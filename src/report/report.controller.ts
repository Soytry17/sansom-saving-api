import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ReportService } from './report.service';
import { GetMonthlyReportQueryDto } from './dto/get-monthly-report-query.dto';
import { MonthlyReportResponseDto } from './dto/monthly-report-response.dto';
import { GetCategoryReportQueryDto } from './dto/get-category-report-query.dto';
import { CategoryReportResponseDto } from './dto/category-report-response.dto';
import { GetTrendsReportQueryDto } from './dto/get-trends-report-query.dto';
import { TrendItemDto } from './dto/trend-item.dto';
import { GetWeeklyReportQueryDto } from './dto/get-weekly-report-query.dto';
import { WeeklyItemDto } from './dto/weekly-item.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ApiOkResponseWrapped } from '../common/swagger/api-response.swagger';

interface JwtUser {
  userId: string;
  email: string;
}

@ApiTags('Report')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('reports')
export class ReportController {
  constructor(private readonly reportService: ReportService) {}

  @Get('monthly')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Income / expense / net savings for a specific month',
  })
  @ApiOkResponseWrapped(MonthlyReportResponseDto)
  monthly(
    @CurrentUser() user: JwtUser,
    @Query() query: GetMonthlyReportQueryDto,
  ): Promise<MonthlyReportResponseDto> {
    return this.reportService.monthly(BigInt(user.userId), query);
  }

  @Get('category')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Per-category breakdown for a given transaction type. ' +
      'Optional month/year (both-or-neither). Sorted by total descending.',
  })
  @ApiOkResponseWrapped(CategoryReportResponseDto)
  category(
    @CurrentUser() user: JwtUser,
    @Query() query: GetCategoryReportQueryDto,
  ): Promise<CategoryReportResponseDto> {
    return this.reportService.category(BigInt(user.userId), query);
  }

  @Get('trends')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Income vs expense across the last N months (current month included). ' +
      'Default 6, max 24.',
  })
  @ApiOkResponseWrapped(TrendItemDto, { isArray: true })
  trends(
    @CurrentUser() user: JwtUser,
    @Query() query: GetTrendsReportQueryDto,
  ): Promise<TrendItemDto[]> {
    return this.reportService.trends(BigInt(user.userId), query);
  }

  @Get('weekly')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Income vs expense bucketed by calendar week (1-7, 8-14, …) ' +
      'within a given month. Returns 4 or 5 buckets.',
  })
  @ApiOkResponseWrapped(WeeklyItemDto, { isArray: true })
  weekly(
    @CurrentUser() user: JwtUser,
    @Query() query: GetWeeklyReportQueryDto,
  ): Promise<WeeklyItemDto[]> {
    return this.reportService.weekly(BigInt(user.userId), query);
  }
}
