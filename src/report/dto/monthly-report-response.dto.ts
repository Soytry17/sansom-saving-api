import { ApiProperty } from '@nestjs/swagger';

export class MonthlyReportResponseDto {
  @ApiProperty({ example: 'May 2026' })
  month: string;

  @ApiProperty({ example: '1000.00' })
  totalIncome: string;

  @ApiProperty({ example: '270.00' })
  totalExpense: string;

  @ApiProperty({ example: '730.00', description: 'totalIncome − totalExpense' })
  netSavings: string;
}
