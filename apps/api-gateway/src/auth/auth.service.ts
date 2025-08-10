import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { LoginDto, RegisterDto } from './dto/auth.dto';

// Mock user data - replace with actual database integration
const mockUsers = [
  {
    id: 1,
    email: 'admin@example.com',
    password: '$2a$10$8qvF7J7wNJ7QGw.PnGPpgeUZqvZbFoHvI8mXlM1iGVl3w.qbZJ1AC', // 'admin123'
    name: 'Admin User',
    role: 'admin',
  },
  {
    id: 2,
    email: 'user@example.com',
    password: '$2a$10$8qvF7J7wNJ7QGw.PnGPpgeUZqvZbFoHvI8mXlM1iGVl3w.qbZJ1AC', // 'user123'
    name: 'Regular User',
    role: 'user',
  },
];

@Injectable()
export class AuthService {
  constructor(private readonly jwtService: JwtService) {}

  async validateUser(email: string, password: string): Promise<any> {
    const user = mockUsers.find((u) => u.email === email);
    if (user && (await bcrypt.compare(password, user.password))) {
      const { password: _, ...result } = user;
      return result;
    }
    return null;
  }

  async login(loginDto: LoginDto) {
    const user = await this.validateUser(loginDto.email, loginDto.password);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload = {
      email: user.email,
      sub: user.id,
      role: user.role,
    };

    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      expires_in: '24h',
    };
  }

  async register(registerDto: RegisterDto) {
    // Check if user already exists
    const existingUser = mockUsers.find((u) => u.email === registerDto.email);
    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(registerDto.password, 10);

    // Create new user (in real app, save to database)
    const newUser = {
      id: mockUsers.length + 1,
      email: registerDto.email,
      password: hashedPassword,
      name: registerDto.name,
      role: 'user',
    };

    mockUsers.push(newUser);

    const payload = {
      email: newUser.email,
      sub: newUser.id,
      role: newUser.role,
    };

    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: newUser.id,
        email: newUser.email,
        name: newUser.name,
        role: newUser.role,
      },
      expires_in: '24h',
    };
  }

  async verifyToken(token: string) {
    try {
      const decoded = this.jwtService.verify(token);
      const user = mockUsers.find((u) => u.id === decoded.sub);
      if (user) {
        const { password: _, ...userWithoutPassword } = user;
        return userWithoutPassword;
      }
      throw new UnauthorizedException('User not found');
    } catch (error) {
      throw new UnauthorizedException('Invalid token');
    }
  }
}
