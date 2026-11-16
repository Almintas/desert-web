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
