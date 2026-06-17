import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

/**
 * Weekly buckets are computed within a single calendar month, so both
 * `month` and `year` are required.
 */
export class GetWeeklyReportQueryDto {
  @ApiProperty({ minimum: 1, maximum: 12, example: 5 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month: number;

  @ApiProperty({ minimum: 1970, maximum: 9999, example: 2026 })
  @Type(() => Number)
  @IsInt()
  @Min(1970)
  @Max(9999)
  year: number;
}
