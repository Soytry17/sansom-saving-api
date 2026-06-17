import { ApiProperty } from '@nestjs/swagger';
import { TransactionSource, TransactionType } from '@prisma/client';

export class RecentTransactionDto {
  @ApiProperty({ example: '10', description: 'Transaction ID' })
  id: string;

  @ApiProperty({ example: '15.50', description: 'Amount as decimal string' })
  amount: string;

  @ApiProperty({ enum: TransactionType, example: TransactionType.expense })
  type: TransactionType;

  @ApiProperty({ enum: TransactionSource, example: TransactionSource.manual })
  source: TransactionSource;

  @ApiProperty({ example: 'Food', description: 'Category name' })
  category: string;

  @ApiProperty({ example: '2026-05-03', description: 'Transaction date (YYYY-MM-DD)' })
  date: string;

  @ApiProperty({ example: 'Lunch', nullable: true, type: String })
  note: string | null;
}
