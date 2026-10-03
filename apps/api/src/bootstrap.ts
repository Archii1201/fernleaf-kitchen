import { ValidationPipe, type INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { requestIdMiddleware } from './common/middleware/request-id.middleware.js';

/**
 * Infrastructure every runtime of this API needs: the real server and the e2e
 * tests both call this, so the tests exercise the same middleware, prefix and
 * validation rules as production.
 */
export function configureApp(app: INestApplication): void {
  app.use(requestIdMiddleware());
  app.use(cookieParser());

  app.setGlobalPrefix('api');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
}
