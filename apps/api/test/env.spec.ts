import { validateEnv } from '../src/config/env';

const SECRET = 'a'.repeat(32);
const base = { MONGODB_URI: 'mongodb://localhost:27017/desert-web' };
const CLOUDINARY = {
  CLOUDINARY_CLOUD_NAME: 'desert-cloud',
  CLOUDINARY_API_KEY: '123456789012345',
  CLOUDINARY_API_SECRET: 'cloudinary-paslaptis',
};

describe('validateEnv: INTERNAL_API_SECRET', () => {
  it.each(['development', 'test', undefined])('NODE_ENV=%s: neprivalomas', (nodeEnv) => {
    const env = validateEnv({ ...base, NODE_ENV: nodeEnv });
    expect(env.INTERNAL_API_SECRET).toBeUndefined();
  });

  it('produkcijoje be paslapties: aiški klaida lietuviškai', () => {
    expect(() => validateEnv({ ...base, NODE_ENV: 'production' })).toThrow(
      /INTERNAL_API_SECRET: INTERNAL_API_SECRET privalomas produkcijoje/,
    );
  });

  it('produkcijoje tuščia ar vien tarpų reikšmė laikoma nenustatyta', () => {
    expect(() =>
      validateEnv({ ...base, NODE_ENV: 'production', INTERNAL_API_SECRET: '   ' }),
    ).toThrow(/privalomas produkcijoje/);
  });

  it('produkcijoje su paslaptimi: paleidžiama', () => {
    const env = validateEnv({
      ...base,
      ...CLOUDINARY,
      NODE_ENV: 'production',
      INTERNAL_API_SECRET: SECRET,
    });
    expect(env.INTERNAL_API_SECRET).toBe(SECRET);
    expect(env.NODE_ENV).toBe('production');
  });

  it('per trumpa paslaptis atmetama visose aplinkose', () => {
    for (const NODE_ENV of ['development', 'production']) {
      expect(() => validateEnv({ ...base, NODE_ENV, INTERNAL_API_SECRET: 'trumpa' })).toThrow(
        /bent 32 simbolių/,
      );
    }
  });
});

describe('validateEnv: Cloudinary', () => {
  const production = { ...base, NODE_ENV: 'production', INTERNAL_API_SECRET: SECRET };

  it.each(['development', 'test'])(
    'NODE_ENV=%s: neprivalomi, katalogas pagal aplinką',
    (nodeEnv) => {
      const env = validateEnv({ ...base, NODE_ENV: nodeEnv });
      expect(env.CLOUDINARY_CLOUD_NAME).toBeUndefined();
      expect(env.CLOUDINARY_FOLDER).toBe(`desert-web/${nodeEnv}/products`);
    },
  );

  it.each(Object.keys(CLOUDINARY))('produkcijoje be %s: nepasileidžia', (key) => {
    const raw: Record<string, unknown> = { ...production, ...CLOUDINARY, [key]: '' };
    expect(() => validateEnv(raw)).toThrow(new RegExp(`${key}: ${key} privalomas produkcijoje`));
  });

  it('produkcijoje be jokių Cloudinary kintamųjų: visi trys klaidoje', () => {
    expect(() => validateEnv(production)).toThrow(
      /CLOUDINARY_CLOUD_NAME[\s\S]*CLOUDINARY_API_KEY[\s\S]*CLOUDINARY_API_SECRET/,
    );
  });

  it('produkcijoje numatytas katalogas desert-web/production/products; galima nurodyti kitą', () => {
    expect(validateEnv({ ...production, ...CLOUDINARY }).CLOUDINARY_FOLDER).toBe(
      'desert-web/production/products',
    );
    expect(
      validateEnv({ ...production, ...CLOUDINARY, CLOUDINARY_FOLDER: 'parduotuve/nuotraukos' })
        .CLOUDINARY_FOLDER,
    ).toBe('parduotuve/nuotraukos');
  });

  it.each(['/pradzia', 'galas/', 'a//b', 'su tarpu', '../kitas'])(
    'netinkamas CLOUDINARY_FOLDER "%s": klaida',
    (folder) => {
      expect(() => validateEnv({ ...base, CLOUDINARY_FOLDER: folder })).toThrow(
        /CLOUDINARY_FOLDER/,
      );
    },
  );
});
