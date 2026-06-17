import { ApiProperty } from '@nestjs/swagger';

export class TransferReceiverDto {
  @ApiProperty({ example: 'ACC-20260429-00002' })
  accountNumber: string;

  @ApiProperty({ example: 'Jane Doe' })
  name: string;
}

export class CreateTransferResponseDto {
  @ApiProperty({ example: '5' })
  transferId: string;

  @ApiProperty({ example: '20.00', description: 'Decimal serialized as string' })
  amount: string;

  @ApiProperty({ type: TransferReceiverDto })
  receiver: TransferReceiverDto;

  @ApiProperty({
    example: '230.00',
    description: "Sender's balance after the transfer",
  })
  newBalance: string;
}
