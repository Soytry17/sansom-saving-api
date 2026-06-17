import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  TransactionSource,
  TransactionType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { ListTransactionsQueryDto } from './dto/list-transactions-query.dto';
import {
  CreateTransactionResponseDto,
  TransactionResponseDto,
} from './dto/transaction-response.dto';
import { PaginatedDataDto } from '../common/dto/api-response.dto';

interface TxRow {
  id: bigint;
  amount: Prisma.Decimal;
  type: TransactionType;
  source: TransactionSource;
  date: Date;
  note: string | null;
  refId: bigint | null;
  createdAt: Date;
  category: { id: bigint; name: string };
}

const TX_SELECT = {
  id: true,
  amount: true,
  type: true,
  source: true,
  date: true,
  note: true,
  refId: true,
  createdAt: true,
  category: { select: { id: true, name: true } },
} as const;

@Injectable()
export class TransactionService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── reads ──────────────────────────────────────────────────────────────

  async list(
    userId: bigint,
    query: ListTransactionsQueryDto,
  ): Promise<PaginatedDataDto<TransactionResponseDto>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where = this.buildWhere(userId, query);

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.transaction.findMany({
        where,
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        select: TX_SELECT,
      }),
      this.prisma.transaction.count({ where }),
    ]);

    return {
      items: rows.map((r) => this.toDto(r)),
      pagination: { page, limit, total },
    };
  }

  async findById(userId: bigint, id: bigint): Promise<TransactionResponseDto> {
    const row = await this.prisma.transaction.findFirst({
      where: { id, userId },
      select: TX_SELECT,
    });
    if (!row) {
      throw new NotFoundException('Transaction not found');
    }
    return this.toDto(row);
  }

  // ─── writes ─────────────────────────────────────────────────────────────

  async create(
    userId: bigint,
    dto: CreateTransactionDto,
  ): Promise<CreateTransactionResponseDto> {
    const account = await this.getAccountForUser(userId);
    const categoryId = BigInt(dto.categoryId);
    await this.assertCategoryMatches(userId, categoryId, dto.type);

    const amount = new Prisma.Decimal(dto.amount);
    const date = this.parseDate(dto.date);

    return this.prisma.$transaction(async (tx) => {
      await this.applyDelta(tx, account.id, amount, dto.type);

      const created = await tx.transaction.create({
        data: {
          userId,
          accountId: account.id,
          categoryId,
          source: TransactionSource.manual,
          refId: null,
          amount,
          type: dto.type,
          date,
          note: dto.note ?? null,
        },
        select: { id: true, amount: true, type: true, source: true },
      });

      const updated = await tx.account.findUniqueOrThrow({
        where: { id: account.id },
        select: { balance: true },
      });

      return {
        id: created.id.toString(),
        amount: created.amount.toString(),
        type: created.type,
        source: created.source,
        newBalance: updated.balance.toString(),
      };
    });
  }

  async update(
    userId: bigint,
    id: bigint,
    dto: UpdateTransactionDto,
  ): Promise<void> {
    if (
      dto.amount === undefined &&
      dto.categoryId === undefined &&
      dto.date === undefined &&
      dto.note === undefined
    ) {
      throw new BadRequestException('At least one field must be provided');
    }

    const existing = await this.prisma.transaction.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      throw new NotFoundException('Transaction not found');
    }
    if (existing.source !== TransactionSource.manual) {
      throw new ForbiddenException('Transfer transactions cannot be updated');
    }

    const newAmount =
      dto.amount !== undefined
        ? new Prisma.Decimal(dto.amount)
        : existing.amount;
    const newCategoryId =
      dto.categoryId !== undefined ? BigInt(dto.categoryId) : existing.categoryId;
    const newDate =
      dto.date !== undefined ? this.parseDate(dto.date) : existing.date;
    const newNote = dto.note !== undefined ? dto.note : existing.note;

    if (dto.categoryId !== undefined && newCategoryId !== existing.categoryId) {
      await this.assertCategoryMatches(userId, newCategoryId, existing.type);
    }

    const amountChanged = !newAmount.equals(existing.amount);

    await this.prisma.$transaction(async (tx) => {
      if (amountChanged) {
        await this.reverseDelta(
          tx,
          existing.accountId,
          existing.amount,
          existing.type,
        );
        await this.applyDelta(tx, existing.accountId, newAmount, existing.type);
      }
      await tx.transaction.update({
        where: { id },
        data: {
          amount: newAmount,
          categoryId: newCategoryId,
          date: newDate,
          note: newNote,
        },
      });
    });
  }

  async remove(userId: bigint, id: bigint): Promise<void> {
    const existing = await this.prisma.transaction.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      throw new NotFoundException('Transaction not found');
    }
    if (existing.source !== TransactionSource.manual) {
      throw new ForbiddenException('Transfer transactions cannot be deleted');
    }

    await this.prisma.$transaction(async (tx) => {
      await this.reverseDelta(
        tx,
        existing.accountId,
        existing.amount,
        existing.type,
      );
      await tx.transaction.delete({ where: { id } });
    });
  }

  // ─── helpers ────────────────────────────────────────────────────────────

  private buildWhere(
    userId: bigint,
    query: ListTransactionsQueryDto,
  ): Prisma.TransactionWhereInput {
    const dateFilter: Prisma.DateTimeFilter = {};
    if (query.start) dateFilter.gte = this.parseDate(query.start);
    if (query.end) dateFilter.lte = this.parseDate(query.end);

    return {
      userId,
      ...(query.type && { type: query.type }),
      ...(query.source && { source: query.source }),
      ...(query.categoryId && { categoryId: BigInt(query.categoryId) }),
      ...((query.start || query.end) && { date: dateFilter }),
    };
  }

  private async getAccountForUser(userId: bigint): Promise<{ id: bigint }> {
    const account = await this.prisma.account.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!account) {
      throw new NotFoundException('Account not found');
    }
    return account;
  }

  private async assertCategoryMatches(
    userId: bigint,
    categoryId: bigint,
    expectedType: TransactionType,
  ): Promise<void> {
    const category = await this.prisma.category.findFirst({
      where: { id: categoryId, userId, isDeleted: false },
      select: { type: true },
    });
    if (!category) {
      throw new BadRequestException(
        'Category not found, has been deleted, or does not belong to you',
      );
    }
    if ((category.type as string) !== (expectedType as string)) {
      throw new BadRequestException(
        `Category type does not match transaction type "${expectedType}"`,
      );
    }
  }

  /**
   * Apply an income (+) or expense (−) delta to the account balance.
   * Expense uses an updateMany with a `balance >= amount` predicate so
   * concurrent debits cannot overdraw the account.
   */
  private async applyDelta(
    tx: Prisma.TransactionClient,
    accountId: bigint,
    amount: Prisma.Decimal,
    type: TransactionType,
  ): Promise<void> {
    if (type === TransactionType.expense) {
      const result = await tx.account.updateMany({
        where: { id: accountId, balance: { gte: amount } },
        data: { balance: { decrement: amount } },
      });
      if (result.count === 0) {
        throw new BadRequestException('Insufficient balance');
      }
    } else {
      await tx.account.update({
        where: { id: accountId },
        data: { balance: { increment: amount } },
      });
    }
  }

  /**
   * Reverse the effect of an existing transaction on the account balance.
   * Used by update (when amount changes) and delete.
   * Note: reversing income may produce a negative balance if the user has
   * since spent the money — we intentionally allow this; the user owns
   * their own data and the docs do not specify rejection logic.
   */
  private async reverseDelta(
    tx: Prisma.TransactionClient,
    accountId: bigint,
    amount: Prisma.Decimal,
    type: TransactionType,
  ): Promise<void> {
    await tx.account.update({
      where: { id: accountId },
      data:
        type === TransactionType.expense
          ? { balance: { increment: amount } }
          : { balance: { decrement: amount } },
    });
  }

  private parseDate(input: string): Date {
    // Treat YYYY-MM-DD as UTC midnight; full ISO strings pass through.
    if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
      return new Date(`${input}T00:00:00.000Z`);
    }
    return new Date(input);
  }

  private toDto(t: TxRow): TransactionResponseDto {
    return {
      id: t.id.toString(),
      amount: t.amount.toString(),
      type: t.type,
      source: t.source,
      category: {
        id: t.category.id.toString(),
        name: t.category.name,
      },
      date: t.date.toISOString().slice(0, 10),
      note: t.note,
      refId: t.refId !== null ? t.refId.toString() : null,
      createdAt: t.createdAt,
    };
  }
}
