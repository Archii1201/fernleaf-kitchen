import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator.js';
import { PERMISSIONS } from '../auth/permissions.js';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.js';
import { FilesService } from '../files/files.service.js';
import { DriverService } from './driver.service.js';

class DriverDeliverDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

@ApiTags('driver')
@Controller('driver')
export class DriverController {
  constructor(
    private readonly driver: DriverService,
    private readonly files: FilesService,
  ) {}

  @Get('drops/today')
  @RequirePermissions(PERMISSIONS.DRIVER_VIEW)
  @ApiOperation({ summary: "The current driver's drops for today" })
  listToday(@CurrentUser() user: AuthenticatedUser) {
    return this.driver.listToday(user.id);
  }

  @Post('drops/:id/deliver')
@RequirePermissions(PERMISSIONS.DRIVER_UPDATE)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  deliver(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: DriverDeliverDto,
    @UploadedFile()
    file?: { buffer: Buffer; mimetype: string; originalname: string; size: number },
  ) {
    return this.deliverWithOptionalPhoto(id, user, dto.note, file);
  }

  private async deliverWithOptionalPhoto(
    id: string,
    user: AuthenticatedUser,
    note: string | undefined,
    file?: { buffer: Buffer; mimetype: string; originalname: string; size: number },
  ) {
    const photo = file
      ? await this.files.upload(file, user.id)
      : undefined;

    return this.driver.deliver(id, user.id, {
      note,
      photoFileId: photo?.id,
    });
  }
}
