import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CategoryType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { CategoryResponseDto } from './dto/category-response.dto';
import { ListCategoriesQueryDto } from './dto/list-categories-query.dto';

const PROTECTED_NAMES = ['Transfer In', 'Transfer Out'] as const;

interface CategoryRow {
  id: bigint;
  name: string;
  type: CategoryType;
  createdAt: Date;
}

@Injectable()
export class CategoryService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    userId: bigint,
    query: ListCategoriesQueryDto,
  ): Promise<CategoryResponseDto[]> {
    const categories = await this.prisma.category.findMany({
      where: {
        userId,
        isDeleted: false,
        ...(query.type && { type: query.type }),
      },
      orderBy: { id: 'asc' },
    });
    return categories.map((c) => this.toDto(c));
  }

  async create(
    userId: bigint,
    dto: CreateCategoryDto,
  ): Promise<CategoryResponseDto> {
    const name = dto.name.trim();
    if (this.isProtectedName(name)) {
      throw new BadRequestException(
        `Category name "${name}" is reserved by the system`,
      );
    }
    const created = await this.prisma.category.create({
      data: { userId, name, type: dto.type },
    });
    return this.toDto(created);
  }

  async update(
    userId: bigint,
    id: bigint,
    dto: UpdateCategoryDto,
  ): Promise<void> {
    const existing = await this.findOwnedActive(userId, id);

    if (this.isProtectedName(existing.name)) {
      throw new ForbiddenException('This category cannot be modified');
    }

    const newName = dto.name.trim();
    if (this.isProtectedName(newName)) {
      throw new BadRequestException(
        `Category name "${newName}" is reserved by the system`,
      );
    }

    await this.prisma.category.update({
      where: { id },
      data: { name: newName },
    });
  }

  async softDelete(userId: bigint, id: bigint): Promise<void> {
    const existing = await this.findOwnedActive(userId, id);

    if (this.isProtectedName(existing.name)) {
      throw new ForbiddenException('This category cannot be deleted');
    }

    await this.prisma.category.update({
      where: { id },
      data: { isDeleted: true },
    });
  }

  private async findOwnedActive(
    userId: bigint,
    id: bigint,
  ): Promise<CategoryRow> {
    const category = await this.prisma.category.findFirst({
      where: { id, userId, isDeleted: false },
      select: { id: true, name: true, type: true, createdAt: true },
    });
    if (!category) {
      throw new NotFoundException('Category not found');
    }
    return category;
  }

  private isProtectedName(name: string): boolean {
    const normalized = name.trim().toLowerCase();
    return PROTECTED_NAMES.some((p) => p.toLowerCase() === normalized);
  }

  private toDto(category: CategoryRow): CategoryResponseDto {
    return {
      id: category.id.toString(),
      name: category.name,
      type: category.type,
      createdAt: category.createdAt,
    };
  }
}
