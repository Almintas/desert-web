/**
 * Cloudinary nuotraukų „našlaičių“ valymas (skriptas images:cleanup). Našlaitis: failas
 * produktų kataloge, kurio nenaudoja joks produktas (aktyvus ar archyvuotas) ir kuris
 * senesnis už apsaugos laikotarpį. Tokie lieka, kai įkėlimas nutrūksta arba forma
 * uždaroma neprisegus nuotraukos.
 *
 * Visa logika čia priklauso tik nuo sąsajų (CloudinaryAdminClient, ProductImageReferences),
 * todėl testuojama be tikro Cloudinary.
 */
import type { Model } from 'mongoose';
import { z } from 'zod';
import type { Product } from '../products/product.schema';

/** Visi parduotuvės katalogai yra po šia šaknimi (žr. CLOUDINARY_FOLDER env.ts). */
export const SAFE_FOLDER_ROOT = 'desert-web/';
export const DEFAULT_GRACE_HOURS = 24;
export const MIN_GRACE_HOURS = 1;
/** Cloudinary Admin API riba vienam delete_resources kvietimui. */
export const DELETE_BATCH_SIZE = 100;

const HOUR_MS = 3_600_000;

export interface CloudinaryImage {
  publicId: string;
  /** ISO data iš Cloudinary (`created_at`). */
  createdAt: string;
  bytes: number;
}

export interface CloudinaryImagePage {
  images: CloudinaryImage[];
  nextCursor?: string;
}

/** Cloudinary rezultatas kiekvienam publicId: `deleted`, `not_found` arba kita klaida. */
export type CloudinaryDeleteResult = Record<string, string>;

/** Admin API veiksmai, kurių reikia valymui (įgyvendina CloudinaryService). */
export interface CloudinaryAdminClient {
  /** Vienas `resources` puslapis: resource_type image, type upload, su nurodytu prefiksu. */
  listImages(prefix: string, nextCursor?: string): Promise<CloudinaryImagePage>;
  /** Vienas `delete_resources` kvietimas (iki DELETE_BATCH_SIZE publicId). */
  deleteImages(publicIds: string[]): Promise<CloudinaryDeleteResult>;
}

/** Kokias nuotraukas naudoja produktai (įgyvendina mongoImageReferences). */
export interface ProductImageReferences {
  /** Visi publicId iš visų produktų, ir aktyvių, ir archyvuotų. */
  allReferenced(): Promise<Set<string>>;
  /** Kiek produktų turi bent vieną nuotrauką (nepriklausoma patikra). */
  countProductsWithImages(): Promise<number>;
  /** Kurie iš nurodytų publicId naudojami dabar (tikrinama prieš kiekvieną trynimo partiją). */
  referencedAmong(publicIds: string[]): Promise<Set<string>>;
}

export class CleanupSafetyError extends Error {}

/**
 * Katalogo prefiksas su gale „/“ (kad `.../products` neapimtų `.../products-old`).
 * Meta klaidą, jei katalogas tuščias arba ne po `desert-web/`.
 */
export function folderPrefix(folder: string): string {
  const trimmed = folder.trim().replace(/\/+$/, '');
  if (trimmed === '') {
    throw new CleanupSafetyError('Cloudinary folder resolved to an empty string: aborting.');
  }
  if (!trimmed.startsWith(SAFE_FOLDER_ROOT) || trimmed.length <= SAFE_FOLDER_ROOT.length) {
    throw new CleanupSafetyError(
      `Cloudinary folder "${trimmed}" is not inside "${SAFE_FOLDER_ROOT}": aborting.`,
    );
  }
  if (trimmed.split('/').some((part) => part === '' || part === '.' || part === '..')) {
    throw new CleanupSafetyError(`Cloudinary folder "${trimmed}" is not a plain path: aborting.`);
  }
  return `${trimmed}/`;
}

const graceHoursSchema = z.coerce
  .number({ error: '--older-than-hours must be a whole number' })
  .int('--older-than-hours must be a whole number')
  .min(MIN_GRACE_HOURS, `--older-than-hours must be at least ${MIN_GRACE_HOURS}`);

