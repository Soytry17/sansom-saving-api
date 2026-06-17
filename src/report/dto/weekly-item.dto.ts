import { ApiProperty } from '@nestjs/swagger';

export class WeeklyItemDto {
  @ApiProperty({ example: 'Week 1' })
  week: string;

  @ApiProperty({ example: '2026-05-01', description: 'Inclusive (YYYY-MM-DD)' })
  startDate: string;

  @ApiProperty({ example: '2026-05-07', description: 'Inclusive (YYYY-MM-DD)' })
  endDate: string;

  @ApiProperty({ example: '500.00' })
  income: string;

  @ApiProperty({ example: '300.00' })
  expense: string;

  @ApiProperty({ example: '200.00', description: 'income − expense' })
  savings: string;
}
