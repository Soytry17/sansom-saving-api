import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDeviceDto } from './dto/register-device.dto';

@Injectable()
export class DevicesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Upsert a device token. Keyed by the unique fcmToken so the same token
   * can move between users on a shared device — we just re-point its userId.
   * A single user keeps multiple rows (one per device).
   */
  async register(userId: bigint, dto: RegisterDeviceDto): Promise<void> {
    await this.prisma.device.upsert({
      where: { fcmToken: dto.fcmToken },
      create: {
        userId,
        fcmToken: dto.fcmToken,
        platform: dto.platform,
      },
      update: {
        userId,
        platform: dto.platform,
      },
    });
  }

  /**
   * Remove a token, scoped to the owner so a user can only unregister
   * their own device. Idempotent: deleting a missing/foreign token is a no-op.
   */
  async unregister(userId: bigint, fcmToken: string): Promise<void> {
    await this.prisma.device.deleteMany({ where: { fcmToken, userId } });
  }
}