/** `--older-than-hours` reikšmė; be jos DEFAULT_GRACE_HOURS. */
export function parseOlderThanHours(raw: string | undefined): number {
  if (raw === undefined) return DEFAULT_GRACE_HOURS;
  const parsed = graceHoursSchema.safeParse(raw.trim() === '' ? Number.NaN : raw);
  if (!parsed.success) throw new CleanupSafetyError(parsed.error.issues[0]!.message);
  return parsed.data;
}

export interface OrphanSelection {
  orphans: CloudinaryImage[];
  referenced: number;
  /** Naujesni už apsaugos laikotarpį (arba be tinkamos datos): gal įkeliami dabar. */
  tooNew: number;
  /** Ne šiame kataloge (Cloudinary prefikso paieška taip neturėtų grąžinti; neliečiam). */
  outsideFolder: number;
}

/**
 * Gryna našlaičių atranka. Našlaitis: kataloge, nenaudojamas ir sukurtas griežtai anksčiau
 * nei `now - olderThanHours`. Abejotini atvejai (bloga data, kitas katalogas) paliekami.
 */
export function selectOrphans(input: {
  images: readonly CloudinaryImage[];
  referenced: ReadonlySet<string>;
  folder: string;
  now: Date;
  olderThanHours: number;
}): OrphanSelection {
  const prefix = folderPrefix(input.folder);
  if (!Number.isFinite(input.olderThanHours) || input.olderThanHours < MIN_GRACE_HOURS) {
    throw new CleanupSafetyError(`Grace period must be at least ${MIN_GRACE_HOURS} h.`);
  }
  const cutoff = input.now.getTime() - input.olderThanHours * HOUR_MS;
  const result: OrphanSelection = { orphans: [], referenced: 0, tooNew: 0, outsideFolder: 0 };
  for (const image of input.images) {
    if (!image.publicId.startsWith(prefix) || image.publicId.length <= prefix.length) {
      result.outsideFolder += 1;
    } else if (input.referenced.has(image.publicId)) {
      result.referenced += 1;
    } else {
      const created = Date.parse(image.createdAt);
      if (Number.isNaN(created) || created >= cutoff) result.tooNew += 1;
      else result.orphans.push(image);
    }
  }
  return result;
}

/**
 * Jei DB grąžino nulį naudojamų nuotraukų, nors produktų su nuotraukomis yra, užklausa ar
 * ryšys sugedę: tęsiant būtų ištrinta viskas.
 */
export function assertReferencesLoaded(referencedCount: number, productsWithImages: number): void {
  if (referencedCount === 0 && productsWithImages > 0) {
    throw new CleanupSafetyError(
      `DB returned 0 referenced images, but ${productsWithImages} product(s) have images: ` +
        'something is wrong with the query or the connection. Aborting.',
    );
  }
}

