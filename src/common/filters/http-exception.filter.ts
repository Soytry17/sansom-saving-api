import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';

/**
 * Standard error payload returned by the API. Mirrors the success envelope
 * shape (statusCode + message + data) plus an `error` field for the short
 * machine-readable error name. Keeping `data: null` makes client-side
 * parsing uniform — consumers can always destructure { statusCode, message,
 * data } and only branch on whether `error` is present.
 */
interface ErrorEnvelope {
  statusCode: number;
  message: string | string[];
  data: null;
  error: string;
}

/**
 * Catches every exception leaving a route handler and reshapes it into
 * the project's standard envelope. Three categories are handled:
 *
 *   1. NestJS HttpException (incl. ValidationPipe / ForbiddenException /
 *      NotFoundException / etc.) — preserve the status, lift the message.
 *   2. PrismaClientKnownRequestError — translate common DB error codes to
 *      sensible HTTP statuses (P2002 unique → 409, P2025 not-found → 404).
 *   3. Anything else — log it and return a generic 500.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const envelope = this.buildEnvelope(exception, request);

    // Internal errors deserve a stack trace in the logs; client errors do
    // not — they're user input issues, not server bugs.
    if (envelope.statusCode >= 500) {
      this.logger.error(
        `${request.method} ${request.url} → ${envelope.statusCode} ${envelope.error}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(envelope.statusCode).json(envelope);
  }

  private buildEnvelope(
    exception: unknown,
    request: Request,
  ): ErrorEnvelope {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();

      // body can be either a string (e.g. throw new BadRequestException('msg'))
      // or an object (e.g. ValidationPipe → { statusCode, message[], error })
      if (typeof body === 'string') {
        return {
          statusCode: status,
          message: body,
          data: null,
          error: this.errorNameFor(status),
        };
      }
      const obj = body as Record<string, unknown>;
      return {
        statusCode: status,
        message:
          (obj.message as string | string[] | undefined) ??
          exception.message,
        data: null,
        error:
          (obj.error as string | undefined) ?? this.errorNameFor(status),
      };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.fromPrismaKnown(exception);
    }

    if (exception instanceof Prisma.PrismaClientValidationError) {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Invalid database query parameters',
        data: null,
        error: 'Bad Request',
      };
    }

    // Anything else: leak nothing useful to the client.
    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
      data: null,
      error: 'Internal Server Error',
    };
  }

  private fromPrismaKnown(
    err: Prisma.PrismaClientKnownRequestError,
  ): ErrorEnvelope {
    // See https://www.prisma.io/docs/reference/api-reference/error-reference
    switch (err.code) {
      case 'P2002': {
        const target = (err.meta?.target as string[] | undefined)?.join(', ');
        return {
          statusCode: HttpStatus.CONFLICT,
          message: target
            ? `Unique constraint failed on field(s): ${target}`
            : 'Unique constraint failed',
          data: null,
          error: 'Conflict',
        };
      }
      case 'P2025':
        return {
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Record not found',
          data: null,
          error: 'Not Found',
        };
      case 'P2003':
        return {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Foreign key constraint failed',
          data: null,
          error: 'Bad Request',
        };
      default:
        // Unknown Prisma error → log and return generic 500.
        this.logger.error(`Unhandled Prisma error ${err.code}`, err.message);
        return {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Internal server error',
          data: null,
          error: 'Internal Server Error',
        };
    }
  }

  private errorNameFor(status: number): string {
    switch (status) {
      case 400:
        return 'Bad Request';
      case 401:
        return 'Unauthorized';
      case 403:
        return 'Forbidden';
      case 404:
        return 'Not Found';
      case 409:
        return 'Conflict';
      case 422:
        return 'Unprocessable Entity';
      case 500:
        return 'Internal Server Error';
      default:
        return status >= 500 ? 'Server Error' : 'Client Error';
    }
  }
}
