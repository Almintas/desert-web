import {
  type AdminSettingsInput,
  DEFAULT_SPECIAL_ORDER_SETTINGS,
  type SettingsDto,
  type SpecialOrderSettings,
} from '@desert-web/shared';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { ClientSession, Model } from 'mongoose';
import { GLOBAL_SETTINGS_ID, Settings } from './settings.schema';

/** Saugomos reikšmės su numatytosiomis vietoje trūkstamų (lean dokumentai default'ų neturi). */
function specialOrdersOf(settings: Pick<Settings, 'specialOrders'> | null): SpecialOrderSettings {
  const stored = settings?.specialOrders;
  return {
    enabled: stored?.enabled ?? DEFAULT_SPECIAL_ORDER_SETTINGS.enabled,
    leadTimeDays: stored?.leadTimeDays ?? DEFAULT_SPECIAL_ORDER_SETTINGS.leadTimeDays,
    maxDaysAhead: stored?.maxDaysAhead ?? DEFAULT_SPECIAL_ORDER_SETTINGS.maxDaysAhead,
  };
}

function toSettingsDto(settings: Settings | null): SettingsDto {
  return {
    specialOrders: specialOrdersOf(settings),
    updatedAt: settings?.updatedAt?.toISOString() ?? null,
  };
}

@Injectable()
export class SettingsService {
  constructor(@InjectModel(Settings.name) private readonly settingsModel: Model<Settings>) {}

  /**
   * Specialių užsakymų nustatymai užklausos metu. Tik skaito (be upsert), todėl tinka ir
   * vieša užklausa, ir transakcija: kol dokumento nėra, grąžinamos numatytosios reikšmės.
   */
  async specialOrders(session?: ClientSession): Promise<SpecialOrderSettings> {
    const query = this.settingsModel.findById(GLOBAL_SETTINGS_ID, { specialOrders: 1 });
    if (session) query.session(session);
    return specialOrdersOf(await query.lean<Settings>().exec());
  }

  /** Admin GET: sukuria dokumentą su numatytosiomis reikšmėmis, jei jo dar nėra. */
  async getOrCreate(): Promise<SettingsDto> {
    const settings = await this.settingsModel
      .findOneAndUpdate(
        { _id: GLOBAL_SETTINGS_ID },
        { $setOnInsert: { specialOrders: { ...DEFAULT_SPECIAL_ORDER_SETTINGS } } },
        { upsert: true, new: true, lean: true },
      )
      .exec();
    return toSettingsDto(settings as Settings | null);
  }

  /** Admin PUT (tik owner): visos reikšmės pakeičiamos (upsert). */
  async update(input: AdminSettingsInput): Promise<SettingsDto> {
    const settings = await this.settingsModel
      .findOneAndUpdate(
        { _id: GLOBAL_SETTINGS_ID },
        { $set: { specialOrders: input.specialOrders } },
        { upsert: true, new: true, lean: true, runValidators: true },
      )
      .exec();
    return toSettingsDto(settings as Settings | null);
  }
}
