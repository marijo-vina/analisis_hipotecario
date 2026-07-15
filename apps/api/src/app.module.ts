import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CaseAnalysisModule } from './case-analysis/case-analysis.module';
import { ClientsModule } from './clients/clients.module';
import { AuthModule } from './auth/auth.module';
import { CatalogsModule } from './catalogs/catalogs.module';
import { MortgageCasesModule } from './mortgage-cases/mortgage-cases.module';
import { DocumentsModule } from './documents/documents.module';
import { LiabilityModule } from './liability/liability.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    AuthModule,
    ClientsModule,
    CatalogsModule,
    MortgageCasesModule,
    DocumentsModule,
    CaseAnalysisModule,
    LiabilityModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
