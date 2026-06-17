import {
  Controller,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import {
  LoginResponseDto,
  RegisterResponseDto,
  VerifyEmailResponseDto,
} from './dto/auth-response.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { EmailOnlyDto } from './dto/email-only.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { ApiMessage } from '../common/decorators/api-message.decorator';
import {
  ApiCreatedResponseWrapped,
  ApiOkResponseWrapped,
} from '../common/swagger/api-response.swagger';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiMessage('Verification code sent')
  @ApiOperation({
    summary: 'Start registration and send an email verification code',
  })
  @ApiCreatedResponseWrapped(RegisterResponseDto, {
    description:
      'Pending registration saved. User/account/categories are created after email verification.',
  })
  register(@Body() dto: RegisterDto): Promise<RegisterResponseDto> {
    return this.authService.register(dto);
  }

  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiMessage('Email verified successfully')
  @ApiOperation({
    summary: 'Verify registration code and create the wallet account',
  })
  @ApiOkResponseWrapped(VerifyEmailResponseDto)
  verifyEmail(@Body() dto: VerifyEmailDto): Promise<VerifyEmailResponseDto> {
    return this.authService.verifyEmail(dto);
  }

  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  @ApiMessage('Verification code resent if registration is pending')
  @ApiOperation({ summary: 'Resend the registration verification code' })
  @ApiOkResponseWrapped()
  resendVerification(@Body() dto: EmailOnlyDto): Promise<void> {
    return this.authService.resendVerification(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiMessage('Login successful')
  @ApiOperation({ summary: 'Authenticate user and return a JWT token' })
  @ApiOkResponseWrapped(LoginResponseDto)
  login(@Body() dto: LoginDto): Promise<LoginResponseDto> {
    return this.authService.login(dto);
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiMessage('Password reset code sent if the email is registered')
  @ApiOperation({ summary: 'Send a password reset code by email' })
  @ApiOkResponseWrapped()
  forgotPassword(@Body() dto: EmailOnlyDto): Promise<void> {
    return this.authService.forgotPassword(dto);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiMessage('Password reset successfully')
  @ApiOperation({ summary: 'Reset password using an email OTP code' })
  @ApiOkResponseWrapped()
  resetPassword(@Body() dto: ResetPasswordDto): Promise<void> {
    return this.authService.resetPassword(dto);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiMessage('Logged out successfully')
  @ApiOperation({ summary: 'Logout the current user (stateless JWT)' })
  @ApiOkResponseWrapped()
  logout(): void {
    this.authService.logout();
  }
}
