import { ApiProperty } from '@nestjs/swagger';
import { TransactionType } from '@prisma/client';

export class CategoryBreakdownItemDto {
  @ApiProperty({ example: 'Food' })
  category: string;

  @ApiProperty({ example: '120.00', description: 'Sum of amounts in this category' })
  total: string;

  @ApiProperty({ example: 8, description: 'Number of transactions' })
  count: number;

  @ApiProperty({
    example: 44.4,
    description: 'Share of grandTotal as a percentage (rounded to 1 decimal)',
  })
  percentage: number;
}

export class CategoryReportResponseDto {
  @ApiProperty({ enum: TransactionType, example: TransactionType.expense })
  type: TransactionType;

  @ApiProperty({ example: 'May 2026', description: 'Period label, or "All time"' })
  period: string;

  @ApiProperty({ example: '270.00' })
  grandTotal: string;

  @ApiProperty({ type: [CategoryBreakdownItemDto] })
  breakdown: CategoryBreakdownItemDto[];
}
