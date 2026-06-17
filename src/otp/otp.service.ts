import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { OtpPurpose } from '@prisma/client';
import { randomInt } from 'crypto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import {
  OTP_EXPIRY_MINUTES,
  OTP_HASH_ROUNDS,
  OTP_MAX_ATTEMPTS,
  OTP_RESEND_COOLDOWN_SECONDS,
} from './otp.constants';

@Injectable()
export class OtpService {
  constructor(private readonly prisma: PrismaService) {}

  async issue(email: string, purpose: OtpPurpose): Promise<string> {
    const normalizedEmail = this.normalizeEmail(email);
    const now = new Date();

    await this.prisma.emailOtp.deleteMany({
      where: { expiresAt: { lt: now } },
    });

    const latest = await this.prisma.emailOtp.findFirst({
      where: { email: normalizedEmail, purpose },
      orderBy: { lastSentAt: 'desc' },
      select: { lastSentAt: true },
    });

    if (latest) {
      const elapsedMs = now.getTime() - latest.lastSentAt.getTime();
      const cooldownMs = OTP_RESEND_COOLDOWN_SECONDS * 1000;
      if (elapsedMs < cooldownMs) {
        const secondsLeft = Math.ceil((cooldownMs - elapsedMs) / 1000);
        throw new HttpException(
          `Please wait ${secondsLeft}s before requesting another code`,
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    await this.prisma.emailOtp.updateMany({
      where: {
        email: normalizedEmail,
        purpose,
        consumedAt: null,
      },
      data: { consumedAt: now },
    });

    const code = this.generateCode();
    await this.prisma.emailOtp.create({
      data: {
        email: normalizedEmail,
        purpose,
        codeHash: await bcrypt.hash(code, OTP_HASH_ROUNDS),
        expiresAt: this.addMinutes(now, OTP_EXPIRY_MINUTES),
        lastSentAt: now,
      },
    });

    return code;
  }

  async verifyAndConsume(
    email: string,
    purpose: OtpPurpose,
    code: string,
  ): Promise<void> {
    const normalizedEmail = this.normalizeEmail(email);
    const otp = await this.prisma.emailOtp.findFirst({
      where: {
        email: normalizedEmail,
        purpose,
        consumedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!otp) {
      throw new BadRequestException('Invalid or expired verification code');
    }

    if (otp.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException('Invalid or expired verification code');
    }

    if (otp.attempts >= OTP_MAX_ATTEMPTS) {
      throw new BadRequestException('Verification code attempt limit reached');
    }

    const isValid = await bcrypt.compare(code, otp.codeHash);
    if (!isValid) {
      await this.prisma.emailOtp.update({
        where: { id: otp.id },
        data: { attempts: { increment: 1 } },
      });
      throw new BadRequestException('Invalid or expired verification code');
    }

    const consumed = await this.prisma.emailOtp.updateMany({
      where: {
        id: otp.id,
        consumedAt: null,
      },
      data: { consumedAt: new Date() },
    });

    if (consumed.count !== 1) {
      throw new BadRequestException('Invalid or expired verification code');
    }
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private addMinutes(date: Date, minutes: number): Date {
    return new Date(date.getTime() + minutes * 60 * 1000);
  }

  private generateCode(): string {
    return randomInt(0, 1_000_000).toString().padStart(6, '0');
  }
}