/** Visi katalogo failai (Cloudinary puslapiavimas per next_cursor). */
export async function listAllImages(
  client: CloudinaryAdminClient,
  prefix: string,
): Promise<CloudinaryImage[]> {
  const images: CloudinaryImage[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | undefined;
  do {
    const page = await client.listImages(prefix, cursor);
    images.push(...page.images);
    cursor = page.nextCursor || undefined;
    if (cursor !== undefined) {
      if (seenCursors.has(cursor)) throw new Error('Cloudinary returned a repeated next_cursor');
      seenCursors.add(cursor);
    }
  } while (cursor !== undefined);
  return images;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

const sumBytes = (images: readonly CloudinaryImage[]) =>
  images.reduce((sum, i) => sum + (Number.isFinite(i.bytes) ? i.bytes : 0), 0);

export interface CleanupOptions {
  folder: string;
  olderThanHours: number;
  apply: boolean;
  now?: Date;
  log?: (line: string) => void;
}

export interface CleanupReport {
  scanned: number;
  selection: OrphanSelection;
  /** Ištrinti (įskaitant `not_found`: jų jau nebuvo). Dry run: 0. */
  deleted: number;
  /** Paskutinę akimirką prisegti prie produkto: neištrinti. */
  skippedNowReferenced: number;
  failed: string[];
}

/**
 * Pilnas valymas. Dry run (numatyta) tik išvardija našlaičius; su `apply` trina partijomis
 * po DELETE_BATCH_SIZE, klaidas užrašo ir tęsia (jos grąžinamos `failed`).
 */
export async function runImageCleanup(
  client: CloudinaryAdminClient,
  references: ProductImageReferences,
  options: CleanupOptions,
): Promise<CleanupReport> {
  const log = options.log ?? ((line: string) => console.log(line));
  const now = options.now ?? new Date();
  const prefix = folderPrefix(options.folder);

  const images = await listAllImages(client, prefix);
  const referenced = await references.allReferenced();
  assertReferencesLoaded(referenced.size, await references.countProductsWithImages());

  const selection = selectOrphans({
    images,
    referenced,
    folder: options.folder,
    now,
    olderThanHours: options.olderThanHours,
  });
  const report: CleanupReport = {
    scanned: images.length,
    selection,
    deleted: 0,
    skippedNowReferenced: 0,
    failed: [],
  };

  log(`Folder: ${prefix} (resource_type=image, type=upload)`);
  log(
    `Scanned ${images.length} file(s): ${selection.referenced} referenced by products, ` +
      `${selection.tooNew} newer than ${options.olderThanHours} h, ` +
      `${selection.outsideFolder} outside the folder, ${selection.orphans.length} orphan(s).`,
  );
  if (selection.orphans.length === 0) {
    log('Nothing to delete.');
    return report;
  }

  const orphans = [...selection.orphans].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (const o of orphans) log(`  ${o.publicId}  ${o.createdAt}  ${formatBytes(o.bytes)}`);
  log(`Total: ${orphans.length} orphan(s), ${formatBytes(sumBytes(orphans))}.`);

  if (!options.apply) {
    log('Dry run: nothing deleted. Re-run with --apply to delete these files.');
    return report;
  }

  const batches = Math.ceil(orphans.length / DELETE_BATCH_SIZE);
  for (let b = 0; b < batches; b++) {
    const label = `Batch ${b + 1}/${batches}`;
    let ids = orphans
      .slice(b * DELETE_BATCH_SIZE, (b + 1) * DELETE_BATCH_SIZE)
      .map((o) => o.publicId);
    try {
      // Nuotrauka galėjo būti prisegta po pirmo DB skaitymo (pvz., ilgai atidaryta forma).
      const nowReferenced = await references.referencedAmong(ids);
      if (nowReferenced.size > 0) {
        report.skippedNowReferenced += nowReferenced.size;
        log(`${label}: skipping ${nowReferenced.size} file(s) attached in the meantime`);
        ids = ids.filter((id) => !nowReferenced.has(id));
      }
      if (ids.length === 0) continue;

      const result = await client.deleteImages(ids);
      const failed = ids.filter((id) => result[id] !== 'deleted' && result[id] !== 'not_found');
      const notFound = ids.filter((id) => result[id] === 'not_found').length;
      report.deleted += ids.length - failed.length;
      report.failed.push(...failed);
      log(
        `${label}: deleted ${ids.length - failed.length - notFound}, ` +
          `already gone ${notFound}, failed ${failed.length}`,
      );
      for (const id of failed) log(`  failed: ${id} (${result[id] ?? 'no result'})`);
    } catch (error) {
      const message = error instanceof Error ? error.message : JSON.stringify(error);
      report.failed.push(...ids);
      log(`${label}: failed (${ids.length} file(s)): ${message}`);
    }
  }
  log(
    `Done: ${report.deleted} deleted, ${report.failed.length} failed` +
      (report.skippedNowReferenced > 0 ? `, ${report.skippedNowReferenced} skipped` : '') +
      '.',
  );
  return report;
}

/** ProductImageReferences per Mongoose: be isActive filtro, nes archyvuoti produktai savo nuotraukų neatsisako. */
export function mongoImageReferences(productModel: Model<Product>): ProductImageReferences {
  const distinctIds = async (filter: Record<string, unknown>) =>
    (await productModel.distinct('images.publicId', filter).exec()).filter(
      (id): id is string => typeof id === 'string' && id !== '',
    );
  return {
    allReferenced: async () => new Set(await distinctIds({})),
    countProductsWithImages: () =>
      productModel.countDocuments({ 'images.0': { $exists: true } }).exec(),
    referencedAmong: async (publicIds) => {
      // distinct grąžina visus atitikusių produktų publicId, todėl susiaurinam iki prašytų.
      const wanted = new Set(publicIds);
      const found = await distinctIds({ 'images.publicId': { $in: publicIds } });
      return new Set(found.filter((id) => wanted.has(id)));
    },
  };
}
