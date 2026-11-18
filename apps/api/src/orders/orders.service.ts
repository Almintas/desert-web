import { randomBytes } from 'node:crypto';
import {
  type CreateOrderInput,
  type CreateOrderResponse,
  getShopYear,
  isSaleWindowOpen,
  normalizeEmail,
  normalizePhone,
  type OrderDto,
  type OrderErrorCode,
} from '@desert-web/shared';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import type { ClientSession, Connection, Model, Types } from 'mongoose';
import { CountersService } from '../counters/counters.service';
import { Product } from '../products/product.schema';
import { SaleWindow, type SaleWindowItem } from '../sale-windows/sale-window.schema';
import { Order, type OrderItem } from './order.schema';
import { toOrderDto } from './orders.mapper';

/** Užsakymo eilutė, suporuota su lango preke. */
interface OrderLine {
  variantId: string;
  quantity: number;
  windowItem: SaleWindowItem;
}

const ACCESS_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32}$/;

function orderError(
  Exception: new (body: object) => Error,
  code: OrderErrorCode,
  message: string,
  extra: Record<string, unknown> = {},
): Error {
  return new Exception({ code, message, ...extra });
}

@Injectable()
export class OrdersService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(Order.name) private readonly orderModel: Model<Order>,
    @InjectModel(SaleWindow.name) private readonly saleWindowModel: Model<SaleWindow>,
    @InjectModel(Product.name) private readonly productModel: Model<Product>,
    private readonly countersService: CountersService,
  ) {}

  /**
   * Sukuria užsakymą atidarytame pardavimo lange.
   *
   * Viskas vyksta vienoje transakcijoje: lango tikrinimas, limitai, kiekių rezervavimas
   * (vienas atominis updateOne su sąlyga quantityAvailable >= kiekis) ir užsakymo įrašas.
   * Kiekvienas užsakymas rašo į tą patį lango dokumentą, todėl lygiagretūs užsakymai
   * tame pačiame lange gauna WriteConflict ir driveris transakciją pakartoja. Taip
   * kiekiai ir limitas vienam pirkėjui visada skaičiuojami nuo naujausių duomenų.
   */
  async create(input: CreateOrderInput): Promise<CreateOrderResponse> {
    const emailNormalized = normalizeEmail(input.customer.email);
    const phoneNormalized = normalizePhone(input.customer.phone);
    const accessToken = randomBytes(24).toString('base64url');

    const order = await this.connection.transaction(async (session) => {
      // Laikas imamas kiekvieno bandymo metu (transakcija gali būti kartojama).
      const now = new Date();

      const saleWindow = await this.saleWindowModel
        .findById(input.saleWindowId)
        .session(session)
        .lean<SaleWindow>()
        .exec();
      if (!saleWindow) {
        throw orderError(NotFoundException, 'SALE_WINDOW_NOT_FOUND', 'Pardavimo langas nerastas');
      }
      if (!isSaleWindowOpen(saleWindow, now)) {
        throw orderError(
          ConflictException,
          'SALE_WINDOW_CLOSED',
          'Šiuo metu užsakymai nepriimami: pardavimo langas uždarytas',
        );
      }

      this.assertFulfillmentAvailable(saleWindow, input.fulfillment.method);
      const lines = this.matchLines(saleWindow, input.items);
      await this.assertCustomerLimits(
        saleWindow._id,
        lines,
        emailNormalized,
        phoneNormalized,
        session,
      );
      this.assertStock(lines);
      const items = await this.buildItemSnapshots(lines, session);
      await this.reserveStock(saleWindow._id, lines, now, session);

      const year = getShopYear(now);
      const seq = await this.countersService.next(`order-${year}`, session);
      const orderNumber = `DW-${year}-${String(seq).padStart(4, '0')}`;

      const [created] = await this.orderModel.create(
        [
          {
            orderNumber,
            saleWindowId: saleWindow._id,
            customer: {
              name: input.customer.name,
              email: input.customer.email.trim(),
              emailNormalized,
              phone: input.customer.phone,
              phoneNormalized,
            },
            items,
            totalCents: items.reduce((sum, i) => sum + i.lineTotalCents, 0),
            currency: 'EUR',
            fulfillment: {
              method: input.fulfillment.method,
              address:
                input.fulfillment.method === 'delivery' ? input.fulfillment.address : undefined,
              notes: input.fulfillment.notes || undefined,
            },
            status: 'pending',
            statusHistory: [{ status: 'pending', at: now }],
            payment: { status: 'unpaid' },
            accessToken,
          },
        ],
        { session },
      );
      if (!created) throw new InternalServerErrorException('Nepavyko sukurti užsakymo');
      return created.toObject<Order>();
    });

    return { order: toOrderDto(order), accessToken };
  }

  /** Pirkėjo užsakymo peržiūra pagal slaptą nuorodą. */
  async findByAccessToken(accessToken: string): Promise<OrderDto> {
    const notFound = new NotFoundException('Užsakymas nerastas');
    if (!ACCESS_TOKEN_PATTERN.test(accessToken)) throw notFound;

    const order = await this.orderModel.findOne({ accessToken }).lean<Order>().exec();
    if (!order) throw notFound;
    return toOrderDto(order);
  }

  private assertFulfillmentAvailable(saleWindow: SaleWindow, method: 'pickup' | 'delivery'): void {
    const f = saleWindow.fulfillment;
    const available = method === 'pickup' ? f?.pickupAvailable : f?.deliveryAvailable;
    if (!available) {
      throw orderError(
        BadRequestException,
        'FULFILLMENT_NOT_AVAILABLE',
        method === 'pickup'
          ? 'Šiame pardavimo lange atsiėmimas negalimas'
          : 'Šiame pardavimo lange pristatymas negalimas',
      );
    }
  }

  private matchLines(saleWindow: SaleWindow, requested: CreateOrderInput['items']): OrderLine[] {
    return requested.map(({ variantId, quantity }) => {
      const windowItem = saleWindow.items.find((i) => i.variantId.equals(variantId));
      if (!windowItem) {
        throw orderError(
          BadRequestException,
          'ITEM_NOT_IN_WINDOW',
          'Šios prekės nėra šiame pardavimo lange',
          { variantId },
        );
      }
      if (windowItem.maxPerOrder && quantity > windowItem.maxPerOrder) {
        throw orderError(
          BadRequestException,
          'MAX_PER_ORDER_EXCEEDED',
          `Vienu užsakymu galima pirkti ne daugiau kaip ${windowItem.maxPerOrder} vnt.`,
          { variantId, max: windowItem.maxPerOrder },
        );
      }
      return { variantId, quantity, windowItem };
    });
  }

  /**
   * „Minkštas“ limitas vienam pirkėjui per visą langą: sumuojami to paties el. pašto
   * ARBA telefono ne atšaukti užsakymai.
   */
  private async assertCustomerLimits(
    saleWindowId: Types.ObjectId,
    lines: OrderLine[],
    emailNormalized: string,
    phoneNormalized: string,
    session: ClientSession,
  ): Promise<void> {
    const limited = lines.filter((l) => l.windowItem.maxPerCustomer);
    if (limited.length === 0) return;

    const previous = await this.orderModel
      .aggregate<{ _id: Types.ObjectId; quantity: number }>([
        {
          $match: {
            saleWindowId,
            status: { $ne: 'cancelled' },
            $or: [
              { 'customer.emailNormalized': emailNormalized },
              { 'customer.phoneNormalized': phoneNormalized },
            ],
          },
        },
        { $unwind: '$items' },
        { $match: { 'items.variantId': { $in: limited.map((l) => l.windowItem.variantId) } } },
        { $group: { _id: '$items.variantId', quantity: { $sum: '$items.quantity' } } },
      ])
      .session(session)
      .exec();

    for (const line of limited) {
      const max = line.windowItem.maxPerCustomer!;
      const alreadyOrdered =
        previous.find((p) => p._id.equals(line.windowItem.variantId))?.quantity ?? 0;
      if (alreadyOrdered + line.quantity > max) {
        const remaining = Math.max(0, max - alreadyOrdered);
        throw orderError(
          ConflictException,
          'MAX_PER_CUSTOMER_EXCEEDED',
          remaining > 0
            ? `Šios prekės vienam pirkėjui dar galite užsakyti ${remaining} vnt.`
            : 'Šios prekės jau užsakėte maksimalų kiekį',
          { variantId: line.variantId, max, remaining },
        );
      }
    }
  }

  /** Aiški klaida pirkėjui, kurių prekių nebeužtenka (pagal transakcijos momentinį vaizdą). */
  private assertStock(lines: OrderLine[]): void {
    const short = lines
      .filter((l) => l.windowItem.quantityAvailable < l.quantity)
      .map((l) => ({
        variantId: l.variantId,
        requested: l.quantity,
        available: l.windowItem.quantityAvailable,
      }));
    if (short.length > 0) {
      throw orderError(ConflictException, 'INSUFFICIENT_STOCK', 'Kai kurių prekių nebeužtenka', {
        items: short,
      });
    }
  }

  private async buildItemSnapshots(
    lines: OrderLine[],
    session: ClientSession,
  ): Promise<OrderItem[]> {
    const productIds = [...new Set(lines.map((l) => l.windowItem.productId.toString()))];
    const products = await this.productModel
      .find({ _id: { $in: productIds } })
      .session(session)
      .lean<Product[]>()
      .exec();
    const productsById = new Map(products.map((p) => [p._id.toString(), p]));

    return lines.map((line) => {
      const product = productsById.get(line.windowItem.productId.toString());
      const variant = product?.variants.find((v) => v._id.equals(line.windowItem.variantId));
      if (!product || !variant) {
        throw orderError(BadRequestException, 'ITEM_UNAVAILABLE', 'Prekė nebeparduodama', {
          variantId: line.variantId,
        });
      }
      return {
        productId: product._id,
        variantId: variant._id,
        productName: product.name,
        variantName: variant.name,
        unitPriceCents: line.windowItem.priceCents, // lango kaina, ne bazinė
        quantity: line.quantity,
        lineTotalCents: line.windowItem.priceCents * line.quantity,
      };
    });
  }

  /**
   * Vienas atominis updateOne: langas vis dar atidarytas ir kiekvienos prekės
   * quantityAvailable >= kiekis. Jei bent viena sąlyga netenkinama, nieko nekeičiama.
   */
  private async reserveStock(
    saleWindowId: Types.ObjectId,
    lines: OrderLine[],
    now: Date,
    session: ClientSession,
  ): Promise<void> {
    const result = await this.saleWindowModel
      .updateOne(
        {
          _id: saleWindowId,
          status: 'published',
          opensAt: { $lte: now },
          closesAt: { $gt: now },
          $and: lines.map((l) => ({
            items: {
              $elemMatch: {
                variantId: l.windowItem.variantId,
                quantityAvailable: { $gte: l.quantity },
              },
            },
          })),
        },
        {
          $inc: Object.fromEntries(
            lines.map((l, i) => [`items.$[i${i}].quantityAvailable`, -l.quantity]),
          ),
        },
        {
          arrayFilters: lines.map((l, i) => ({ [`i${i}.variantId`]: l.windowItem.variantId })),
          session,
        },
      )
      .exec();

    if (result.modifiedCount !== 1) {
      // Neturėtų nutikti po assertStock, bet tai paskutinė apsauga nuo perpardavimo.
      throw orderError(ConflictException, 'INSUFFICIENT_STOCK', 'Kai kurių prekių nebeužtenka');
    }
  }
}
