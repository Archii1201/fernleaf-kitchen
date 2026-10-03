import { createHash, randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  ALLOWED_IMAGE_MIME_TYPES,
  FileNotFoundError,
  FileRequiredError,
  FileTooLargeError,
  FileTypeNotAllowedError,
  MAX_FILE_BYTES,
} from './files.errors.js';

export interface StoredFile {
  id: string;
  mimeType: string;
  filename: string;
  sizeBytes: number;
  data: Buffer;
}

@Injectable()
export class FilesService {
  constructor(private readonly prisma: PrismaService) {}

  async upload(
    file: { buffer: Buffer; mimetype: string; originalname: string; size: number } | undefined,
    uploadedByUserId: string,
  ): Promise<{ id: string }> {
    if (!file) {
      throw new FileRequiredError();
    }

    this.assertImagePayload(file.mimetype, file.size);

  const data = new Uint8Array(file.buffer.byteLength);
data.set(file.buffer);
    const checksum = createHash('sha256').update(data).digest('hex');

    const created = await this.prisma.dbFile.create({
      data: {
        storageKey: `db:${randomUUID()}`,
        filename: file.originalname || 'upload',
        mimeType: file.mimetype,
        sizeBytes: data.length,
        checksum,
        data,
        uploadedByUserId,
      },
      select: { id: true },
    });

    return created;
  }

  async getStored(id: string): Promise<StoredFile> {
    const row = await this.prisma.dbFile.findUnique({
      where: { id },
      select: {
        id: true,
        mimeType: true,
        filename: true,
        sizeBytes: true,
        data: true,
      },
    });

    if (!row || !row.data) {
      throw new FileNotFoundError(id);
    }

    return {
      id: row.id,
      mimeType: row.mimeType,
      filename: row.filename,
      sizeBytes: row.sizeBytes,
      data: Buffer.from(row.data),
    };
  }

  async assertImage(id: string): Promise<void> {
    const row = await this.prisma.dbFile.findUnique({
      where: { id },
      select: { mimeType: true, sizeBytes: true },
    });

    if (!row) {
      throw new FileNotFoundError(id);
    }

    this.assertImagePayload(row.mimeType, row.sizeBytes);
  }

  assertImagePayload(mimeType: string, sizeBytes: number): void {
    if (sizeBytes > MAX_FILE_BYTES) {
      throw new FileTooLargeError(sizeBytes);
    }

    if (
      !ALLOWED_IMAGE_MIME_TYPES.includes(
        mimeType as (typeof ALLOWED_IMAGE_MIME_TYPES)[number],
      )
    ) {
      throw new FileTypeNotAllowedError(mimeType);
    }
  }
}
