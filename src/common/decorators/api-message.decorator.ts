import { SetMetadata } from '@nestjs/common';

export const API_MESSAGE_KEY = 'sonsam:api-message';

/**
 * Attach a human-readable success message to a route handler.
 * The ResponseInterceptor reads this and includes it in the envelope.
 *
 * @example
 *   @ApiMessage('Registration successful')
 *   @Post('register')
 */
export const ApiMessage = (message: string) =>
  SetMetadata(API_MESSAGE_KEY, message);
