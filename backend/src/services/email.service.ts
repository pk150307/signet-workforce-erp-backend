import { config } from '../config';
import { logger } from '../utils/logger';

export interface SendEmailInput {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface EmailService {
  send(input: SendEmailInput): Promise<void>;
}

class ConsoleEmailService implements EmailService {
  async send(input: SendEmailInput): Promise<void> {
    logger.info('Email (console transport)', {
      to: input.to,
      subject: input.subject,
      preview: input.text.slice(0, 200),
    });
    if (!config.isProduction) {
      console.log(`[email] To: ${input.to}\nSubject: ${input.subject}\n${input.text}`);
    }
  }
}

let emailService: EmailService = new ConsoleEmailService();

export function setEmailService(service: EmailService): void {
  emailService = service;
}

export async function sendEmail(input: SendEmailInput): Promise<void> {
  if (!config.email.enabled) {
    logger.info('Email skipped (EMAIL_ENABLED=false)', { to: input.to, subject: input.subject });
    if (!config.isProduction) {
      console.log(`[email-disabled] To: ${input.to}\nSubject: ${input.subject}\n${input.text}`);
    }
    return;
  }

  await emailService.send({
    ...input,
    html: input.html ?? input.text.replace(/\n/g, '<br/>'),
  });
}

export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  await sendEmail({
    to,
    subject: 'Reset your Signet Workforce ERP password',
    text: [
      'You requested a password reset for your Signet Workforce ERP account.',
      '',
      `Reset your password: ${resetUrl}`,
      '',
      'This link expires in 30 minutes. If you did not request this, ignore this email.',
    ].join('\n'),
  });
}
