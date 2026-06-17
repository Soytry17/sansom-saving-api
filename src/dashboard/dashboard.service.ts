import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TransactionType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GetSummaryQueryDto } from './dto/get-summary-query.dto';
import { GetRecentQueryDto } from './dto/get-recent-query.dto';
import { SummaryResponseDto } from './dto/summary-response.dto';
import { RecentTransactionDto } from './dto/recent-transaction.dto';

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(
    userId: bigint,
    query: GetSummaryQueryDto,
  ): Promise<SummaryResponseDto> {
    const period = this.resolvePeriod(query);

    const account = await this.prisma.account.findUnique({
      where: { userId },
      select: { balance: true },
    });
    if (!account) {
      throw new NotFoundException('Account not found');
    }

    const where: Prisma.TransactionWhereInput = {
      userId,
      ...(period.range && { date: period.range }),
    };

    // Sum income and expense in a single round-trip via groupBy.
    const groups = await this.prisma.transaction.groupBy({
      by: ['type'],
      where,
      _sum: { amount: true },
    });

    let totalIncome = new Prisma.Decimal(0);
    let totalExpense = new Prisma.Decimal(0);
    for (const g of groups) {
      const sum = g._sum.amount ?? new Prisma.Decimal(0);
      if (g.type === TransactionType.income) totalIncome = sum;
      else if (g.type === TransactionType.expense) totalExpense = sum;
    }

    return {
      totalBalance: account.balance.toString(),
      totalIncome: totalIncome.toString(),
      totalExpense: totalExpense.toString(),
      period: period.label,
    };
  }

  async getRecent(
    userId: bigint,
    query: GetRecentQueryDto,
  ): Promise<RecentTransactionDto[]> {
    const limit = query.limit ?? 10;

    const rows = await this.prisma.transaction.findMany({
      where: { userId },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: limit,
      select: {
        id: true,
        amount: true,
        type: true,
        source: true,
        date: true,
        note: true,
        category: { select: { name: true } },
      },
    });

    return rows.map((r) => ({
      id: r.id.toString(),
      amount: r.amount.toString(),
      type: r.type,
      source: r.source,
      category: r.category.name,
      date: r.date.toISOString().slice(0, 10),
      note: r.note,
    }));
  }

  // ─── helpers ────────────────────────────────────────────────────────────

  /**
   * Validate the (month, year) pair and produce a date range filter +
   * human-readable label. Either both must be present or both omitted —
   * a half-supplied period is rejected with 400.
   */
  private resolvePeriod(query: GetSummaryQueryDto): {
    range?: Prisma.DateTimeFilter;
    label: string;
  } {
    const { month, year } = query;

    if ((month === undefined) !== (year === undefined)) {
      throw new BadRequestException(
        '`month` and `year` must be supplied together (or both omitted for all-time)',
      );
    }

    if (month === undefined || year === undefined) {
      return { label: 'All time' };
    }

    // month is 1-based in the API, 0-based in JS Date.UTC
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 1)); // exclusive — first day of next month

    return {
      range: { gte: start, lt: end },
      label: `${MONTH_NAMES[month - 1]} ${year}`,
    };
  }
}
