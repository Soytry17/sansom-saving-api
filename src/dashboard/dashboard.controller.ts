import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { GetSummaryQueryDto } from './dto/get-summary-query.dto';
import { GetRecentQueryDto } from './dto/get-recent-query.dto';
import { SummaryResponseDto } from './dto/summary-response.dto';
import { RecentTransactionDto } from './dto/recent-transaction.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ApiOkResponseWrapped } from '../common/swagger/api-response.swagger';

interface JwtUser {
  userId: string;
  email: string;
}

@ApiTags('Dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Financial overview: current balance + income/expense totals. ' +
      'Supply month+year together to scope to a single month, or omit both for all-time.',
  })
  @ApiOkResponseWrapped(SummaryResponseDto)
  getSummary(
    @CurrentUser() user: JwtUser,
    @Query() query: GetSummaryQueryDto,
  ): Promise<SummaryResponseDto> {
    return this.dashboardService.getSummary(BigInt(user.userId), query);
  }

  @Get('recent')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Most recent transactions for the current user (newest first). ' +
      'Default limit 10, max 100.',
  })
  @ApiOkResponseWrapped(RecentTransactionDto, { isArray: true })
  getRecent(
    @CurrentUser() user: JwtUser,
    @Query() query: GetRecentQueryDto,
  ): Promise<RecentTransactionDto[]> {
    return this.dashboardService.getRecent(BigInt(user.userId), query);
  }
}
