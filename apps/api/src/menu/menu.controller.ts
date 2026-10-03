import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator.js';
import { PERMISSIONS } from '../auth/permissions.js';
import {
  CreateMenuCategoryDto,
  MenuAvailabilityDto,
  MenuPreviewQueryDto,
  ReplaceMenuCategoryDishesDto,
  ReorderMenuCategoriesDto,
  UpdateMenuCategoryDishDto,
  UpdateMenuCategoryDto,
} from './dto/menu.dto.js';
import { MenuAdminService } from './menu-admin.service.js';
import { MenuService } from './menu.service.js';

@ApiTags('menu')
@Controller('menu')
export class MenuController {
  constructor(
    private readonly menuService: MenuService,
    private readonly menuAdmin: MenuAdminService,
  ) {}

  @Get('categories')
  @RequirePermissions(PERMISSIONS.MENU_VIEW)
  @ApiOperation({ summary: 'Admin category list, including inactive' })
  listCategories() {
    return this.menuAdmin.listCategories();
  }

  @Post('categories')
  @RequirePermissions(PERMISSIONS.MENU_MANAGE)
  createCategory(@Body() dto: CreateMenuCategoryDto) {
    return this.menuAdmin.createCategory(dto);
  }

  @Put('categories/order')
  @RequirePermissions(PERMISSIONS.MENU_MANAGE)
  reorderCategories(@Body() dto: ReorderMenuCategoriesDto) {
    return this.menuAdmin.reorderCategories(dto);
  }

  @Patch('categories/:id')
  @RequirePermissions(PERMISSIONS.MENU_MANAGE)
  updateCategory(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMenuCategoryDto,
  ) {
    return this.menuAdmin.updateCategory(id, dto);
  }

  @Put('categories/:id/dishes')
  @RequirePermissions(PERMISSIONS.MENU_MANAGE)
  replaceDishes(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReplaceMenuCategoryDishesDto,
  ) {
    return this.menuAdmin.replaceDishes(id, dto);
  }

  @Patch('categories/:id/dishes/:dishId')
  @RequirePermissions(PERMISSIONS.MENU_MANAGE)
  updateDish(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('dishId', ParseUUIDPipe) dishId: string,
    @Body() dto: UpdateMenuCategoryDishDto,
  ) {
    return this.menuAdmin.updateDish(id, dishId, dto);
  }

  @Get()
  @RequirePermissions(PERMISSIONS.MENU_VIEW)
  @ApiOperation({
    summary:
      'Employee/company menu preview. Secret categories are omitted; missing-price dishes are omitted.',
  })
  preview(@Query() query: MenuPreviewQueryDto) {
    return this.menuService.preview(query);
  }

  @Get('categories/:slug')
  @RequirePermissions(PERMISSIONS.MENU_VIEW)
  @ApiOperation({
    summary:
      'Direct category lookup. A secret category is reachable by slug; visibility and pricing still apply.',
  })
  previewCategory(
    @Param('slug') slug: string,
    @Query() query: MenuPreviewQueryDto,
  ) {
    return this.menuService.previewCategory(slug, query);
  }

  @Post('availability')
  @RequirePermissions(PERMISSIONS.MENU_VIEW)
  @ApiOperation({
    summary:
      'Order-validation seam. Same MenuResolver as preview; unavailable dishes fail the request.',
  })
  assertOrderable(@Body() dto: MenuAvailabilityDto) {
    return this.menuService.assertOrderable(dto, dto.items);
  }
}
