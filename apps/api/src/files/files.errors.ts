import {
  NotFoundDomainError,
  ValidationDomainError,
} from '../common/errors/index.js';

export const ALLOWED_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export const MAX_FILE_BYTES = 2 * 1024 * 1024;

export class FileNotFoundError extends NotFoundDomainError {
  constructor(id: string) {
    super({
      code: 'FILE_NOT_FOUND',
      message: 'File not found.',
      details: { id },
    });
  }
}

export class FileTooLargeError extends ValidationDomainError {
  constructor(sizeBytes: number) {
    super({
      code: 'FILE_TOO_LARGE',
      message: 'File exceeds the 2 MB limit.',
      details: { sizeBytes, maxBytes: MAX_FILE_BYTES },
    });
  }
}

export class FileTypeNotAllowedError extends ValidationDomainError {
  constructor(mimeType: string) {
    super({
      code: 'FILE_TYPE_NOT_ALLOWED',
      message: 'Only JPEG, PNG and WebP images are accepted.',
      details: { mimeType, allowed: [...ALLOWED_IMAGE_MIME_TYPES] },
    });
  }
}

export class FileRequiredError extends ValidationDomainError {
  constructor() {
    super({
      code: 'FILE_REQUIRED',
      message: 'A multipart field named "file" is required.',
    });
  }
}
