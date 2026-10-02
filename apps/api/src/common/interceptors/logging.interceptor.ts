import {
  type CallHandler,
  type ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  type NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { Observable } from 'rxjs';
import { tap } from 'rxjs';
import { DomainError, statusForDomainError } from '../errors/index.js';
import { getRequestId } from '../middleware/request-id.middleware.js';

/**
 * Logs one line per request: method, path, status, duration and request id.
 *
 * Request bodies, headers and query values are deliberately not logged so
 * credentials, tokens and connection strings can never reach the log output.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    const method = request.method;
    const path = request.originalUrl.split('?')[0];
    const requestId = getRequestId(request);
    const startedAt = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          this.log(method, path, response.statusCode, startedAt, requestId);
        },
        error: (error: unknown) => {
          this.log(method, path, statusCodeOf(error), startedAt, requestId);
        },
      }),
    );
  }

  private log(
    method: string,
    path: string,
    statusCode: number,
    startedAt: number,
    requestId: string | undefined,
  ): void {
    const duration = Date.now() - startedAt;
    const suffix = requestId ? ` requestId=${requestId}` : '';

    this.logger.log(`${method} ${path} ${statusCode} ${duration}ms${suffix}`);
  }
}

function statusCodeOf(error: unknown): number {
  if (error instanceof DomainError) {
    return statusForDomainError(error);
  }

  if (error instanceof HttpException) {
    return error.getStatus();
  }

  return HttpStatus.INTERNAL_SERVER_ERROR;
}
