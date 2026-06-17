import { IsEmail } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class EmailOnlyDto {
  @ApiProperty({ example: 'john@example.com', format: 'email' })
  @IsEmail()
  email: string;
}
