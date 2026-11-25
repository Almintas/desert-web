import {
  type AdminDto,
  type AdminOrderBulkResultDto,
  type AdminOrderBulkStatusResponse,
  type BulkOrderStatus,
  type AdminOrderDto,
  type AdminOrderListQuery,
  type AdminOrderListResponse,
  type AdminPickupOrderDto,
  isFinalOrderStatus,
  objectIdSchema,
  ORDER_STATUSES,
  type OrderErrorCode,
  type OrderStatus,
  orderStatusesAllowingTransitionTo,
} from '@desert-web/shared';
import {
  ConflictException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { type ClientSession, type Connection, type Model, type FilterQuery, Types } from 'mongoose';
import { customerSearchConditions } from '../common/customer-search';
import { Order } from '../orders/order.schema';
import { SaleWindow } from '../sale-windows/sale-window.schema';
import { AdminAccountsService } from '../admin-auth/admin-accounts.service';
import { OrderNotificationsService } from '../notifications/order-notifications.service';
import {
  adminIdsOf,
  toAdminOrderDto,
  toAdminOrderListItemDto,
  toAdminPickupOrderDto,
  type WindowTitles,
} from './admin-orders.mapper';

function orderError(
  Exception: new (body: object) => Error,
  code: OrderErrorCode,
  message: string,
  extra: Record<string, unknown> = {},
): Error {
  return new Exception({ code, message, ...extra });
}

const notFound = () => orderError(NotFoundException, 'ORDER_NOT_FOUND', 'Užsakymas nerastas');

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
  private readonly logger = new Logger(AdminOrdersService.name);

  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(Order.name) private readonly orderModel: Model<Order>,
    @InjectModel(SaleWindow.name) private readonly saleWindowModel: Model<SaleWindow>,
    private readonly adminAccounts: AdminAccountsService,
    private readonly notifications: OrderNotificationsService,
  ) {}

  /** Naujausi pirmi. counts skaičiuojami be būsenos filtro (skirtukams). */
  async list(query: AdminOrderListQuery): Promise<AdminOrderListResponse> {
    const base: FilterQuery<Order> = {};
    if (query.saleWindowId) base.saleWindowId = new Types.ObjectId(query.saleWindowId);
    if (query.q) base.$or = customerSearchConditions(query.q, 'orderNumber');
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

  /** Atsiėmimo sąrašui: visi neatšaukti lango užsakymai, surikiuoti pagal pirkėjo vardą. */
  async pickupList(saleWindowId: string): Promise<AdminPickupOrderDto[]> {
    const window = await this.saleWindowModel.exists({ _id: saleWindowId }).exec();
    if (!window) {
      throw orderError(NotFoundException, 'SALE_WINDOW_NOT_FOUND', 'Pardavimo langas nerastas');
    }
    const orders = await this.orderModel
      .find({ saleWindowId: new Types.ObjectId(saleWindowId), status: { $ne: 'cancelled' } })
      .lean<Order[]>()
      .exec();
    const collator = new Intl.Collator('lt', { sensitivity: 'base', numeric: true });
    return orders
      .map(toAdminPickupOrderDto)
      .sort(
        (a, b) =>
          collator.compare(a.customer.name, b.customer.name) ||
          a.orderNumber.localeCompare(b.orderNumber),
      );
  }

  async findById(id: string): Promise<AdminOrderDto> {
    if (!objectIdSchema.safeParse(id).success) throw notFound();
    const order = await this.orderModel.findById(id).lean<Order>().exec();
    if (!order) throw notFound();
    return this.toDto(order);
  }

  private async toDto(order: Order): Promise<AdminOrderDto> {
    const [titles, emails] = await Promise.all([
      this.windowTitles([order]),
      this.adminAccounts.emailsByIds(adminIdsOf(order)),
    ]);
    return toAdminOrderDto(order, titles, emails);
  }

  /**
   * Vienintelė vieta, kur keičiama užsakymo būsena (ir eigoje, ir atšaukiant). Po sėkmingos
   * transakcijos čia siunčiamas laiškas pirkėjui (confirmed, ready, cancelled; žr.
   * OrderNotificationsService). Nepavykęs perėjimas (409) laiško nesiunčia, todėl dvigubas
   * atšaukimas reiškia vieną laišką.
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

    // Tik po commit'o ir fone: laiško klaida perėjimo neatšaukia ir atsakymo nelaiko.
    this.notifications.orderStatusChanged(updated, to);
    return this.toDto(updated);
  }

  /**
   * Masinis būsenos keitimas: kiekvienas užsakymas paeiliui per changeStatus (todėl istorija,
   * apmokėjimas ir laiškai lygiai tokie patys kaip keičiant po vieną). Ne „viskas arba nieko“:
   * vieno klaida kitų nestabdo. Jau esantis tos būsenos užsakymas laikomas sėkme (`unchanged`)
   * ir laiško antrą kartą negauna (changeStatus jį atmeta prieš siunčiant).
   */
  async bulkChangeStatus(
    ids: string[],
    to: BulkOrderStatus,
    admin: AdminDto,
  ): Promise<AdminOrderBulkStatusResponse> {
    const results: AdminOrderBulkResultDto[] = [];
    for (const id of ids) results.push(await this.bulkOne(id, to, admin));
    const count = (outcome: AdminOrderBulkResultDto['outcome']) =>
      results.filter((r) => r.outcome === outcome).length;
    return {
      results,
      summary: { updated: count('updated'), unchanged: count('unchanged'), failed: count('error') },
    };
  }

  private async bulkOne(
    id: string,
    to: BulkOrderStatus,
    admin: AdminDto,
  ): Promise<AdminOrderBulkResultDto> {
    try {
      const order = await this.changeStatus(id, to, admin);
      return { id, outcome: 'updated', orderNumber: order.orderNumber, status: order.status };
    } catch (error) {
      if (!(error instanceof HttpException)) {
        this.logger.error(`Bulk status ${id} -> ${to} failed`, error as Error);
        const current = await this.orderModel
          .findById(id, { orderNumber: 1, status: 1 })
          .lean<Order>()
          .exec()
          .catch(() => null);
        return {
          id,
          outcome: 'error',
          orderNumber: current?.orderNumber ?? null,
          status: current?.status ?? null,
          code: 'UNKNOWN',
          message: 'Nepavyko pakeisti būsenos. Bandyk dar kartą.',
        };
      }
      const body = error.getResponse() as {
        code?: OrderErrorCode;
        message?: string;
        status?: OrderStatus;
      };
      if (body.code === 'ORDER_NOT_FOUND') {
        return {
          id,
          outcome: 'error',
          orderNumber: null,
          status: null,
          code: 'ORDER_NOT_FOUND',
          message: body.message ?? 'Užsakymas nerastas',
        };
      }
      const current = await this.orderModel
        .findById(id, { orderNumber: 1, status: 1 })
        .lean<Pick<Order, 'orderNumber' | 'status'>>()
        .exec();
      if (body.code === 'INVALID_STATUS_TRANSITION' && body.status === to) {
        return { id, outcome: 'unchanged', orderNumber: current?.orderNumber ?? '', status: to };
      }
      return {
        id,
        outcome: 'error',
        orderNumber: current?.orderNumber ?? null,
        status: current?.status ?? body.status ?? null,
        code: body.code ?? 'UNKNOWN',
        message: body.message ?? error.message,
      };
    }
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
