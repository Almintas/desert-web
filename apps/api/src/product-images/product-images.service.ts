import {
  type AdminProductDto,
  type AttachProductImageInput,
  objectIdSchema,
  PRODUCT_IMAGE_MAX_COUNT,
  type ProductImageErrorCode,
} from '@desert-web/shared';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { type ClientSession, type Connection, type Model, Types } from 'mongoose';
import { Product, type ProductImage } from '../products/product.schema';
import { toAdminProductDto } from '../products/products.mapper';
import { CloudinaryService } from './cloudinary.service';

function imageError(
  Exception: new (body: object) => Error,
  code: ProductImageErrorCode,
  message: string,
): Error {
  return new Exception({ code, message });
}

const productNotFound = () =>
  imageError(NotFoundException, 'PRODUCT_NOT_FOUND', 'Produktas nerastas');
const imageNotFound = () =>
  imageError(NotFoundException, 'IMAGE_NOT_FOUND', 'Nuotrauka nerasta: galbūt ji jau pašalinta');
const duplicateImage = () =>
  imageError(ConflictException, 'DUPLICATE_IMAGE', 'Ši nuotrauka jau pridėta');
const limitReached = () =>
  imageError(
    ConflictException,
    'IMAGE_LIMIT_REACHED',
    `Produktas jau turi ${PRODUCT_IMAGE_MAX_COUNT} nuotraukas: daugiau pridėti negalima`,
  );

/** E11000 ant images.publicId unikalaus indekso (ta pati nuotrauka kitame produkte). */
function isDuplicateImageError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { code?: unknown; keyPattern?: Record<string, unknown> };
  return e.code === 11000 && !!e.keyPattern && 'images.publicId' in e.keyPattern;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Produktų nuotraukos. Archyvuotų produktų nuotraukas tvarkyti taip pat galima.
 * Produkto PUT (AdminProductsService) `images` niekada neliečia, todėl su juo
 * konfliktų nėra; vienas kito pakeitimus mato tik šie maršrutai.
 */
