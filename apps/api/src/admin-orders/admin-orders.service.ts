import {
  type AdminDto,
  type AdminOrderDto,
  type AdminOrderListQuery,
  type AdminOrderListResponse,
  isFinalOrderStatus,
  normalizeEmail,
  normalizePhone,
  objectIdSchema,
  ORDER_STATUSES,
  type OrderErrorCode,
  type OrderStatus,
  orderStatusesAllowingTransitionTo,
} from '@desert-web/shared';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { type ClientSession, type Connection, type Model, type FilterQuery, Types } from 'mongoose';
import { Order } from '../orders/order.schema';
import { SaleWindow } from '../sale-windows/sale-window.schema';
import { toAdminOrderDto, toAdminOrderListItemDto, type WindowTitles } from './admin-orders.mapper';

function orderError(
  Exception: new (body: object) => Error,
  code: OrderErrorCode,
  message: string,
  extra: Record<string, unknown> = {},
): Error {
  return new Exception({ code, message, ...extra });
}

const notFound = () => orderError(NotFoundException, 'ORDER_NOT_FOUND', 'Užsakymas nerastas');

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Kodėl perėjimas `from -> to` negalimas (lietuviškas pranešimas). */
function transitionMessage(from: OrderStatus, to: OrderStatus): string {
  if (from === 'cancelled') return 'Užsakymas jau atšauktas: jo būsenos keisti nebegalima';
  if (from === 'completed') return 'Užsakymas jau įvykdytas: jo būsenos keisti nebegalima';
  if (to === 'cancelled') return 'Užsakymo atšaukti negalima';
  if (from === to) return 'Užsakymas jau yra šios būsenos';
  return 'Užsakymo būseną galima keisti tik pirmyn';
}

