import { IsEmail, IsString, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyEmailDto {
  @ApiProperty({ example: 'john@example.com', format: 'email' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: '482913', minLength: 6, maxLength: 6 })
  @IsString()
  @Matches(/^\d{6}$/, { message: 'Code must be a 6-digit number' })
  code: string;
}
