import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException, ConflictException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { LoginDto, RegisterDto } from './dto/auth.dto';

describe('AuthService', () => {
  let service: AuthService;
  let jwtService: JwtService;

  const mockJwtService = {
    sign: jest.fn(),
    verify: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jwtService = module.get<JwtService>(JwtService);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('validateUser', () => {
    it('should return user data without password for valid credentials', async () => {
      const email = 'admin@example.com';
      const password = 'admin123';

      jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);

      const result = await service.validateUser(email, password);

      expect(result).toEqual({
        id: 1,
        email: 'admin@example.com',
        name: 'Admin User',
        role: 'admin',
      });
      expect(bcrypt.compare).toHaveBeenCalledWith(password, expect.any(String));
    });

    it('should return null for invalid email', async () => {
      const email = 'nonexistent@example.com';
      const password = 'admin123';

      const result = await service.validateUser(email, password);

      expect(result).toBeNull();
    });

    it('should return null for invalid password', async () => {
      const email = 'admin@example.com';
      const password = 'wrongpassword';

      jest.spyOn(bcrypt, 'compare').mockResolvedValue(false as never);

      const result = await service.validateUser(email, password);

      expect(result).toBeNull();
    });
  });

  describe('login', () => {
    const loginDto: LoginDto = {
      email: 'admin@example.com',
      password: 'admin123',
    };

    it('should return access token and user data for valid credentials', async () => {
      const mockToken = 'mock-jwt-token';
      const mockUser = {
        id: 1,
        email: 'admin@example.com',
        name: 'Admin User',
        role: 'admin',
      };

      jest.spyOn(service, 'validateUser').mockResolvedValue(mockUser);
      mockJwtService.sign.mockReturnValue(mockToken);

      const result = await service.login(loginDto);

      expect(result).toEqual({
        access_token: mockToken,
        user: mockUser,
        expires_in: '24h',
      });
      expect(mockJwtService.sign).toHaveBeenCalledWith({
        email: mockUser.email,
        sub: mockUser.id,
        role: mockUser.role,
      });
    });

    it('should throw UnauthorizedException for invalid credentials', async () => {
      jest.spyOn(service, 'validateUser').mockResolvedValue(null);

      await expect(service.login(loginDto)).rejects.toThrow(
        new UnauthorizedException('Invalid credentials')
      );
    });
  });

  describe('register', () => {
    const registerDto: RegisterDto = {
      email: 'newuser@example.com',
      password: 'password123',
      name: 'New User',
    };

    it('should create new user and return access token', async () => {
      const mockToken = 'mock-jwt-token';
      const hashedPassword = 'hashed-password';

      jest.spyOn(bcrypt, 'hash').mockResolvedValue(hashedPassword as never);
      mockJwtService.sign.mockReturnValue(mockToken);

      const result = await service.register(registerDto);

      expect(result).toEqual({
        access_token: mockToken,
        user: {
          id: expect.any(Number),
          email: registerDto.email,
          name: registerDto.name,
          role: 'user',
        },
        expires_in: '24h',
      });
      expect(bcrypt.hash).toHaveBeenCalledWith(registerDto.password, 10);
    });

    it('should throw ConflictException if user already exists', async () => {
      const existingUserDto: RegisterDto = {
        email: 'admin@example.com', // This email already exists in mockUsers
        password: 'password123',
        name: 'Admin User',
      };

      await expect(service.register(existingUserDto)).rejects.toThrow(
        new ConflictException('User with this email already exists')
      );
    });
  });

  describe('verifyToken', () => {
    const mockToken = 'mock-jwt-token';

    it('should return user data for valid token', async () => {
      const mockDecoded = { sub: 1, email: 'admin@example.com', role: 'admin' };
      mockJwtService.verify.mockReturnValue(mockDecoded);

      const result = await service.verifyToken(mockToken);

      expect(result).toEqual({
        id: 1,
        email: 'admin@example.com',
        name: 'Admin User',
        role: 'admin',
      });
      expect(mockJwtService.verify).toHaveBeenCalledWith(mockToken);
    });

    it('should throw UnauthorizedException for invalid token', async () => {
      mockJwtService.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      await expect(service.verifyToken(mockToken)).rejects.toThrow(
        new UnauthorizedException('Invalid token')
      );
    });

    it('should throw UnauthorizedException if user not found', async () => {
      const mockDecoded = {
        sub: 999,
        email: 'nonexistent@example.com',
        role: 'user',
      };
      mockJwtService.verify.mockReturnValue(mockDecoded);

      await expect(service.verifyToken(mockToken)).rejects.toThrow(
        new UnauthorizedException('User not found')
      );
    });
  });
});
