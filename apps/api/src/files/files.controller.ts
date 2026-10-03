import {
  BadRequestException,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileTooLargeError } from './files.errors.js';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator.js';
import { PERMISSIONS } from '../auth/permissions.js';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.js';
import { MAX_FILE_BYTES } from './files.errors.js';
import { FilesService } from './files.service.js';

@ApiTags('files')
@Controller('files')
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Post()
  @RequirePermissions(PERMISSIONS.FILES_UPLOAD)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload an image (JPEG, PNG or WebP, max 2 MB)' })
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @UploadedFile() file: { buffer: Buffer; mimetype: string; originalname: string; size: number },
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ id: string }> {
    return this.files.upload(file, user.id);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.FILES_VIEW)
  @ApiOperation({ summary: 'Stream a stored file' })
  async getById(
    @Param('id', ParseUUIDPipe) id: string,
    @Res() response: Response,
  ): Promise<void> {
    const file = await this.files.getStored(id);
    response.setHeader('Content-Type', file.mimeType);
    response.setHeader('Content-Length', String(file.sizeBytes));
    response.setHeader(
      'Content-Disposition',
      `inline; filename="${file.filename}"`,
    );
    response.send(file.data);
  }
}
