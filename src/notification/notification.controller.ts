import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { NotificationService } from './notification.service';
import { ListNotificationsQueryDto } from './dto/list-notifications-query.dto';
import { NotificationResponseDto } from './dto/notification-response.dto';
import { NotificationSettingsResponseDto } from './dto/notification-settings-response.dto';
import { SaveNotificationSettingsDto } from './dto/save-notification-settings.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ApiMessage } from '../common/decorators/api-message.decorator';
import {
  ApiOkResponseWrapped,
  ApiPaginatedResponse,
} from '../common/swagger/api-response.swagger';
import { ParseBigIntPipe } from '../common/pipes/parse-bigint.pipe';
import { PaginatedDataDto } from '../common/dto/api-response.dto';

interface JwtUser {
  userId: string;
  email: string;
}

@ApiTags('Notification')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'List the current user\'s notifications (newest first). ' +
      'Filter by isRead and paginate with page/limit.',
  })
  @ApiPaginatedResponse(NotificationResponseDto, {
    description: 'Paginated notification list',
  })
  list(
    @CurrentUser() user: JwtUser,
    @Query() query: ListNotificationsQueryDto,
  ): Promise<PaginatedDataDto<NotificationResponseDto>> {
    return this.notificationService.list(BigInt(user.userId), query);
  }

  // NOTE: declare the static path BEFORE the param-based route so Express
  // never accidentally tries to match `read-all` against `:id`.
  @Put('read-all')
  @HttpCode(HttpStatus.OK)
  @ApiMessage('All notifications marked as read')
  @ApiOperation({
    summary: 'Mark all of the current user\'s notifications as read',
  })
  @ApiOkResponseWrapped()
  async markAllAsRead(@CurrentUser() user: JwtUser): Promise<void> {
    await this.notificationService.markAllAsRead(BigInt(user.userId));
  }

  @Put(':id/read')
  @HttpCode(HttpStatus.OK)
  @ApiMessage('Notification marked as read')
  @ApiOperation({ summary: 'Mark a single notification as read' })
  @ApiOkResponseWrapped()
  async markAsRead(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseBigIntPipe) id: bigint,
  ): Promise<void> {
    await this.notificationService.markAsRead(BigInt(user.userId), id);
  }

  @Get('settings')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get the current user\'s notification preferences',
  })
  @ApiOkResponseWrapped(NotificationSettingsResponseDto)
  getSettings(
    @CurrentUser() user: JwtUser,
  ): Promise<NotificationSettingsResponseDto> {
    return this.notificationService.getSettings(BigInt(user.userId));
  }

  @Post('settings')
  @HttpCode(HttpStatus.OK)
  @ApiMessage('Notification settings saved')
  @ApiOperation({
    summary: 'Save (upsert) the current user\'s notification preferences',
  })
  @ApiOkResponseWrapped(NotificationSettingsResponseDto)
  saveSettings(
    @CurrentUser() user: JwtUser,
    @Body() dto: SaveNotificationSettingsDto,
  ): Promise<NotificationSettingsResponseDto> {
    return this.notificationService.saveSettings(BigInt(user.userId), dto);
  }

  @Post('test')
  @HttpCode(HttpStatus.OK)
  @ApiMessage('Test push sent')
  @ApiOperation({
    summary:
      'Send a test push to the current user\'s devices (dev/QA only — ' +
      'disabled in production unless PUSH_TEST_ENABLED=true)',
  })
  @ApiOkResponseWrapped()
  async sendTest(@CurrentUser() user: JwtUser): Promise<void> {
    await this.notificationService.sendTest(BigInt(user.userId));
  }
}
