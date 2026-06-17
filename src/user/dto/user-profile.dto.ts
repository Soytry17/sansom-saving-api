import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UserProfileDto {
  @ApiProperty({ example: '1', description: 'User ID (BigInt serialized as string)' })
  id: string;

  @ApiProperty({ example: 'John Doe' })
  fullName: string;

  @ApiProperty({ example: 'john@example.com' })
  email: string;

  @ApiPropertyOptional({ example: '012345678', nullable: true })
  phone: string | null;

  @ApiProperty({ example: '2026-04-29T04:43:29.250Z' })
  createdAt: Date;
}

/**
 * Compact user representation embedded in auth responses.
 */
export class UserSummaryDto {
  @ApiProperty({ example: '1' })
  id: string;

  @ApiProperty({ example: 'John Doe' })
  fullName: string;

  @ApiProperty({ example: 'john@example.com' })
  email: string;
}
