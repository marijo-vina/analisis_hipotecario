import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor(private configService: ConfigService) {
    const host = this.configService.get<string>('SMTP_HOST');
    const port = this.configService.get<number>('SMTP_PORT', 587);
    const user = this.configService.get<string>('SMTP_USER');
    const pass = this.configService.get<string>('SMTP_PASS');

    if (host && user && pass) {
      this.transporter = nodemailer.createTransport({
        host,
        port: Number(port),
        secure: Number(port) === 465,
        auth: { user, pass },
      });
      this.logger.log(`SMTP Mailer initialized with host ${host}`);
    } else {
      this.logger.warn(
        'SMTP credentials not fully configured (SMTP_HOST, SMTP_USER, SMTP_PASS). Verification links will be logged to console in dev mode.',
      );
    }
  }

  async sendVerificationEmail(email: string, token: string): Promise<void> {
    const baseUrl = this.configService.get<string>('APP_URL', 'http://localhost:3000');
    const verificationUrl = `${baseUrl}/verify-email?token=${token}`;
    const mailFrom = this.configService.get<string>(
      'MAIL_FROM',
      '"Gestión Financiera" <no-reply@gestionfinanciera.com>',
    );

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
        <h2 style="color: #1a365d; text-align: center;">Confirmación de Cuenta — Operaciones Hipotecarias</h2>
        <p>Hola,</p>
        <p>Has registrado una nueva cuenta en la plataforma de Análisis Hipotecario de <strong>Gestión Financiera</strong>.</p>
        <p>Por favor confirma tu dirección de correo electrónico y activa tu cuenta haciendo clic en el siguiente botón:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${verificationUrl}" style="background-color: #2563eb; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Confirmar mi cuenta</a>
        </div>
        <p style="font-size: 13px; color: #666666;">O copia y pega este enlace en tu navegador:</p>
        <p style="font-size: 13px; color: #2563eb; word-break: break-all;">${verificationUrl}</p>
        <hr style="border: none; border-top: 1px solid #eeeeee; margin: 20px 0;" />
        <p style="font-size: 12px; color: #999999; text-align: center;">Este enlace vencerá en 24 horas. Si no solicitaste esta cuenta, puedes ignorar este mensaje.</p>
      </div>
    `;

    if (this.transporter) {
      try {
        await this.transporter.sendMail({
          from: mailFrom,
          to: email,
          subject: 'Confirma tu correo electrónico — Operaciones Hipotecarias',
          html: htmlContent,
        });
        this.logger.log(`Verification email sent to ${email}`);
      } catch (error) {
        this.logger.error(`Failed to send verification email to ${email}`, error);
        this.logger.log(`[DEV FALLBACK VERIFICATION LINK] for ${email}: ${verificationUrl}`);
      }
    } else {
      this.logger.log(`[DEV VERIFICATION LINK] for ${email}: ${verificationUrl}`);
    }
  }
}
