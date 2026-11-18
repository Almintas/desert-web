import { hashPassword, verifyPassword } from '../src/admin-auth/password';

describe('slaptažodžių hash (scrypt)', () => {
  const password = 'labai-slaptas-123';

  it('teisingas slaptažodis patvirtinamas', async () => {
    const hash = await hashPassword(password);
    expect(hash).toMatch(/^scrypt\$\d+\$\d+\$\d+\$[\w-]+\$[\w-]+$/);
    expect(await verifyPassword(password, hash)).toBe(true);
  });

  it('neteisingas slaptažodis atmetamas', async () => {
    const hash = await hashPassword(password);
    expect(await verifyPassword('labai-slaptas-124', hash)).toBe(false);
    expect(await verifyPassword('', hash)).toBe(false);
  });

  it('to paties slaptažodžio hash’ai skiriasi (atsitiktinė druska)', async () => {
    const [a, b] = await Promise.all([hashPassword(password), hashPassword(password)]);
    expect(a).not.toBe(b);
    expect(await verifyPassword(password, a)).toBe(true);
    expect(await verifyPassword(password, b)).toBe(true);
  });

  it('sugadintas ar svetimo formato hash grąžina false, ne klaidą', async () => {
    expect(await verifyPassword(password, 'nesąmonė')).toBe(false);
    expect(await verifyPassword(password, 'scrypt$999999999$8$1$abc$def')).toBe(false);
    expect(await verifyPassword(password, 'bcrypt$1$2$3$4$5')).toBe(false);
  });
});
