import {
  type AdminProductInput,
  objectIdSchema,
  type AdminProductDto,
  type ProductErrorCode,
  slugify,
  type VariantInUseErrorBody,
} from '@desert-web/shared';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { type ClientSession, type Connection, type Model, Types } from 'mongoose';
import { Product } from '../products/product.schema';
import { toAdminProductDto } from '../products/products.mapper';
import { SaleWindow } from '../sale-windows/sale-window.schema';

function productError(
  Exception: new (body: object) => Error,
  code: ProductErrorCode,
  message: string,
  extra: Record<string, unknown> = {},
): Error {
  return new Exception({ code, message, ...extra });
}

const slugTaken = () =>
  productError(ConflictException, 'SLUG_TAKEN', 'Toks adresas jau naudojamas kito produkto');

/** Sugeneruoto slug pagrindo ilgis: lieka vietos priesagai (-2, -3...) iki 120 simbolių. */
const GENERATED_SLUG_BASE_MAX = 110;
/** Kiek kartų bandoma iš naujo, jei lygiagretus kūrimas užėmė ką tik parinktą slug. */
const GENERATED_SLUG_ATTEMPTS = 5;

/** Slug pagrindas iš pavadinimo; jei pavadinime nėra raidžių ar skaičių, "produktas". */
function slugBase(name: string): string {
  const base = slugify(name).slice(0, GENERATED_SLUG_BASE_MAX).replace(/-+$/, '');
  return base || 'produktas';
}

const productNotFound = () =>
  productError(NotFoundException, 'PRODUCT_NOT_FOUND', 'Produktas nerastas');

/** E11000 ant products.slug unikalaus indekso (lenktynės tarp patikrinimo ir įrašymo). */
function isDuplicateSlugError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { code?: unknown; keyPattern?: Record<string, unknown> };
  return e.code === 11000 && !!e.keyPattern && 'slug' in e.keyPattern;
}

/**
 * Laukai, kuriuos keičia admino forma. `images` čia sąmoningai nėra. Be `slug` įvestyje
 * esamas slug nekeičiamas (pasikeistų viešas adresas).
 */
function editableFields(input: AdminProductInput) {
  return {
    name: input.name,
    ...(input.slug ? { slug: input.slug } : {}),
    description: input.description,
    category: input.category,
    allergens: input.allergens,
    specialOrder: input.specialOrder,
    isActive: input.isActive,
  };
}

