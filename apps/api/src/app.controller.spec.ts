import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return health check status', () => {
      expect(appController.getHealthCheck()).toEqual({
        status: 'ok',
        app: 'Gestion Financiera API',
        module: 'Sprint 1 - Base del sistema',
      });
    });
  });
});