@Injectable()
export class ProductImagesService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(Product.name) private readonly productModel: Model<Product>,
    private readonly cloudinary: CloudinaryService,
  ) {}

  /**
   * Prideda Cloudinary įkeltą nuotrauką gale. Pirmiau tikrinam, kad atsakymą tikrai
   * pasirašė Cloudinary mūsų paslaptimi, kad nuotrauka mūsų kataloge ir URL mūsų paskyros.
   *
   * Limitas ir dublikatai tikrinami vienu sąlyginiu atnaujinimu (`images.<MAX-1>` neegzistuoja
   * ir tokio publicId dar nėra), todėl du lygiagretūs pridėjimai prie 7 nuotraukų negali
   * abu praeiti: MongoDB dokumento atnaujinimai atominiai, antrasis sąlygos nebeatitinka.
   */
  async attach(productId: string, input: AttachProductImageInput): Promise<AdminProductDto> {
    const settings = this.cloudinary.require();
    if (!objectIdSchema.safeParse(productId).success) throw productNotFound();

    if (!this.cloudinary.verifyResponseSignature(input.publicId, input.version, input.signature)) {
      throw imageError(
        BadRequestException,
        'INVALID_UPLOAD_SIGNATURE',
        'Įkėlimo parašas neteisingas: įkelk nuotrauką iš naujo',
      );
    }

    const insideFolder =
      input.publicId.startsWith(`${settings.folder}/`) &&
      input.publicId.length > settings.folder.length + 1 &&
      !input.publicId.split('/').some((part) => part === '' || part === '.' || part === '..');
    const expectedUrl = new RegExp(
      `^https://res\\.cloudinary\\.com/${escapeRegExp(settings.cloudName)}/image/upload/` +
        `v${input.version}/${escapeRegExp(input.publicId)}\\.${escapeRegExp(input.format)}$`,
    );
    if (!insideFolder || !expectedUrl.test(input.secureUrl)) {
      throw imageError(
        BadRequestException,
        'FOREIGN_IMAGE',
        'Nuotrauka įkelta ne į šios parduotuvės Cloudinary katalogą',
      );
    }

    const id = new Types.ObjectId(productId);
    const image: Omit<ProductImage, '_id'> & { _id: Types.ObjectId } = {
      _id: new Types.ObjectId(),
      publicId: input.publicId,
      version: input.version,
      url: input.secureUrl,
      width: input.width,
      height: input.height,
      format: input.format,
      bytes: input.bytes,
      createdAt: new Date(),
    };

    let updated: Product | null;
    try {
      updated = await this.productModel
        .findOneAndUpdate(
          {
            _id: id,
            'images.publicId': { $ne: input.publicId },
            [`images.${PRODUCT_IMAGE_MAX_COUNT - 1}`]: { $exists: false },
          },
          { $push: { images: image } },
          { new: true },
        )
        .lean<Product>()
        .exec();
    } catch (error) {
      if (isDuplicateImageError(error)) throw duplicateImage();
      throw error;
    }

    if (!updated) {
      // Sąlyga neatitiko: išsiaiškinam kodėl (tik pranešimui; sprendimą jau priėmė DB).
      const current = await this.productModel.findById(id, { images: 1 }).lean<Product>().exec();
      if (!current) throw productNotFound();
      if (current.images.some((i) => i.publicId === input.publicId)) throw duplicateImage();
      throw limitReached();
    }
    return toAdminProductDto(updated);
  }

  /**
   * Pašalina nuotrauką iš produkto, o po sėkmingos transakcijos ištrina ją iš Cloudinary
   * (geriausiomis pastangomis: Cloudinary klaida užsakymo neatmeta, tik užrašoma į logą).
   */
  async remove(productId: string, imageId: string): Promise<AdminProductDto> {
    this.cloudinary.require();
    if (!objectIdSchema.safeParse(productId).success) throw productNotFound();
    if (!objectIdSchema.safeParse(imageId).success) throw imageNotFound();

    const { product, removed } = await this.connection.transaction((session) =>
      this.removeInSession(productId, imageId, session),
    );
    await this.cloudinary.destroyBestEffort(removed.publicId);
    return toAdminProductDto(product);
  }

  private async removeInSession(
    productId: string,
    imageId: string,
    session: ClientSession,
  ): Promise<{ product: Product; removed: ProductImage }> {
    const existing = await this.productModel
      .findById(productId, { images: 1 })
      .session(session)
      .lean<Product>()
      .exec();
    if (!existing) throw productNotFound();
    const removed = existing.images.find((i) => i._id.toString() === imageId);
    if (!removed) throw imageNotFound();

    const product = await this.productModel
      .findOneAndUpdate(
        { _id: existing._id },
        { $pull: { images: { _id: removed._id } } },
        { new: true, session },
      )
      .lean<Product>()
      .exec();
    if (!product) throw productNotFound();
    return { product, removed };
  }

  /**
   * Nauja tvarka. `imageIds` turi būti lygiai dabartinis nuotraukų rinkinys, kitaip 409
   * (adminas matė pasenusį sąrašą). Transakcija: jei kartu pridedama ar šalinama nuotrauka,
   * abu rašo tą patį dokumentą, todėl vienas gauna WriteConflict ir kartojamas su
   * naujausiu sąrašu (ir tada gauna 409, jei rinkinys pasikeitė).
   */
  async reorder(productId: string, imageIds: string[]): Promise<AdminProductDto> {
    this.cloudinary.require();
    if (!objectIdSchema.safeParse(productId).success) throw productNotFound();

    const product = await this.connection.transaction(async (session) => {
      const existing = await this.productModel
        .findById(productId, { images: 1 })
        .session(session)
        .lean<Product>()
        .exec();
      if (!existing) throw productNotFound();

      const byId = new Map(existing.images.map((i) => [i._id.toString(), i]));
      const sameSet =
        imageIds.length === existing.images.length && imageIds.every((id) => byId.has(id));
      if (!sameSet) {
        throw imageError(
          ConflictException,
          'IMAGE_SET_MISMATCH',
          'Nuotraukos ką tik pasikeitė: atnaujink puslapį ir bandyk dar kartą',
        );
      }

      const updated = await this.productModel
        .findOneAndUpdate(
          { _id: existing._id },
          { $set: { images: imageIds.map((id) => byId.get(id)!) } },
          { new: true, session },
        )
        .lean<Product>()
        .exec();
      if (!updated) throw productNotFound();
      return updated;
    });
    return toAdminProductDto(product);
  }
}
