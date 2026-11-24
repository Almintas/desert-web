import { randomBytes } from 'node:crypto';
import {
  addCalendarDays,
  type CreateSpecialOrderInput,
  type CreateSpecialOrderResponse,
  formatCalendarDate,
  getShopYear,
  normalizeEmail,
  normalizePhone,
  type PaymentMethod,
  type SpecialOrderConfigDto,
  type SpecialOrderDto,
  type SpecialOrderQuantityProblemDto,
  type SpecialOrderSettings,
  shopToday,
} from '@desert-web/shared';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { type ClientSession, type Connection, type Model, mongo } from 'mongoose';
import { CountersService } from '../counters/counters.service';
import { Product } from '../products/product.schema';
import { toPublicImages } from '../products/products.mapper';
import { SettingsService } from '../settings/settings.service';
import { TurnstileService } from '../turnstile/turnstile.service';
import { specialOrderError } from './special-order-errors';
import { SpecialOrder, type SpecialOrderItem } from './special-order.schema';
import { toSpecialOrderDto } from './special-orders.mapper';

const ACCESS_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32}$/;
const PAYMENT_METHOD: PaymentMethod = 'on_pickup';

const isDuplicateKeyError = (error: unknown): boolean =>
  error instanceof mongo.MongoServerError && error.code === 11000;

/** Leidžiamų datų intervalas (imtinai) šiandienai Vilniaus laiku. */
export function specialOrderDateRange(
  settings: Pick<SpecialOrderSettings, 'leadTimeDays' | 'maxDaysAhead'>,
  now: Date = new Date(),
): { earliestDate: string; latestDate: string } {
  const today = shopToday(now);
  return {
    earliestDate: addCalendarDays(today, settings.leadTimeDays),
    latestDate: addCalendarDays(today, settings.maxDaysAhead),
  };
}

/** Ar produktą šiuo metu galima užsakyti specialiu užsakymu. */
const isEligible = (p: Product): boolean => p.isActive && p.specialOrder?.enabled === true;
const minQuantityOf = (p: Product): number => p.specialOrder?.minQuantity ?? 1;

export interface CreateSpecialOrderResult {
  response: CreateSpecialOrderResponse;
  /** true: sukurta dabar (201); false: rasta pagal clientRequestId (200). */
  created: boolean;
}

