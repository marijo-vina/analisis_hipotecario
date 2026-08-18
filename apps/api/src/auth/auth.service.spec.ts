import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { MailService } from '../mail/mail.service';
import {
  ConflictException,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';

jest.mock('bcrypt');

describe('AuthService', () => {
  let service: AuthService;
  let prisma: PrismaService;
  let mailService: MailService;

  const mockPrismaService = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    verificationToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
  };

  const mockJwtService = {
    sign: jest.fn().mockReturnValue('mock-token'),
  };

  const mockMailService = {
    sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: MailService, useValue: mockMailService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prisma = module.get<PrismaService>(PrismaService);
    mailService = module.get<MailService>(MailService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('validateUser', () => {
    it('should return user if password matches and email is verified', async () => {
      const user = {
        id: '1',
        email: 'test@test.com',
        passwordHash: 'hashed',
        name: 'Test',
        role: 'ADMIN',
        isEmailVerified: true,
      };
      jest.spyOn(prisma.user, 'findUnique').mockResolvedValue(user as any);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.validateUser('test@test.com', 'password');
      expect(result).toEqual({
        id: '1',
        email: 'test@test.com',
        name: 'Test',
        role: 'ADMIN',
        isEmailVerified: true,
      });
    });

    it('should throw UnauthorizedException if email is not verified', async () => {
      const user = {
        id: '1',
        email: 'test@test.com',
        passwordHash: 'hashed',
        name: 'Test',
        role: 'ADVISOR',
        isEmailVerified: false,
      };
      jest.spyOn(prisma.user, 'findUnique').mockResolvedValue(user as any);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await expect(
        service.validateUser('test@test.com', 'password'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should return null if password does not match', async () => {
      const user = {
        id: '1',
        email: 'test@test.com',
        passwordHash: 'hashed',
        isEmailVerified: true,
      };
      jest.spyOn(prisma.user, 'findUnique').mockResolvedValue(user as any);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      const result = await service.validateUser('test@test.com', 'wrong');
      expect(result).toBeNull();
    });
  });

  describe('register', () => {
    it('should create user, generate token and send email', async () => {
      jest.spyOn(prisma.user, 'findUnique').mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashedPass');
      jest.spyOn(prisma.user, 'create').mockResolvedValue({
        id: 'u1',
        name: 'Nuevo Asesor',
        email: 'nuevo@test.com',
      } as any);

      const dto = {
        name: 'Nuevo Asesor',
        email: 'nuevo@test.com',
        password: 'password123',
      };
      const res = await service.register(dto);

      expect(prisma.user.create).toHaveBeenCalled();
      expect(prisma.verificationToken.create).toHaveBeenCalled();
      expect(mailService.sendVerificationEmail).toHaveBeenCalled();
      expect(res.userId).toBe('u1');
    });

    it('should throw ConflictException if user already exists', async () => {
      jest
        .spyOn(prisma.user, 'findUnique')
        .mockResolvedValue({ id: 'ex' } as any);

      const dto = {
        name: 'Existe',
        email: 'existe@test.com',
        password: 'password123',
      };
      await expect(service.register(dto)).rejects.toThrow(ConflictException);
    });
  });

  describe('verifyEmail', () => {
    it('should set isEmailVerified to true and delete token on valid token', async () => {
      const validToken = {
        id: 't1',
        email: 'test@test.com',
        token: 'token123',
        expiresAt: new Date(Date.now() + 100000),
      };
      jest
        .spyOn(prisma.verificationToken, 'findUnique')
        .mockResolvedValue(validToken as any);

      const res = await service.verifyEmail('token123');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { email: 'test@test.com' },
        data: { isEmailVerified: true },
      });
      expect(prisma.verificationToken.delete).toHaveBeenCalledWith({
        where: { id: 't1' },
      });
      expect(res.message).toContain('verificado con éxito');
    });

    it('should throw BadRequestException on expired token', async () => {
      const expiredToken = {
        id: 't2',
        email: 'test@test.com',
        token: 'exp123',
        expiresAt: new Date(Date.now() - 100000),
      };
      jest
        .spyOn(prisma.verificationToken, 'findUnique')
        .mockResolvedValue(expiredToken as any);

      await expect(service.verifyEmail('exp123')).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
