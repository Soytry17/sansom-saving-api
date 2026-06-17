import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { cert, getApps, initializeApp, ServiceAccount } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { PrismaService } from '../prisma/prisma.service';
import { PushData, toFcmDataRecord } from './push-payload';

/** FCM error codes that mean the token is permanently dead and should be purged. */
const DEAD_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
]);

@Injectable()
export class FcmService implements OnModuleInit {
  private readonly logger = new Logger(FcmService.name);
  private enabled = false;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    if (getApps().length > 0) {
      this.enabled = true;
      return;
    }

    const base64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
    if (!base64) {
      // No credentials configured — run in no-op mode so the rest of the API
      // works in dev/test. In-app notification rows are still created.
      this.logger.warn(
        'FIREBASE_SERVICE_ACCOUNT_BASE64 is not set — push notifications are disabled.',
      );
      return;
    }

    try {
      const json = Buffer.from(base64, 'base64').toString('utf8');
      const serviceAccount = JSON.parse(json) as ServiceAccount;
      initializeApp({ credential: cert(serviceAccount) });
      this.enabled = true;
      this.logger.log('Firebase Admin initialized — push notifications enabled.');
    } catch (err) {
      this.logger.error(
        'Failed to initialize Firebase Admin — push notifications disabled.',
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  /**
   * Send a data-only push to every device registered for a user. Best-effort:
   * - no devices  → silently skip (the in-app inbox row still exists)
   * - dead tokens → pruned from the devices table
   * - any failure → logged, never thrown (must not break the API request)
   */
  async sendToUser(userId: bigint, data: PushData): Promise<void> {
    if (!this.enabled) return;

    try {
      const devices = await this.prisma.device.findMany({
        where: { userId },
        select: { fcmToken: true },
      });
      if (devices.length === 0) return;

      const tokens = devices.map((d) => d.fcmToken);
      const response = await getMessaging().sendEachForMulticast({
        tokens,
        data: toFcmDataRecord(data),
        android: { priority: 'high' },
      });

      const deadTokens: string[] = [];
      response.responses.forEach((res, i) => {
        if (res.error && DEAD_TOKEN_CODES.has(res.error.code)) {
          deadTokens.push(tokens[i]);
        }
      });

      if (deadTokens.length > 0) {
        await this.prisma.device.deleteMany({
          where: { fcmToken: { in: deadTokens } },
        });
        this.logger.log(`Pruned ${deadTokens.length} dead FCM token(s).`);
      }
    } catch (err) {
      this.logger.error(
        `FCM send failed for user ${userId.toString()}`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }
}
