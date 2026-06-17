import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DevicesService } from './devices.service';
import { RegisterDeviceDto } from './dto/register-device.dto';
import { UnregisterDeviceDto } from './dto/unregister-device.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ApiMessage } from '../common/decorators/api-message.decorator';
import { ApiOkResponseWrapped } from '../common/swagger/api-response.swagger';

interface JwtUser {
  userId: string;
  email: string;
}

@ApiTags('Device')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('devices')
export class DevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiMessage('Device registered')
  @ApiOperation({
    summary:
      'Register or refresh this device\'s FCM token for push notifications. ' +
      'Call on login and whenever Firebase issues a new token.',
  })
  @ApiOkResponseWrapped()
  async register(
    @CurrentUser() user: JwtUser,
    @Body() dto: RegisterDeviceDto,
  ): Promise<void> {
    await this.devicesService.register(BigInt(user.userId), dto);
  }

  @Post('unregister')
  @HttpCode(HttpStatus.OK)
  @ApiMessage('Device unregistered')
  @ApiOperation({
    summary:
      'Remove this device\'s FCM token (call on logout) so it stops ' +
      'receiving the user\'s push notifications.',
  })
  @ApiOkResponseWrapped()
  async unregister(
    @CurrentUser() user: JwtUser,
    @Body() dto: UnregisterDeviceDto,
  ): Promise<void> {
    await this.devicesService.unregister(BigInt(user.userId), dto.fcmToken);
  }
}