@Injectable()
export class AdminOrdersService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(Order.name) private readonly orderModel: Model<Order>,
    @InjectModel(SaleWindow.name) private readonly saleWindowModel: Model<SaleWindow>,
  ) {}

  /** Naujausi pirmi. counts skaičiuojami be būsenos filtro (skirtukams). */
  async list(query: AdminOrderListQuery): Promise<AdminOrderListResponse> {
    const base: FilterQuery<Order> = {};
    if (query.saleWindowId) base.saleWindowId = new Types.ObjectId(query.saleWindowId);
    if (query.q) base.$or = this.searchConditions(query.q);
    const filter: FilterQuery<Order> = query.status?.length
      ? { ...base, status: { $in: query.status } }
      : base;

    const [orders, total, byStatus] = await Promise.all([
      this.orderModel
        .find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((query.page - 1) * query.pageSize)
        .limit(query.pageSize)
        .lean<Order[]>()
        .exec(),
      this.orderModel.countDocuments(filter).exec(),
      this.orderModel
        .aggregate<{ _id: OrderStatus; n: number }>([
          { $match: base },
          { $group: { _id: '$status', n: { $sum: 1 } } },
        ])
        .exec(),
    ]);

    const counts = Object.fromEntries(ORDER_STATUSES.map((s) => [s, 0])) as Record<
      OrderStatus,
      number
    >;
    for (const { _id, n } of byStatus) counts[_id] = n;
    const titles = await this.windowTitles(orders);
    return {
      items: orders.map((o) => toAdminOrderListItemDto(o, titles)),
      total,
      page: query.page,
      pageSize: query.pageSize,
      counts: { ...counts, all: byStatus.reduce((sum, s) => sum + s.n, 0) },
    };
  }

  async findById(id: string): Promise<AdminOrderDto> {
    if (!objectIdSchema.safeParse(id).success) throw notFound();
    const order = await this.orderModel.findById(id).lean<Order>().exec();
    if (!order) throw notFound();
    return toAdminOrderDto(order, await this.windowTitles([order]));
  }

  /**
   * Vienintelė vieta, kur keičiama užsakymo būsena (ir eigoje, ir atšaukiant), kad vėliau
   * čia būtų galima prijungti laiškus pirkėjui.
   *
   * Eiga tik pirmyn: pending -> confirmed -> ready -> completed (galima peršokti).
   * completed ir cancelled yra galutinės. Atšaukti galima iš bet kurios negalutinės.
   *
   * Viena transakcija:
   * 1. Sąlyginis findOneAndUpdate (`status` vis dar viena iš leidžiamų). Jei du adminai
   *    atšaukia vienu metu, antrasis po pakartojimo sąlygos nebeatitinka ir gauna 409,
   *    todėl kiekiai grąžinami tik kartą.
   *    Pereinant į completed tame pačiame įraše pažymima payment.status = 'paid' ir paidAt.
   * 2. Atšaukiant: $inc kiekvienos prekės quantityAvailable lange (arrayFilters pagal
   *    variantId), net jei langas jau uždarytas ar pasibaigęs. Tai rašo lango dokumentą,
   *    kaip ir POST /orders bei lango PUT, todėl lygiagrečios transakcijos konfliktuoja
   *    (WriteConflict) ir kartojamos, o ne praranda pakeitimus.
   */
  async changeStatus(
    id: string,
    to: OrderStatus,
    admin: AdminDto,
    options: { reason?: string } = {},
  ): Promise<AdminOrderDto> {
    if (!objectIdSchema.safeParse(id).success) throw notFound();
    const adminId = new Types.ObjectId(admin.id);

    const updated = await this.connection.transaction(async (session) => {
      const now = new Date();
      const order = await this.orderModel
        .findOneAndUpdate(
          { _id: id, status: { $in: orderStatusesAllowingTransitionTo(to) } },
          {
            $set: {
              status: to,
              ...(to === 'cancelled'
                ? {
                    cancellation: {
                      reason: options.reason,
                      cancelledAt: now,
                      cancelledBy: adminId,
                    },
                  }
                : {}),
              // Apmokama atsiimant: įvykdytas užsakymas reiškia, kad pirkėjas sumokėjo.
              ...(to === 'completed' ? { 'payment.status': 'paid', 'payment.paidAt': now } : {}),
            },
            $push: { statusHistory: { status: to, at: now, adminId } },
          },
          { new: true, session },
        )
        .lean<Order>()
        .exec();

      if (!order) {
        const existing = await this.orderModel.findById(id).session(session).lean<Order>().exec();
        if (!existing) throw notFound();
        throw orderError(
          ConflictException,
          'INVALID_STATUS_TRANSITION',
          transitionMessage(existing.status, to),
          {
            status: existing.status,
            requestedStatus: to,
            final: isFinalOrderStatus(existing.status),
          },
        );
      }

      if (to === 'cancelled') await this.returnStock(order, session);
      return order;
    });

    // Čia vėliau: pranešimas pirkėjui apie būsenos pakeitimą (Resend).
    return toAdminOrderDto(updated, await this.windowTitles([updated]));
  }

  /** Grąžina atšaukto užsakymo kiekius į langą (vienas atominis $inc su arrayFilters). */
  private async returnStock(order: Order, session: ClientSession): Promise<void> {
    const byVariant = new Map<string, { variantId: Types.ObjectId; quantity: number }>();
    for (const item of order.items) {
      const key = item.variantId.toString();
      const entry = byVariant.get(key) ?? { variantId: item.variantId, quantity: 0 };
      entry.quantity += item.quantity;
      byVariant.set(key, entry);
    }
    const lines = [...byVariant.values()];
    if (lines.length === 0) return;

    await this.saleWindowModel
      .updateOne(
        { _id: order.saleWindowId },
        {
          $inc: Object.fromEntries(
            lines.map((l, i) => [`items.$[i${i}].quantityAvailable`, l.quantity]),
          ),
        },
        { arrayFilters: lines.map((l, i) => ({ [`i${i}.variantId`]: l.variantId })), session },
      )
      .exec();
  }

  /** Užsakymo numeris, vardas, el. paštas (normalizuotas) arba telefonas (normalizuotas). */
  private searchConditions(q: string): FilterQuery<Order>[] {
    const contains = (s: string) => new RegExp(escapeRegex(s), 'i');
    const conditions: FilterQuery<Order>[] = [
      { orderNumber: contains(q) },
      { 'customer.name': contains(q) },
      { 'customer.emailNormalized': contains(normalizeEmail(q)) },
    ];
    const digits = q.replace(/\D/g, '');
    if (digits.length >= 3) {
      conditions.push(
        { 'customer.phoneNormalized': contains(normalizePhone(q)) },
        { 'customer.phoneNormalized': contains(digits) },
      );
    }
    return conditions;
  }

  private async windowTitles(orders: Order[]): Promise<WindowTitles> {
    const ids = [...new Set(orders.map((o) => o.saleWindowId.toString()))];
    if (ids.length === 0) return new Map();
    const windows = await this.saleWindowModel
      .find({ _id: { $in: ids } }, { title: 1 })
      .lean<Pick<SaleWindow, '_id' | 'title'>[]>()
      .exec();
    return new Map(windows.map((w) => [w._id.toString(), w.title]));
  }
}
