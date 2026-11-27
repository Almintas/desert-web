import { randomBytes } from 'node:crypto';
import {
  type CreateOrderInput,
  type CreateOrderResponse,
  getShopYear,
  isSaleWindowOpen,
  normalizeEmail,
  normalizePhone,
  type OrderAccessDto,
  type OrderErrorCode,
  type OrderItemProblemDto,
  type PaymentMethod,
} from '@desert-web/shared';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { type ClientSession, type Connection, type Model, mongo, type Types } from 'mongoose';
import { CountersService } from '../counters/counters.service';
import { OrderNotificationsService } from '../notifications/order-notifications.service';
import { Product } from '../products/product.schema';
import {
  giftWrapAllowedOf,
  giftWrapOf,
  SaleWindow,
  type SaleWindowItem,
} from '../sale-windows/sale-window.schema';
import { TurnstileService } from '../turnstile/turnstile.service';
import { Order, type OrderItem } from './order.schema';
import { toOrderAccessDto, toOrderDto } from './orders.mapper';

/** Užsakymo eilutė, suporuota su lango preke. */
interface OrderLine {
  variantId: string;
  quantity: number;
  /** Kiek vienetų supakuoti kaip dovaną (schema jau užtikrino 0..quantity). */
  giftWrapQuantity: number;
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

/**
 * Prekių klaida su `details.items` (kurios eilutės ir kiek dar leidžiama). Pirmos eilutės
 * `variantId` paliekamas ir viršutiniame lygyje (suderinamumui su ankstesniais klientais).
 */
function itemError(
  Exception: new (body: object) => Error,
  code: OrderErrorCode,
  message: string,
  items: OrderItemProblemDto[],
  extra: Record<string, unknown> = {},
): Error {
  return orderError(Exception, code, message, {
    variantId: items[0]?.variantId,
    ...extra,
    details: { items },
  });
}

const PAYMENT_METHOD: PaymentMethod = 'on_pickup';

/** Užsakymo sumos iš eilučių kopijų: prekės + dovanų pakavimas. */
function sumTotals(items: OrderItem[]) {
  const itemsTotalCents = items.reduce((sum, i) => sum + i.lineTotalCents, 0);
  const giftWrapTotalCents = items.reduce((sum, i) => sum + (i.giftWrapTotalCents ?? 0), 0);
  return { itemsTotalCents, giftWrapTotalCents, totalCents: itemsTotalCents + giftWrapTotalCents };
}

/** Rezultatas su požymiu, ar užsakymas sukurtas dabar (201), ar rastas pagal clientRequestId (200). */
export interface CreateOrderResult {
  response: CreateOrderResponse;
  created: boolean;
}

const isDuplicateKeyError = (error: unknown): boolean =>
  error instanceof mongo.MongoServerError && error.code === 11000;

@Injectable()
export class OrdersService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(Order.name) private readonly orderModel: Model<Order>,
    @InjectModel(SaleWindow.name) private readonly saleWindowModel: Model<SaleWindow>,
    @InjectModel(Product.name) private readonly productModel: Model<Product>,
    private readonly countersService: CountersService,
    private readonly turnstile: TurnstileService,
    private readonly notifications: OrderNotificationsService,
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
  async create(
    input: CreateOrderInput,
    context: { clientIp?: string } = {},
  ): Promise<CreateOrderResult> {
    // Pakartojimas jau sukurto užsakymo (tas pats clientRequestId, langas ir el. paštas)
    // grąžinamas be Turnstile: pirkėjas, kuriam dingo atsakymas, neturi gauti klaidos.
    const replay = await this.findByClientRequestId(input);
    if (replay) return replay;

    // Tik naujam užsakymui: tokenas tikrinamas PRIEŠ transakciją, todėl nepavykus
    // niekas nerezervuojama. idempotency_key = clientRequestId, kad lygiagretus to paties
    // pateikimo dublikatas (dvigubas paspaudimas) negautų timeout-or-duplicate.
    await this.turnstile.verify(input.turnstileToken, {
      remoteIp: context.clientIp,
      idempotencyKey: input.clientRequestId,
    });

    try {
      const { order, ...result } = await this.createOnce(input);
      // Tik naujam užsakymui ir tik po commit'o: transakcija galėjo būti kartojama, bet
      // createOnce grąžina paskutinio (sėkmingo) bandymo rezultatą. Laiškai siunčiami fone.
      if (result.created && order) this.notifications.orderCreated(order);
      return result;
    } catch (error) {
      // Lygiagretus dublikatas, kurio transakcija commit'ino tarp mūsų patikrinimo ir įrašo.
      // Paprastai tai baigiasi WriteConflict ir driverio pakartojimu (tada transakcijos
      // pradžioje dublikatą jau randam), bet E11000 atveju grąžinam esamą užsakymą čia.
      if (isDuplicateKeyError(error)) {
        const existing = await this.findByClientRequestId(input);
        if (existing) return existing;
      }
      throw error;
    }
  }