/** Vieši (pirkėjų) specialių užsakymų veiksmai. Admin valdymas: admin-special-orders. */
@Injectable()
export class SpecialOrdersService {
  private readonly logger = new Logger(SpecialOrdersService.name);

  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(SpecialOrder.name) private readonly specialOrderModel: Model<SpecialOrder>,
    @InjectModel(Product.name) private readonly productModel: Model<Product>,
    private readonly settings: SettingsService,
    private readonly countersService: CountersService,
    private readonly turnstile: TurnstileService,
  ) {}

  /** Formos duomenys: datų ribos ir tinkami produktai (išjungus: tuščias sąrašas). */
  async config(now: Date = new Date()): Promise<SpecialOrderConfigDto> {
    const settings = await this.settings.specialOrders();
    const base = {
      enabled: settings.enabled,
      leadTimeDays: settings.leadTimeDays,
      maxDaysAhead: settings.maxDaysAhead,
      ...specialOrderDateRange(settings, now),
    };
    if (!settings.enabled) return { ...base, products: [] };

    const products = await this.productModel
      .find({ isActive: true, 'specialOrder.enabled': true, 'variants.0': { $exists: true } })
      .sort({ category: 1, name: 1 })
      .lean<Product[]>()
      .exec();
    return {
      ...base,
      products: products.map((p) => ({
        id: p._id.toString(),
        name: p.name,
        slug: p.slug,
        description: p.description ?? '',
        category: p.category,
        allergens: p.allergens ?? [],
        images: toPublicImages(p),
        minQuantity: minQuantityOf(p),
        variants: p.variants.map((v) => ({
          id: v._id.toString(),
          name: v.name,
          priceCents: v.priceCents,
        })),
      })),
    };
  }

  /**
   * Nauja užklausa. Eilė kaip POST /orders: idempotentiškas pakartojimas (be Turnstile) →
   * Turnstile → transakcija (nustatymai, data, produktai, kiekiai, numeris, įrašas).
   * Pardavimo langų kiekių nekeičia.
   */
  async create(
    input: CreateSpecialOrderInput,
    context: { clientIp?: string } = {},
  ): Promise<CreateSpecialOrderResult> {
    const replay = await this.findByClientRequestId(input);
    if (replay) return replay;

    await this.turnstile.verify(input.turnstileToken, {
      remoteIp: context.clientIp,
      idempotencyKey: input.clientRequestId,
    });

    try {
      const { specialOrder, ...result } = await this.createOnce(input);
      if (result.created && specialOrder) this.afterCreated(specialOrder);
      return result;
    } catch (error) {
      // Lygiagretus to paties pateikimo dublikatas commit'ino pirmas.
      if (isDuplicateKeyError(error)) {
        const existing = await this.findByClientRequestId(input);
        if (existing) return existing;
      }
      throw error;
    }
  }

  /**
   * Plėtinio vieta (2 dalis): laiškas pardavėjui apie naują užklausą ir pirkėjui su nuoroda.
   * Kviečiama tik po commit'o ir tik naujai užklausai.
   */
  private afterCreated(specialOrder: SpecialOrder): void {
    // TODO(special-orders, 2 dalis): laiškai (pardavėjui ir pirkėjui), kaip OrderNotificationsService.
    this.logger.log(`Special order ${specialOrder.requestNumber} requested`);
  }

  private async createOnce(
    input: CreateSpecialOrderInput,
  ): Promise<CreateSpecialOrderResult & { specialOrder?: SpecialOrder }> {
    const emailNormalized = normalizeEmail(input.customer.email);
    const phoneNormalized = normalizePhone(input.customer.phone);
    const accessToken = randomBytes(24).toString('base64url');

    return this.connection.transaction(async (session) => {
      const existing = await this.findByClientRequestId(input, session);
      if (existing) return existing;

      // Laikas imamas kiekvieno bandymo metu (transakcija gali būti kartojama).
      const now = new Date();
      const settings = await this.settings.specialOrders(session);
      if (!settings.enabled) {
        throw specialOrderError(
          ConflictException,
          'SPECIAL_ORDERS_DISABLED',
          'Specialūs užsakymai šiuo metu nepriimami.',
        );
      }
      this.assertDesiredDate(input.desiredDate, settings, now);
      const items = await this.buildItemSnapshots(input.items, session);

      const year = getShopYear(now);
      const seq = await this.countersService.next(`special-order-${year}`, session);
      const requestNumber = `SP-${year}-${String(seq).padStart(4, '0')}`;

      const [created] = await this.specialOrderModel.create(
        [
          {
            requestNumber,
            customer: {
              name: input.customer.name,
              email: input.customer.email.trim(),
              emailNormalized,
              phone: input.customer.phone,
              phoneNormalized,
            },
            desiredDate: input.desiredDate,
            items,
            estimatedTotalCents: items.reduce((sum, i) => sum + i.estimatedLineTotalCents, 0),
            currency: 'EUR',
            customerNotes: input.customerNotes,
            fulfillment: { method: 'pickup' },
            status: 'requested',
            statusHistory: [{ status: 'requested', at: now }],
            payment: { status: 'unpaid', method: PAYMENT_METHOD },
            accessToken,
            clientRequestId: input.clientRequestId,
          },
        ],
        { session },
      );
      if (!created) throw new InternalServerErrorException('Failed to create special order');
      const specialOrder = created.toObject<SpecialOrder>();
      return {
        response: { specialOrder: toSpecialOrderDto(specialOrder), accessToken },
        created: true,
        specialOrder,
      };
    });
  }

  /** desiredDate ∈ [šiandien + leadTimeDays, šiandien + maxDaysAhead] (Vilniaus kalendorius). */
  private assertDesiredDate(desiredDate: string, settings: SpecialOrderSettings, now: Date): void {
    const { earliestDate, latestDate } = specialOrderDateRange(settings, now);
    // „YYYY-MM-DD“ eilučių palyginimas sutampa su chronologiniu.
    if (desiredDate < earliestDate) {
      throw specialOrderError(
        BadRequestException,
        'DESIRED_DATE_TOO_EARLY',
        `Anksčiausia galima data: ${formatCalendarDate(earliestDate)}.`,
        { details: { earliestDate } },
      );
    }
    if (desiredDate > latestDate) {
      throw specialOrderError(
        BadRequestException,
        'DESIRED_DATE_TOO_LATE',
        `Vėliausia galima data: ${formatCalendarDate(latestDate)}.`,
        { details: { latestDate } },
      );
    }
  }

  /**
   * Eilučių kopijos: produktas aktyvus ir leidžia specialius užsakymus, kiekis ne mažesnis už
   * product.specialOrder.minQuantity, kaina = bazinė varianto priceCents.
   */
  private async buildItemSnapshots(
    requested: CreateSpecialOrderInput['items'],
    session: ClientSession,
  ): Promise<SpecialOrderItem[]> {
    const products = await this.productModel
      .find({ 'variants._id': { $in: requested.map((i) => i.variantId) } })
      .session(session)
      .lean<Product[]>()
      .exec();

    const unavailable: { variantId: string; requested: number }[] = [];
    const belowMinimum: SpecialOrderQuantityProblemDto[] = [];
    const items: SpecialOrderItem[] = [];
    for (const { variantId, quantity } of requested) {
      const product = products.find((p) => p.variants.some((v) => v._id.equals(variantId)));
      if (!product || !isEligible(product)) {
        unavailable.push({ variantId, requested: quantity });
        continue;
      }
      const minimum = minQuantityOf(product);
      if (quantity < minimum) belowMinimum.push({ variantId, requested: quantity, minimum });
      const variant = product.variants.find((v) => v._id.equals(variantId))!;
      items.push({
        productId: product._id,
        variantId: variant._id,
        productName: product.name,
        variantName: variant.name,
        quantity,
        estimatedUnitPriceCents: variant.priceCents,
        estimatedLineTotalCents: variant.priceCents * quantity,
      });
    }

    if (unavailable.length > 0) {
      throw specialOrderError(
        BadRequestException,
        'PRODUCT_NOT_AVAILABLE',
        unavailable.length === 1
          ? 'Šios prekės specialiu užsakymu užsakyti negalima.'
          : 'Kai kurių prekių specialiu užsakymu užsakyti negalima.',
        { details: { items: unavailable } },
      );
    }
    if (belowMinimum.length > 0) {
      throw specialOrderError(
        BadRequestException,
        'QUANTITY_BELOW_MINIMUM',
        belowMinimum.length === 1
          ? `Mažiausias kiekis specialiam užsakymui: ${belowMinimum[0]!.minimum} vnt.`
          : 'Kai kurių prekių kiekis mažesnis nei leidžiamas specialiam užsakymui.',
        { details: { items: belowMinimum } },
      );
    }
    return items;
  }

  /**
   * Jau sukurta užklausa su tuo pačiu clientRequestId. Grąžinama tik tam pačiam pirkėjui
   * (el. paštas): ID nėra slaptas, todėl svetimam pakartojimui accessToken neatiduodam.
   */
  private async findByClientRequestId(
    input: CreateSpecialOrderInput,
    session?: ClientSession,
  ): Promise<CreateSpecialOrderResult | null> {
    const query = this.specialOrderModel.findOne({ clientRequestId: input.clientRequestId });
    if (session) query.session(session);
    const existing = await query.lean<SpecialOrder>().exec();
    if (!existing) return null;
    if (existing.customer.emailNormalized !== normalizeEmail(input.customer.email)) {
      throw specialOrderError(
        ConflictException,
        'IDEMPOTENCY_CONFLICT',
        'Ši užklausa jau panaudota. Atnaujinkite puslapį ir bandykite dar kartą.',
      );
    }
    return {
      response: { specialOrder: toSpecialOrderDto(existing), accessToken: existing.accessToken },
      created: false,
    };
  }

  /** Pirkėjo užklausos peržiūra pagal slaptą nuorodą (be vidinių laukų). */
  async findByAccessToken(accessToken: string): Promise<SpecialOrderDto> {
    const notFound = () =>
      specialOrderError(NotFoundException, 'SPECIAL_ORDER_NOT_FOUND', 'Užklausa nerasta');
    if (!ACCESS_TOKEN_PATTERN.test(accessToken)) throw notFound();
    const specialOrder = await this.specialOrderModel
      .findOne({ accessToken })
      .lean<SpecialOrder>()
      .exec();
    if (!specialOrder) throw notFound();
    return toSpecialOrderDto(specialOrder);
  }
}
