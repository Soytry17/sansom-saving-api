import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class GetTrendsReportQueryDto {
  @ApiPropertyOptional({
    default: 6,
    minimum: 1,
    maximum: 24,
    description: 'Number of past months to include (current month included)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(24)
  months?: number = 6;
}
