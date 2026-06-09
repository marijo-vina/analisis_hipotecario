import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

jest.mock('bcrypt');

describe('AuthService', () => {
  let service: AuthService;
  let prisma: PrismaService;
  let jwt: JwtService;

  const mockPrismaService = {
    user: {
      findUnique: jest.fn(),
    },
  };

  const mockJwtService = {
    sign: jest.fn().mockReturnValue('mock-token'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: JwtService, useValue: mockJwtService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prisma = module.get<PrismaService>(PrismaService);
    jwt = module.get<JwtService>(JwtService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('validateUser', () => {
    it('should return user if password matches', async () => {
      const user = { id: '1', email: 'test@test.com', passwordHash: 'hashed', name: 'Test', role: 'ADMIN' };
      jest.spyOn(prisma.user, 'findUnique').mockResolvedValue(user as any);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.validateUser('test@test.com', 'password');
      expect(result).toEqual({ id: '1', email: 'test@test.com', name: 'Test', role: 'ADMIN' });
    });

    it('should return null if password does not match', async () => {
      const user = { id: '1', email: 'test@test.com', passwordHash: 'hashed' };
      jest.spyOn(prisma.user, 'findUnique').mockResolvedValue(user as any);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      const result = await service.validateUser('test@test.com', 'wrong');
      expect(result).toBeNull();
    });

    it('should return null if user not found', async () => {
      jest.spyOn(prisma.user, 'findUnique').mockResolvedValue(null);

      const result = await service.validateUser('none@test.com', 'any');
      expect(result).toBeNull();
    });
  });

  describe('login', () => {
    it('should return access_token and user info', async () => {
      const user = { id: '1', email: 'test@test.com', name: 'Test', role: 'ADMIN' };
      const result = await service.login(user);

      expect(result).toEqual({
        access_token: 'mock-token',
        user: { id: '1', email: 'test@test.com', name: 'Test', role: 'ADMIN' },
      });
      expect(jwt.sign).toHaveBeenCalled();
    });
  });
});
