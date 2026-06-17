import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { ReportService } from '../../report/report.service';
import { FcmService } from '../../push/fcm.service';

@Injectable()
export class MonthlyReportJob {
  private readonly logger = new Logger(MonthlyReportJob.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly reportService: ReportService,
    private readonly fcm: FcmService,
  ) {}

  /**
   * Runs at 00:00 UTC on the 1st of every month and notifies every opted-in
   * user with a summary of the month that just ended. Idempotent: if a row
   * for this run already exists for a user, that user is skipped, so a retry
   * (or a restart) never double-sends.
   */
  @Cron('0 0 1 * *', { name: 'monthly-report', timeZone: 'UTC' })
  async sendMonthlyReports(): Promise<void> {
    const { month, year, label } = this.previousMonth();
    const runWindowStart = this.firstOfCurrentMonthUtc();

    const recipients = await this.prisma.notificationSettings.findMany({
      where: { monthlyReport: true },
      select: { userId: true },
    });

    this.logger.log(
      `Monthly report job: ${recipients.length} opted-in user(s) for ${label}.`,
    );

    let sent = 0;
    for (const { userId } of recipients) {
      try {
        // Idempotency guard — skip if already notified this run.
        const existing = await this.prisma.notification.findFirst({
          where: {
            userId,
            title: 'Monthly Report',
            createdAt: { gte: runWindowStart },
          },
          select: { id: true },
        });
        if (existing) continue;

        const report = await this.reportService.monthly(userId, {
          month,
          year,
        });

        const message =
          `${label}: income ${report.totalIncome}, ` +
          `expense ${report.totalExpense}, ` +
          `net savings ${report.netSavings}.`;

        const notif = await this.prisma.notification.create({
          data: { userId, title: 'Monthly Report', message },
          select: { id: true, title: true, message: true, createdAt: true },
        });

        await this.fcm.sendToUser(userId, {
          type: 'monthly_report',
          notificationId: notif.id.toString(),
          title: notif.title,
          message: notif.message,
          createdAt: notif.createdAt.toISOString(),
        });
        sent += 1;
      } catch (err) {
        // One user's failure must not abort the whole run.
        this.logger.error(
          `Monthly report failed for user ${userId.toString()}`,
          err instanceof Error ? err.stack : String(err),
        );
      }
    }

    this.logger.log(`Monthly report job complete: ${sent} sent for ${label}.`);
  }

  /** The month that just ended, relative to "now" (UTC). */
  private previousMonth(): { month: number; year: number; label: string } {
    const now = new Date();
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const month = d.getUTCMonth() + 1;
    const year = d.getUTCFullYear();
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ];
    return { month, year, label: `${monthNames[month - 1]} ${year}` };
  }

  private firstOfCurrentMonthUtc(): Date {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  }
}
