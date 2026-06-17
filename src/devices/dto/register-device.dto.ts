import { IsEnum, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum DevicePlatform {
  android = 'android',
  ios = 'ios',
}

export class RegisterDeviceDto {
  @ApiProperty({
    example: 'fGc1...long-fcm-token',
    description: 'The FCM registration token issued to this device by Firebase',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  fcmToken: string;

  @ApiProperty({ enum: DevicePlatform, example: DevicePlatform.android })
  @IsEnum(DevicePlatform)
  platform: DevicePlatform;
}
