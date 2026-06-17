import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional } from 'class-validator';

export enum TransferDirection {
  sent = 'sent',
  received = 'received',
}

export class ListTransfersQueryDto {
  @ApiPropertyOptional({
    enum: TransferDirection,
    description: 'Filter by direction (omit to include both)',
  })
  @IsOptional()
  @IsEnum(TransferDirection)
  direction?: TransferDirection;

  @ApiPropertyOptional({ example: '2026-05-01', description: 'Start date (inclusive)' })
  @IsOptional()
  @IsDateString()
  start?: string;

  @ApiPropertyOptional({ example: '2026-05-31', description: 'End date (inclusive)' })
  @IsOptional()
  @IsDateString()
  end?: string;
}
