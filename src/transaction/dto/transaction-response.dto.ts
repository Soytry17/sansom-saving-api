import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TransactionSource, TransactionType } from '@prisma/client';

export class CategoryRefDto {
  @ApiProperty({ example: '7' })
  id: string;

  @ApiProperty({ example: 'Food' })
  name: string;
}

export class TransactionResponseDto {
  @ApiProperty({ example: '1' })
  id: string;

  @ApiProperty({ example: '15.50', description: 'Decimal serialized as string' })
  amount: string;

  @ApiProperty({ enum: TransactionType, example: TransactionType.expense })
  type: TransactionType;

  @ApiProperty({ enum: TransactionSource, example: TransactionSource.manual })
  source: TransactionSource;

  @ApiProperty({ type: CategoryRefDto })
  category: CategoryRefDto;

  @ApiProperty({ example: '2026-05-03', description: 'YYYY-MM-DD' })
  date: string;

  @ApiPropertyOptional({ example: 'Lunch', nullable: true })
  note: string | null;

  @ApiPropertyOptional({
    example: null,
    nullable: true,
    description: 'Transfer ID when source = transfer, otherwise null',
  })
  refId: string | null;

  @ApiProperty({ example: '2026-05-03T12:30:00.000Z' })
  createdAt: Date;
}

/**
 * Slim response for POST /transactions — confirms creation and returns
 * the new account balance so the client can update local state without
 * an extra GET /account/me round-trip.
 */
export class CreateTransactionResponseDto {
  @ApiProperty({ example: '10' })
  id: string;

  @ApiProperty({ example: '500.00' })
  amount: string;

  @ApiProperty({ enum: TransactionType, example: TransactionType.income })
  type: TransactionType;

  @ApiProperty({ enum: TransactionSource, example: TransactionSource.manual })
  source: TransactionSource;

  @ApiProperty({ example: '750.00', description: 'Account balance after applying this transaction' })
  newBalance: string;
}
