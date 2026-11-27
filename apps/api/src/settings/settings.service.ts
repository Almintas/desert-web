import {
  type AdminSettingsInput,
  DEFAULT_SHOP_INFO,
  DEFAULT_SPECIAL_ORDER_SETTINGS,
  defaultPickupInfo,
  type PickupInfo,
  SELLER_FIELDS,
  type ShopInfo,
  type ShopInfoDto,
  SOCIAL_NETWORKS,
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

/** Saugoma parduotuvės informacija; kiekvienas trūkstamas laukas pakeičiamas numatytuoju. */
export function shopInfoOf(settings: Pick<Settings, 'shop'> | null): ShopInfo {
  const stored = settings?.shop;
  const pick = <K extends string>(
    keys: readonly K[],
    values: Partial<Record<K, string>> | undefined,
    defaults: Readonly<Record<K, string>>,
  ) => Object.fromEntries(keys.map((k) => [k, values?.[k] ?? defaults[k]])) as Record<K, string>;
  return {
    seller: pick(SELLER_FIELDS, stored?.seller, DEFAULT_SHOP_INFO.seller),
    social: pick(SOCIAL_NETWORKS, stored?.social, DEFAULT_SHOP_INFO.social),
    texts: pick(['tagline', 'subtagline'] as const, stored?.texts, DEFAULT_SHOP_INFO.texts),
  };
}

/**
 * Saugomas atsiėmimas; trūkstami laukai numatytieji: vieta yra pardavėjo adresas (tuščias:
 * DEFAULT_PICKUP_LOCATION), laikas DEFAULT_PICKUP_HOURS.
 */
export function pickupOf(settings: Pick<Settings, 'shop' | 'pickup'> | null): PickupInfo {
  const defaults = defaultPickupInfo(shopInfoOf(settings).seller);
  return {
    location: settings?.pickup?.location || defaults.location,
    hours: settings?.pickup?.hours || defaults.hours,
  };
}

function toSettingsDto(settings: Settings | null): SettingsDto {
  return {
    specialOrders: specialOrdersOf(settings),
    shop: shopInfoOf(settings),
    pickup: pickupOf(settings),
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

  /**
   * Parduotuvės informacija su atsiėmimu (viešas GET /shop-info ir laiškai). Tik skaito: kol
   * dokumento ar laukų nėra, numatytosios reikšmės.
   */
  async shopInfo(): Promise<ShopInfoDto> {
    const settings = await this.settingsModel
      .findById(GLOBAL_SETTINGS_ID, { shop: 1, pickup: 1 })
      .lean<Settings>()
      .exec();
    return { ...shopInfoOf(settings), pickup: pickupOf(settings) };
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

  /** Admin PUT (tik owner): atsiųstos dalys pakeičiamos visos (upsert). */
  async update(input: AdminSettingsInput): Promise<SettingsDto> {
    const $set: Partial<Pick<Settings, 'specialOrders' | 'shop' | 'pickup'>> = {};
    if (input.specialOrders) $set.specialOrders = input.specialOrders;
    if (input.shop) $set.shop = input.shop;
    if (input.pickup) $set.pickup = input.pickup;
    const settings = await this.settingsModel
      .findOneAndUpdate(
        { _id: GLOBAL_SETTINGS_ID },
        {
          $set,
          // Pirmą kartą išsaugant ne specialių užsakymų dalį: specialūs užsakymai numatytieji.
          ...(input.specialOrders
            ? {}
            : { $setOnInsert: { specialOrders: { ...DEFAULT_SPECIAL_ORDER_SETTINGS } } }),
        },
        { upsert: true, new: true, lean: true, runValidators: true },
      )
      .exec();
    return toSettingsDto(settings as Settings | null);
  }
}
