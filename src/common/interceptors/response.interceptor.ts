import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Response } from 'express';
import { API_MESSAGE_KEY } from '../decorators/api-message.decorator';
import { ApiResponseDto } from '../dto/api-response.dto';

/**
 * Wraps every successful response in a uniform envelope:
 * `{ statusCode, message, data }`.
 *
 * - `statusCode` is taken from the Express response (so @HttpCode works).
 * - `message`    is read from the @ApiMessage() decorator on the handler,
 *                falling back to 'Success'.
 * - `data`       is whatever the handler returned (null if nothing).
 *
 * Controllers should return raw business data — no manual wrapping.
 *
 * If a handler already returns an object that looks like the envelope
 * (has its own `statusCode` field), it is passed through untouched.
 */
@Injectable()
export class ResponseInterceptor<T = unknown>
  implements NestInterceptor<T, ApiResponseDto<T>>
{
  constructor(private readonly reflector: Reflector) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiResponseDto<T>> {
    const message =
      this.reflector.get<string>(API_MESSAGE_KEY, context.getHandler()) ??
      'Success';

    const response = context.switchToHttp().getResponse<Response>();

    return next.handle().pipe(
      map((data) => {
        if (this.isAlreadyWrapped(data)) {
          return data as unknown as ApiResponseDto<T>;
        }
        return {
          statusCode: response.statusCode,
          message,
          data: (data ?? null) as T | null,
        };
      }),
    );
  }

  private isAlreadyWrapped(value: unknown): boolean {
    return (
      typeof value === 'object' &&
      value !== null &&
      'statusCode' in value &&
      'message' in value &&
      'data' in value
    );
  }
}
