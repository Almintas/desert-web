import { getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import request from 'supertest';
import { SpecialOrder } from '../src/special-orders/special-order.schema';
import {
  clearDatabase,
  createProduct,
  createTestContext,
  loginAdmin,
  setSpecialOrderSettings,
  specialOrderBody,
  type TestContext,
} from './helpers';

const HOUR = 3_600_000;
const iso = (hoursFromNow: number) => new Date(Date.now() + hoursFromNow * HOUR).toISOString();

describe('Admin specialūs užsakymai: lygiagretūs būsenų keitimai', () => {
  let ctx: TestContext;
  let model: Model<SpecialOrder>;
  let tokens: [string, string];

  const http = () => request(ctx.app.getHttpServer());
  const confirm = (id: string, token: string) =>
    http()
      .post(`/admin/special-orders/${id}/confirm`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        totalCents: 10_000,
        pickupFrom: iso(48),
        pickupTo: iso(50),
        pickupLocation: 'Vilnius',
      });
  const reject = (id: string, token: string) =>
    http()
      .post(`/admin/special-orders/${id}/reject`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'Negalime' });
  const cancel = (id: string, token: string) =>
    http()
      .post(`/admin/special-orders/${id}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

  async function newRequest(): Promise<string> {
    const p = await createProduct(ctx, { specialOrder: { enabled: true, minQuantity: 1 } });
    const res = await http()
      .post('/special-orders')
      .send(specialOrderBody([{ variantId: p.variantIds[0]!, quantity: 5 }]));
    expect(res.status).toBe(201);
    return res.body.specialOrder.id as string;
  }

  beforeAll(async () => {
    ctx = await createTestContext();
    model = ctx.app.get(getModelToken(SpecialOrder.name));
    await clearDatabase(ctx.connection);
    await setSpecialOrderSettings(ctx);
    tokens = [await loginAdmin(ctx), await loginAdmin(ctx, 'staff')];
  });

  afterAll(async () => {
    await ctx?.app.close();
  });

  it('confirm ir reject vienu metu: laimi tik vienas, kitas 409, istorijoje vienas įrašas', async () => {
    const winners = { confirmed: 0, rejected: 0 };
    for (let round = 0; round < 15; round++) {
      const id = await newRequest();
      // Kas antrą kartą kita tvarka, kad abu galėtų laimėti.
      const [a, b] =
        round % 2 === 0
          ? [confirm(id, tokens[0]), reject(id, tokens[1])]
          : [reject(id, tokens[1]), confirm(id, tokens[0])];
      const responses = await Promise.all([a, b]);
      const statuses = responses.map((r) => r.status).sort();
      expect(statuses).toEqual([200, 409]);
      const loser = responses.find((r) => r.status === 409)!;
      expect(loser.body.code).toBe('INVALID_STATUS_TRANSITION');

      const stored = await model.findById(id).lean().exec();
      expect(['confirmed', 'rejected']).toContain(stored!.status);
      expect(stored!.statusHistory.map((h) => h.status)).toEqual(['requested', stored!.status]);
      // Tik laimėjusio perėjimo duomenys.
      if (stored!.status === 'confirmed') {
        expect(stored!.confirmation).toBeDefined();
        expect(stored!.rejectionReason).toBeUndefined();
      } else {
        expect(stored!.rejectionReason).toBe('Negalime');
        expect(stored!.confirmation).toBeUndefined();
      }
      winners[stored!.status as 'confirmed' | 'rejected'] += 1;
    }
    expect(winners.confirmed + winners.rejected).toBe(15);
  });

  it('du adminai patvirtina vienu metu: vienas 200, kitas 409', async () => {
    for (let round = 0; round < 5; round++) {
      const id = await newRequest();
      const responses = await Promise.all([confirm(id, tokens[0]), confirm(id, tokens[1])]);
      expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
      const stored = await model.findById(id).lean().exec();
      expect(stored!.statusHistory.filter((h) => h.status === 'confirmed')).toHaveLength(1);
    }
  });

  it('confirm, reject ir cancel vienu metu: tik leidžiamos sekos, istorija atitinka', async () => {
    for (let round = 0; round < 8; round++) {
      const id = await newRequest();
      const [c, r, x] = await Promise.all([
        confirm(id, tokens[0]),
        reject(id, tokens[1]),
        cancel(id, tokens[0]),
      ]);
      const won = [
        ...(c.status === 200 ? ['confirmed'] : []),
        ...(r.status === 200 ? ['rejected'] : []),
        ...(x.status === 200 ? ['cancelled'] : []),
      ].join(',');
      // confirmed -> cancelled leidžiamas, todėl confirm ir cancel gali pavykti abu.
      expect(['confirmed', 'rejected', 'cancelled', 'confirmed,cancelled']).toContain(won);
      for (const res of [c, r, x]) {
        if (res.status !== 200)
          expect([res.status, res.body.code]).toEqual([409, 'INVALID_STATUS_TRANSITION']);
      }
      const stored = await model.findById(id).lean().exec();
      expect(stored!.statusHistory.map((h) => h.status)).toEqual(['requested', ...won.split(',')]);
    }
  });
});
