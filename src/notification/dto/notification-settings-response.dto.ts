import { ApiProperty } from '@nestjs/swagger';

export class NotificationSettingsResponseDto {
  @ApiProperty({ example: true })
  transferAlert: boolean;

  @ApiProperty({ example: true })
  monthlyReport: boolean;

  @ApiProperty({ example: true })
  lowBalanceAlert: boolean;

  @ApiProperty({
    example: '50.00',
    description: 'Decimal stored as string for precise client-side handling',
  })
  lowBalanceThreshold: string;
}
