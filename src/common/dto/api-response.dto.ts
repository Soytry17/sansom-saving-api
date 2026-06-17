import { ApiProperty } from '@nestjs/swagger';

/**
 * Standard envelope returned by every successful API response.
 * Built dynamically by the ResponseInterceptor.
 */
export class ApiResponseDto<T = unknown> {
  @ApiProperty({ example: 200, description: 'HTTP status code' })
  statusCode: number;

  @ApiProperty({ example: 'Success', description: 'Human-readable message' })
  message: string;

  @ApiProperty({ description: 'Response payload (null when there is no body)' })
  data: T | null;
}

/**
 * Pagination metadata returned with paginated list endpoints.
 */
export class PaginationDto {
  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  limit: number;

  @ApiProperty({ example: 45 })
  total: number;
}

/**
 * Generic paginated payload — used as the `data` field of paginated list
 * endpoints. The `items` field is typed per-endpoint in Swagger via the
 * ApiPaginatedResponse helper decorator.
 */
export class PaginatedDataDto<T = unknown> {
  @ApiProperty({ isArray: true })
  items: T[];

  @ApiProperty({ type: PaginationDto })
  pagination: PaginationDto;
}
