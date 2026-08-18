import {
  Injectable,
  ConflictException,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { RegisterDto } from './dto/register.dto';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private mailService: MailService,
  ) {}

  async validateUser(email: string, pass: string): Promise<any> {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      return null;
    }

    const isValidPassword = await bcrypt.compare(pass, user.passwordHash);
    if (!isValidPassword) {
      return null;
    }

    if (!user.isEmailVerified) {
      throw new UnauthorizedException(
        'Debes confirmar tu correo electrónico antes de ingresar. Revisa tu bandeja de entrada.',
      );
    }

    const { passwordHash, ...result } = user;
    return result;
  }

  async login(user: any) {
    const payload = { email: user.email, sub: user.id, role: user.role };
    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    };
  }

  async register(registerDto: RegisterDto) {
    const { name, email, password } = registerDto;
    const normalizedEmail = email.trim().toLowerCase();

    const existingUser = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      throw new ConflictException('El correo electrónico ya se encuentra registrado.');
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await this.prisma.user.create({
      data: {
        name: name.trim(),
        email: normalizedEmail,
        passwordHash,
        isEmailVerified: false,
      },
    });

    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 horas

    await this.prisma.verificationToken.create({
      data: {
        email: normalizedEmail,
        token,
        expiresAt,
      },
    });

    await this.mailService.sendVerificationEmail(normalizedEmail, token);

    return {
      message:
        'Usuario registrado correctamente. Por favor revisa tu correo electrónico para confirmar tu cuenta.',
      userId: user.id,
    };
  }

  async verifyEmail(token: string) {
    if (!token) {
      throw new BadRequestException('Token de verificación no proporcionado.');
    }

    const verificationToken = await this.prisma.verificationToken.findUnique({
      where: { token },
    });

    if (!verificationToken) {
      throw new BadRequestException('El enlace de verificación es inválido o ya fue utilizado.');
    }

    if (verificationToken.expiresAt < new Date()) {
      await this.prisma.verificationToken.delete({
        where: { id: verificationToken.id },
      });
      throw new BadRequestException(
        'El enlace de verificación ha expirado. Por favor solicita un nuevo correo de confirmación.',
      );
    }

    await this.prisma.user.update({
      where: { email: verificationToken.email },
      data: { isEmailVerified: true },
    });

    await this.prisma.verificationToken.delete({
      where: { id: verificationToken.id },
    });

    return {
      message: 'Tu correo ha sido verificado con éxito. Ya puedes iniciar sesión.',
    };
  }

  async resendVerification(email: string) {
    if (!email) {
      throw new BadRequestException('El correo electrónico es obligatorio.');
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (user && !user.isEmailVerified) {
      await this.prisma.verificationToken.deleteMany({
        where: { email: normalizedEmail },
      });

      const token = randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      await this.prisma.verificationToken.create({
        data: {
          email: normalizedEmail,
          token,
          expiresAt,
        },
      });

      await this.mailService.sendVerificationEmail(normalizedEmail, token);
    }

    return {
      message:
        'Si la cuenta existe y requiere verificación, se ha enviado un nuevo correo de confirmación.',
    };
  }
}
