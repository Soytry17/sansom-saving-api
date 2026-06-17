import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, TransactionType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GetMonthlyReportQueryDto } from './dto/get-monthly-report-query.dto';
import { MonthlyReportResponseDto } from './dto/monthly-report-response.dto';
import { GetCategoryReportQueryDto } from './dto/get-category-report-query.dto';
import {
  CategoryBreakdownItemDto,
  CategoryReportResponseDto,
} from './dto/category-report-response.dto';
import { GetTrendsReportQueryDto } from './dto/get-trends-report-query.dto';
import { TrendItemDto } from './dto/trend-item.dto';
import { GetWeeklyReportQueryDto } from './dto/get-weekly-report-query.dto';
import { WeeklyItemDto } from './dto/weekly-item.dto';

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

interface MonthRange {
  start: Date; // inclusive
  end: Date; // exclusive
  label: string; // e.g. "May 2026"
}

@Injectable()
export class ReportService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── /reports/monthly ────────────────────────────────────────────────
  async monthly(
    userId: bigint,
    query: GetMonthlyReportQueryDto,
  ): Promise<MonthlyReportResponseDto> {
    const range = this.monthRange(query.year, query.month);
    const { income, expense } = await this.sumByType(userId, {
      gte: range.start,
      lt: range.end,
    });

    return {
      month: range.label,
      totalIncome: income.toString(),
      totalExpense: expense.toString(),
      netSavings: income.sub(expense).toString(),
    };
  }

  // ─── /reports/category ───────────────────────────────────────────────
  async category(
    userId: bigint,
    query: GetCategoryReportQueryDto,
  ): Promise<CategoryReportResponseDto> {
    const { dateFilter, label } = this.optionalPeriod(query.month, query.year);

    const where: Prisma.TransactionWhereInput = {
      userId,
      type: query.type,
      ...(dateFilter && { date: dateFilter }),
    };

    const grouped = await this.prisma.transaction.groupBy({
      by: ['categoryId'],
      where,
      _sum: { amount: true },
      _count: { _all: true },
    });

    if (grouped.length === 0) {
      return {
        type: query.type,
        period: label,
        grandTotal: '0',
        breakdown: [],
      };
    }

    // Resolve category names in one batch
    const categoryIds = grouped.map((g) => g.categoryId);
    const categories = await this.prisma.category.findMany({
      where: { id: { in: categoryIds } },
      select: { id: true, name: true },
    });
    const nameById = new Map(categories.map((c) => [c.id.toString(), c.name]));

    const grandTotal = grouped.reduce(
      (acc, g) => acc.add(g._sum.amount ?? new Prisma.Decimal(0)),
      new Prisma.Decimal(0),
    );

    const breakdown: CategoryBreakdownItemDto[] = grouped
      .map((g) => {
        const total = g._sum.amount ?? new Prisma.Decimal(0);
        // Round to 1 decimal: floor(x * 10) / 10 isn't symmetric; use Math.round.
        const pct = grandTotal.isZero()
          ? 0
          : Math.round(
              total.div(grandTotal).mul(1000).toNumber(),
            ) / 10;
        return {
          category: nameById.get(g.categoryId.toString()) ?? 'Unknown',
          total: total.toString(),
          count: g._count._all,
          percentage: pct,
        };
      })
      .sort((a, b) => Number(b.total) - Number(a.total));

    return {
      type: query.type,
      period: label,
      grandTotal: grandTotal.toString(),
      breakdown,
    };
  }

  // ─── /reports/trends ─────────────────────────────────────────────────
  async trends(
    userId: bigint,
    query: GetTrendsReportQueryDto,
  ): Promise<TrendItemDto[]> {
    const months = query.months ?? 6;

    // Build the last N month ranges, oldest first.
    const ranges: MonthRange[] = [];
    const now = new Date();
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1),
      );
      ranges.push(
        this.monthRange(d.getUTCFullYear(), d.getUTCMonth() + 1),
      );
    }

    // Single query covering the whole window, then bucket in JS.
    const overallStart = ranges[0].start;
    const overallEnd = ranges[ranges.length - 1].end;

    const rows = await this.prisma.transaction.findMany({
      where: {
        userId,
        date: { gte: overallStart, lt: overallEnd },
      },
      select: { date: true, type: true, amount: true },
    });

    // Pre-seed buckets so months with no transactions still appear.
    const buckets = new Map<
      string,
      { income: Prisma.Decimal; expense: Prisma.Decimal }
    >();
    for (const r of ranges) {
      buckets.set(r.label, {
        income: new Prisma.Decimal(0),
        expense: new Prisma.Decimal(0),
      });
    }

    for (const r of rows) {
      const label = `${MONTH_NAMES[r.date.getUTCMonth()]} ${r.date.getUTCFullYear()}`;
      const bucket = buckets.get(label);
      if (!bucket) continue; // outside the window — shouldn't happen
      if (r.type === TransactionType.income) {
        bucket.income = bucket.income.add(r.amount);
      } else {
        bucket.expense = bucket.expense.add(r.amount);
      }
    }

    return ranges.map((r) => {
      const b = buckets.get(r.label)!;
      return {
        month: r.label,
        income: b.income.toString(),
        expense: b.expense.toString(),
        savings: b.income.sub(b.expense).toString(),
      };
    });
  }

  // ─── /reports/weekly ─────────────────────────────────────────────────
  async weekly(
    userId: bigint,
    query: GetWeeklyReportQueryDto,
  ): Promise<WeeklyItemDto[]> {
    const range = this.monthRange(query.year, query.month);
    const daysInMonth = this.daysInMonth(query.year, query.month);

    // Week buckets: 1-7, 8-14, 15-21, 22-28, 29-end
    interface WeekBucket {
      week: string;
      start: Date; // inclusive UTC
      endExclusive: Date; // exclusive UTC
      startStr: string;
      endStr: string; // inclusive label for the response
    }
    const weeks: WeekBucket[] = [];
    let n = 1;
    for (let day = 1; day <= daysInMonth; day += 7) {
      const lastDayInclusive = Math.min(day + 6, daysInMonth);
      weeks.push({
        week: `Week ${n}`,
        start: new Date(Date.UTC(query.year, query.month - 1, day)),
        endExclusive: new Date(
          Date.UTC(query.year, query.month - 1, lastDayInclusive + 1),
        ),
        startStr: this.toDateStr(query.year, query.month, day),
        endStr: this.toDateStr(query.year, query.month, lastDayInclusive),
      });
      n++;
    }

    // Single query, bucket in JS.
    const rows = await this.prisma.transaction.findMany({
      where: {
        userId,
        date: { gte: range.start, lt: range.end },
      },
      select: { date: true, type: true, amount: true },
    });

    const totals = weeks.map(() => ({
      income: new Prisma.Decimal(0),
      expense: new Prisma.Decimal(0),
    }));

    for (const r of rows) {
      // r.date is at UTC midnight — find which week contains it
      const idx = weeks.findIndex(
        (w) => r.date >= w.start && r.date < w.endExclusive,
      );
      if (idx === -1) continue;
      if (r.type === TransactionType.income) {
        totals[idx].income = totals[idx].income.add(r.amount);
      } else {
        totals[idx].expense = totals[idx].expense.add(r.amount);
      }
    }

    return weeks.map((w, i) => ({
      week: w.week,
      startDate: w.startStr,
      endDate: w.endStr,
      income: totals[i].income.toString(),
      expense: totals[i].expense.toString(),
      savings: totals[i].income.sub(totals[i].expense).toString(),
    }));
  }

  // ─── helpers ────────────────────────────────────────────────────────

  /**
   * Sum income and expense in a single round-trip.
   * Returns Decimals (zero when no rows match).
   */
  private async sumByType(
    userId: bigint,
    dateFilter: Prisma.DateTimeFilter,
  ): Promise<{ income: Prisma.Decimal; expense: Prisma.Decimal }> {
    const groups = await this.prisma.transaction.groupBy({
      by: ['type'],
      where: { userId, date: dateFilter },
      _sum: { amount: true },
    });

    let income = new Prisma.Decimal(0);
    let expense = new Prisma.Decimal(0);
    for (const g of groups) {
      const sum = g._sum.amount ?? new Prisma.Decimal(0);
      if (g.type === TransactionType.income) income = sum;
      else expense = sum;
    }
    return { income, expense };
  }

  /**
   * Convert (year, month=1-12) → an inclusive [start, end) UTC range
   * plus a human-readable label.
   */
  private monthRange(year: number, month: number): MonthRange {
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 1)); // exclusive
    return { start, end, label: `${MONTH_NAMES[month - 1]} ${year}` };
  }

  /**
   * Both-or-neither validator for optional (month, year). Returns the
   * derived filter and label, throws BadRequest if half-supplied.
   */
  private optionalPeriod(
    month?: number,
    year?: number,
  ): { dateFilter?: Prisma.DateTimeFilter; label: string } {
    if ((month === undefined) !== (year === undefined)) {
      throw new BadRequestException(
        '`month` and `year` must be supplied together (or both omitted for all-time)',
      );
    }
    if (month === undefined || year === undefined) {
      return { label: 'All time' };
    }
    const r = this.monthRange(year, month);
    return { dateFilter: { gte: r.start, lt: r.end }, label: r.label };
  }

  private daysInMonth(year: number, month: number): number {
    // Day 0 of next month = last day of this month
    return new Date(Date.UTC(year, month, 0)).getUTCDate();
  }

  private toDateStr(year: number, month: number, day: number): string {
    const mm = String(month).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    return `${year}-${mm}-${dd}`;
  }
}
