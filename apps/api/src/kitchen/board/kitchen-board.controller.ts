import { Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../auth/decorators/require-permissions.decorator.js';
import { PERMISSIONS } from '../../auth/permissions.js';
import { KitchenBoardService } from './kitchen-board.service.js';

@ApiTags('kitchen')
@Controller('kitchen')
export class KitchenBoardController {
  constructor(private readonly board: KitchenBoardService) {}

  @Get('board')
  @RequirePermissions(PERMISSIONS.KITCHEN_VIEW)
  @ApiOperation({ summary: 'Confirmed kitchen work for a delivery date, by station' })
  getBoard(@Query('date') date: string) {
    return this.board.board(date);
  }

  @Post('units/:id/start')
  @RequirePermissions(PERMISSIONS.KITCHEN_UPDATE)
  start(@Param('id', ParseUUIDPipe) id: string) {
    return this.board.start(id);
  }

  @Post('units/:id/done')
  @RequirePermissions(PERMISSIONS.KITCHEN_UPDATE)
  done(@Param('id', ParseUUIDPipe) id: string) {
    return this.board.done(id);
  }

  @Post('orders/:id/force-complete')
  @RequirePermissions(PERMISSIONS.KITCHEN_FORCE_COMPLETE)
  forceComplete(@Param('id', ParseUUIDPipe) id: string) {
    return this.board.forceComplete(id);
  }
}
