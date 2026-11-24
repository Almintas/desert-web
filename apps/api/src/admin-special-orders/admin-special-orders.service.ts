import {
  type AdminDto,
  type AdminSpecialOrderDto,
  type AdminSpecialOrderListQuery,
  type AdminSpecialOrderListResponse,
  type AdminSpecialOrderStatsDto,
  type ConfirmSpecialOrderInput,
  isFinalSpecialOrderStatus,
  objectIdSchema,
  SPECIAL_ORDER_STATUSES,
  type SpecialOrderStatus,
  specialOrderStatusesAllowingTransitionTo,
} from '@desert-web/shared';
import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type FilterQuery, type Model, Types } from 'mongoose';
import { AdminAccountsService } from '../admin-auth/admin-accounts.service';
import { customerSearchConditions } from '../common/customer-search';
import { specialOrderError } from '../special-orders/special-order-errors';
import { SpecialOrder } from '../special-orders/special-order.schema';
import {
  adminIdsOf,
  toAdminSpecialOrderDto,
  toAdminSpecialOrderListItemDto,
} from '../special-orders/special-orders.mapper';

/** Būsenos pakeitimas su tos būsenos duomenimis. */
export type SpecialOrderStatusChange =
  | { to: 'confirmed'; confirmation: ConfirmSpecialOrderInput }
  | { to: 'rejected'; reason: string }
  | { to: 'cancelled'; reason?: string }
  | { to: 'completed' };

const notFound = () =>
  specialOrderError(NotFoundException, 'SPECIAL_ORDER_NOT_FOUND', 'Užklausa nerasta');

/** Būsena „užklausa jau …“ sakiniui. */
const STATUS_WORDS: Record<SpecialOrderStatus, string> = {
  requested: 'pateikta',
  confirmed: 'patvirtinta',
  completed: 'įvykdyta',
  rejected: 'atmesta',
  cancelled: 'atšaukta',
};

/** Kodėl perėjimas `from -> to` negalimas (lietuviškas pranešimas). */
function transitionMessage(from: SpecialOrderStatus, to: SpecialOrderStatus): string {
  if (from === to) return `Užklausa jau ${STATUS_WORDS[from]}`;
  if (isFinalSpecialOrderStatus(from)) {
    return `Užklausa jau ${STATUS_WORDS[from]}: jos būsenos keisti nebegalima`;
  }
  if (to === 'completed') return 'Įvykdyti galima tik patvirtintą užklausą';
  return 'Šis veiksmas negalimas: užklausa jau patvirtinta';
}

@Injectable()
export class AdminSpecialOrdersService {
  private readonly logger = new Logger(AdminSpecialOrdersService.name);

  constructor(
    @InjectModel(SpecialOrder.name) private readonly specialOrderModel: Model<SpecialOrder>,
    private readonly adminAccounts: AdminAccountsService,
  ) {}

  /** Artimiausios pageidaujamos datos pirmos. counts skaičiuojami be būsenos filtro. */
  async list(query: AdminSpecialOrderListQuery): Promise<AdminSpecialOrderListResponse> {
    const base: FilterQuery<SpecialOrder> = {};
    if (query.desiredFrom || query.desiredTo) {
      base.desiredDate = {
        ...(query.desiredFrom ? { $gte: query.desiredFrom } : {}),
        ...(query.desiredTo ? { $lte: query.desiredTo } : {}),
      };
    }
    if (query.q) base.$or = customerSearchConditions(query.q, 'requestNumber');
    const filter: FilterQuery<SpecialOrder> = query.status?.length
      ? { ...base, status: { $in: query.status } }
      : base;

    const [specialOrders, total, byStatus] = await Promise.all([
      this.specialOrderModel
        .find(filter)
        .sort({ desiredDate: 1, createdAt: 1, _id: 1 })
        .skip((query.page - 1) * query.pageSize)
        .limit(query.pageSize)
        .lean<SpecialOrder[]>()
        .exec(),
      this.specialOrderModel.countDocuments(filter).exec(),
      this.specialOrderModel
        .aggregate<{ _id: SpecialOrderStatus; n: number }>([
          { $match: base },
          { $group: { _id: '$status', n: { $sum: 1 } } },
        ])
        .exec(),
    ]);

    const counts = Object.fromEntries(SPECIAL_ORDER_STATUSES.map((s) => [s, 0])) as Record<
      SpecialOrderStatus,
      number
    >;
    for (const { _id, n } of byStatus) counts[_id] = n;
    return {
      items: specialOrders.map(toAdminSpecialOrderListItemDto),
      total,
      page: query.page,
      pageSize: query.pageSize,
      counts: { ...counts, all: byStatus.reduce((sum, s) => sum + s.n, 0) },
    };
  }

