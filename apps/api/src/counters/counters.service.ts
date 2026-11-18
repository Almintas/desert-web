import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { ClientSession, Model } from 'mongoose';
import { Counter } from './counter.schema';

@Injectable()
export class CountersService {
  constructor(@InjectModel(Counter.name) private readonly counterModel: Model<Counter>) {}

  /**
   * Atomiškai padidina skaitiklį ir grąžina naują reikšmę.
   * Perduok session, kad numeris būtų „sudegintas“ tik jei transakcija pavyksta.
   *
   * Pirmas metų užsakymas sukuria dokumentą per upsert. Kai du tokie upsert'ai vyksta
   * lygiagrečiose transakcijose (pvz., skirtinguose languose), serveris pralaimėjusiai
   * grąžina WriteConflict su TransientTransactionError žyma (ne E11000), todėl
   * withTransaction transakciją pakartoja ir antrą kartą upsert randa dokumentą.
   * Patikrinta su MongoDB 7.0, 8.0 ir 8.2. Testas „skaitiklio upsert konfliktas
   * transakcijoje“ (test/orders.concurrency.spec.ts) tai užfiksuoja, todėl atskiro
   * kartojimo dėl 11000 čia nedarom. Be session serveris tokį upsert kartoja pats.
   */
  async next(key: string, session?: ClientSession): Promise<number> {
    const counter = await this.counterModel
      .findOneAndUpdate(
        { _id: key },
        { $inc: { seq: 1 } },
        { upsert: true, new: true, session, lean: true },
      )
      .exec();
    return counter!.seq;
  }
}
