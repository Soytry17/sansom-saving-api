import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ListNotificationsQueryDto } from './dto/list-notifications-query.dto';
import { NotificationResponseDto } from './dto/notification-response.dto';
import { NotificationSettingsResponseDto } from './dto/notification-settings-response.dto';
import { SaveNotificationSettingsDto } from './dto/save-notification-settings.dto';
import { PaginatedDataDto } from '../common/dto/api-response.dto';
import { FcmService } from '../push/fcm.service';

interface NotificationRow {
  id: bigint;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: Date;
}

const NOTIFICATION_SELECT = {
  id: true,
  title: true,
  message: true,
  isRead: true,
  createdAt: true,
} as const;

@Injectable()
export class NotificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fcm: FcmService,
  ) {}

  async list(
    userId: bigint,
    query: ListNotificationsQueryDto,
  ): Promise<PaginatedDataDto<NotificationResponseDto>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where: Prisma.NotificationWhereInput = {
      userId,
      ...(query.isRead !== undefined && { isRead: query.isRead }),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: NOTIFICATION_SELECT,
      }),
      this.prisma.notification.count({ where }),
    ]);

    return {
      items: rows.map((r) => this.toDto(r)),
      pagination: { page, limit, total },
    };
  }

  /**
   * Mark a single notification as read. Idempotent: a row that is
   * already read will simply not match the updateMany predicate and
   * we'll fall through to verify ownership and exit silently.
   */
  async markAsRead(userId: bigint, id: bigint): Promise<void> {
    const result = await this.prisma.notification.updateMany({
      where: { id, userId, isRead: false },
      data: { isRead: true },
    });

    if (result.count === 0) {
      // Either the row doesn't exist / isn't owned by this user, OR it
      // was already read. Disambiguate so we return 404 only for
      // truly missing rows.
      const exists = await this.prisma.notification.findFirst({
        where: { id, userId },
        select: { id: true },
      });
      if (!exists) {
        throw new NotFoundException('Notification not found');
      }
    }
  }

  async markAllAsRead(userId: bigint): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
  }

  /**
   * Read the current user's notification settings. New users get a row
   * seeded at registration; for any legacy user created before seeding we
   * lazily create the defaults so this never 404s.
   */
  async getSettings(
    userId: bigint,
  ): Promise<NotificationSettingsResponseDto> {
    const select = {
      transferAlert: true,
      monthlyReport: true,
      lowBalanceAlert: true,
      lowBalanceThreshold: true,
    } as const;

    const row =
      (await this.prisma.notificationSettings.findUnique({
        where: { userId },
        select,
      })) ??
      (await this.prisma.notificationSettings.create({
        data: { userId },
        select,
      }));

    return {
      transferAlert: row.transferAlert,
      monthlyReport: row.monthlyReport,
      lowBalanceAlert: row.lowBalanceAlert,
      lowBalanceThreshold: row.lowBalanceThreshold.toString(),
    };
  }

  /**
   * Upsert the settings row for the current user. The first call
   * creates it; subsequent calls update the existing row in place.
   */
  async saveSettings(
    userId: bigint,
    dto: SaveNotificationSettingsDto,
  ): Promise<NotificationSettingsResponseDto> {
    const threshold = new Prisma.Decimal(dto.lowBalanceThreshold);

    const row = await this.prisma.notificationSettings.upsert({
      where: { userId },
      create: {
        userId,
        transferAlert: dto.transferAlert,
        monthlyReport: dto.monthlyReport,
        lowBalanceAlert: dto.lowBalanceAlert,
        lowBalanceThreshold: threshold,
      },
      update: {
        transferAlert: dto.transferAlert,
        monthlyReport: dto.monthlyReport,
        lowBalanceAlert: dto.lowBalanceAlert,
        lowBalanceThreshold: threshold,
      },
      select: {
        transferAlert: true,
        monthlyReport: true,
        lowBalanceAlert: true,
        lowBalanceThreshold: true,
      },
    });

    return {
      transferAlert: row.transferAlert,
      monthlyReport: row.monthlyReport,
      lowBalanceAlert: row.lowBalanceAlert,
      lowBalanceThreshold: row.lowBalanceThreshold.toString(),
    };
  }

  /**
   * Dev/QA helper: persist a sample notification and push it to the caller's
   * devices so the Android team can verify end-to-end delivery. Disabled in
   * production unless PUSH_TEST_ENABLED === 'true'.
   */
  async sendTest(userId: bigint): Promise<void> {
    const isProd = process.env.NODE_ENV === 'production';
    if (isProd && process.env.PUSH_TEST_ENABLED !== 'true') {
      throw new ForbiddenException('Test push endpoint is disabled');
    }

    const notif = await this.prisma.notification.create({
      data: {
        userId,
        title: 'Test Notification',
        message: 'This is a test push from Sonsam Saving.',
      },
      select: { id: true, title: true, message: true, createdAt: true },
    });

    await this.fcm.sendToUser(userId, {
      type: 'transfer_received',
      notificationId: notif.id.toString(),
      title: notif.title,
      message: notif.message,
      createdAt: notif.createdAt.toISOString(),
    });
  }

  private toDto(n: NotificationRow): NotificationResponseDto {
    return {
      id: n.id.toString(),
      title: n.title,
      message: n.message,
      isRead: n.isRead,
      createdAt: n.createdAt,
    };
  }
}
