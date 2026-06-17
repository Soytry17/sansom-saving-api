import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class GetSummaryQueryDto {
  @ApiPropertyOptional({
    description: 'Month (1–12). Must be supplied together with `year`.',
    minimum: 1,
    maximum: 12,
    example: 5,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month?: number;

  @ApiPropertyOptional({
    description: 'Year (e.g. 2026). Must be supplied together with `month`.',
    minimum: 1970,
    maximum: 9999,
    example: 2026,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1970)
  @Max(9999)
  year?: number;
}
