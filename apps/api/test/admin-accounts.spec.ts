import type { AdminRole } from '@desert-web/shared';
import request from 'supertest';
import { AdminAccountsService } from '../src/admin-auth/admin-accounts.service';
import { clearDatabase, createTestContext, type TestContext } from './helpers';

const PASSWORD = 'teisingas-slaptazodis';

describe('Adminų paskyros (/admin/admins)', () => {
  let ctx: TestContext;
  let accounts: AdminAccountsService;
  let ipSeq = 0;
  let ip: string;

  const http = () => request(ctx.app.getHttpServer());

  async function tokenFor(email: string, role: AdminRole): Promise<string> {
    await accounts.create(email, role, PASSWORD);
    const res = await http()
      .post('/admin/auth/login')
      .set('X-Forwarded-For', ip)
      .send({ email, password: PASSWORD });
    expect(res.status).toBe(200);
    return res.body.token as string;
  }

  const createAdmin = (token: string, body: object) =>
    http().post('/admin/admins').set('Authorization', `Bearer ${token}`).send(body);

  beforeAll(async () => {
    ctx = await createTestContext();
    accounts = ctx.app.get(AdminAccountsService);
  });

  afterAll(async () => {
    await ctx?.app.close();
  });

  beforeEach(async () => {
    await clearDatabase(ctx.connection);
    ipSeq += 1;
    ip = `10.1.${Math.floor(ipSeq / 250)}.${ipSeq % 250}`;
  });

  it('owner sukuria adminą, kuris gali prisijungti; sąraše abu', async () => {
    const token = await tokenFor('ona@example.com', 'owner');

    const res = await createAdmin(token, {
      email: '  Jonas@Example.com ',
      password: 'naujas-slaptazodis',
      role: 'staff',
    });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: expect.any(String),
      email: 'jonas@example.com',
      role: 'staff',
      createdAt: expect.any(String),
    });

    const login = await http()
      .post('/admin/auth/login')
      .set('X-Forwarded-For', ip)
      .send({ email: 'jonas@example.com', password: 'naujas-slaptazodis' });
    expect(login.status).toBe(200);
    expect(login.body.admin.role).toBe('staff');

    const list = await http().get('/admin/admins').set('Authorization', `Bearer ${token}`);
    expect(list.status).toBe(200);
    expect(list.body.map((a: { email: string }) => a.email)).toEqual([
      'ona@example.com',
      'jonas@example.com',
    ]);
    expect(JSON.stringify(list.body)).not.toContain('passwordHash');
  });

  it('esamas el. paštas: 409 ADMIN_EMAIL_TAKEN', async () => {
    const token = await tokenFor('ona@example.com', 'owner');
    const res = await createAdmin(token, {
      email: 'ONA@example.com',
      password: 'naujas-slaptazodis',
      role: 'owner',
    });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ADMIN_EMAIL_TAKEN');
  });

  it('per trumpas slaptažodis ir netinkama rolė: 400', async () => {
    const token = await tokenFor('ona@example.com', 'owner');
    const res = await createAdmin(token, {
      email: 'jonas@example.com',
      password: 'trumpas',
      role: 'boss',
    });
    expect(res.status).toBe(400);
    expect(res.body.issues.map((i: { path: string }) => i.path).sort()).toEqual([
      'password',
      'role',
    ]);
  });

  it('staff negali nei kurti, nei matyti adminų: 403', async () => {
    const token = await tokenFor('petras@example.com', 'staff');
    const create = await createAdmin(token, {
      email: 'jonas@example.com',
      password: 'naujas-slaptazodis',
      role: 'owner',
    });
    expect(create.status).toBe(403);
    const list = await http().get('/admin/admins').set('Authorization', `Bearer ${token}`);
    expect(list.status).toBe(403);
    expect(await accounts.list()).toHaveLength(1);
  });

  it('be prisijungimo: 401', async () => {
    const res = await http()
      .post('/admin/admins')
      .send({ email: 'jonas@example.com', password: 'naujas-slaptazodis', role: 'owner' });
    expect(res.status).toBe(401);
  });
});
