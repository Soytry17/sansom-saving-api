import {
  ArgumentMetadata,
  BadRequestException,
  Injectable,
  PipeTransform,
} from '@nestjs/common';

/**
 * Parses a string route/query parameter into a positive `bigint`.
 * Use on `@Param('id', ParseBigIntPipe)` for any BigInt-keyed resource.
 */
@Injectable()
export class ParseBigIntPipe implements PipeTransform<string, bigint> {
  transform(value: string, metadata: ArgumentMetadata): bigint {
    if (typeof value !== 'string' || value.trim() === '') {
      throw new BadRequestException(
        `Validation failed: ${metadata.data ?? 'value'} is required`,
      );
    }
    let parsed: bigint;
    try {
      parsed = BigInt(value);
    } catch {
      throw new BadRequestException(
        `Validation failed: ${metadata.data ?? 'value'} must be a valid integer`,
      );
    }
    if (parsed <= 0n) {
      throw new BadRequestException(
        `Validation failed: ${metadata.data ?? 'value'} must be a positive integer`,
      );
    }
    return parsed;
  }
}
