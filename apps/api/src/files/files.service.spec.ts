import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  FileTooLargeError,
  FileTypeNotAllowedError,
  MAX_FILE_BYTES,
} from './files.errors.js';
import { FilesService } from './files.service.js';

describe('FilesService', () => {
  let service: FilesService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        FilesService,
        { provide: PrismaService, useValue: { dbFile: { create: vi.fn() } } },
      ],
    }).compile();
    service = moduleRef.get(FilesService);
  });

  it('rejects a file larger than 2 MB', () => {
    expect(() =>
      service.assertImagePayload('image/jpeg', MAX_FILE_BYTES + 1),
    ).toThrow(FileTooLargeError);
  });

  it('rejects a non-image file', () => {
    expect(() => service.assertImagePayload('application/pdf', 100)).toThrow(
      FileTypeNotAllowedError,
    );
  });
});
