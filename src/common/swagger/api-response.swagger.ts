import { applyDecorators, Type } from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiExtraModels,
  ApiOkResponse,
  getSchemaPath,
} from '@nestjs/swagger';
import {
  ApiResponseDto,
  PaginatedDataDto,
  PaginationDto,
} from '../dto/api-response.dto';

interface ResponseOptions {
  description?: string;
  isArray?: boolean;
}

/**
 * Build the Swagger schema for a wrapped response where `data` is:
 * - `model` (single object), or
 * - `model[]` if `isArray` is true, or
 * - `null` if no model is provided.
 */
function wrappedSchema(model?: Type<unknown>, isArray = false) {
  let dataSchema: Record<string, unknown>;
  if (!model) {
    dataSchema = { type: 'null', nullable: true };
  } else if (isArray) {
    dataSchema = { type: 'array', items: { $ref: getSchemaPath(model) } };
  } else {
    dataSchema = { $ref: getSchemaPath(model) };
  }

  return {
    allOf: [
      { $ref: getSchemaPath(ApiResponseDto) },
      { properties: { data: dataSchema } },
    ],
  };
}

/**
 * 200 OK with `{ statusCode, message, data: T | T[] | null }`.
 *
 * @example
 *   @ApiOkResponseWrapped(UserProfileDto)                      // data: UserProfileDto
 *   @ApiOkResponseWrapped(CategoryDto, { isArray: true })      // data: CategoryDto[]
 *   @ApiOkResponseWrapped()                                    // data: null
 */
export const ApiOkResponseWrapped = <T extends Type<unknown>>(
  model?: T,
  options: ResponseOptions = {},
) => {
  const decorators = [ApiExtraModels(ApiResponseDto)];
  if (model) decorators.push(ApiExtraModels(model));
  decorators.push(
    ApiOkResponse({
      description: options.description,
      schema: wrappedSchema(model, options.isArray),
    }),
  );
  return applyDecorators(...decorators);
};

/**
 * 201 Created with `{ statusCode, message, data: T | T[] | null }`.
 */
export const ApiCreatedResponseWrapped = <T extends Type<unknown>>(
  model?: T,
  options: ResponseOptions = {},
) => {
  const decorators = [ApiExtraModels(ApiResponseDto)];
  if (model) decorators.push(ApiExtraModels(model));
  decorators.push(
    ApiCreatedResponse({
      description: options.description,
      schema: wrappedSchema(model, options.isArray),
    }),
  );
  return applyDecorators(...decorators);
};

/**
 * 200 OK with `{ statusCode, message, data: { items: T[], pagination } }`.
 */
export const ApiPaginatedResponse = <T extends Type<unknown>>(
  model: T,
  options: Pick<ResponseOptions, 'description'> = {},
) =>
  applyDecorators(
    ApiExtraModels(ApiResponseDto, PaginatedDataDto, PaginationDto, model),
    ApiOkResponse({
      description: options.description,
      schema: {
        allOf: [
          { $ref: getSchemaPath(ApiResponseDto) },
          {
            properties: {
              data: {
                allOf: [
                  { $ref: getSchemaPath(PaginatedDataDto) },
                  {
                    properties: {
                      items: {
                        type: 'array',
                        items: { $ref: getSchemaPath(model) },
                      },
                    },
                  },
                ],
              },
            },
          },
        ],
      },
    }),
  );
