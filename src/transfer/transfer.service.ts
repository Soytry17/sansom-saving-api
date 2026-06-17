import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import {
  CategoryType,
  Prisma,
  TransactionSource,
  TransactionType,
  TransferStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTransferDto } from './dto/create-transfer.dto';
import {
  ListTransfersQueryDto,
  TransferDirection,
} from './dto/list-transfers-query.dto';
import { CreateTransferResponseDto } from './dto/transfer-response.dto';
import { TransferHistoryItemDto } from './dto/transfer-history-item.dto';
import { FcmService } from '../push/fcm.service';

/** A notification row captured inside the transaction, pushed after commit. */
interface PendingPush {
  userId: bigint;
  notificationId: bigint;
  title: string;
  message: string;
  createdAt: Date;
}

@Injectable()
export class TransferService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fcm: FcmService,
  ) {}

  /**
   * Atomic P2P transfer.
   * In one prisma.$transaction:
   *   1. Race-safe debit on sender (predicate balance >= amount)
   *   2. Credit on receiver
   *   3. Insert `transfers` row
   *   4. Look up sender's "Transfer Out" and receiver's "Transfer In" categories
   *   5. Insert paired `transactions` rows (source = transfer, refId = transfer.id)
   *   6. Insert `notifications` row for the receiver
   *   7. Read updated sender balance for the response
   */
  async create(
    userId: bigint,
    dto: CreateTransferDto,
  ): Promise<CreateTransferResponseDto> {
    const senderAccount = await this.prisma.account.findUnique({
      where: { userId },
      select: { id: true, accountNumber: true },
    });
    if (!senderAccount) {
      throw new NotFoundException('Sender account not found');
    }

    const receiverAccount = await this.prisma.account.findUnique({
      where: { accountNumber: dto.receiverAccountNumber },
      select: {
        id: true,
        userId: true,
        accountNumber: true,
        user: { select: { fullName: true } },
      },
    });
    if (!receiverAccount) {
      throw new NotFoundException('Receiver account not found');
    }
    if (receiverAccount.id === senderAccount.id) {
      throw new BadRequestException('Cannot transfer to your own account');
    }

    const sender = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { fullName: true },
    });
    if (!sender) {
      throw new NotFoundException('Sender not found');
    }

    const amount = new Prisma.Decimal(dto.amount);
    const today = this.todayUtc();

    const { response, pushes } = await this.prisma.$transaction(async (tx) => {
      // Notification rows created below are pushed AFTER the transaction
      // commits — never inside it, so a rollback can't emit a phantom push.
      const pendingPushes: PendingPush[] = [];

      // 1) Race-safe debit
      const debit = await tx.account.updateMany({
        where: { id: senderAccount.id, balance: { gte: amount } },
        data: { balance: { decrement: amount } },
      });
      if (debit.count === 0) {
        throw new BadRequestException('Insufficient balance');
      }

      // 2) Credit receiver
      await tx.account.update({
        where: { id: receiverAccount.id },
        data: { balance: { increment: amount } },
      });

      // 3) Insert transfer record
      const transfer = await tx.transfer.create({
        data: {
          senderAccountId: senderAccount.id,
          receiverAccountId: receiverAccount.id,
          amount,
          note: dto.note ?? null,
          status: TransferStatus.completed,
        },
        select: { id: true },
      });

      // 4) Resolve protected categories on each side
      const [senderTransferOut, receiverTransferIn] = await Promise.all([
        tx.category.findFirst({
          where: {
            userId,
            name: 'Transfer Out',
            type: CategoryType.expense,
            isDeleted: false,
          },
          select: { id: true },
        }),
        tx.category.findFirst({
          where: {
            userId: receiverAccount.userId,
            name: 'Transfer In',
            type: CategoryType.income,
            isDeleted: false,
          },
          select: { id: true },
        }),
      ]);
      if (!senderTransferOut || !receiverTransferIn) {
        // Should never happen — these are seeded at registration and protected.
        throw new InternalServerErrorException(
          'System category for transfers is missing',
        );
      }

      // 5) Paired transactions
      await tx.transaction.createMany({
        data: [
          {
            userId,
            accountId: senderAccount.id,
            categoryId: senderTransferOut.id,
            source: TransactionSource.transfer,
            refId: transfer.id,
            amount,
            type: TransactionType.expense,
            date: today,
            note: dto.note ?? null,
          },
          {
            userId: receiverAccount.userId,
            accountId: receiverAccount.id,
            categoryId: receiverTransferIn.id,
            source: TransactionSource.transfer,
            refId: transfer.id,
            amount,
            type: TransactionType.income,
            date: today,
            note: dto.note ?? null,
          },
        ],
      });

      // 6) Receiver notification — gated by the receiver's transferAlert
      //    setting (toggle off ⇒ no inbox row and no push).
      const receiverSettings = await tx.notificationSettings.findUnique({
        where: { userId: receiverAccount.userId },
        select: { transferAlert: true },
      });
      if (receiverSettings?.transferAlert) {
        const notif = await tx.notification.create({
          data: {
            userId: receiverAccount.userId,
            title: 'Transfer Received',
            message: `You received ${amount.toString()} from ${sender.fullName}`,
          },
          select: { id: true, title: true, message: true, createdAt: true },
        });
        pendingPushes.push({
          userId: receiverAccount.userId,
          notificationId: notif.id,
          title: notif.title,
          message: notif.message,
          createdAt: notif.createdAt,
        });
      }

      // 7) Read fresh sender balance
      const updatedSender = await tx.account.findUniqueOrThrow({
        where: { id: senderAccount.id },
        select: { balance: true },
      });

      // 8) Low-balance alert (sender side, opt-in)
      //    Fires on EVERY transfer whose post-debit balance is below
      //    the user's threshold. Designed as a recurring reminder:
      //    while the user keeps spending in the danger zone, they
      //    keep getting nudged on each transaction. Users without a
      //    notification_settings row never get this alert; they must
      //    opt in via POST /notifications/settings first.
      const newBalance = updatedSender.balance;
      const settings = await tx.notificationSettings.findUnique({
        where: { userId },
        select: { lowBalanceAlert: true, lowBalanceThreshold: true },
      });
      if (
        settings &&
        settings.lowBalanceAlert &&
        newBalance.lt(settings.lowBalanceThreshold)
      ) {
        const notif = await tx.notification.create({
          data: {
            userId,
            title: 'Low Balance Alert',
            message:
              `Your balance is ${newBalance.toString()}, ` +
              `below your threshold of ${settings.lowBalanceThreshold.toString()}.`,
          },
          select: { id: true, title: true, message: true, createdAt: true },
        });
        pendingPushes.push({
          userId,
          notificationId: notif.id,
          title: notif.title,
          message: notif.message,
          createdAt: notif.createdAt,
        });
      }

      return {
        response: {
          transferId: transfer.id.toString(),
          amount: amount.toString(),
          receiver: {
            accountNumber: receiverAccount.accountNumber,
            name: receiverAccount.user.fullName,
          },
          newBalance: newBalance.toString(),
        },
        pushes: pendingPushes,
      };
    });

    // Post-commit: best-effort push delivery. Failures are swallowed inside
    // FcmService so they can never affect the transfer's success.
    await this.dispatchPushes(pushes, amount.toString());

    return response;
  }

  /**
   * Fire the captured notification rows as FCM pushes. The push `type` is
   * derived from the notification title (the only two transfer-flow alerts).
   */
  private async dispatchPushes(
    pushes: PendingPush[],
    amount: string,
  ): Promise<void> {
    await Promise.all(
      pushes.map((p) =>
        this.fcm.sendToUser(p.userId, {
          type:
            p.title === 'Low Balance Alert'
              ? 'low_balance'
              : 'transfer_received',
          notificationId: p.notificationId.toString(),
          title: p.title,
          message: p.message,
          createdAt: p.createdAt.toISOString(),
          amount,
        }),
      ),
    );
  }

  async history(
    userId: bigint,
    query: ListTransfersQueryDto,
  ): Promise<TransferHistoryItemDto[]> {
    const account = await this.prisma.account.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!account) {
      throw new NotFoundException('Account not found');
    }

    const where = this.buildHistoryWhere(account.id, query);

    const transfers = await this.prisma.transfer.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        amount: true,
        note: true,
        createdAt: true,
        senderAccountId: true,
        receiverAccountId: true,
        senderAccount: {
          select: {
            accountNumber: true,
            user: { select: { fullName: true } },
          },
        },
        receiverAccount: {
          select: {
            accountNumber: true,
            user: { select: { fullName: true } },
          },
        },
      },
    });

    return transfers.map((t) => {
      const direction =
        t.senderAccountId === account.id
          ? TransferDirection.sent
          : TransferDirection.received;
      const counterpart =
        direction === TransferDirection.sent
          ? t.receiverAccount
          : t.senderAccount;

      return {
        transferId: t.id.toString(),
        direction,
        amount: t.amount.toString(),
        note: t.note,
        counterpart: {
          name: counterpart.user.fullName,
          accountNumber: counterpart.accountNumber,
        },
        createdAt: t.createdAt,
      };
    });
  }

  // ─── helpers ────────────────────────────────────────────────────────────

  private buildHistoryWhere(
    accountId: bigint,
    query: ListTransfersQueryDto,
  ): Prisma.TransferWhereInput {
    const directionClauses: Prisma.TransferWhereInput[] = [];
    if (!query.direction || query.direction === TransferDirection.sent) {
      directionClauses.push({ senderAccountId: accountId });
    }
    if (!query.direction || query.direction === TransferDirection.received) {
      directionClauses.push({ receiverAccountId: accountId });
    }

    const dateFilter: Prisma.DateTimeFilter = {};
    if (query.start) dateFilter.gte = this.parseDateStart(query.start);
    if (query.end) dateFilter.lte = this.parseDateEnd(query.end);

    return {
      OR: directionClauses,
      ...((query.start || query.end) && { createdAt: dateFilter }),
    };
  }

  private parseDateStart(input: string): Date {
    if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
      return new Date(`${input}T00:00:00.000Z`);
    }
    return new Date(input);
  }

  private parseDateEnd(input: string): Date {
    if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
      return new Date(`${input}T23:59:59.999Z`);
    }
    return new Date(input);
  }

  private todayUtc(): Date {
    const now = new Date();
    return new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
  }
}
