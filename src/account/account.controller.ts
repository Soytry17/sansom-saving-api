import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AccountService } from './account.service';
import { AccountDetailsDto, AccountQrDto } from './dto/account-response.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ApiOkResponseWrapped } from '../common/swagger/api-response.swagger';

interface JwtUser {
  userId: string;
  email: string;
}

@ApiTags('Account')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('account')
export class AccountController {
  constructor(private readonly accountService: AccountService) {}

  @Get('me')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Get the signed-in user's account details" })
  @ApiOkResponseWrapped(AccountDetailsDto)
  getMyAccount(@CurrentUser() user: JwtUser): Promise<AccountDetailsDto> {
    return this.accountService.getMyAccount(BigInt(user.userId));
  }

  @Get('qr')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get a QR code for receiving transfers into this account',
  })
  @ApiOkResponseWrapped(AccountQrDto)
  getQrCode(@CurrentUser() user: JwtUser): Promise<AccountQrDto> {
    return this.accountService.generateQrCode(BigInt(user.userId));
  }
}
