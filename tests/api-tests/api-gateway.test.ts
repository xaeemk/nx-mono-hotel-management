import request from 'supertest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AppModule } from '../../apps/api-gateway/src/app/app.module';
import { AuthService } from '../../apps/api-gateway/src/auth/auth.service';
import {
  LoginDto,
  RegisterDto,
} from '../../apps/api-gateway/src/auth/dto/auth.dto';

describe('API Gateway E2E Tests', () => {
  let app: INestApplication;
  let authService: AuthService;
  let jwtService: JwtService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    authService = moduleFixture.get<AuthService>(AuthService);
    jwtService = moduleFixture.get<JwtService>(JwtService);

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('/health (GET)', () => {
    it('should return health check status', async () => {
      const response = await request(app.getHttpServer())
        .get('/health')
        .expect(200);

      expect(response.body).toEqual({
        status: 'ok',
        info: {
          database: { status: 'up' },
          redis: { status: 'up' },
        },
        error: {},
        details: {
          database: { status: 'up' },
          redis: { status: 'up' },
        },
      });
    });
  });

  describe('/auth/login (POST)', () => {
    const loginDto: LoginDto = {
      email: 'admin@example.com',
      password: 'admin123',
    };

    it('should login with valid credentials', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send(loginDto)
        .expect(201);

      expect(response.body).toEqual({
        access_token: expect.any(String),
        user: {
          id: expect.any(Number),
          email: loginDto.email,
          name: expect.any(String),
          role: expect.any(String),
        },
        expires_in: '24h',
      });

      // Validate JWT token
      const decoded = jwtService.verify(response.body.access_token);
      expect(decoded.email).toBe(loginDto.email);
      expect(decoded.sub).toBe(response.body.user.id);
    });

    it('should return 401 for invalid credentials', async () => {
      const invalidLoginDto: LoginDto = {
        email: 'admin@example.com',
        password: 'wrongpassword',
      };

      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send(invalidLoginDto)
        .expect(401);

      expect(response.body.message).toBe('Invalid credentials');
    });

    it('should return 400 for missing email', async () => {
      const incompleteLoginDto = {
        password: 'admin123',
      };

      await request(app.getHttpServer())
        .post('/auth/login')
        .send(incompleteLoginDto)
        .expect(400);
    });

    it('should return 400 for invalid email format', async () => {
      const invalidEmailDto = {
        email: 'invalid-email',
        password: 'admin123',
      };

      await request(app.getHttpServer())
        .post('/auth/login')
        .send(invalidEmailDto)
        .expect(400);
    });
  });

  describe('/auth/register (POST)', () => {
    const registerDto: RegisterDto = {
      email: 'newuser@example.com',
      password: 'password123',
      name: 'New User',
    };

    it('should register a new user', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send(registerDto)
        .expect(201);

      expect(response.body).toEqual({
        access_token: expect.any(String),
        user: {
          id: expect.any(Number),
          email: registerDto.email,
          name: registerDto.name,
          role: 'user',
        },
        expires_in: '24h',
      });

      // Validate JWT token
      const decoded = jwtService.verify(response.body.access_token);
      expect(decoded.email).toBe(registerDto.email);
    });

    it('should return 409 for existing email', async () => {
      const existingUserDto: RegisterDto = {
        email: 'admin@example.com', // This email already exists
        password: 'password123',
        name: 'Test User',
      };

      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send(existingUserDto)
        .expect(409);

      expect(response.body.message).toBe('User with this email already exists');
    });

    it('should return 400 for invalid registration data', async () => {
      const invalidRegisterDto = {
        email: 'invalid-email',
        password: '123', // Too short
        name: '',
      };

      await request(app.getHttpServer())
        .post('/auth/register')
        .send(invalidRegisterDto)
        .expect(400);
    });
  });

  describe('/auth/verify (POST)', () => {
    let validToken: string;

    beforeAll(async () => {
      // Get a valid token first
      const loginDto: LoginDto = {
        email: 'admin@example.com',
        password: 'admin123',
      };

      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send(loginDto);

      validToken = loginResponse.body.access_token;
    });

    it('should verify valid token', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/verify')
        .send({ token: validToken })
        .expect(200);

      expect(response.body).toEqual({
        id: expect.any(Number),
        email: 'admin@example.com',
        name: expect.any(String),
        role: expect.any(String),
      });
    });

    it('should return 401 for invalid token', async () => {
      const invalidToken = 'invalid.jwt.token';

      const response = await request(app.getHttpServer())
        .post('/auth/verify')
        .send({ token: invalidToken })
        .expect(401);

      expect(response.body.message).toBe('Invalid token');
    });

    it('should return 401 for expired token', async () => {
      // Create an expired token
      const expiredToken = jwtService.sign(
        { sub: 1, email: 'test@example.com' },
        { expiresIn: '0s' }
      );

      await new Promise((resolve) => setTimeout(resolve, 1000));

      const response = await request(app.getHttpServer())
        .post('/auth/verify')
        .send({ token: expiredToken })
        .expect(401);

      expect(response.body.message).toBe('Invalid token');
    });
  });

  describe('Protected routes', () => {
    let authToken: string;

    beforeEach(async () => {
      // Get authentication token
      const loginDto: LoginDto = {
        email: 'admin@example.com',
        password: 'admin123',
      };

      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send(loginDto);

      authToken = loginResponse.body.access_token;
    });

    describe('/users (GET)', () => {
      it('should return users list for authenticated request', async () => {
        const response = await request(app.getHttpServer())
          .get('/users')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(Array.isArray(response.body)).toBe(true);
        if (response.body.length > 0) {
          expect(response.body[0]).toHaveProperty('id');
          expect(response.body[0]).toHaveProperty('email');
          expect(response.body[0]).not.toHaveProperty('password');
        }
      });

      it('should return 401 for unauthenticated request', async () => {
        await request(app.getHttpServer()).get('/users').expect(401);
      });

      it('should return 401 for invalid token', async () => {
        await request(app.getHttpServer())
          .get('/users')
          .set('Authorization', 'Bearer invalid-token')
          .expect(401);
      });
    });
  });

  describe('GraphQL endpoint', () => {
    let authToken: string;

    beforeEach(async () => {
      const loginDto: LoginDto = {
        email: 'admin@example.com',
        password: 'admin123',
      };

      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send(loginDto);

      authToken = loginResponse.body.access_token;
    });

    it('should handle GraphQL query with authentication', async () => {
      const query = `
        query {
          users {
            id
            email
            name
            role
          }
        }
      `;

      const response = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ query })
        .expect(200);

      expect(response.body.data).toBeDefined();
      expect(response.body.data.users).toBeDefined();
    });

    it('should return error for unauthenticated GraphQL request', async () => {
      const query = `
        query {
          users {
            id
            email
          }
        }
      `;

      const response = await request(app.getHttpServer())
        .post('/graphql')
        .send({ query })
        .expect(200);

      expect(response.body.errors).toBeDefined();
      expect(response.body.errors[0].message).toContain('Unauthorized');
    });

    it('should handle GraphQL mutation with authentication', async () => {
      const mutation = `
        mutation {
          updateUser(id: 1, name: "Updated Name") {
            id
            name
            email
          }
        }
      `;

      const response = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ query: mutation })
        .expect(200);

      expect(response.body.data).toBeDefined();
    });
  });

  describe('Error handling', () => {
    it('should handle non-existent endpoints', async () => {
      await request(app.getHttpServer())
        .get('/non-existent-endpoint')
        .expect(404);
    });

    it('should handle malformed JSON', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .set('Content-Type', 'application/json')
        .send('{ invalid json }')
        .expect(400);
    });

    it('should handle large payloads gracefully', async () => {
      const largePayload = {
        email: 'test@example.com',
        password: 'a'.repeat(10000),
        name: 'Test User',
      };

      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send(largePayload);

      expect([400, 413]).toContain(response.status);
    });
  });

  describe('Rate limiting', () => {
    it('should handle multiple requests within limits', async () => {
      const loginDto: LoginDto = {
        email: 'admin@example.com',
        password: 'admin123',
      };

      // Make multiple requests within rate limit
      for (let i = 0; i < 5; i++) {
        await request(app.getHttpServer())
          .post('/auth/login')
          .send(loginDto)
          .expect(201);
      }
    });

    it('should apply rate limiting for excessive requests', async () => {
      const loginDto: LoginDto = {
        email: 'admin@example.com',
        password: 'wrongpassword',
      };

      // This test might need adjustment based on your rate limiting configuration
      // Make requests rapidly to trigger rate limiting
      const requests = [];
      for (let i = 0; i < 100; i++) {
        requests.push(
          request(app.getHttpServer()).post('/auth/login').send(loginDto)
        );
      }

      const responses = await Promise.all(requests);
      const rateLimitedResponses = responses.filter((r) => r.status === 429);

      // At least some requests should be rate limited
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    });
  });

  describe('CORS handling', () => {
    it('should include proper CORS headers', async () => {
      const response = await request(app.getHttpServer())
        .options('/auth/login')
        .set('Origin', 'https://example.com')
        .set('Access-Control-Request-Method', 'POST');

      expect(response.headers['access-control-allow-origin']).toBeDefined();
      expect(response.headers['access-control-allow-methods']).toBeDefined();
    });
  });
});
