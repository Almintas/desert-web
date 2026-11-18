import type { AdminDto } from '@desert-web/shared';
import type { Admin } from './admin.schema';

export function toAdminDto(a: Admin): AdminDto {
  return {
    id: a._id.toString(),
    email: a.email,
    role: a.role,
    createdAt: a.createdAt.toISOString(),
  };
}
