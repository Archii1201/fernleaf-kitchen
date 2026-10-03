import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator.js';
import { PERMISSIONS } from '../auth/permissions.js';
import { MenuAvailabilityDto, MenuPreviewQueryDto } from './dto/menu.dto.js';
import { MenuService } from './menu.service.js';

@ApiTags('menu')
@Controller('menu')
export class MenuController {
  constructor(private readonly menuService: MenuService) {}

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
