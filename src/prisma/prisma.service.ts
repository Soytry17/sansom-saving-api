import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL environment variable is required');
    }

    // Let the adapter create and own the pg Pool from the connection string.
    // (Don't build a pg.Pool here: this app and @prisma/adapter-pg can resolve
    // to separate copies of `pg` under pnpm, and passing a Pool built by one
    // copy into the other crashes pg's startup with ERR_INVALID_ARG_TYPE.)
    const adapter = new PrismaPg({ connectionString });

    super({ adapter });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
