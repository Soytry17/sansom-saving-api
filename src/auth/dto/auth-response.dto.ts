import { ApiProperty } from '@nestjs/swagger';
import { UserSummaryDto } from '../../user/dto/user-profile.dto';
import { AccountSummaryDto } from '../../account/dto/account-response.dto';

export class RegisterResponseDto {
  @ApiProperty({ example: 'john@example.com' })
  email: string;

  @ApiProperty({
    example: 'Verification code sent to your email. Code expires in 10 minutes.',
  })
  message: string;
}

export class LoginResponseDto {
  @ApiProperty({
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    description: 'JWT access token (expires in 7 days)',
  })
  token: string;

  @ApiProperty({ type: UserSummaryDto })
  user: UserSummaryDto;
}

export class VerifyEmailResponseDto extends LoginResponseDto {
  @ApiProperty({ type: AccountSummaryDto })
  account: AccountSummaryDto;
}
