import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsNumber,
  IsPositive,
  Max,
} from 'class-validator';

export class SaveNotificationSettingsDto {
  @ApiProperty({
    example: true,
    description: 'Receive a notification when a transfer is received',
  })
  @IsBoolean()
  transferAlert: boolean;

  @ApiProperty({
    example: true,
    description: 'Receive a monthly summary report',
  })
  @IsBoolean()
  monthlyReport: boolean;

  @ApiProperty({
    example: true,
    description: 'Receive an alert when balance falls below threshold',
  })
  @IsBoolean()
  lowBalanceAlert: boolean;

  @ApiProperty({
    example: 50,
    description:
      'Threshold (in account currency) below which the low-balance alert fires',
  })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(9_999_999_999_999)
  lowBalanceThreshold: number;
}
