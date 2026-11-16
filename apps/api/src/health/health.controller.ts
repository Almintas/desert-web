import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';

@Controller('health')
export class HealthController {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  @Get()
  check() {
    const dbConnected = this.connection.readyState === 1;
    if (!dbConnected) {
      throw new ServiceUnavailableException({ status: 'error', db: 'disconnected' });
    }
    return { status: 'ok', db: 'connected' };
  }
}
