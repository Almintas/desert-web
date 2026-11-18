import type { AdminDto } from '@desert-web/shared';
import type { Request } from 'express';
import type { Types } from 'mongoose';

/** Request, praėjęs AdminAuthGuard. */
export interface AdminRequest extends Request {
  admin?: AdminDto;
  adminSessionId?: Types.ObjectId;
}
