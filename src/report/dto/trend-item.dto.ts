import { ApiProperty } from '@nestjs/swagger';

export class TrendItemDto {
  @ApiProperty({ example: 'May 2026' })
  month: string;

  @ApiProperty({ example: '1000.00' })
  income: string;

  @ApiProperty({ example: '270.00' })
  expense: string;

  @ApiProperty({ example: '730.00', description: 'income − expense' })
  savings: string;
}
