import { type AdminDto, type AdminRole, normalizeEmail } from '@desert-web/shared';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { Admin } from './admin.schema';
import { AdminSession } from './admin-session.schema';
import { toAdminDto } from './admin.mapper';
import { hashPassword } from './password';

export class AdminExistsError extends Error {
  constructor(email: string) {
    super(
      `Adminas ${email} jau egzistuoja. Norėdamas pakeisti slaptažodį, pridėk --reset-password.`,
    );
  }
}

export class AdminNotFoundError extends Error {
  constructor(email: string) {
    super(`Adminas ${email} nerastas. Be --reset-password jis bus sukurtas (reikia --role).`);
  }
}

/** Adminų paskyrų valdymas (naudoja admin:create skriptas). Slaptažodis turi būti jau validuotas. */
@Injectable()
export class AdminAccountsService {
  constructor(
    @InjectModel(Admin.name) private readonly adminModel: Model<Admin>,
    @InjectModel(AdminSession.name) private readonly sessionModel: Model<AdminSession>,
  ) {}

  async create(email: string, role: AdminRole, password: string): Promise<AdminDto> {
    const normalized = normalizeEmail(email);
    if (await this.adminModel.exists({ email: normalized })) {
      throw new AdminExistsError(normalized);
    }
    const admin = await this.adminModel.create({
      email: normalized,
      role,
      passwordHash: await hashPassword(password),
    });
    return toAdminDto(admin.toObject());
  }

  /** Pakeičia slaptažodį (ir rolę, jei nurodyta) ir ištrina visas admino sesijas. */
  async resetPassword(
    email: string,
    password: string,
    role?: AdminRole,
  ): Promise<{ admin: AdminDto; deletedSessions: number }> {
    const normalized = normalizeEmail(email);
    const admin = await this.adminModel
      .findOneAndUpdate(
        { email: normalized },
        { passwordHash: await hashPassword(password), ...(role ? { role } : {}) },
        { new: true },
      )
      .lean<Admin>()
      .exec();
    if (!admin) throw new AdminNotFoundError(normalized);
    const { deletedCount } = await this.sessionModel.deleteMany({ adminId: admin._id }).exec();
    return { admin: toAdminDto(admin), deletedSessions: deletedCount };
  }
}
