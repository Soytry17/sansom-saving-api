import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TransactionType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateTransactionDto {
  @ApiProperty({ example: 500.0, description: 'Positive amount, max 2 decimals' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount: number;

  @ApiProperty({ enum: TransactionType, example: TransactionType.income })
  @IsEnum(TransactionType)
  type: TransactionType;

  @ApiProperty({
    example: 1,
    description:
      'Category ID — must belong to the user and match the transaction type',
  })
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  categoryId: number;

  @ApiProperty({ example: '2026-05-01', description: 'YYYY-MM-DD' })
  @IsDateString()
  date: string;

  @ApiPropertyOptional({ example: 'Monthly salary', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
