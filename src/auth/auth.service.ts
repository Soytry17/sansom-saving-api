import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { CategoryType, OtpPurpose, Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { EmailOnlyDto } from './dto/email-only.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import {
  LoginResponseDto,
  RegisterResponseDto,
  VerifyEmailResponseDto,
} from './dto/auth-response.dto';
import { MailService } from '../mail/mail.service';
import { OtpService } from '../otp/otp.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
    private readonly otpService: OtpService,
  ) {}

  async register(registerDto: RegisterDto): Promise<RegisterResponseDto> {
    const email = this.normalizeEmail(registerDto.email);

    const existingUser = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existingUser) {
      throw new BadRequestException('Email already registered');
    }

    const passwordHash = await bcrypt.hash(registerDto.password, 10);
    const expiresAt = this.addHours(new Date(), 24);

    await this.prisma.pendingRegistration.upsert({
      where: { email },
      update: {
        fullName: registerDto.fullName.trim(),
        phone: registerDto.phone,
        passwordHash,
        expiresAt,
      },
      create: {
        email,
        fullName: registerDto.fullName.trim(),
        phone: registerDto.phone,
        passwordHash,
        expiresAt,
      },
    });

    const code = await this.otpService.issue(email, OtpPurpose.VERIFY_EMAIL);
    await this.mailService.sendVerificationCode(email, code);

    return {
      email,
      message: 'Verification code sent to your email. Code expires in 10 minutes.',
    };
  }

  async verifyEmail(dto: VerifyEmailDto): Promise<VerifyEmailResponseDto> {
    const email = this.normalizeEmail(dto.email);
    await this.otpService.verifyAndConsume(
      email,
      OtpPurpose.VERIFY_EMAIL,
      dto.code,
    );

    const pending = await this.prisma.pendingRegistration.findUnique({
      where: { email },
    });

    if (!pending || pending.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException(
        'Registration not found or expired, please register again',
      );
    }

    const existingUser = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existingUser) {
      throw new BadRequestException('Email already registered');
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          fullName: pending.fullName,
          email: pending.email,
          password: pending.passwordHash,
          phone: pending.phone,
        },
      });

      const account = await tx.account.create({
        data: {
          userId: user.id,
          accountNumber: await this.generateUniqueAccountNumber(tx),
          balance: 0,
        },
      });

      await tx.category.createMany({
        data: this.defaultCategories().map((cat) => ({
          userId: user.id,
          name: cat.name,
          type: cat.type,
        })),
      });

      // Seed default notification preferences so push-notification gating
      // (transferAlert / lowBalanceAlert / monthlyReport) always has a row
      // to read — no "missing settings" edge case for new users.
      await tx.notificationSettings.create({ data: { userId: user.id } });

      await tx.pendingRegistration.delete({ where: { email } });

      return { user, account };
    });

    const token = this.generateToken(created.user.id, created.user.email);

    return {
      token,
      user: {
        id: created.user.id.toString(),
        fullName: created.user.fullName,
        email: created.user.email,
      },
      account: {
        accountNumber: created.account.accountNumber,
        balance: created.account.balance.toString(),
      },
    };
  }

  async login(loginDto: LoginDto): Promise<LoginResponseDto> {
    const email = this.normalizeEmail(loginDto.email);

    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // Compare password
    const isPasswordValid = await bcrypt.compare(
      loginDto.password,
      user.password,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // Generate JWT token
    const token = this.generateToken(user.id, user.email);

    return {
      token,
      user: {
        id: user.id.toString(),
        fullName: user.fullName,
        email: user.email,
      },
    };
  }

  logout(): null {
    // Stateless JWT - nothing to do server-side
    // In production, could add token blacklist
    return null;
  }

  async resendVerification(dto: EmailOnlyDto): Promise<void> {
    const email = this.normalizeEmail(dto.email);
    const pending = await this.prisma.pendingRegistration.findUnique({
      where: { email },
      select: { email: true, expiresAt: true },
    });

    if (!pending || pending.expiresAt.getTime() <= Date.now()) {
      return;
    }

    const code = await this.otpService.issue(email, OtpPurpose.VERIFY_EMAIL);
    await this.mailService.sendVerificationCode(email, code);
  }

  async forgotPassword(dto: EmailOnlyDto): Promise<void> {
    const email = this.normalizeEmail(dto.email);
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (!user) {
      return;
    }

    const code = await this.otpService.issue(email, OtpPurpose.RESET_PASSWORD);
    await this.mailService.sendPasswordResetCode(email, code);
  }

  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    const email = this.normalizeEmail(dto.email);
    await this.otpService.verifyAndConsume(
      email,
      OtpPurpose.RESET_PASSWORD,
      dto.code,
    );

    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (!user) {
      throw new BadRequestException('Invalid or expired verification code');
    }

    await this.prisma.user.update({
      where: { email },
      data: { password: await bcrypt.hash(dto.newPassword, 10) },
    });

    await this.prisma.emailOtp.updateMany({
      where: {
        email,
        purpose: OtpPurpose.RESET_PASSWORD,
        consumedAt: null,
      },
      data: { consumedAt: new Date() },
    });
  }

  private generateToken(userId: bigint, email: string): string {
    const payload = { sub: userId.toString(), email };
    return this.jwtService.sign(payload);
  }

  private generateAccountNumber(): string {
    const date = new Date();
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
    const randomNum = Math.floor(Math.random() * 100000)
      .toString()
      .padStart(5, '0');
    return `ACC-${dateStr}-${randomNum}`;
  }

  private async generateUniqueAccountNumber(
    tx: Prisma.TransactionClient,
  ): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const accountNumber = this.generateAccountNumber();
      const existing = await tx.account.findUnique({
        where: { accountNumber },
        select: { id: true },
      });
      if (!existing) {
        return accountNumber;
      }
    }

    throw new BadRequestException('Could not generate account number');
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private addHours(date: Date, hours: number): Date {
    return new Date(date.getTime() + hours * 60 * 60 * 1000);
  }

  private defaultCategories(): { name: string; type: CategoryType }[] {
    return [
      { name: 'Salary', type: CategoryType.income },
      { name: 'Pay Back', type: CategoryType.income },
      { name: 'Transfer In', type: CategoryType.income },
      { name: 'Gift', type: CategoryType.income },
      { name: 'Other Income', type: CategoryType.income },
      { name: 'Shopping', type: CategoryType.expense },
      { name: 'Food', type: CategoryType.expense },
      { name: 'Transport', type: CategoryType.expense },
      { name: 'Bill', type: CategoryType.expense },
      { name: 'Borrow', type: CategoryType.expense },
      { name: 'Transfer Out', type: CategoryType.expense },
      { name: 'Other Expense', type: CategoryType.expense },
    ];
  }
}
