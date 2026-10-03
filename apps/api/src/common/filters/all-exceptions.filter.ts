import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { DomainError, statusForDomainError } from '../errors/index.js';
import { getRequestId } from '../middleware/request-id.middleware.js';

export interface ErrorResponseBody {
  statusCode: number;
  code: string;
  message: string;
  requestId?: string;
  details?: Record<string, unknown>;
}

/**
 * Single exit point for every error leaving the API.
 *
 * Domain errors keep their machine-readable code; anything unexpected is
 * reduced to a generic payload so stack traces, SQL text or credentials can
 * never reach the client.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const requestId = getRequestId(http.getRequest());

    const body = this.toResponseBody(exception, requestId);

    if (body.statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `Unhandled exception requestId=${requestId ?? 'unknown'}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(body.statusCode).json(body);
  }

  private toResponseBody(
    exception: unknown,
    requestId: string | undefined,
  ): ErrorResponseBody {
    if (exception instanceof DomainError) {
      return {
        statusCode: statusForDomainError(exception),
        code: exception.code,
        message: exception.message,
        requestId,
        ...(exception.details ? { details: exception.details } : {}),
      };
    }

    if (exception instanceof HttpException) {
      return this.fromHttpException(exception, requestId);
    }

    if (isMulterFileTooLarge(exception)) {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        code: 'FILE_TOO_LARGE',
        message: 'File exceeds the 2 MB limit.',
        requestId,
      };
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred.',
      requestId,
    };
  }

  private fromHttpException(
    exception: HttpException,
    requestId: string | undefined,
  ): ErrorResponseBody {
    const statusCode = exception.getStatus();
    const payload = exception.getResponse();

    if (statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
      return {
        statusCode,
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred.',
        requestId,
      };
    }

    const message = this.extractMessage(payload) ?? exception.message;
    const code =
      this.extractCode(payload) ?? httpStatusToCode(statusCode) ?? 'HTTP_ERROR';
    const details = this.extractDetails(payload);

    return {
      statusCode,
      code,
      message,
      requestId,
      ...(details ? { details } : {}),
    };
  }

  private extractMessage(payload: unknown): string | undefined {
    if (typeof payload === 'string') {
      return payload;
    }

    if (isRecord(payload)) {
      const { message } = payload;

      if (typeof message === 'string') {
        return message;
      }

      // ValidationPipe reports an array of constraint messages.
      if (Array.isArray(message) && message.length > 0) {
        return 'Request validation failed.';
      }
    }

    return undefined;
  }

  private extractCode(payload: unknown): string | undefined {
    if (isRecord(payload) && typeof payload.code === 'string') {
      return payload.code;
    }

    return undefined;
  }

  private extractDetails(
    payload: unknown,
  ): Record<string, unknown> | undefined {
    if (isRecord(payload) && Array.isArray(payload.message)) {
      return { errors: payload.message };
    }

    return undefined;
  }
}

function isMulterFileTooLarge(exception: unknown): boolean {
  return (
    typeof exception === 'object' &&
    exception !== null &&
    'code' in exception &&
    (exception as { code: string }).code === 'LIMIT_FILE_SIZE'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function httpStatusToCode(statusCode: number): string | undefined {
  const name = Object.entries(HttpStatus).find(
    ([, value]) => value === statusCode,
  )?.[0];

  return name;
}
