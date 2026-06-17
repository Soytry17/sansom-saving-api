import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TransactionType } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';

export class GetCategoryReportQueryDto {
  @ApiProperty({ enum: TransactionType, example: TransactionType.expense })
  @IsEnum(TransactionType)
  type: TransactionType;

  @ApiPropertyOptional({ minimum: 1, maximum: 12, example: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month?: number;

  @ApiPropertyOptional({ minimum: 1970, maximum: 9999, example: 2026 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1970)
  @Max(9999)
  year?: number;
}
