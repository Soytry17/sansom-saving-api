import { IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UnregisterDeviceDto {
  @ApiProperty({
    example: 'fGc1...long-fcm-token',
    description: 'The FCM token to remove so this device stops receiving pushes',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  fcmToken: string;
}
