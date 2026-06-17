import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateTransferDto {
  @ApiProperty({
    example: 'ACC-20260429-00002',
    description: 'Receiver account number in format ACC-YYYYMMDD-NNNNN',
  })
  @IsString()
  @Matches(/^ACC-\d{8}-\d{5}$/, {
    message: 'receiverAccountNumber must be in format ACC-YYYYMMDD-NNNNN',
  })
  receiverAccountNumber: string;

  @ApiProperty({ example: 20.0, description: 'Positive amount, max 2 decimals' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount: number;

  @ApiPropertyOptional({ example: 'Treat for coffee', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
