// Load .env BEFORE any module imports — ensures process.env.JWT_SECRET
// is set when JwtModule.register() evaluates its config. Without this,
// JwtModule signs with the fallback secret while JwtStrategy verifies
// with the real secret loaded later by ConfigModule, causing 401s.
import 'dotenv/config';

import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

// Allow JSON serialization of BigInt values returned from Prisma
// (User.id, Account.id, etc. are BigInt). Without this, Express throws:
// "TypeError: Do not know how to serialize a BigInt"
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function () {
  return this.toString();
};

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable CORS so browser-based clients (web app, Swagger UI on another
  // origin) can call the API. CORS_ORIGINS is an optional comma-separated
  // allowlist; when unset we reflect any origin (fine for development).
  const corsOrigins = process.env.CORS_ORIGINS?.split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({
    origin: corsOrigins && corsOrigins.length > 0 ? corsOrigins : true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  app.setGlobalPrefix('api');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());

  const config = new DocumentBuilder()
    .setTitle('Sonsam Saving API')
    .setDescription('Personal Finance Tracker — REST API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const documentFactory = () => SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, documentFactory);

  // Bind to 0.0.0.0 so the API is reachable from other devices on the LAN
  // (e.g. a physical Android phone hitting the host's local IP), not just
  // localhost on the host machine.
  await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
}
bootstrap();
