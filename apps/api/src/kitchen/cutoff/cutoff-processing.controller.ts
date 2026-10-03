import { Controller, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../auth/decorators/require-permissions.decorator.js';
import { PERMISSIONS } from '../../auth/permissions.js';
import {
  CutoffProcessingService,
  type CutoffProcessResult,
} from './cutoff-processing.service.js';

@ApiTags('cutoff')
@Controller('cutoff')
export class CutoffProcessingController {
  constructor(private readonly processing: CutoffProcessingService) {}

  @Post('process/:date')
  @RequirePermissions(PERMISSIONS.KITCHEN_UPDATE)
  @ApiOperation({
    summary:
      'Process kitchen cutoff for a delivery date. Safe to repeat. Past dates allowed; future cutoffs are skipped.',
  })
  process(@Param('date') date: string): Promise<CutoffProcessResult> {
    return this.processing.ensureProcessed(date);
  }
}
