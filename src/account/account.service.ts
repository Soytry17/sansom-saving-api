import { Injectable, NotFoundException } from '@nestjs/common';
import * as QRCode from 'qrcode';
import { PrismaService } from '../prisma/prisma.service';
import { AccountDetailsDto, AccountQrDto } from './dto/account-response.dto';

@Injectable()
export class AccountService {
  constructor(private readonly prisma: PrismaService) {}

  async getMyAccount(userId: bigint): Promise<AccountDetailsDto> {
    const account = await this.prisma.account.findUnique({
      where: { userId },
    });
    if (!account) {
      throw new NotFoundException('Account not found');
    }

    return {
      accountNumber: account.accountNumber,
      balance: account.balance.toString(),
      createdAt: account.createdAt,
    };
  }

  async generateQrCode(userId: bigint): Promise<AccountQrDto> {
    const account = await this.prisma.account.findUnique({
      where: { userId },
      select: {
        accountNumber: true,
        user: { select: { fullName: true } },
      },
    });
    if (!account) {
      throw new NotFoundException('Account not found');
    }

    const qrImageBase64 = await QRCode.toDataURL(account.accountNumber, {
      errorCorrectionLevel: 'H',
      margin: 2,
      width: 512,
      color: {
        dark: '#000000FF',
        light: '#FFFFFFFF',
      },
    });

    return {
      accountNumber: account.accountNumber,
      ownerName: account.user.fullName,
      qrImageBase64,
    };
  }
}
