import {
  assertReferencesLoaded,
  CleanupSafetyError,
  type CloudinaryAdminClient,
  type CloudinaryImage,
  DEFAULT_GRACE_HOURS,
  folderPrefix,
  formatBytes,
  listAllImages,
  parseOlderThanHours,
  type ProductImageReferences,
  runImageCleanup,
  selectOrphans,
} from '../src/product-images/image-cleanup';

const FOLDER = 'desert-web/production/products';
const NOW = new Date('2026-11-24T12:00:00.000Z');
const HOUR = 3_600_000;

const image = (name: string, ageMs: number, bytes = 200_000): CloudinaryImage => ({
  publicId: `${FOLDER}/${name}`,
  createdAt: new Date(NOW.getTime() - ageMs).toISOString(),
  bytes,
});

const select = (images: CloudinaryImage[], referenced: string[] = [], olderThanHours = 24) =>
  selectOrphans({
    images,
    referenced: new Set(referenced),
    folder: FOLDER,
    now: NOW,
    olderThanHours,
  });

describe('folderPrefix (katalogo saugumo patikra)', () => {
  it('grąžina prefiksą su „/“ gale', () => {
    expect(folderPrefix(FOLDER)).toBe(`${FOLDER}/`);
    expect(folderPrefix(`${FOLDER}/`)).toBe(`${FOLDER}/`);
  });

  it.each([
    ['tuščias', ''],
    ['tik tarpai', '   '],
    ['tik „/“', '/'],
    ['ne po desert-web/', 'products'],
    ['kitas projektas', 'kitas-projektas/production/products'],
    ['panašus pavadinimas', 'desert-webx/production/products'],
    ['pati šaknis', 'desert-web'],
    ['šaknis su „/“', 'desert-web/'],
    ['su ..', 'desert-web/../kita'],
    ['dvigubas „/“', 'desert-web//products'],
  ])('atmeta: %s', (_label, folder) => {
    expect(() => folderPrefix(folder)).toThrow(CleanupSafetyError);
  });

  it('selectOrphans taip pat atmeta nesaugų katalogą', () => {
    expect(() =>
      selectOrphans({
        images: [],
        referenced: new Set(),
        folder: '',
        now: NOW,
        olderThanHours: 24,
      }),
    ).toThrow(CleanupSafetyError);
  });
});

describe('parseOlderThanHours', () => {
  it('numatyta 24 h', () => {
    expect(parseOlderThanHours(undefined)).toBe(DEFAULT_GRACE_HOURS);
    expect(DEFAULT_GRACE_HOURS).toBe(24);
  });

  it.each([
    ['1', 1],
    ['72', 72],
  ])('%j -> %d', (raw, expected) => {
    expect(parseOlderThanHours(raw)).toBe(expected);
  });

  it.each(['0', '-5', '0.5', '1.5', 'abc', ''])('atmeta %j', (raw) => {
    expect(() => parseOlderThanHours(raw)).toThrow(CleanupSafetyError);
  });
});

describe('selectOrphans', () => {
  it('naudojamos nuotraukos paliekamos, nenaudojamos ir senos yra našlaičiai', () => {
    const used = image('naudojama', 30 * 24 * HOUR);
    const orphan = image('nasle', 30 * 24 * HOUR);
    const result = select([used, orphan], [used.publicId]);
    expect(result.orphans).toEqual([orphan]);
    expect(result).toMatchObject({ referenced: 1, tooNew: 0, outsideFolder: 0 });
  });

  it('archyvuoto produkto nuotrauka (yra naudojamų sąraše) paliekama, kad ir kokia sena', () => {
    // Naudojamų sąrašas sudaromas iš visų produktų (žr. mongoImageReferences testą žemiau).
    const archived = image('archyvuoto-produkto', 365 * 24 * HOUR);
    expect(select([archived], [archived.publicId]).orphans).toEqual([]);
  });

  it('apsaugos laikotarpio riba: lygiai 24 h paliekama, 24 h + 1 ms trinama', () => {
    const exactly = image('lygiai-24h', 24 * HOUR);
    const older = image('24h-ir-1ms', 24 * HOUR + 1);
    const newer = image('23h59m', 24 * HOUR - 60_000);
    const result = select([exactly, older, newer]);
    expect(result.orphans).toEqual([older]);
    expect(result.tooNew).toBe(2);
  });

  it('naudoja nurodytą apsaugos laikotarpį', () => {
    const fiveHours = image('5h', 5 * HOUR);
    expect(select([fiveHours], [], 24).orphans).toEqual([]);
    expect(select([fiveHours], [], 4).orphans).toEqual([fiveHours]);
  });

  it('apsaugos laikotarpis mažesnis nei 1 h atmetamas', () => {
    expect(() => select([], [], 0)).toThrow(CleanupSafetyError);
  });

  it('failai be tinkamos datos ir ne šiame kataloge neliečiami', () => {
    const noDate = { ...image('be-datos', 0), createdAt: 'nezinoma' };
    const outside: CloudinaryImage[] = [
      {
        publicId: 'desert-web/development/products/kita',
        createdAt: '2020-01-01T00:00:00Z',
        bytes: 1,
      },
      { publicId: `${FOLDER}-old/sena`, createdAt: '2020-01-01T00:00:00Z', bytes: 1 },
      { publicId: `${FOLDER}/`, createdAt: '2020-01-01T00:00:00Z', bytes: 1 },
    ];
    const result = select([noDate, ...outside]);
    expect(result.orphans).toEqual([]);
    expect(result).toMatchObject({ tooNew: 1, outsideFolder: 3 });
  });
});

