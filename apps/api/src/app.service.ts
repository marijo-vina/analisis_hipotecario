import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHealthCheck() {
    return {
      status: 'ok',
      app: 'Gestion Financiera API',
      module: 'Sprint 1 - Base del sistema',
    };
  }
}