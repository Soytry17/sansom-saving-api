import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * Coerce common truthy/falsy strings into a boolean.
 * Accepts: true, false, 1, 0 (case-insensitive). Anything else → undefined,
 * which lets class-validator catch it via @IsBoolean.
 */
function toBool(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const v = value.toLowerCase();
    if (v === 'true' || v === '1') return true;
    if (v === 'false' || v === '0') return false;
  }
  return undefined;
}

export class ListNotificationsQueryDto {
  @ApiPropertyOptional({
    description: 'Filter by read status (true/false)',
    example: false,
  })
  @IsOptional()
  @Transform(({ value }) => toBool(value))
  @IsBoolean()
  isRead?: boolean;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
