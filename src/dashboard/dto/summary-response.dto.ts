import { ApiProperty } from '@nestjs/swagger';

export class SummaryResponseDto {
  @ApiProperty({
    example: '730.00',
    description: "User's current account balance (lifetime, not period-scoped)",
  })
  totalBalance: string;

  @ApiProperty({
    example: '1000.00',
    description:
      'Sum of all income transactions in the period (or all-time if no period given). Includes transfer-in.',
  })
  totalIncome: string;

  @ApiProperty({
    example: '270.00',
    description:
      'Sum of all expense transactions in the period (or all-time if no period given). Includes transfer-out.',
  })
  totalExpense: string;

  @ApiProperty({
    example: 'May 2026',
    description: 'Human-readable period label, or "All time" when no month/year is supplied',
  })
  period: string;
}
