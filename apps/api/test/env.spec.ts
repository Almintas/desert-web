import { validateEnv } from '../src/config/env';

const SECRET = 'a'.repeat(32);
const base = { MONGODB_URI: 'mongodb://localhost:27017/desert-web' };

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
    const env = validateEnv({ ...base, NODE_ENV: 'production', INTERNAL_API_SECRET: SECRET });
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