describe('assertReferencesLoaded', () => {
  it('nutraukia, jei DB grąžino 0 naudojamų, nors produktų su nuotraukomis yra', () => {
    expect(() => assertReferencesLoaded(0, 3)).toThrow(CleanupSafetyError);
  });

  it('leidžia, kai nuotraukų neturi nė vienas produktas arba jų rasta', () => {
    expect(() => assertReferencesLoaded(0, 0)).not.toThrow();
    expect(() => assertReferencesLoaded(5, 3)).not.toThrow();
  });
});

describe('formatBytes', () => {
  it.each([
    [512, '512 B'],
    [2048, '2.0 KB'],
    [3 * 1024 * 1024, '3.00 MB'],
  ])('%d -> %s', (bytes, expected) => {
    expect(formatBytes(bytes)).toBe(expected);
  });
});

/** Cloudinary klientas atmintyje: puslapiuoja po `pageSize`, trina iš `stored`. */
function fakeClient(images: CloudinaryImage[], pageSize = 2) {
  const stored = new Map(images.map((i) => [i.publicId, i]));
  const deleteCalls: string[][] = [];
  const listCalls: { prefix: string; cursor?: string }[] = [];
  const client: CloudinaryAdminClient & { failBatch?: number; failIds?: Set<string> } = {
    async listImages(prefix, cursor) {
      listCalls.push({ prefix, cursor });
      const all = [...stored.values()].filter((i) => i.publicId.startsWith(prefix));
      const start = cursor ? Number(cursor) : 0;
      const next = start + pageSize;
      return {
        images: all.slice(start, next),
        nextCursor: next < all.length ? String(next) : undefined,
      };
    },
    async deleteImages(ids) {
      deleteCalls.push(ids);
      if (client.failBatch === deleteCalls.length) throw new Error('Rate Limit Exceeded');
      const result: Record<string, string> = {};
      for (const id of ids) {
        if (client.failIds?.has(id)) result[id] = 'error';
        else result[id] = stored.delete(id) ? 'deleted' : 'not_found';
      }
      return result;
    },
  };
  return { client, stored, deleteCalls, listCalls };
}

function fakeReferences(
  referenced: string[],
  productsWithImages = referenced.length,
  attachedLater: string[] = [],
): ProductImageReferences {
  return {
    allReferenced: async () => new Set(referenced),
    countProductsWithImages: async () => productsWithImages,
    referencedAmong: async (ids) => new Set(ids.filter((id) => attachedLater.includes(id))),
  };
}

describe('listAllImages', () => {
  it('eina per visus puslapius pagal next_cursor', async () => {
    const images = Array.from({ length: 5 }, (_, i) => image(`f${i}`, 48 * HOUR));
    const { client, listCalls } = fakeClient(images, 2);
    expect(await listAllImages(client, `${FOLDER}/`)).toEqual(images);
    expect(listCalls).toEqual([
      { prefix: `${FOLDER}/`, cursor: undefined },
      { prefix: `${FOLDER}/`, cursor: '2' },
      { prefix: `${FOLDER}/`, cursor: '4' },
    ]);
  });

  it('nutraukia, jei Cloudinary kartoja tą patį next_cursor', async () => {
    const client: CloudinaryAdminClient = {
      listImages: async () => ({ images: [], nextCursor: 'tas-pats' }),
      deleteImages: async () => ({}),
    };
    await expect(listAllImages(client, `${FOLDER}/`)).rejects.toThrow('repeated next_cursor');
  });
});

