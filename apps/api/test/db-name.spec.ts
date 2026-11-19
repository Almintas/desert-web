import './env/db-name';
import { createTestContext, type TestContext } from './helpers';

describe('MONGODB_DB_NAME', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  afterAll(async () => {
    await ctx?.connection.dropDatabase();
    await ctx?.app.close();
  });

  it('API jungiasi prie nurodytos DB, o ne prie MONGODB_URI kelio', () => {
    expect(process.env.MONGODB_URI).toContain('/desert-web-test');
    expect(ctx.connection.db!.databaseName).toBe('desert-web-dbname-test');
  });
});
