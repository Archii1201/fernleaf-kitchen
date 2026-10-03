import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module.js';
import { CatalogueModule } from './catalogue/catalogue.module.js';
import { CommonModule } from './common/common.module.js';
import { CompaniesModule } from './companies/companies.module.js';
import { validateEnv } from './config/env.validation.js';
import { EmployeesModule } from './employees/employees.module.js';
import { KitchenModule } from './kitchen/kitchen.module.js';
import { MenuModule } from './menu/menu.module.js';
import { PricingModule } from './pricing/pricing.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { HealthModule } from './health/health.module.js';
import { StaffModule } from './staff/staff.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
    }),
    CommonModule,
    PrismaModule,
    AuthModule,
    StaffModule,
    KitchenModule,
    CatalogueModule,
    PricingModule,
    CompaniesModule,
    EmployeesModule,
    MenuModule,
    HealthModule,
  ],
})
export class AppModule {}
