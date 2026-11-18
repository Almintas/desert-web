import { createHash, randomBytes } from 'node:crypto';
import {
  type AdminDto,
  type AdminLoginInput,
  type AdminLoginResponse,
  normalizeEmail,
} from '@desert-web/shared';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import type { Model, Types } from 'mongoose';
import type { Env } from '../config/env';
import { Admin } from './admin.schema';
import { AdminSession } from './admin-session.schema';
import { toAdminDto } from './admin.mapper';
import { hashPassword, verifyPassword } from './password';

const DAY_MS = 24 * 60 * 60 * 1000;
export const INVALID_CREDENTIALS_MESSAGE = 'Neteisingas el. paštas arba slaptažodis';

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export interface AuthenticatedSession {
  admin: AdminDto;
  sessionId: Types.ObjectId;
}

@Injectable()
export class AdminAuthService {
  /**
   * Hash'as, su kuriuo tikrinamas slaptažodis, kai el. pašto nėra: atsakymo laikas
   * tada nesiskiria nuo neteisingo slaptažodžio atvejo.
   */
  private readonly dummyHash = hashPassword(randomBytes(32).toString('base64url'));

  constructor(
    @InjectModel(Admin.name) private readonly adminModel: Model<Admin>,
    @InjectModel(AdminSession.name) private readonly sessionModel: Model<AdminSession>,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async login(input: AdminLoginInput): Promise<AdminLoginResponse> {
    const admin = await this.adminModel
      .findOne({ email: normalizeEmail(input.email) })
      .lean<Admin>()
      .exec();

    const valid = await verifyPassword(
      input.password,
      admin?.passwordHash ?? (await this.dummyHash),
    );
    if (!admin || !valid) {
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    const token = randomBytes(32).toString('base64url');
    const ttlDays = this.config.get('ADMIN_SESSION_TTL_DAYS', { infer: true });
    const expiresAt = new Date(Date.now() + ttlDays * DAY_MS);
    await this.sessionModel.create({
      tokenHash: hashSessionToken(token),
      adminId: admin._id,
      expiresAt,
    });
    await this.adminModel.updateOne({ _id: admin._id }, { lastLoginAt: new Date() }).exec();

    return { token, expiresAt: expiresAt.toISOString(), admin: toAdminDto(admin) };
  }

  /**
   * Sesija galioja, jei ji yra, nepasibaigusi (tikrinam užklausoje, nes TTL monitorius
   * veikia ne iškart) ir jos adminas vis dar egzistuoja.
   */
  async authenticate(token: string): Promise<AuthenticatedSession | null> {
    const session = await this.sessionModel
      .findOne({ tokenHash: hashSessionToken(token), expiresAt: { $gt: new Date() } })
      .lean<AdminSession>()
      .exec();
    if (!session) return null;

    const admin = await this.adminModel.findById(session.adminId).lean<Admin>().exec();
    if (!admin) return null;
    return { admin: toAdminDto(admin), sessionId: session._id };
  }

  async logout(sessionId: Types.ObjectId): Promise<void> {
    await this.sessionModel.deleteOne({ _id: sessionId }).exec();
  }
}