  /**
   * Viskas vyksta vienoje transakcijoje: idempotencijos patikrinimas, lango tikrinimas,
   * limitai, kiekių rezervavimas (vienas atominis updateOne su sąlyga quantityAvailable >=
   * kiekis) ir užsakymo įrašas. Kiekvienas užsakymas rašo į tą patį lango dokumentą, todėl
   * lygiagretūs užsakymai tame pačiame lange gauna WriteConflict ir driveris transakciją
   * pakartoja. Taip kiekiai, limitas vienam pirkėjui ir clientRequestId patikrinimas visada
   * remiasi naujausiais duomenimis: pakartotas dublikatas randa jau sukurtą užsakymą ir
   * kiekio antrą kartą nerezervuoja.
   */
  private async createOnce(
    input: CreateOrderInput,
  ): Promise<CreateOrderResult & { order?: Order }> {
    const emailNormalized = normalizeEmail(input.customer.email);
    const phoneNormalized = normalizePhone(input.customer.phone);
    const accessToken = randomBytes(24).toString('base64url');

    return this.connection.transaction(
      async (session): Promise<CreateOrderResult & { order?: Order }> => {
        // Pirmiausia idempotencija: pakartojimas grąžina užsakymą net jei langas jau uždarytas.
        const existing = await this.findByClientRequestId(input, session);
        if (existing) return existing;

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
        this.assertGiftWrapAvailable(saleWindow, lines);
        await this.assertCustomerLimits(
          saleWindow._id,
          lines,
          emailNormalized,
          phoneNormalized,
          session,
        );
        this.assertStock(lines);
        const items = await this.buildItemSnapshots(
          lines,
          giftWrapOf(saleWindow).priceCents,
          session,
        );
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
              ...sumTotals(items),
              currency: 'EUR',
              fulfillment: {
                method: input.fulfillment.method,
                address:
                  input.fulfillment.method === 'delivery' ? input.fulfillment.address : undefined,
                notes: input.fulfillment.notes || undefined,
              },
              status: 'pending',
              statusHistory: [{ status: 'pending', at: now }],
              payment: { status: 'unpaid', method: PAYMENT_METHOD },
              accessToken,
              clientRequestId: input.clientRequestId,
            },
          ],
          { session },
        );
        if (!created) throw new InternalServerErrorException('Failed to create order');
        const order = created.toObject<Order>();
        return { response: { order: toOrderDto(order), accessToken }, created: true, order };
      },
    );
  }

  /**
   * Jau sukurtas užsakymas su tuo pačiu clientRequestId. Grąžinamas tik tam pačiam langui ir
   * tam pačiam pirkėjui (el. paštas): ID nėra slaptas raktas, todėl svetimam užklausos
   * pakartojimui užsakymo (ir accessToken) neatiduodam.
   */
  private async findByClientRequestId(
    input: CreateOrderInput,
    session?: ClientSession,
  ): Promise<CreateOrderResult | null> {
    const query = this.orderModel.findOne({ clientRequestId: input.clientRequestId });
    if (session) query.session(session);
    const order = await query.lean<Order>().exec();
    if (!order) return null;

    const sameRequest =
      order.saleWindowId.equals(input.saleWindowId) &&
      order.customer.emailNormalized === normalizeEmail(input.customer.email);
    if (!sameRequest) {
      throw orderError(
        ConflictException,
        'IDEMPOTENCY_CONFLICT',
        'Ši užklausa jau panaudota kitam užsakymui. Atnaujinkite puslapį ir bandykite dar kartą.',
      );
    }
    return {
      response: { order: toOrderDto(order), accessToken: order.accessToken },
      created: false,
    };
  }

  /** Pirkėjo užsakymo peržiūra pagal slaptą nuorodą (su lango pavadinimu). */
  async findByAccessToken(accessToken: string): Promise<OrderAccessDto> {
    const notFound = new NotFoundException('Užsakymas nerastas');
    if (!ACCESS_TOKEN_PATTERN.test(accessToken)) throw notFound;

    const order = await this.orderModel.findOne({ accessToken }).lean<Order>().exec();
    if (!order) throw notFound;
    const saleWindow = await this.saleWindowModel
      .findById(order.saleWindowId, { title: 1 })
      .lean<Pick<SaleWindow, '_id' | 'title'>>()
      .exec();
    return toOrderAccessDto(order, saleWindow);
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
    const notInWindow: OrderItemProblemDto[] = [];
    const overMax: OrderItemProblemDto[] = [];
    const lines: OrderLine[] = [];
    for (const { variantId, quantity, giftWrapQuantity } of requested) {
      const windowItem = saleWindow.items.find((i) => i.variantId.equals(variantId));
      if (!windowItem) {
        notInWindow.push({ variantId, requested: quantity, allowed: 0 });
        continue;
      }
      if (windowItem.maxPerOrder && quantity > windowItem.maxPerOrder) {
        overMax.push({ variantId, requested: quantity, allowed: windowItem.maxPerOrder });
      }
      lines.push({ variantId, quantity, giftWrapQuantity, windowItem });
    }

    if (notInWindow.length > 0) {
      throw itemError(
        BadRequestException,
        'ITEM_NOT_IN_WINDOW',
        'Šios prekės nėra šiame pardavimo lange',
        notInWindow,
      );
    }
    if (overMax.length > 0) {
      const max = overMax[0]!.allowed;
      throw itemError(
        BadRequestException,
        'MAX_PER_ORDER_EXCEEDED',
        overMax.length === 1
          ? `Vienu užsakymu galima pirkti ne daugiau kaip ${max} vnt.`
          : 'Kai kurių prekių vienu užsakymu galima pirkti mažiau',
        overMax,
        { max },
      );
    }
    return lines;
  }

  /**
   * Dovanų pakavimas: lange įjungtas ir prekė jį leidžia. Kainos kopija imama iš to paties
   * transakcijos momentinio lango vaizdo; lygiagretus admino lango PUT rašo tą patį dokumentą,
   * todėl viena transakcija gauna WriteConflict ir kartojama su naujausiais duomenimis.
   */
  private assertGiftWrapAvailable(saleWindow: SaleWindow, lines: OrderLine[]): void {
    const enabled = giftWrapOf(saleWindow).enabled;
    const unavailable = lines
      .filter((l) => l.giftWrapQuantity > 0 && (!enabled || !giftWrapAllowedOf(l.windowItem)))
      .map((l) => ({ variantId: l.variantId, requested: l.giftWrapQuantity, allowed: 0 }));
    if (unavailable.length === 0) return;
    throw itemError(
      ConflictException,
      'GIFT_WRAP_UNAVAILABLE',
      enabled
        ? 'Kai kurių prekių supakuoti kaip dovaną negalima'
        : 'Šiame pardavime supakuoti kaip dovaną nebegalima',
      unavailable,
    );
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

    const exceeded: (OrderItemProblemDto & { max: number })[] = [];
    for (const line of limited) {
      const max = line.windowItem.maxPerCustomer!;
      const alreadyOrdered =
        previous.find((p) => p._id.equals(line.windowItem.variantId))?.quantity ?? 0;
      if (alreadyOrdered + line.quantity > max) {
        exceeded.push({
          variantId: line.variantId,
          requested: line.quantity,
          allowed: Math.max(0, max - alreadyOrdered),
          max,
        });
      }
    }
    if (exceeded.length === 0) return;

    const first = exceeded[0]!;
    throw itemError(
      ConflictException,
      'MAX_PER_CUSTOMER_EXCEEDED',
      exceeded.length > 1
        ? 'Kai kurių prekių vienam pirkėjui galima užsakyti mažiau'
        : first.allowed > 0
          ? `Šios prekės vienam pirkėjui dar galite užsakyti ${first.allowed} vnt.`
          : 'Šios prekės jau užsakėte maksimalų kiekį',
      exceeded.map(({ variantId, requested, allowed }) => ({ variantId, requested, allowed })),
      { max: first.max, remaining: first.allowed },
    );
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
      throw itemError(
        ConflictException,
        'INSUFFICIENT_STOCK',
        'Kai kurių prekių nebeužtenka',
        short.map((s) => ({
          variantId: s.variantId,
          requested: s.requested,
          allowed: s.available,
        })),
        { items: short },
      );
    }
  }

  /** `giftWrapPriceCents`: lango pakavimo kaina užsakymo metu (kopija į eilutes). */
  private async buildItemSnapshots(
    lines: OrderLine[],
    giftWrapPriceCents: number,
    session: ClientSession,
  ): Promise<OrderItem[]> {
    const productIds = [...new Set(lines.map((l) => l.windowItem.productId.toString()))];
    const products = await this.productModel
      .find({ _id: { $in: productIds } })
      .session(session)
      .lean<Product[]>()
      .exec();
    const productsById = new Map(products.map((p) => [p._id.toString(), p]));

    const unavailable = lines.filter((line) => {
      const product = productsById.get(line.windowItem.productId.toString());
      return !product?.variants.some((v) => v._id.equals(line.windowItem.variantId));
    });
    if (unavailable.length > 0) {
      throw itemError(
        BadRequestException,
        'ITEM_UNAVAILABLE',
        'Prekė nebeparduodama',
        unavailable.map((l) => ({ variantId: l.variantId, requested: l.quantity, allowed: 0 })),
      );
    }

    return lines.map((line) => {
      const product = productsById.get(line.windowItem.productId.toString())!;
      const variant = product.variants.find((v) => v._id.equals(line.windowItem.variantId))!;
      const giftWrapUnitPriceCents = line.giftWrapQuantity > 0 ? giftWrapPriceCents : 0;
      return {
        productId: product._id,
        variantId: variant._id,
        productName: product.name,
        variantName: variant.name,
        unitPriceCents: line.windowItem.priceCents, // lango kaina, ne bazinė
        quantity: line.quantity,
        lineTotalCents: line.windowItem.priceCents * line.quantity,
        giftWrapQuantity: line.giftWrapQuantity,
        giftWrapUnitPriceCents,
        giftWrapTotalCents: giftWrapUnitPriceCents * line.giftWrapQuantity,
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
      // Kad klientas žinotų, ką pakeisti, perskaitom dabartinius kiekius.
      const fresh = await this.saleWindowModel
        .findById(saleWindowId, { items: 1 })
        .session(session)
        .lean<Pick<SaleWindow, 'items'>>()
        .exec();
      const short = lines
        .map((l) => ({
          variantId: l.variantId,
          requested: l.quantity,
          available:
            fresh?.items.find((i) => i.variantId.equals(l.windowItem.variantId))
              ?.quantityAvailable ?? 0,
        }))
        .filter((l) => l.available < l.requested);
      throw itemError(
        ConflictException,
        'INSUFFICIENT_STOCK',
        'Kai kurių prekių nebeužtenka',
        short.map((l) => ({
          variantId: l.variantId,
          requested: l.requested,
          allowed: l.available,
        })),
        { items: short },
      );
    }
  }
}
