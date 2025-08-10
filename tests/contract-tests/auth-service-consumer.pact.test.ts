import { Pact } from '@pact-foundation/pact';
import { InteractionObject } from '@pact-foundation/pact';
import path from 'path';
import axios from 'axios';

const mockProvider = new Pact({
  consumer: 'admin-console',
  provider: 'auth-service',
  port: 1234, // Port for the mock server
  log: path.resolve(process.cwd(), 'pact-logs', 'mockserver-integration.log'),
  dir: path.resolve(process.cwd(), 'pacts'),
  spec: 2,
  logLevel: 'INFO',
});

describe('Auth Service Contract Tests', () => {
  beforeAll(async () => {
    await mockProvider.setup();
  });

  afterEach(async () => {
    await mockProvider.verify();
  });

  afterAll(async () => {
    await mockProvider.finalize();
  });

  describe('POST /auth/login', () => {
    it('should authenticate user with valid credentials', async () => {
      // Arrange
      const expectedResponse = {
        access_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        user: {
          id: 1,
          email: 'admin@example.com',
          name: 'Admin User',
          role: 'admin',
        },
        expires_in: '24h',
      };

      const interaction: InteractionObject = {
        state: 'user with valid credentials exists',
        uponReceiving: 'a login request with valid credentials',
        withRequest: {
          method: 'POST',
          path: '/auth/login',
          headers: {
            'Content-Type': 'application/json',
          },
          body: {
            email: 'admin@example.com',
            password: 'admin123',
          },
        },
        willRespondWith: {
          status: 201,
          headers: {
            'Content-Type': 'application/json',
          },
          body: expectedResponse,
        },
      };

      await mockProvider.addInteraction(interaction);

      // Act
      const response = await axios.post('http://localhost:1234/auth/login', {
        email: 'admin@example.com',
        password: 'admin123',
      });

      // Assert
      expect(response.status).toBe(201);
      expect(response.data).toMatchObject(expectedResponse);
      expect(response.data.access_token).toBeDefined();
      expect(response.data.user.id).toBe(1);
      expect(response.data.user.email).toBe('admin@example.com');
    });

    it('should reject login with invalid credentials', async () => {
      // Arrange
      const interaction: InteractionObject = {
        state: 'user with invalid credentials',
        uponReceiving: 'a login request with invalid credentials',
        withRequest: {
          method: 'POST',
          path: '/auth/login',
          headers: {
            'Content-Type': 'application/json',
          },
          body: {
            email: 'admin@example.com',
            password: 'wrongpassword',
          },
        },
        willRespondWith: {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
          },
          body: {
            statusCode: 401,
            message: 'Invalid credentials',
            error: 'Unauthorized',
          },
        },
      };

      await mockProvider.addInteraction(interaction);

      // Act & Assert
      try {
        await axios.post('http://localhost:1234/auth/login', {
          email: 'admin@example.com',
          password: 'wrongpassword',
        });
      } catch (error) {
        expect(error.response.status).toBe(401);
        expect(error.response.data.message).toBe('Invalid credentials');
      }
    });

    it('should reject login with missing email', async () => {
      // Arrange
      const interaction: InteractionObject = {
        state: 'login request with missing email',
        uponReceiving: 'a login request with missing email',
        withRequest: {
          method: 'POST',
          path: '/auth/login',
          headers: {
            'Content-Type': 'application/json',
          },
          body: {
            password: 'admin123',
          },
        },
        willRespondWith: {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
          },
          body: {
            statusCode: 400,
            message: ['email should not be empty', 'email must be an email'],
            error: 'Bad Request',
          },
        },
      };

      await mockProvider.addInteraction(interaction);

      // Act & Assert
      try {
        await axios.post('http://localhost:1234/auth/login', {
          password: 'admin123',
        });
      } catch (error) {
        expect(error.response.status).toBe(400);
        expect(error.response.data.message).toContain(
          'email should not be empty'
        );
      }
    });
  });

  describe('POST /auth/register', () => {
    it('should register new user with valid data', async () => {
      // Arrange
      const expectedResponse = {
        access_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        user: {
          id: 2,
          email: 'newuser@example.com',
          name: 'New User',
          role: 'user',
        },
        expires_in: '24h',
      };

      const interaction: InteractionObject = {
        state: 'new user registration',
        uponReceiving: 'a registration request with valid data',
        withRequest: {
          method: 'POST',
          path: '/auth/register',
          headers: {
            'Content-Type': 'application/json',
          },
          body: {
            email: 'newuser@example.com',
            password: 'password123',
            name: 'New User',
          },
        },
        willRespondWith: {
          status: 201,
          headers: {
            'Content-Type': 'application/json',
          },
          body: expectedResponse,
        },
      };

      await mockProvider.addInteraction(interaction);

      // Act
      const response = await axios.post('http://localhost:1234/auth/register', {
        email: 'newuser@example.com',
        password: 'password123',
        name: 'New User',
      });

      // Assert
      expect(response.status).toBe(201);
      expect(response.data).toMatchObject(expectedResponse);
      expect(response.data.user.role).toBe('user');
    });

    it('should reject registration with existing email', async () => {
      // Arrange
      const interaction: InteractionObject = {
        state: 'user with existing email',
        uponReceiving: 'a registration request with existing email',
        withRequest: {
          method: 'POST',
          path: '/auth/register',
          headers: {
            'Content-Type': 'application/json',
          },
          body: {
            email: 'admin@example.com',
            password: 'password123',
            name: 'Test User',
          },
        },
        willRespondWith: {
          status: 409,
          headers: {
            'Content-Type': 'application/json',
          },
          body: {
            statusCode: 409,
            message: 'User with this email already exists',
            error: 'Conflict',
          },
        },
      };

      await mockProvider.addInteraction(interaction);

      // Act & Assert
      try {
        await axios.post('http://localhost:1234/auth/register', {
          email: 'admin@example.com',
          password: 'password123',
          name: 'Test User',
        });
      } catch (error) {
        expect(error.response.status).toBe(409);
        expect(error.response.data.message).toBe(
          'User with this email already exists'
        );
      }
    });
  });

  describe('POST /auth/verify', () => {
    it('should verify valid JWT token', async () => {
      // Arrange
      const expectedResponse = {
        id: 1,
        email: 'admin@example.com',
        name: 'Admin User',
        role: 'admin',
      };

      const interaction: InteractionObject = {
        state: 'valid JWT token',
        uponReceiving: 'a token verification request with valid token',
        withRequest: {
          method: 'POST',
          path: '/auth/verify',
          headers: {
            'Content-Type': 'application/json',
          },
          body: {
            token: 'valid.jwt.token',
          },
        },
        willRespondWith: {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
          body: expectedResponse,
        },
      };

      await mockProvider.addInteraction(interaction);

      // Act
      const response = await axios.post('http://localhost:1234/auth/verify', {
        token: 'valid.jwt.token',
      });

      // Assert
      expect(response.status).toBe(200);
      expect(response.data).toMatchObject(expectedResponse);
      expect(response.data.email).toBe('admin@example.com');
    });

    it('should reject invalid JWT token', async () => {
      // Arrange
      const interaction: InteractionObject = {
        state: 'invalid JWT token',
        uponReceiving: 'a token verification request with invalid token',
        withRequest: {
          method: 'POST',
          path: '/auth/verify',
          headers: {
            'Content-Type': 'application/json',
          },
          body: {
            token: 'invalid.jwt.token',
          },
        },
        willRespondWith: {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
          },
          body: {
            statusCode: 401,
            message: 'Invalid token',
            error: 'Unauthorized',
          },
        },
      };

      await mockProvider.addInteraction(interaction);

      // Act & Assert
      try {
        await axios.post('http://localhost:1234/auth/verify', {
          token: 'invalid.jwt.token',
        });
      } catch (error) {
        expect(error.response.status).toBe(401);
        expect(error.response.data.message).toBe('Invalid token');
      }
    });
  });

  describe('GET /users', () => {
    it('should return users list for authenticated request', async () => {
      // Arrange
      const expectedResponse = [
        {
          id: 1,
          email: 'admin@example.com',
          name: 'Admin User',
          role: 'admin',
        },
        {
          id: 2,
          email: 'user@example.com',
          name: 'Regular User',
          role: 'user',
        },
      ];

      const interaction: InteractionObject = {
        state: 'authenticated user requesting users list',
        uponReceiving: 'a users list request with valid token',
        withRequest: {
          method: 'GET',
          path: '/users',
          headers: {
            Authorization: 'Bearer valid.jwt.token',
          },
        },
        willRespondWith: {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
          body: expectedResponse,
        },
      };

      await mockProvider.addInteraction(interaction);

      // Act
      const response = await axios.get('http://localhost:1234/users', {
        headers: {
          Authorization: 'Bearer valid.jwt.token',
        },
      });

      // Assert
      expect(response.status).toBe(200);
      expect(response.data).toHaveLength(2);
      expect(response.data[0]).toHaveProperty('email');
      expect(response.data[0]).not.toHaveProperty('password');
    });

    it('should reject unauthenticated request', async () => {
      // Arrange
      const interaction: InteractionObject = {
        state: 'unauthenticated user requesting users list',
        uponReceiving: 'a users list request without token',
        withRequest: {
          method: 'GET',
          path: '/users',
        },
        willRespondWith: {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
          },
          body: {
            statusCode: 401,
            message: 'Unauthorized',
            error: 'Unauthorized',
          },
        },
      };

      await mockProvider.addInteraction(interaction);

      // Act & Assert
      try {
        await axios.get('http://localhost:1234/users');
      } catch (error) {
        expect(error.response.status).toBe(401);
        expect(error.response.data.message).toBe('Unauthorized');
      }
    });
  });
});
