import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TransferDirection } from './list-transfers-query.dto';

export class TransferCounterpartDto {
  @ApiProperty({ example: 'Jane Doe' })
  name: string;

  @ApiProperty({ example: 'ACC-20260429-00002' })
  accountNumber: string;
}

export class TransferHistoryItemDto {
  @ApiProperty({ example: '5' })
  transferId: string;

  @ApiProperty({
    enum: TransferDirection,
    example: TransferDirection.sent,
    description:
      'sent — current user is the sender; received — current user is the receiver',
  })
  direction: TransferDirection;

  @ApiProperty({ example: '20.00' })
  amount: string;

  @ApiPropertyOptional({ example: 'Treat for coffee', nullable: true })
  note: string | null;

  @ApiProperty({ type: TransferCounterpartDto })
  counterpart: TransferCounterpartDto;

  @ApiProperty({ example: '2026-05-10T14:00:00.000Z' })
  createdAt: Date;
}
