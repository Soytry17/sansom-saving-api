import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TransferService } from './transfer.service';
import { CreateTransferDto } from './dto/create-transfer.dto';
import { ListTransfersQueryDto } from './dto/list-transfers-query.dto';
import { CreateTransferResponseDto } from './dto/transfer-response.dto';
import { TransferHistoryItemDto } from './dto/transfer-history-item.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ApiMessage } from '../common/decorators/api-message.decorator';
import { ApiOkResponseWrapped } from '../common/swagger/api-response.swagger';

interface JwtUser {
  userId: string;
  email: string;
}

@ApiTags('Transfer')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('transfer')
export class TransferController {
  constructor(private readonly transferService: TransferService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiMessage('Transfer successful')
  @ApiOperation({
    summary:
      'Send money to another account (P2P). Atomic: balance check, paired ' +
      'transactions, and a notification to the receiver are all committed ' +
      'together or rolled back.',
  })
  @ApiOkResponseWrapped(CreateTransferResponseDto)
  create(
    @CurrentUser() user: JwtUser,
    @Body() dto: CreateTransferDto,
  ): Promise<CreateTransferResponseDto> {
    return this.transferService.create(BigInt(user.userId), dto);
  }

  @Get('history')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'List transfers where the current user is the sender, receiver, or both.',
  })
  @ApiOkResponseWrapped(TransferHistoryItemDto, {
    isArray: true,
    description: 'Array of transfer history items (newest first)',
  })
  history(
    @CurrentUser() user: JwtUser,
    @Query() query: ListTransfersQueryDto,
  ): Promise<TransferHistoryItemDto[]> {
    return this.transferService.history(BigInt(user.userId), query);
  }
}