  /** Navigacijos ženkleliui: kiek naujų (dar neperžiūrėtų) užklausų. */
  async stats(): Promise<AdminSpecialOrderStatsDto> {
    return { requested: await this.specialOrderModel.countDocuments({ status: 'requested' }) };
  }

  async findById(id: string): Promise<AdminSpecialOrderDto> {
    if (!objectIdSchema.safeParse(id).success) throw notFound();
    const specialOrder = await this.specialOrderModel.findById(id).lean<SpecialOrder>().exec();
    if (!specialOrder) throw notFound();
    return this.toDto(specialOrder);
  }

  private async toDto(specialOrder: SpecialOrder): Promise<AdminSpecialOrderDto> {
    const emails = await this.adminAccounts.emailsByIds(adminIdsOf(specialOrder));
    return toAdminSpecialOrderDto(specialOrder, emails);
  }

  /**
   * Vienintelė vieta, kur keičiama specialaus užsakymo būsena (confirm, reject, cancel,
   * complete). Leidžiami perėjimai: SPECIAL_ORDER_TRANSITIONS (shared).
   *
   * Vienas sąlyginis findOneAndUpdate: `status` vis dar viena iš būsenų, iš kurių galima
   * pereiti į `to`. Dokumento atnaujinimas atominis, todėl jei du adminai vienu metu
   * patvirtina ir atmeta, laimi tik vienas, o kitas gauna 409 INVALID_STATUS_TRANSITION.
   * Tame pačiame įraše išsaugomi būsenos duomenys ir istorijos įrašas su adminId.
   */
  async changeStatus(
    id: string,
    change: SpecialOrderStatusChange,
    admin: AdminDto,
  ): Promise<AdminSpecialOrderDto> {
    if (!objectIdSchema.safeParse(id).success) throw notFound();
    const adminId = new Types.ObjectId(admin.id);
    const now = new Date();

    const updated = await this.specialOrderModel
      .findOneAndUpdate(
        { _id: id, status: { $in: specialOrderStatusesAllowingTransitionTo(change.to) } },
        {
          $set: { status: change.to, ...this.fieldsFor(change, adminId, now) },
          $push: { statusHistory: { status: change.to, at: now, adminId } },
        },
        { new: true, runValidators: true },
      )
      .lean<SpecialOrder>()
      .exec();

    if (!updated) {
      const existing = await this.specialOrderModel
        .findById(id, { status: 1 })
        .lean<Pick<SpecialOrder, 'status'>>()
        .exec();
      if (!existing) throw notFound();
      throw specialOrderError(
        ConflictException,
        'INVALID_STATUS_TRANSITION',
        transitionMessage(existing.status, change.to),
        {
          status: existing.status,
          requestedStatus: change.to,
          final: isFinalSpecialOrderStatus(existing.status),
        },
      );
    }

    this.afterStatusChange(updated, change.to);
    return this.toDto(updated);
  }

  /** Laukai, kuriuos nustato konkretus perėjimas. */
  private fieldsFor(
    change: SpecialOrderStatusChange,
    adminId: Types.ObjectId,
    now: Date,
  ): Record<string, unknown> {
    switch (change.to) {
      case 'confirmed': {
        const c = change.confirmation;
        return {
          confirmation: {
            totalCents: c.totalCents,
            adminMessage: c.adminMessage,
            pickupFrom: c.pickupFrom,
            pickupTo: c.pickupTo,
            pickupLocation: c.pickupLocation,
            confirmedAt: now,
            confirmedBy: adminId,
          },
        };
      }
      case 'rejected':
        return { rejectionReason: change.reason };
      case 'cancelled':
        return { cancellation: { reason: change.reason, cancelledAt: now, cancelledBy: adminId } };
      case 'completed':
        // Apmokama atsiimant: įvykdyta užklausa reiškia, kad pirkėjas sumokėjo.
        return { 'payment.status': 'paid', 'payment.paidAt': now };
    }
  }

  /**
   * Plėtinio vieta (2 dalis): pirkėjo laiškai apie patvirtinimą (su galutine kaina ir
   * atsiėmimu), atmetimą ir atšaukimą. Kviečiama tik po sėkmingo perėjimo; nepavykęs
   * perėjimas (409) čia neateina, todėl laiškas nesiunčiamas du kartus.
   */
  private afterStatusChange(specialOrder: SpecialOrder, to: SpecialOrderStatus): void {
    // TODO(special-orders, 2 dalis): laiškai pirkėjui (confirmed, rejected, cancelled).
    this.logger.log(`Special order ${specialOrder.requestNumber}: ${to}`);
  }
}