@Injectable()
export class AdminProductsService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(Product.name) private readonly productModel: Model<Product>,
    @InjectModel(SaleWindow.name) private readonly saleWindowModel: Model<SaleWindow>,
  ) {}

  /** Visi produktai, ir archyvuoti, pagal pavadinimą lietuviška abėcėle. */
  async findAll(): Promise<AdminProductDto[]> {
    const products = await this.productModel
      .find()
      .collation({ locale: 'lt' })
      .sort({ name: 1, _id: 1 })
      .lean<Product[]>()
      .exec();
    return products.map(toAdminProductDto);
  }

  async findById(id: string): Promise<AdminProductDto> {
    if (!objectIdSchema.safeParse(id).success) throw productNotFound();
    const product = await this.productModel.findById(id).lean<Product>().exec();
    if (!product) throw productNotFound();
    return toAdminProductDto(product);
  }

  /**
   * Su `slug` įvestyje: užimtas slug grąžina 409 SLUG_TAKEN. Be jo slug sudaromas iš
   * pavadinimo, o užimtas gauna priesagą („tortas“, „tortas-2“, „tortas-3“...).
   */
  async create(input: AdminProductInput): Promise<AdminProductDto> {
    // Naujas produktas dar neturi variantų, todėl bet koks `id` yra svetimas.
    const withId = input.variants.filter((v) => v.id).map((v) => v.id!);
    if (withId.length > 0) throw this.unknownVariants(withId);

    if (input.slug) {
      if (await this.productModel.exists({ slug: input.slug })) throw slugTaken();
      try {
        return await this.insert(input, input.slug);
      } catch (error) {
        if (isDuplicateSlugError(error)) throw slugTaken();
        throw error;
      }
    }

    const base = slugBase(input.name);
    for (let attempt = 0; attempt < GENERATED_SLUG_ATTEMPTS; attempt += 1) {
      try {
        return await this.insert(input, await this.freeSlug(base));
      } catch (error) {
        // Lygiagretus kūrimas spėjo užimti tą patį slug: parenkam kitą.
        if (!isDuplicateSlugError(error)) throw error;
      }
    }
    throw slugTaken();
  }

  private async insert(input: AdminProductInput, slug: string): Promise<AdminProductDto> {
    const created = await this.productModel.create({
      ...editableFields(input),
      slug,
      variants: input.variants.map((v) => ({ name: v.name, priceCents: v.priceCents })),
    });
    return toAdminProductDto(created.toObject<Product>());
  }

  /** `base`, o jei užimtas, pirmas laisvas `base-N` (N nuo 2). */
  private async freeSlug(base: string): Promise<string> {
    // base sudarytas tik iš [a-z0-9-], todėl regex'e jo escapinti nereikia.
    const pattern = new RegExp(`^${base}(?:-\\d+)?$`);
    const docs = await this.productModel
      .find({ slug: pattern }, { slug: 1 })
      .lean<Pick<Product, 'slug'>[]>()
      .exec();
    const taken = new Set(docs.map((d) => d.slug));
    if (!taken.has(base)) return base;
    let n = 2;
    while (taken.has(`${base}-${n}`)) n += 1;
    return `${base}-${n}`;
  }

  /**
   * Pilnas atnaujinimas (be nuotraukų).
   *
   * Variantai: su `id` atnaujinami vietoje (tas pats _id, todėl pardavimo langų ir užsakymų
   * nuorodos lieka galioti), be `id` sukuriami nauji, o DB esantys, bet įvestyje nebeesantys,
   * pašalinami, jei jų nenaudoja juodraštinis ar dar nesibaigęs paskelbtas langas.
   *
   * Varianto priceCents pakeitimas esamų pardavimo langų neveikia: langas turi savo
   * items[].priceCents, o užsakymai saugo kainos kopiją.
   *
   * Transakcija: perskaitom produktą, tikrinam langus ir rašom vienu metu, todėl du
   * lygiagretūs PUT neperrašo vienas kito variantų (antrasis gauna WriteConflict ir kartojamas).
   */
  async update(id: string, input: AdminProductInput): Promise<AdminProductDto> {
    if (!objectIdSchema.safeParse(id).success) throw productNotFound();

    try {
      const updated = await this.connection.transaction((session) =>
        this.updateInSession(id, input, session),
      );
      return toAdminProductDto(updated);
    } catch (error) {
      if (isDuplicateSlugError(error)) throw slugTaken();
      throw error;
    }
  }

  /**
   * update() vienos transakcijos turinys (atskirai, kad testai galėtų valdyti transakcijų
   * eiliškumą).
   *
   * Lenktynės su pardavimo langais: čia skaitom langus (ar variantas naudojamas) ir rašom
   * produktą, o lango kūrimas / redagavimas skaito produktą ir rašo langą. Kadangi nė viena
   * pusė nerašo to, ką skaito kita, MongoDB pats konflikto nepastebėtų, ir langas galėtų
   * likti su ką tik pašalintu variantu. Todėl lango transakcija taip pat RAŠO šį produktą
   * ($inc saleWindowLinkVersion, žr. AdminSaleWindowsService.linkProducts). Abi transakcijos
   * keičia tą patį dokumentą, todėl vėliau rašanti gauna WriteConflict ir kartojama:
   * pakartotas PUT jau mato naują langą ir grąžina VARIANT_IN_USE, o pakartotas lango
   * įrašymas mato pašalintą variantą ir grąžina VARIANT_NOT_FOUND.
   */
  async updateInSession(
    id: string,
    input: AdminProductInput,
    session: ClientSession,
  ): Promise<Product> {
    const existing = await this.productModel.findById(id).session(session).lean<Product>().exec();
    if (!existing) throw productNotFound();

    if (input.slug) {
      const slugOwner = await this.productModel
        .exists({ slug: input.slug, _id: { $ne: existing._id } })
        .session(session);
      if (slugOwner) throw slugTaken();
    }

    const existingById = new Map(existing.variants.map((v) => [v._id.toString(), v]));
    const unknown = input.variants.filter((v) => v.id && !existingById.has(v.id)).map((v) => v.id!);
    if (unknown.length > 0) throw this.unknownVariants(unknown);

    const keptIds = new Set(input.variants.filter((v) => v.id).map((v) => v.id!));
    const removedIds = existing.variants
      .filter((v) => !keptIds.has(v._id.toString()))
      .map((v) => v._id);
    await this.assertVariantsRemovable(existing._id, removedIds, session);

    const variants = input.variants.map((v) => ({
      _id: v.id ? existingById.get(v.id)!._id : new Types.ObjectId(),
      name: v.name,
      priceCents: v.priceCents,
    }));

    const updated = await this.productModel
      .findByIdAndUpdate(
        existing._id,
        { $set: { ...editableFields(input), variants } },
        { new: true, runValidators: true, session },
      )
      .lean<Product>()
      .exec();
    if (!updated) throw productNotFound();
    return updated;
  }

  /**
   * Varianto negalima šalinti, kol jį naudoja juodraštinis langas arba paskelbtas langas,
   * kuris dar nesibaigė (closesAt ateityje). Pasibaigę ir atšaukti langai netrukdo:
   * užsakymai saugo produkto ir varianto pavadinimų bei kainų kopijas.
   */
  private async assertVariantsRemovable(
    productId: Types.ObjectId,
    variantIds: Types.ObjectId[],
    session: ClientSession,
  ): Promise<void> {
    if (variantIds.length === 0) return;

    const windows = await this.saleWindowModel
      .find(
        {
          items: { $elemMatch: { productId, variantId: { $in: variantIds } } },
          $or: [{ status: 'draft' }, { status: 'published', closesAt: { $gt: new Date() } }],
        },
        { title: 1, items: 1 },
      )
      .sort({ opensAt: 1 })
      .session(session)
      .lean<SaleWindow[]>()
      .exec();
    if (windows.length === 0) return;

    const removed = new Set(variantIds.map((v) => v.toString()));
    const inUse = new Set(
      windows.flatMap((w) =>
        w.items.map((i) => i.variantId.toString()).filter((v) => removed.has(v)),
      ),
    );
    const body: VariantInUseErrorBody = {
      code: 'VARIANT_IN_USE',
      message:
        'Šių variantų pašalinti negalima: jie naudojami juodraštiniuose arba dar ' +
        'nesibaigusiuose pardavimo languose. Pirmiau išimk juos iš tų langų.',
      variantIds: [...inUse],
      saleWindows: windows.map((w) => ({ id: w._id.toString(), title: w.title })),
    };
    throw new ConflictException(body);
  }

  private unknownVariants(variantIds: string[]): Error {
    return productError(
      BadRequestException,
      'VARIANT_NOT_FOUND',
      'Variantas nepriklauso šiam produktui',
      { variantIds },
    );
  }
}
