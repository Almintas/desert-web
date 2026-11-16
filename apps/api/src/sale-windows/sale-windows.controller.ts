import { Controller, Get } from '@nestjs/common';
import { SaleWindowsService } from './sale-windows.service';

@Controller('sale-windows')
export class SaleWindowsController {
  constructor(private readonly saleWindowsService: SaleWindowsService) {}

  /** Pirkėjų puslapiui: ar dabar galima užsakyti, ir kada bus kitas pardavimas. */
  @Get('current')
  getCurrent() {
    return this.saleWindowsService.getCurrent();
  }
}
