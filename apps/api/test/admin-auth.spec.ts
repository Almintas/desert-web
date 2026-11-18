import type { AdminDto, AdminRole } from '@desert-web/shared';
import { Controller, Get, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import request from 'supertest';
import { AdminAccountsService, AdminExistsError } from '../src/admin-auth/admin-accounts.service';
import { Admin } from '../src/admin-auth/admin.schema';
import { AdminSession } from '../src/admin-auth/admin-session.schema';
import { AdminAuthGuard } from '../src/admin-auth/admin-auth.guard';
import { AdminAuthModule } from '../src/admin-auth/admin-auth.module';
import { hashSessionToken } from '../src/admin-auth/admin-auth.service';
import { CurrentAdmin } from '../src/admin-auth/current-admin.decorator';
import { Roles, RolesGuard } from '../src/admin-auth/roles';
import type { Env } from '../src/config/env';
import { clearDatabase, createTestContext, type TestContext } from './helpers';

/** Tik testams: endpointas, leidžiamas vien owner rolei. */
@Controller('test-only/owner')
class OwnerOnlyController {
  @Get()
  @UseGuards(AdminAuthGuard, RolesGuard)
  @Roles('owner')
  get(@CurrentAdmin() admin: AdminDto) {
    return { ok: true, email: admin.email };
  }
}

const PASSWORD = 'teisingas-slaptazodis';

describe('Admin autentifikacija (/admin/auth)', () => {
  let ctx: TestContext;
  let accounts: AdminAccountsService;
  let adminModel: Model<Admin>;
  let sessionModel: Model<AdminSession>;
  let ipSeq = 0;

  /** Kiekvienas testas gauna savo IP, kad login ribojimas testų nesupainiotų. */
  let ip: string;

  const http = () => request(ctx.app.getHttpServer());
  const login = (body: object) =>
    http().post('/admin/auth/login').set('X-Forwarded-For', ip).send(body);
  const me = (token?: string) => {
    const req = http().get('/admin/auth/me');
    return token === undefined ? req : req.set('Authorization', `Bearer ${token}`);
  };

  async function createAdmin(email = 'ona@example.com', role: AdminRole = 'owner') {
    return accounts.create(email, role, PASSWORD);
  }

  async function loginToken(email = 'ona@example.com'): Promise<string> {
    const res = await login({ email, password: PASSWORD });
    expect(res.status).toBe(200);
    return res.body.token as string;
  }

  beforeAll(async () => {
    ctx = await createTestContext({
      imports: [AdminAuthModule],
      controllers: [OwnerOnlyController],
    });
    accounts = ctx.app.get(AdminAccountsService);
    adminModel = ctx.app.get(getModelToken(Admin.name));
    sessionModel = ctx.app.get(getModelToken(AdminSession.name));
  });

  afterAll(async () => {
    await ctx?.app.close();
  });

  beforeEach(async () => {
    await clearDatabase(ctx.connection);
    ipSeq += 1;
    ip = `10.0.${Math.floor(ipSeq / 250)}.${ipSeq % 250}`;
  });

  describe('POST /admin/auth/login', () => {
    it('sėkmingas prisijungimas: tokenas veikia /me, nustatomas lastLoginAt', async () => {
      const created = await createAdmin();
      const before = Date.now();

      const res = await login({ email: 'ona@example.com', password: PASSWORD });

      expect(res.status).toBe(200);
      expect(res.body.admin).toEqual(created);
      expect(Object.keys(res.body.admin).sort()).toEqual(['createdAt', 'email', 'id', 'role']);
      expect(res.body.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      const expiresAt = new Date(res.body.expiresAt).getTime();
      const ttlDays = ctx.app.get(ConfigService<Env, true>).get('ADMIN_SESSION_TTL_DAYS');
      expect(expiresAt).toBeGreaterThanOrEqual(before + ttlDays * 86_400_000 - 1000);
      expect(expiresAt).toBeLessThanOrEqual(Date.now() + ttlDays * 86_400_000 + 1000);

      const meRes = await me(res.body.token);
      expect(meRes.status).toBe(200);
      expect(meRes.body).toEqual(created);

      const stored = await adminModel.findById(created.id).lean().exec();
      expect(stored?.lastLoginAt).toBeInstanceOf(Date);
      expect(stored!.lastLoginAt!.getTime()).toBeGreaterThanOrEqual(before - 1000);
    });

    it('DB saugomas tik tokeno SHA-256 hash, ne pats tokenas', async () => {
      await createAdmin();
      const token = await loginToken();
      const sessions = await sessionModel.find().lean().exec();
      expect(sessions).toHaveLength(1);
      expect(sessions[0]!.tokenHash).toBe(hashSessionToken(token));
      expect(JSON.stringify(sessions)).not.toContain(token);
    });

    it('neteisingas slaptažodis ir nežinomas el. paštas: tas pats 401', async () => {
      await createAdmin();
      const wrongPassword = await login({
        email: 'ona@example.com',
        password: 'blogas-slaptazodis',
      });
      const unknownEmail = await login({ email: 'nera@example.com', password: PASSWORD });

      expect(wrongPassword.status).toBe(401);
      expect(unknownEmail.status).toBe(401);
      expect(wrongPassword.body).toEqual(unknownEmail.body);
      expect(wrongPassword.body.message).toBe('Neteisingas el. paštas arba slaptažodis');
      expect(await sessionModel.countDocuments()).toBe(0);
    });

    it('el. paštas tikrinamas nepaisant didžiųjų raidžių ir tarpų', async () => {
      await createAdmin('ona@example.com');
      const res = await login({ email: '  ONA@Example.COM ', password: PASSWORD });
      expect(res.status).toBe(200);
      expect(res.body.admin.email).toBe('ona@example.com');
    });

    it('netinkamas body: 400 Netinkami duomenys', async () => {
      const res = await login({ email: 'ne-pastas' });
      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Netinkami duomenys');
    });

    it('viršijus bandymų limitą: 429', async () => {
      await createAdmin();
      const limit = ctx.app.get(ConfigService<Env, true>).get('ADMIN_LOGIN_RATE_LIMIT');
      for (let i = 0; i < limit; i++) {
        const res = await login({ email: 'ona@example.com', password: 'blogas-slaptazodis' });
        expect(res.status).toBe(401);
      }
      const blocked = await login({ email: 'ona@example.com', password: PASSWORD });
      expect(blocked.status).toBe(429);
      expect(blocked.body.message).toBe('Per daug bandymų prisijungti. Pabandyk vėliau.');

      // Kitas IP (pagal X-Forwarded-For, nes įjungtas trust proxy) neužblokuotas.
      ip = '10.255.255.1';
      const other = await login({ email: 'ona@example.com', password: PASSWORD });
      expect(other.status).toBe(200);
    });
  });

  describe('GET /admin/auth/me', () => {
    it('be tokeno: 401', async () => {
      expect((await me()).status).toBe(401);
    });

    it('su šiukšlių tokenu: 401', async () => {
      expect((await me('nesamone')).status).toBe(401);
      expect((await me('A'.repeat(43))).status).toBe(401);
      const raw = await http().get('/admin/auth/me').set('Authorization', 'Basic abc');
      expect(raw.status).toBe(401);
    });

    it('pasibaigusi sesija: 401, net jei TTL monitorius jos dar neištrynė', async () => {
      await createAdmin();
      const token = await loginToken();
      await sessionModel.updateOne(
        { tokenHash: hashSessionToken(token) },
        { expiresAt: new Date(Date.now() - 1000) },
      );
      expect((await me(token)).status).toBe(401);
    });

    it('ištrynus adminą, jo sesijos nebegalioja', async () => {
      const admin = await createAdmin();
      const token = await loginToken();
      expect((await me(token)).status).toBe(200);
      await adminModel.deleteOne({ _id: admin.id });
      expect((await me(token)).status).toBe(401);
    });
  });

  describe('POST /admin/auth/logout', () => {
    it('ištrina dabartinę sesiją: 204, po to tas pats tokenas 401', async () => {
      await createAdmin();
      const token = await loginToken();
      const other = await loginToken();

      const res = await http().post('/admin/auth/logout').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(204);
      expect((await me(token)).status).toBe(401);
      // Kitos to paties admino sesijos lieka.
      expect((await me(other)).status).toBe(200);
    });

    it('be tokeno: 401', async () => {
      expect((await http().post('/admin/auth/logout')).status).toBe(401);
    });
  });

  describe('@Roles', () => {
    it('owner praleidžiamas, staff gauna 403', async () => {
      await createAdmin('owner@example.com', 'owner');
      await createAdmin('staff@example.com', 'staff');
      const ownerToken = await loginToken('owner@example.com');
      const staffToken = await loginToken('staff@example.com');

      const ok = await http().get('/test-only/owner').set('Authorization', `Bearer ${ownerToken}`);
      expect(ok.status).toBe(200);
      expect(ok.body).toEqual({ ok: true, email: 'owner@example.com' });

      const forbidden = await http()
        .get('/test-only/owner')
        .set('Authorization', `Bearer ${staffToken}`);
      expect(forbidden.status).toBe(403);
      expect(forbidden.body.message).toBe('Šiam veiksmui neturi teisių');

      expect((await http().get('/test-only/owner')).status).toBe(401);
    });
  });

  describe('AdminAccountsService (admin:create)', () => {
    it('el. paštas saugomas normalizuotas; pakartotinis kūrimas meta klaidą', async () => {
      const admin = await accounts.create('  Ona@Example.com ', 'staff', PASSWORD);
      expect(admin.email).toBe('ona@example.com');
      await expect(accounts.create('ONA@example.com', 'owner', PASSWORD)).rejects.toBeInstanceOf(
        AdminExistsError,
      );
    });

    it('--reset-password pakeičia slaptažodį ir ištrina admino sesijas', async () => {
      await createAdmin();
      await createAdmin('kitas@example.com');
      const token = await loginToken();
      const otherToken = await loginToken('kitas@example.com');

      const { deletedSessions } = await accounts.resetPassword(
        'ona@example.com',
        'naujas-slaptazodis',
      );
      expect(deletedSessions).toBe(1);
      expect((await me(token)).status).toBe(401);
      expect((await me(otherToken)).status).toBe(200);

      expect((await login({ email: 'ona@example.com', password: PASSWORD })).status).toBe(401);
      const relog = await login({ email: 'ona@example.com', password: 'naujas-slaptazodis' });
      expect(relog.status).toBe(200);
    });
  });
});
