import { Module } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { NotificationController } from './notification.controller';
import { MonthlyReportJob } from './jobs/monthly-report.job';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { ReportModule } from '../report/report.module';
import { PushModule } from '../push/push.module';

@Module({
  imports: [PrismaModule, AuthModule, ReportModule, PushModule],
  providers: [NotificationService, MonthlyReportJob],
  controllers: [NotificationController],
  exports: [NotificationService],
})
export class NotificationModule {}
