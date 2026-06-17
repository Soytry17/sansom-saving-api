import { IsEnum, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { CategoryType } from '@prisma/client';

export class ListCategoriesQueryDto {
  @ApiPropertyOptional({
    enum: CategoryType,
    description: 'Filter by category type',
  })
  @IsOptional()
  @IsEnum(CategoryType)
  type?: CategoryType;
}
