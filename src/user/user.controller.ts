import {
  Controller,
  Get,
  Put,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UserService } from './user.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserProfileDto } from './dto/user-profile.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ApiMessage } from '../common/decorators/api-message.decorator';
import { ApiOkResponseWrapped } from '../common/swagger/api-response.swagger';

interface JwtUser {
  userId: string;
  email: string;
}

@ApiTags('User')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('me')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Get the current user's profile" })
  @ApiOkResponseWrapped(UserProfileDto)
  getMe(@CurrentUser() user: JwtUser): Promise<UserProfileDto> {
    return this.userService.getMe(BigInt(user.userId));
  }

  @Put('me')
  @HttpCode(HttpStatus.OK)
  @ApiMessage('Profile updated successfully')
  @ApiOperation({ summary: "Update the current user's profile" })
  @ApiOkResponseWrapped()
  async updateMe(
    @CurrentUser() user: JwtUser,
    @Body() dto: UpdateUserDto,
  ): Promise<void> {
    await this.userService.updateMe(BigInt(user.userId), dto);
  }
}
