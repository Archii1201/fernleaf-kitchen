import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

/** Swagger UI path, relative to the global `/api` prefix. */
export const SWAGGER_PATH = 'docs';

export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('Fernleaf Kitchen API')
    .setDescription(
      'Internal admin API for Fernleaf Kitchen commercial kitchen operations.',
    )
    .setVersion('0.1.0')
    .build();

  const document = SwaggerModule.createDocument(app, config);

  // `useGlobalPrefix` reuses the existing `/api` prefix instead of hardcoding
  // it here, which would produce `/api/api/docs`.
  SwaggerModule.setup(SWAGGER_PATH, app, document, {
    useGlobalPrefix: true,
  });
}
