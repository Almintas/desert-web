import {
  type AdminSaleWindowDto,
  type AdminSaleWindowInput,
  getSaleWindowPhase,
  missingPickupInfo,
  objectIdSchema,
  type SaleWindowErrorCode,
} from '@desert-web/shared';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { type ClientSession, type Connection, type Model, Types } from 'mongoose';
import { Order } from '../orders/order.schema';
import { Product } from '../products/product.schema';
import { SaleWindow, type SaleWindowItem } from '../sale-windows/sale-window.schema';
import { type OrderStats, toAdminSaleWindowDto } from './admin-sale-windows.mapper';

function windowError(
  Exception: new (body: object) => Error,
  code: SaleWindowErrorCode,
  message: string,
  extra: Record<string, unknown> = {},
): Error {
  return new Exception({ code, message, ...extra });
}

const notFound = () =>
  windowError(NotFoundException, 'SALE_WINDOW_NOT_FOUND', 'Pardavimo langas nerastas');

const invalidStatus = (message: string) =>
  windowError(ConflictException, 'INVALID_STATUS', message);

const hasOrders = (message: string) => windowError(ConflictException, 'WINDOW_HAS_ORDERS', message);

const NOT_CANCELLED = { $ne: 'cancelled' } as const;

/**
 * Paskelbtas langas turi turėti atsiėmimo vietą ir laiką: pirkėjai užsako tik atsiėmimui,
 * o užsakymo puslapis yra vienintelė vieta, kur jie tai sužino. Juodraščiams netaikoma.
 */
function assertPickupInfo(fulfillment: Parameters<typeof missingPickupInfo>[0] | undefined): void {
  const missing = missingPickupInfo(fulfillment ?? {});
  if (missing.length > 0) {
    throw windowError(
      ConflictException,
      'PICKUP_INFO_REQUIRED',
      'Prieš skelbiant langą nurodyk atsiėmimo vietą ir laiką (nuo ir iki).',
      { missing },
    );
  }
}

const MINUTE_MS = 60_000;

/**
 * Admin forma laikus siunčia minutės tikslumu (datetime-local), o „Atidaryti dabar“ /
 * „Uždaryti dabar“ juos išsaugo su sekundėmis. Jei pateiktas laikas lygus išsaugotam,
 * nukirptam iki minutės, laikom, kad jis nekeistas, ir paliekam išsaugotą (su sekundėmis).
 * Kitaip nepakeistas langas „pasislinktų“ atgal iki minutės pradžios: pvz., ką tik
 * atidarytas langas „atsidarytų“ anksčiau, nei buvo atidarytas iš tikrųjų.
 */
function keepStoredSeconds(input: AdminSaleWindowInput, stored: SaleWindow): AdminSaleWindowInput {
  const keep = <T extends Date | undefined>(submitted: T, prev: Date | undefined): T =>
    submitted && prev && submitted.getTime() === Math.floor(prev.getTime() / MINUTE_MS) * MINUTE_MS
      ? (prev as T)
      : submitted;

  let opensAt = keep(input.opensAt, stored.opensAt);
  let closesAt = keep(input.closesAt, stored.closesAt);
  // Teoriškai išsaugotos sekundės galėtų sugadinti eiliškumą: tada imam pateiktus laikus.
  if (closesAt <= opensAt) ({ opensAt, closesAt } = input);

  const f = input.fulfillment;
  let pickupFrom = keep(f.pickupFrom, stored.fulfillment?.pickupFrom);
  let pickupTo = keep(f.pickupTo, stored.fulfillment?.pickupTo);
  if (pickupFrom && pickupTo && pickupTo <= pickupFrom) ({ pickupFrom, pickupTo } = f);

  return { ...input, opensAt, closesAt, fulfillment: { ...f, pickupFrom, pickupTo } };
}

