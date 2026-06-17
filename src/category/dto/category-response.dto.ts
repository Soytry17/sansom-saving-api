import { ApiProperty } from '@nestjs/swagger';
import { CategoryType } from '@prisma/client';

export class CategoryResponseDto {
  @ApiProperty({ example: '13', description: 'Category ID (BigInt as string)' })
  id: string;

  @ApiProperty({ example: 'Freelance' })
  name: string;

  @ApiProperty({ enum: CategoryType, example: CategoryType.income })
  type: CategoryType;

  @ApiProperty({ example: '2026-04-29T10:00:00.000Z' })
  createdAt: Date;
}
