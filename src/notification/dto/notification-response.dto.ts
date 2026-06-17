import { ApiProperty } from '@nestjs/swagger';

export class NotificationResponseDto {
  @ApiProperty({ example: '1', description: 'Notification ID' })
  id: string;

  @ApiProperty({ example: 'Transfer Received' })
  title: string;

  @ApiProperty({ example: 'You received 20.00 from John Doe' })
  message: string;

  @ApiProperty({ example: false })
  isRead: boolean;

  @ApiProperty({ example: '2026-05-10T14:00:00.000Z' })
  createdAt: Date;
}
