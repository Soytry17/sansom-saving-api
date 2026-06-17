import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TransactionService } from './transaction.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { ListTransactionsQueryDto } from './dto/list-transactions-query.dto';
import {
  CreateTransactionResponseDto,
  TransactionResponseDto,
} from './dto/transaction-response.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ApiMessage } from '../common/decorators/api-message.decorator';
import {
  ApiCreatedResponseWrapped,
  ApiOkResponseWrapped,
  ApiPaginatedResponse,
} from '../common/swagger/api-response.swagger';
import { ParseBigIntPipe } from '../common/pipes/parse-bigint.pipe';
import { PaginatedDataDto } from '../common/dto/api-response.dto';

interface JwtUser {
  userId: string;
  email: string;
}

@ApiTags('Transaction')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('transactions')
export class TransactionController {
  constructor(private readonly transactionService: TransactionService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'List transactions with optional filters and pagination',
  })
  @ApiPaginatedResponse(TransactionResponseDto, {
    description: 'Paginated transaction list (newest first)',
  })
  list(
    @CurrentUser() user: JwtUser,
    @Query() query: ListTransactionsQueryDto,
  ): Promise<PaginatedDataDto<TransactionResponseDto>> {
    return this.transactionService.list(BigInt(user.userId), query);
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get a single transaction owned by the current user' })
  @ApiOkResponseWrapped(TransactionResponseDto)
  findById(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseBigIntPipe) id: bigint,
  ): Promise<TransactionResponseDto> {
    return this.transactionService.findById(BigInt(user.userId), id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiMessage('Transaction created successfully')
  @ApiOperation({
    summary:
      'Create a manual transaction (income or expense). ' +
      'Expense is rejected if it would overdraw the account.',
  })
  @ApiCreatedResponseWrapped(CreateTransactionResponseDto)
  create(
    @CurrentUser() user: JwtUser,
    @Body() dto: CreateTransactionDto,
  ): Promise<CreateTransactionResponseDto> {
    return this.transactionService.create(BigInt(user.userId), dto);
  }

  @Put(':id')
  @HttpCode(HttpStatus.OK)
  @ApiMessage('Transaction updated successfully')
  @ApiOperation({
    summary:
      'Update a manual transaction. Transfer-sourced transactions are immutable.',
  })
  @ApiOkResponseWrapped()
  async update(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() dto: UpdateTransactionDto,
  ): Promise<void> {
    await this.transactionService.update(BigInt(user.userId), id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiMessage('Transaction deleted and balance adjusted')
  @ApiOperation({
    summary:
      'Delete a manual transaction and reverse its effect on the balance. ' +
      'Transfer-sourced transactions are immutable.',
  })
  @ApiOkResponseWrapped()
  async remove(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseBigIntPipe) id: bigint,
  ): Promise<void> {
    await this.transactionService.remove(BigInt(user.userId), id);
  }
}
