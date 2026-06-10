import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ClientsModule } from './clients/clients.module';
import { AuthModule } from './auth/auth.module';
import { CatalogsModule } from './catalogs/catalogs.module';
import { MortgageCasesModule } from './mortgage-cases/mortgage-cases.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    AuthModule,
    ClientsModule,
    CatalogsModule,
    MortgageCasesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
