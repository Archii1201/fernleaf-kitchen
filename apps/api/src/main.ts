import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { requestIdMiddleware } from './common/middleware/request-id.middleware.js';
import type { Env } from './config/env.schema.js';
import { setupSwagger } from './config/swagger.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const configService = app.get<ConfigService<Env, true>>(ConfigService);
  const port = configService.get('PORT', { infer: true });

  app.use(requestIdMiddleware());

  app.setGlobalPrefix('api');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  setupSwagger(app);

  await app.listen(port);

  new Logger('Bootstrap').log(`API running on http://localhost:${port}/api`);
}

void bootstrap();