describe('runImageCleanup', () => {
  const run = (
    client: CloudinaryAdminClient,
    references: ProductImageReferences,
    opts: { apply?: boolean; folder?: string } = {},
  ) => {
    const lines: string[] = [];
    const promise = runImageCleanup(client, references, {
      folder: opts.folder ?? FOLDER,
      olderThanHours: 24,
      apply: opts.apply ?? false,
      now: NOW,
      log: (l) => lines.push(l),
    });
    return { promise, lines };
  };

  it('dry run: išvardija našlaičius ir sumas, nieko netrina', async () => {
    const used = image('naudojama', 10 * 24 * HOUR, 300_000);
    const fresh = image('ikeliama-dabar', HOUR);
    const orphanA = image('nutrukes-ikelimas', 3 * 24 * HOUR, 412_345);
    const orphanB = image('uzdaryta-forma', 2 * 24 * HOUR, 1_234_567);
    const { client, deleteCalls, stored } = fakeClient([used, fresh, orphanA, orphanB]);
    const { promise, lines } = run(client, fakeReferences([used.publicId]));
    const report = await promise;

    expect(report.selection.orphans.map((o) => o.publicId).sort()).toEqual(
      [orphanA.publicId, orphanB.publicId].sort(),
    );
    expect(report).toMatchObject({ scanned: 4, deleted: 0, failed: [] });
    expect(deleteCalls).toEqual([]);
    expect(stored.size).toBe(4);
    expect(lines).toEqual([
      `Folder: ${FOLDER}/ (resource_type=image, type=upload)`,
      'Scanned 4 file(s): 1 referenced by products, 1 newer than 24 h, 0 outside the folder, 2 orphan(s).',
      `  ${FOLDER}/nutrukes-ikelimas  2026-11-21T12:00:00.000Z  402.7 KB`,
      `  ${FOLDER}/uzdaryta-forma  2026-11-22T12:00:00.000Z  1.18 MB`,
      'Total: 2 orphan(s), 1.57 MB.',
      'Dry run: nothing deleted. Re-run with --apply to delete these files.',
    ]);
  });

  it('--apply: trina partijomis po 100 ir palieka naudojamas bei naujas', async () => {
    const orphans = Array.from({ length: 250 }, (_, i) =>
      image(`nasle-${String(i).padStart(3, '0')}`, 48 * HOUR),
    );
    const used = image('naudojama', 48 * HOUR);
    const fresh = image('nauja', HOUR);
    const { client, deleteCalls, stored } = fakeClient([...orphans, used, fresh], 100);
    const { promise, lines } = run(client, fakeReferences([used.publicId]), { apply: true });
    const report = await promise;

    expect(deleteCalls.map((c) => c.length)).toEqual([100, 100, 50]);
    expect(report).toMatchObject({ deleted: 250, failed: [] });
    expect([...stored.keys()].sort()).toEqual([fresh.publicId, used.publicId].sort());
    expect(lines).toContain('Batch 1/3: deleted 100, already gone 0, failed 0');
    expect(lines.at(-1)).toBe('Done: 250 deleted, 0 failed.');
  });

  it('--apply: klaidingą partiją užrašo ir tęsia, nepavykę grąžinami', async () => {
    const orphans = Array.from({ length: 205 }, (_, i) => image(`n${i}`, 48 * HOUR));
    const { client, deleteCalls } = fakeClient(orphans, 500);
    client.failBatch = 2;
    client.failIds = new Set([orphans[204]!.publicId]);
    const { promise, lines } = run(client, fakeReferences([]), { apply: true });
    const report = await promise;

    expect(deleteCalls).toHaveLength(3);
    expect(report.deleted).toBe(104);
    expect(report.failed).toHaveLength(101);
    expect(report.failed).toContain(orphans[204]!.publicId);
    expect(lines).toContain('Batch 2/3: failed (100 file(s)): Rate Limit Exceeded');
    expect(lines).toContain('Batch 3/3: deleted 4, already gone 0, failed 1');
  });

  it('--apply: neištrina nuotraukos, prisegtos po pirmo DB skaitymo', async () => {
    const late = image('prisegta-veliau', 48 * HOUR);
    const orphan = image('nasle', 48 * HOUR);
    const { client, deleteCalls, stored } = fakeClient([late, orphan]);
    const { promise } = run(client, fakeReferences([], 0, [late.publicId]), { apply: true });
    const report = await promise;

    expect(deleteCalls).toEqual([[orphan.publicId]]);
    expect(report).toMatchObject({ deleted: 1, skippedNowReferenced: 1 });
    expect(stored.has(late.publicId)).toBe(true);
  });

  it('nutraukia prieš trynimą, jei DB grąžino 0 naudojamų, o produktų su nuotraukomis yra', async () => {
    const { client, deleteCalls } = fakeClient([image('a', 48 * HOUR)]);
    const { promise } = run(client, fakeReferences([], 2), { apply: true });
    await expect(promise).rejects.toThrow(CleanupSafetyError);
    expect(deleteCalls).toEqual([]);
  });

  it('nutraukia nieko nekviesdamas, jei katalogas nesaugus', async () => {
    const { client, listCalls, deleteCalls } = fakeClient([]);
    const { promise } = run(client, fakeReferences([]), { apply: true, folder: '' });
    await expect(promise).rejects.toThrow(CleanupSafetyError);
    expect(listCalls).toEqual([]);
    expect(deleteCalls).toEqual([]);
  });
});
