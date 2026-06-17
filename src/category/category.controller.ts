import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CategoryService } from './category.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { CategoryResponseDto } from './dto/category-response.dto';
import { ListCategoriesQueryDto } from './dto/list-categories-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ApiMessage } from '../common/decorators/api-message.decorator';
import {
  ApiCreatedResponseWrapped,
  ApiOkResponseWrapped,
} from '../common/swagger/api-response.swagger';
import { ParseBigIntPipe } from '../common/pipes/parse-bigint.pipe';

interface JwtUser {
  userId: string;
  email: string;
}

@ApiTags('Category')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('categories')
export class CategoryController {
  constructor(private readonly categoryService: CategoryService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List active categories for the current user' })
  @ApiOkResponseWrapped(CategoryResponseDto, {
    isArray: true,
    description: 'Array of active (non-deleted) categories',
  })
  list(
    @CurrentUser() user: JwtUser,
    @Query() query: ListCategoriesQueryDto,
  ): Promise<CategoryResponseDto[]> {
    return this.categoryService.list(BigInt(user.userId), query);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiMessage('Category created successfully')
  @ApiOperation({ summary: 'Create a custom category' })
  @ApiCreatedResponseWrapped(CategoryResponseDto)
  create(
    @CurrentUser() user: JwtUser,
    @Body() dto: CreateCategoryDto,
  ): Promise<CategoryResponseDto> {
    return this.categoryService.create(BigInt(user.userId), dto);
  }

  @Put(':id')
  @HttpCode(HttpStatus.OK)
  @ApiMessage('Category updated successfully')
  @ApiOperation({
    summary: 'Rename a category — protected names (Transfer In / Out) are blocked',
  })
  @ApiOkResponseWrapped()
  async update(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() dto: UpdateCategoryDto,
  ): Promise<void> {
    await this.categoryService.update(BigInt(user.userId), id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiMessage('Category deleted successfully')
  @ApiOperation({
    summary:
      'Soft-delete a category — protected names (Transfer In / Out) are blocked',
  })
  @ApiOkResponseWrapped()
  async remove(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseBigIntPipe) id: bigint,
  ): Promise<void> {
    await this.categoryService.softDelete(BigInt(user.userId), id);
  }
}