@Injectable()
export class AdminSaleWindowsService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(SaleWindow.name) private readonly saleWindowModel: Model<SaleWindow>,
    @InjectModel(Product.name) private readonly productModel: Model<Product>,
    @InjectModel(Order.name) private readonly orderModel: Model<Order>,
  ) {}

  /** Visi langai, naujausias opensAt pirmas. */
  async findAll(): Promise<AdminSaleWindowDto[]> {
    const windows = await this.saleWindowModel
      .find()
      .sort({ opensAt: -1, _id: -1 })
      .lean<SaleWindow[]>()
      .exec();
    return this.toDtos(windows);
  }

  async findById(id: string): Promise<AdminSaleWindowDto> {
    if (!objectIdSchema.safeParse(id).success) throw notFound();
    const w = await this.saleWindowModel.findById(id).lean<SaleWindow>().exec();
    if (!w) throw notFound();
    return (await this.toDtos([w]))[0]!;
  }

  /** Naujas langas visada kuriamas kaip juodraštis. */
  async create(input: AdminSaleWindowInput): Promise<AdminSaleWindowDto> {
    const created = await this.connection.transaction((s) => this.createInSession(input, s));
    return (await this.toDtos([created]))[0]!;
  }

  async createInSession(input: AdminSaleWindowInput, session: ClientSession): Promise<SaleWindow> {
    await this.assertItemsValid(input.items, new Set(), session);
    await this.linkProducts(input.items, session);
    const [created] = await this.saleWindowModel.create(
      [
        {
          ...this.windowFields(input),
          status: 'draft',
          items: input.items.map((i) => ({
            ...this.itemFields(i),
            quantityAvailable: i.quantityTotal,
          })),
        },
      ],
      { session },
    );
    return created!.toObject<SaleWindow>();
  }

  /**
   * Pilnas atnaujinimas. Prekės suporuojamos pagal variantId:
   * - nauja prekė: quantityAvailable = quantityTotal;
   * - esama: quantityAvailable keičiamas tiek pat, kiek quantityTotal (parduotas kiekis
   *   išlieka), o naujas quantityTotal negali būti mažesnis nei parduota;
   * - išimta: tik jei jos neturi neatšaukti užsakymai.
   * Kaina (ir dovanų pakavimo kaina bei jungikliai) keičiama laisvai: užsakymai saugo kainos
   * kopiją, todėl tai veikia tik naujus.
   *
   * Lygiagretūs užsakymai: transakcija skaito ir rašo lango dokumentą, o užsakymas
   * jame mažina quantityAvailable. Abu rašo tą patį dokumentą, todėl vienas gauna
   * WriteConflict ir kartojamas su naujausiais kiekiais (jokių prarastų atnaujinimų).
   */
  async update(id: string, input: AdminSaleWindowInput): Promise<AdminSaleWindowDto> {
    if (!objectIdSchema.safeParse(id).success) throw notFound();
    const updated = await this.connection.transaction((s) => this.updateInSession(id, input, s));
    return (await this.toDtos([updated]))[0]!;
  }

  async updateInSession(
    id: string,
    input: AdminSaleWindowInput,
    session: ClientSession,
  ): Promise<SaleWindow> {
    const stored = await this.loadEditable(id, session);
    input = keepStoredSeconds(input, stored);
    const storedByVariant = new Map(stored.items.map((i) => [i.variantId.toString(), i]));
    await this.assertItemsValid(input.items, new Set(storedByVariant.keys()), session);

    const inputVariants = new Set(input.items.map((i) => i.variantId));
    const removed = stored.items.filter((i) => !inputVariants.has(i.variantId.toString()));
    if (removed.length > 0) {
      const ordered = await this.orderedVariantIds(
        stored._id,
        removed.map((i) => i.variantId),
        session,
      );
      if (ordered.length > 0) {
        throw windowError(
          ConflictException,
          'ITEM_HAS_ORDERS',
          'Prekės, kurią jau užsakė pirkėjai, iš lango išimti negalima. Vietoj to nustatyk ' +
            'jos kiekį lygų parduotam.',
          { variantId: ordered[0], variantIds: ordered },
        );
      }
    }

    const items = input.items.map((i) => {
      const prev = storedByVariant.get(i.variantId);
      if (!prev) return { ...this.itemFields(i), quantityAvailable: i.quantityTotal };
      const sold = prev.quantityTotal - prev.quantityAvailable;
      if (i.quantityTotal < sold) {
        throw windowError(
          ConflictException,
          'QUANTITY_BELOW_SOLD',
          `Kiekis negali būti mažesnis nei jau parduota (${sold} vnt.)`,
          { variantId: i.variantId, sold, requestedTotal: i.quantityTotal },
        );
      }
      return { ...this.itemFields(i), quantityAvailable: i.quantityTotal - sold };
    });

    if (stored.status === 'published') assertPickupInfo(input.fulfillment);

    await this.linkProducts(input.items, session);
    const updated = await this.saleWindowModel
      .findByIdAndUpdate(
        stored._id,
        { $set: { ...this.windowFields(input), items } },
        { new: true, runValidators: true, session },
      )
      .lean<SaleWindow>()
      .exec();
    if (!updated) throw notFound();
    return updated;
  }

  /** draft -> published (jei turi atsiėmimo info). Paskelbti langai gali persidengti. */
  publish(id: string): Promise<AdminSaleWindowDto> {
    return this.mutate(id, async (w, _session, now) => {
      if (w.status !== 'draft') throw invalidStatus('Paskelbti galima tik juodraštį');
      if (w.closesAt <= now) {
        throw invalidStatus('Lango pabaiga jau praėjo. Pirmiau pakeisk lango laikus.');
      }
      assertPickupInfo(w.fulfillment);
      return { status: 'published' };
    });
  }

  /** published -> draft, tik jei lange nėra neatšauktų užsakymų. */
  unpublish(id: string): Promise<AdminSaleWindowDto> {
    return this.mutate(id, async (w, session) => {
      if (w.status !== 'published') throw invalidStatus('Langas nėra paskelbtas');
      if ((await this.countOrders(w._id, session)) > 0) {
        throw hasOrders('Lange jau yra užsakymų, todėl grąžinti į juodraštį negalima');
      }
      return { status: 'draft' };
    });
  }

  /** draft / published -> cancelled, tik jei nėra neatšauktų užsakymų. */
  cancel(id: string): Promise<AdminSaleWindowDto> {
    return this.mutate(id, async (w, session) => {
      if ((await this.countOrders(w._id, session)) > 0) {
        throw hasOrders(
          'Lange jau yra užsakymų, todėl atšaukti negalima. Pirmiau reikia atšaukti užsakymus.',
        );
      }
      return { status: 'cancelled' };
    });
  }

  /** opensAt = dabar ir paskelbia. */
  openNow(id: string): Promise<AdminSaleWindowDto> {
    return this.mutate(id, async (w, _session, now) => {
      if (getSaleWindowPhase(w, now) === 'open') throw invalidStatus('Langas jau atidarytas');
      if (w.closesAt <= now) {
        throw invalidStatus('Lango pabaiga jau praėjo. Pirmiau pakeisk uždarymo laiką.');
      }
      assertPickupInfo(w.fulfillment);
      return { status: 'published', opensAt: now };
    });
  }

  /** closesAt = dabar paskelbtam, šiuo metu atidarytam langui. */
  closeNow(id: string): Promise<AdminSaleWindowDto> {
    return this.mutate(id, async (w, _session, now) => {
      if (getSaleWindowPhase(w, now) !== 'open') {
        throw invalidStatus('Uždaryti galima tik šiuo metu atidarytą langą');
      }
      return { closesAt: now };
    });
  }

  /** Tik juodraštis be užsakymų. */
  async remove(id: string): Promise<void> {
    if (!objectIdSchema.safeParse(id).success) throw notFound();
    await this.connection.transaction(async (session) => {
      const w = await this.loadEditable(id, session);
      if (w.status !== 'draft') throw invalidStatus('Ištrinti galima tik juodraštį');
      if ((await this.countOrders(w._id, session)) > 0) {
        throw hasOrders('Lange yra užsakymų, todėl ištrinti negalima');
      }
      await this.saleWindowModel.deleteOne({ _id: w._id }, { session }).exec();
    });
  }

  /**
   * Bendras būsenos veiksmas: transakcijoje perskaito langą, `change` patikrina taisykles
   * ir grąžina keičiamus laukus. Laikas imamas kiekvieno (galbūt pakartoto) bandymo metu.
   */
  private async mutate(
    id: string,
    change: (
      w: SaleWindow,
      session: ClientSession,
      now: Date,
    ) => Promise<Partial<Pick<SaleWindow, 'status' | 'opensAt' | 'closesAt'>>>,
  ): Promise<AdminSaleWindowDto> {
    if (!objectIdSchema.safeParse(id).success) throw notFound();
    const updated = await this.connection.transaction(async (session) => {
      const now = new Date();
      const w = await this.loadEditable(id, session);
      const patch = await change(w, session, now);
      const result = await this.saleWindowModel
        .findByIdAndUpdate(w._id, { $set: patch }, { new: true, session })
        .lean<SaleWindow>()
        .exec();
      if (!result) throw notFound();
      return result;
    });
    return (await this.toDtos([updated]))[0]!;
  }

  /** Langas transakcijoje; atšauktas tik skaitomas. */
  private async loadEditable(id: string, session: ClientSession): Promise<SaleWindow> {
    const w = await this.saleWindowModel.findById(id).session(session).lean<SaleWindow>().exec();
    if (!w) throw notFound();
    if (w.status === 'cancelled') {
      throw windowError(
        ConflictException,
        'WINDOW_CANCELLED',
        'Atšauktas langas tik skaitomas: jo keisti negalima',
      );
    }
    return w;
  }

  /**
   * Produktas turi egzistuoti, variantas jam priklausyti, o produktas būti aktyvus.
   * Archyvuotas produktas leidžiamas tik jei ta prekė lange jau buvo (`existingVariants`):
   * tokia prekė lieka ir parduodama, kol adminas jos neišima.
   */
  private async assertItemsValid(
    items: AdminSaleWindowInput['items'],
    existingVariants: Set<string>,
    session: ClientSession,
  ): Promise<void> {
    const productIds = [...new Set(items.map((i) => i.productId))];
    const products = await this.productModel
      .find({ _id: { $in: productIds } }, { isActive: 1, variants: 1 })
      .session(session)
      .lean<Product[]>()
      .exec();
    const byId = new Map(products.map((p) => [p._id.toString(), p]));

    for (const item of items) {
      const product = byId.get(item.productId);
      const extra = { variantId: item.variantId };
      if (!product) {
        throw windowError(BadRequestException, 'PRODUCT_NOT_FOUND', 'Produktas nerastas', extra);
      }
      if (!product.variants.some((v) => v._id.equals(item.variantId))) {
        throw windowError(
          BadRequestException,
          'VARIANT_NOT_FOUND',
          'Variantas nepriklauso produktui (galbūt jis ką tik pašalintas)',
          extra,
        );
      }
      if (!product.isActive && !existingVariants.has(item.variantId)) {
        throw windowError(
          BadRequestException,
          'PRODUCT_INACTIVE',
          'Archyvuoto produkto į langą pridėti negalima',
          extra,
        );
      }
    }
  }

  /**
   * Tikrai pakeičia (ne no-op) kiekvieną lange nurodytą produktą, kad lygiagretus
   * produkto PUT (AdminProductsService.updateInSession) su šia transakcija konfliktuotų.
   *
   * Be šito: PUT perskaito langus („variantas nenaudojamas“) ir rašo produktą, o ši
   * transakcija perskaito produktą („variantas yra“) ir rašo langą. Nė viena nerašo to,
   * ką skaito kita, todėl abi commit'intų ir langas nurodytų pašalintą variantą (write
   * skew). Su $inc abi rašo produkto dokumentą: vėlesnė gauna WriteConflict
   * (TransientTransactionError) ir kartojama, o pakartojus jau mato kitos rezultatą.
   * Testas: test/admin-sale-windows.concurrency.spec.ts.
   */
  private async linkProducts(
    items: AdminSaleWindowInput['items'],
    session: ClientSession,
  ): Promise<void> {
    const productIds = [...new Set(items.map((i) => i.productId))];
    await this.productModel
      .updateMany(
        { _id: { $in: productIds } },
        { $inc: { saleWindowLinkVersion: 1 } },
        { session, timestamps: false },
      )
      .exec();
  }

  private async countOrders(windowId: Types.ObjectId, session: ClientSession): Promise<number> {
    return this.orderModel
      .countDocuments({ saleWindowId: windowId, status: NOT_CANCELLED })
      .session(session)
      .exec();
  }

  /** Kurie iš `variantIds` turi neatšauktų užsakymų šiame lange. */
  private async orderedVariantIds(
    windowId: Types.ObjectId,
    variantIds: Types.ObjectId[],
    session: ClientSession,
  ): Promise<string[]> {
    const found = await this.orderModel
      .distinct('items.variantId', {
        saleWindowId: windowId,
        status: NOT_CANCELLED,
        'items.variantId': { $in: variantIds },
      })
      .session(session)
      .exec();
    const wanted = new Set(variantIds.map((v) => v.toString()));
    return (found as Types.ObjectId[]).map((v) => v.toString()).filter((v) => wanted.has(v));
  }

  private windowFields(input: AdminSaleWindowInput) {
    const f = input.fulfillment;
    return {
      title: input.title,
      opensAt: input.opensAt,
      closesAt: input.closesAt,
      fulfillment: {
        pickupAvailable: f.pickupAvailable,
        pickupLocation: f.pickupLocation || undefined,
        pickupFrom: f.pickupFrom,
        pickupTo: f.pickupTo,
        deliveryAvailable: f.deliveryAvailable,
      },
      // Kaip ir prekių kainos: keičiama bet kada, užsakymai saugo kopiją.
      giftWrap: { enabled: input.giftWrap.enabled, priceCents: input.giftWrap.priceCents },
    };
  }

  private itemFields(
    i: AdminSaleWindowInput['items'][number],
  ): Omit<SaleWindowItem, 'quantityAvailable'> {
    return {
      productId: new Types.ObjectId(i.productId),
      variantId: new Types.ObjectId(i.variantId),
      priceCents: i.priceCents,
      quantityTotal: i.quantityTotal,
      maxPerOrder: i.maxPerOrder,
      maxPerCustomer: i.maxPerCustomer,
      giftWrapAllowed: i.giftWrapAllowed,
    };
  }

  private async toDtos(windows: SaleWindow[]): Promise<AdminSaleWindowDto[]> {
    if (windows.length === 0) return [];
    const now = new Date();
    const productIds = [
      ...new Set(windows.flatMap((w) => w.items.map((i) => i.productId.toString()))),
    ];
    const windowIds = windows.map((w) => w._id);
    const [products, [facets]] = await Promise.all([
      this.productModel
        .find({ _id: { $in: productIds } })
        .lean<Product[]>()
        .exec(),
      this.orderModel
        .aggregate<{
          perWindow: { _id: Types.ObjectId; count: number }[];
          perItem: { _id: { w: Types.ObjectId; v: Types.ObjectId }; count: number }[];
        }>([
          { $match: { saleWindowId: { $in: windowIds }, status: NOT_CANCELLED } },
          {
            $facet: {
              perWindow: [{ $group: { _id: '$saleWindowId', count: { $sum: 1 } } }],
              perItem: [
                { $unwind: '$items' },
                {
                  $group: {
                    _id: { w: '$saleWindowId', v: '$items.variantId' },
                    count: { $sum: 1 },
                  },
                },
              ],
            },
          },
        ])
        .exec(),
    ]);
    const productsById = new Map(products.map((p) => [p._id.toString(), p]));

    return windows.map((w) => {
      const key = w._id.toString();
      const stats: OrderStats = {
        ordersCount: facets?.perWindow.find((p) => p._id.toString() === key)?.count ?? 0,
        ordersByVariant: new Map(
          (facets?.perItem ?? [])
            .filter((p) => p._id.w.toString() === key)
            .map((p) => [p._id.v.toString(), p.count]),
        ),
      };
      return toAdminSaleWindowDto(w, productsById, stats, now);
    });
  }
}
