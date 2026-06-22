import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

/** Resolved sender identity used by both transports. */
interface Sender {
  name: string;
  address: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter?: Transporter;

  private getSender(): Sender {
    const name = process.env.MAIL_FROM_NAME ?? 'Sonsam Saving';
    const address = process.env.MAIL_FROM_ADDRESS ?? process.env.MAIL_USER;
    if (!address) {
      throw new Error(
        'MAIL_FROM_ADDRESS (or MAIL_USER) is required to send email',
      );
    }
    return { name, address };
  }

  private getTransporter(): { transporter: Transporter; from: string } {
    const host = process.env.MAIL_HOST ?? 'smtp.gmail.com';
    const port = Number(process.env.MAIL_PORT ?? 465);
    const user = process.env.MAIL_USER;
    const pass = process.env.MAIL_PASS;
    const sender = this.getSender();

    if (!user || !pass) {
      throw new Error('MAIL_USER and MAIL_PASS are required for SMTP email OTP');
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
      from: `"${sender.name}" <${sender.address}>`,
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
    const text = `${input.title}\n\nYour code is ${input.code}.\n\n${input.helpText}\nThis code expires in 10 minutes.`;
    const html = `
          <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111827;">
            <h2>${input.title}</h2>
            <p>${input.helpText}</p>
            <p style="font-size: 32px; font-weight: 700; letter-spacing: 6px; margin: 24px 0;">
              ${input.code}
            </p>
            <p>This code expires in 10 minutes.</p>
            <p>If you did not request this, you can ignore this email.</p>
          </div>
        `;

    try {
      // Prefer Brevo's HTTP API in production: it sends over HTTPS (443),
      // which hosts like Render allow, unlike SMTP ports (25/465/587) that
      // are commonly blocked. Falls back to SMTP when no Brevo key is set
      // (handy for local development with Gmail).
      if (process.env.BREVO_API_KEY) {
        await this.sendViaBrevo(input.to, input.subject, text, html);
      } else {
        await this.sendViaSmtp(input.to, input.subject, text, html);
      }
    } catch (err) {
      // Surface the real reason in the logs (e.g. ETIMEDOUT = SMTP port
      // blocked by the host, EAUTH = bad credentials/app password, or a
      // Brevo 401/400) while keeping the client-facing message generic.
      this.logger.error(
        `Failed to send OTP email to ${input.to}`,
        err instanceof Error ? err.stack : String(err),
      );
      throw new InternalServerErrorException('Failed to send email OTP');
    }
  }

  private async sendViaSmtp(
    to: string,
    subject: string,
    text: string,
    html: string,
  ): Promise<void> {
    const { transporter, from } = this.getTransporter();
    await transporter.sendMail({ from, to, subject, text, html });
  }

  /**
   * Send through Brevo's transactional email HTTP API.
   * Docs: https://developers.brevo.com/reference/sendtransacemail
   * The sender address must be a verified sender (or verified domain) in
   * your Brevo account, otherwise Brevo rejects the request.
   */
  private async sendViaBrevo(
    to: string,
    subject: string,
    text: string,
    html: string,
  ): Promise<void> {
    const sender = this.getSender();
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': process.env.BREVO_API_KEY as string,
        'Content-Type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        sender: { name: sender.name, email: sender.address },
        to: [{ email: to }],
        subject,
        textContent: text,
        htmlContent: html,
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      throw new Error(`Brevo API ${res.status}: ${detail}`);
    }

    // Confirm acceptance in the logs (Brevo returns a messageId). If this
    // logs but no email arrives, the issue is delivery-side (unverified
    // sender, spam folder, or recipient), not the API call.
    const accepted = await res.text();
    this.logger.log(`Brevo accepted email to ${to}: ${accepted}`);
  }
}
