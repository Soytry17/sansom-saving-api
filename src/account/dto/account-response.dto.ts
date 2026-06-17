import { ApiProperty } from '@nestjs/swagger';

export class AccountDetailsDto {
  @ApiProperty({ example: 'ACC-20260429-00001' })
  accountNumber: string;

  @ApiProperty({ example: '0.00', description: 'Decimal serialized as string' })
  balance: string;

  @ApiProperty({ example: '2026-04-29T04:43:29.568Z' })
  createdAt: Date;
}

export class AccountQrDto {
  @ApiProperty({ example: 'ACC-20260429-00001' })
  accountNumber: string;

  @ApiProperty({ example: 'John Doe' })
  ownerName: string;

  @ApiProperty({
    example: 'data:image/png;base64,iVBORw0KGgoAAAA...',
    description: 'Base64-encoded PNG of the account-number QR code',
  })
  qrImageBase64: string;
}

/**
 * Compact account representation embedded in registration response.
 */
export class AccountSummaryDto {
  @ApiProperty({ example: 'ACC-20260429-00001' })
  accountNumber: string;

  @ApiProperty({ example: '0.00' })
  balance: string;
}
