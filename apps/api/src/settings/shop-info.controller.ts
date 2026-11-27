import type { ShopInfoDto } from '@desert-web/shared';
import { Controller, Get } from '@nestjs/common';
import { SettingsService } from './settings.service';

/**
 * Vieša parduotuvės informacija ir atsiėmimas (poraštė, privatumo puslapis, užsakymo forma,
 * pagrindinis puslapis). Be autentifikacijos: grąžina tik viešus laukus, ne visus nustatymus.
 */
@Controller('shop-info')
export class ShopInfoController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  get(): Promise<ShopInfoDto> {
    return this.settings.shopInfo();
  }
}
