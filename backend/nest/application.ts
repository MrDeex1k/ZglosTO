// oxlint-disable-next-line import/no-unassigned-import -- Decorator metadata must load before NestJS modules.
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter, type NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import { API_JSON_REQUEST_MAX_BYTES } from '@zglosto/contracts';
import { AppModule } from './app.module.ts';
import { StructuredLogger } from './platform/structured-logger.ts';

export type NestApplicationMode = 'runtime' | 'test';

export async function createNestApplication(mode: NestApplicationMode): Promise<INestApplication> {
  const application = await NestFactory.create<NestExpressApplication>(
    AppModule,
    new ExpressAdapter(),
    {
      logger: false,
    },
  );
  application.useBodyParser('json', { limit: API_JSON_REQUEST_MAX_BYTES });

  if (mode === 'runtime') {
    application.useLogger(application.get(StructuredLogger));
    application.enableShutdownHooks();
    setupNestOpenApi(application);
  }

  return application;
}

function createNestOpenApiDocument(application: INestApplication): OpenAPIObject {
  const configuration = new DocumentBuilder()
    .setTitle('ZglosTO Backend API')
    .setDescription('Stable HTTP contract for one White-Label city installation.')
    .setVersion('1.0.0')
    .addCookieAuth('better-auth.session_token', { in: 'cookie', type: 'apiKey' }, 'session')
    .build();

  const document = SwaggerModule.createDocument(application, configuration, {
    autoTagControllers: false,
    deepScanRoutes: true,
    operationIdFactory: (controller, method) => `${controller}.${method}`,
  });
  return document;
}

function setupNestOpenApi(application: INestApplication): OpenAPIObject {
  const document = createNestOpenApiDocument(application);
  SwaggerModule.setup('internal/openapi', application, document, {
    jsonDocumentUrl: '/openapi.json',
    raw: ['json'],
    ui: false,
  });
  return document;
}
