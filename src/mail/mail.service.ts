import { Injectable, InternalServerErrorException } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

@Injectable()
export class MailService {
  private transporter?: Transporter;

  private getTransporter(): { transporter: Transporter; from: string } {
    const host = process.env.MAIL_HOST ?? 'smtp.gmail.com';
    const port = Number(process.env.MAIL_PORT ?? 465);
    const user = process.env.MAIL_USER;
    const pass = process.env.MAIL_PASS;
    const fromName = process.env.MAIL_FROM_NAME ?? 'Sonsam Saving';
    const fromAddress = process.env.MAIL_FROM_ADDRESS ?? user;

    if (!user || !pass || !fromAddress) {
      throw new Error(
        'MAIL_USER, MAIL_PASS, and MAIL_FROM_ADDRESS are required for email OTP',
      );
    }

    this.transporter ??= nodemailer.createTransport({
        host,
        port,
        secure: process.env.MAIL_SECURE
          ? process.env.MAIL_SECURE === 'true'
          : port === 465,
        auth: { user, pass },
      });

    return {
      transporter: this.transporter,
      from: `"${fromName}" <${fromAddress}>`,
    };
  }

  async sendVerificationCode(email: string, code: string): Promise<void> {
    await this.sendOtpEmail({
      to: email,
      subject: 'Verify your Sonsam Saving email',
      title: 'Verify your email',
      code,
      helpText: 'Enter this code to finish creating your Sonsam Saving account.',
    });
  }

  async sendPasswordResetCode(email: string, code: string): Promise<void> {
    await this.sendOtpEmail({
      to: email,
      subject: 'Reset your Sonsam Saving password',
      title: 'Reset your password',
      code,
      helpText: 'Enter this code to choose a new password.',
    });
  }

  private async sendOtpEmail(input: {
    to: string;
    subject: string;
    title: string;
    code: string;
    helpText: string;
  }): Promise<void> {
    try {
      const { transporter, from } = this.getTransporter();
      await transporter.sendMail({
        from,
        to: input.to,
        subject: input.subject,
        text: `${input.title}\n\nYour code is ${input.code}.\n\n${input.helpText}\nThis code expires in 10 minutes.`,
        html: `
          <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111827;">
            <h2>${input.title}</h2>
            <p>${input.helpText}</p>
            <p style="font-size: 32px; font-weight: 700; letter-spacing: 6px; margin: 24px 0;">
              ${input.code}
            </p>
            <p>This code expires in 10 minutes.</p>
            <p>If you did not request this, you can ignore this email.</p>
          </div>
        `,
      });
    } catch {
      throw new InternalServerErrorException('Failed to send email OTP');
    }
  }
}
