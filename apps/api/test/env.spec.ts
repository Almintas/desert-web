import { TURNSTILE_SITEVERIFY_URL, TURNSTILE_TEST_KEYS } from '@desert-web/shared';
import { validateEnv } from '../src/config/env';

const SECRET = 'a'.repeat(32);
const TURNSTILE = { TURNSTILE_SECRET_KEY: 'cloudflare-turnstile-paslaptis' };
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
      ...TURNSTILE,
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
  const production = {
    ...base,
    ...TURNSTILE,
    NODE_ENV: 'production',
    INTERNAL_API_SECRET: SECRET,
  };

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

describe('validateEnv: Turnstile', () => {
  const production = {
    ...base,
    ...CLOUDINARY,
    NODE_ENV: 'production',
    INTERNAL_API_SECRET: SECRET,
  };

  it.each(['development', 'test'])(
    'NODE_ENV=%s: be rakto naudojamas Cloudflare testinis „visada praeina“',
    (nodeEnv) => {
      const env = validateEnv({ ...base, NODE_ENV: nodeEnv });
      expect(env.TURNSTILE_SECRET_KEY).toBe(TURNSTILE_TEST_KEYS.secretPass);
      expect(env.TURNSTILE_VERIFY_URL).toBe(TURNSTILE_SITEVERIFY_URL);
    },
  );

  it.each([undefined, '', '   '])(
    'produkcijoje TURNSTILE_SECRET_KEY=%j: nepasileidžia',
    (value) => {
      expect(() => validateEnv({ ...production, TURNSTILE_SECRET_KEY: value })).toThrow(
        /TURNSTILE_SECRET_KEY: TURNSTILE_SECRET_KEY privalomas produkcijoje/,
      );
    },
  );

  it('produkcijoje su raktu: naudojamas jis (testinis numatytasis netaikomas)', () => {
    const env = validateEnv({ ...production, ...TURNSTILE });
    expect(env.TURNSTILE_SECRET_KEY).toBe(TURNSTILE.TURNSTILE_SECRET_KEY);
  });
});

describe('validateEnv: ribojimai ir kliento IP', () => {
  it('numatyti užsakymų ribojimai: 5 / 10 min., 20 / parą, peržiūra 60 / min.', () => {
    const env = validateEnv(base);
    expect([
      env.ORDER_RATE_LIMIT_SHORT,
      env.ORDER_RATE_WINDOW_SHORT_SECONDS,
      env.ORDER_RATE_LIMIT_DAILY,
      env.ORDER_RATE_WINDOW_DAILY_SECONDS,
      env.ORDER_ACCESS_RATE_LIMIT,
      env.ORDER_ACCESS_RATE_WINDOW_SECONDS,
    ]).toEqual([5, 600, 20, 86_400, 60, 60]);
  });

  it('ribojimus galima pakeisti per aplinką; netinkama reikšmė atmetama', () => {
    expect(validateEnv({ ...base, ORDER_RATE_LIMIT_SHORT: '2' }).ORDER_RATE_LIMIT_SHORT).toBe(2);
    expect(() => validateEnv({ ...base, ORDER_RATE_LIMIT_SHORT: '0' })).toThrow(
      /ORDER_RATE_LIMIT_SHORT/,
    );
  });

  it('TRUST_X_REAL_IP: numatyta tik produkcijoje, galima nurodyti aiškiai', () => {
    expect(validateEnv(base).TRUST_X_REAL_IP).toBe(false);
    expect(
      validateEnv({
        ...base,
        ...CLOUDINARY,
        ...TURNSTILE,
        NODE_ENV: 'production',
        INTERNAL_API_SECRET: SECRET,
      }).TRUST_X_REAL_IP,
    ).toBe(true);
    expect(validateEnv({ ...base, TRUST_X_REAL_IP: 'true' }).TRUST_X_REAL_IP).toBe(true);
    expect(() => validateEnv({ ...base, TRUST_X_REAL_IP: 'taip' })).toThrow(/TRUST_X_REAL_IP/);
  });
});

describe('validateEnv: visi trūkstami kintamieji vienoje klaidoje', () => {
  it('be MONGODB_URI: aiški klaida', () => {
    expect(() => validateEnv({})).toThrow(/MONGODB_URI: MONGODB_URI privalomas/);
  });

  it('produkcijoje be nieko: išvardijami visi privalomi kintamieji iš karto', () => {
    let message = '';
    try {
      validateEnv({ NODE_ENV: 'production' });
    } catch (error) {
      message = (error as Error).message;
    }
    for (const key of [
      'MONGODB_URI',
      'INTERNAL_API_SECRET',
      'TURNSTILE_SECRET_KEY',
      'CLOUDINARY_CLOUD_NAME',
      'CLOUDINARY_API_KEY',
      'CLOUDINARY_API_SECRET',
    ]) {
      expect(message).toContain(`${key}: ${key} privalomas`);
    }
  });
});

describe('validateEnv: MONGODB_DB_NAME', () => {
  it('neprivalomas; nurodytas perduodamas, netinkamas atmetamas', () => {
    expect(validateEnv(base).MONGODB_DB_NAME).toBeUndefined();
    expect(validateEnv({ ...base, MONGODB_DB_NAME: 'desert-web' }).MONGODB_DB_NAME).toBe(
      'desert-web',
    );
    expect(() => validateEnv({ ...base, MONGODB_DB_NAME: 'su tarpu' })).toThrow(/MONGODB_DB_NAME/);
  });
});
