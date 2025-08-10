# API Gateway

A comprehensive NestJS-based API Gateway that provides both REST and GraphQL endpoints with JWT authentication, rate limiting, and comprehensive documentation.

## 🚀 Features

- **Dual API Support**: Both REST and GraphQL endpoints
- **JWT Authentication**: Secure token-based authentication
- **Rate Limiting**: Multi-tier throttling protection
- **Auto-Generated Documentation**: Swagger/OpenAPI for REST, GraphQL SDL
- **Health Checks**: Kubernetes-ready health endpoints
- **Security**: Helmet, CORS, compression middleware
- **Postman Collection**: Ready-to-import API collection

## 📋 Prerequisites

- Node.js 18+
- npm or yarn
- NX workspace

## ⚡ Quick Start

1. **Install dependencies**:

   ```bash
   npm install
   ```

2. **Set up environment variables**:

   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Start the development server**:

   ```bash
   npm run gateway:dev
   ```

4. **Access the services**:
   - API Gateway: http://localhost:3000
   - Swagger Documentation: http://localhost:3000/docs
   - GraphQL Playground: http://localhost:3000/graphql

## 🏗️ Architecture

### REST API Endpoints

#### Authentication (`/api/auth`)

- `POST /api/auth/login` - User login
- `POST /api/auth/register` - User registration
- `GET /api/auth/profile` - Get user profile (protected)
- `POST /api/auth/verify` - Verify JWT token

#### Users (`/api/users`)

- `GET /api/users` - Get all users (protected)
- `GET /api/users/:id` - Get user by ID (protected)
- `POST /api/users` - Create new user (protected)
- `PUT /api/users/:id` - Update user (protected)
- `DELETE /api/users/:id` - Delete user (protected)

#### Health Checks

- `GET /` - Root health check
- `GET /health` - Detailed health status
- `GET /health/ready` - Readiness probe
- `GET /health/live` - Liveness probe

### GraphQL API

#### Queries

- `me` - Get current user profile (protected)
- `users` - Get all users (protected)
- `user(id: Int!)` - Get user by ID (protected)

#### Mutations

- `login(loginInput: LoginDto!)` - User login
- `register(registerInput: RegisterDto!)` - User registration
- `verifyToken(token: String!)` - Verify JWT token
- `createUser(input: CreateUserInput!)` - Create user (protected)
- `updateUser(id: Int!, input: UpdateUserInput!)` - Update user (protected)
- `deleteUser(id: Int!)` - Delete user (protected)

## 🔒 Authentication

### JWT Token Structure

```json
{
  "email": "user@example.com",
  "sub": 1,
  "role": "user",
  "iat": 1640995200,
  "exp": 1641081600
}
```

### Default Users

- **Admin**: `admin@example.com` / `admin123`
- **User**: `user@example.com` / `user123`

### Using Authentication

#### REST API

```bash
# 1. Login to get token
curl -X POST http://localhost:3000/api/auth/login \\
  -H "Content-Type: application/json" \\
  -d '{"email":"admin@example.com","password":"admin123"}'

# 2. Use token in subsequent requests
curl -X GET http://localhost:3000/api/users \\
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

#### GraphQL

```graphql
# 1. Login mutation
mutation {
  login(loginInput: { email: "admin@example.com", password: "admin123" }) {
    access_token
    user {
      id
      name
      email
      role
    }
  }
}

# 2. Use token in headers for protected queries
# Header: {"Authorization": "Bearer YOUR_JWT_TOKEN"}
query {
  me {
    id
    name
    email
    role
  }
}
```

## 🛡️ Rate Limiting

Multi-tier rate limiting is implemented:

- **Short**: 3 requests per second
- **Medium**: 20 requests per 10 seconds
- **Long**: 100 requests per minute

Rate limits apply globally to all endpoints.

## 📖 Documentation

### Swagger/OpenAPI

- **URL**: http://localhost:3000/docs
- **Features**: Interactive API explorer, authentication support
- **Export**: Available in JSON/YAML formats

### GraphQL Schema

- **URL**: http://localhost:3000/graphql
- **Features**: Interactive playground, schema exploration
- **SDL**: Auto-generated schema definition

### Postman Collection

Import the generated collection: `docs/api-gateway-postman-collection.json`

**Features**:

- Pre-configured requests for all endpoints
- Automatic token management
- Environment variables
- Test scripts for token extraction

## 🔧 Configuration

### Environment Variables

```env
# Server
PORT=3000
NODE_ENV=development

# JWT
JWT_SECRET=your-super-secret-jwt-key
JWT_EXPIRES_IN=24h

# CORS
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:4200

# Rate Limiting
THROTTLE_TTL=60
THROTTLE_LIMIT=10
```

### Development Scripts

```bash
# Development
npm run gateway:dev       # Start development server
npm run gateway:build     # Build for production
npm run gateway:start     # Start production server

# Documentation
node scripts/generate-postman-collection.js  # Generate Postman collection
```

## 🏥 Health Monitoring

### Kubernetes Health Checks

```yaml
# Deployment example
spec:
  containers:
    - name: api-gateway
      livenessProbe:
        httpGet:
          path: /health/live
          port: 3000
        initialDelaySeconds: 30
        periodSeconds: 10
      readinessProbe:
        httpGet:
          path: /health/ready
          port: 3000
        initialDelaySeconds: 5
        periodSeconds: 5
```

### Health Response Format

```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "uptime": 1234567,
  "memory": {
    "rss": 50331648,
    "heapTotal": 20971520,
    "heapUsed": 15728640,
    "external": 1048576
  },
  "version": "v18.17.0"
}
```

## 🚀 Deployment

### Docker

```dockerfile
FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY dist/apps/api-gateway ./
EXPOSE 3000

CMD ["node", "main.js"]
```

### Build Commands

```bash
# Build the application
npm run gateway:build

# Production build location
./dist/apps/api-gateway/
```

## 🧪 Testing

### Manual Testing

1. **Health Check**:

   ```bash
   curl http://localhost:3000/health
   ```

2. **Authentication Flow**:

   ```bash
   # Login
   TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \\
     -H "Content-Type: application/json" \\
     -d '{"email":"admin@example.com","password":"admin123"}' \\
     | jq -r '.access_token')

   # Use token
   curl -H "Authorization: Bearer $TOKEN" \\
     http://localhost:3000/api/users
   ```

3. **GraphQL Testing**:
   ```bash
   curl -X POST http://localhost:3000/graphql \\
     -H "Content-Type: application/json" \\
     -d '{"query":"query { users { id name email } }"}'
   ```

### Using Postman

1. Import `docs/api-gateway-postman-collection.json`
2. Run the "Login" request first
3. Token is automatically set for subsequent requests
4. Test all endpoints with proper authentication

## 🔍 Monitoring & Logging

### Request Logging

All requests are logged with:

- HTTP method and path
- Response status and time
- User information (if authenticated)
- Error details (if applicable)

### GraphQL Logging

- Query/mutation details
- Execution time
- Error stack traces
- User context

## 🛠️ Customization

### Adding New Endpoints

1. **Create a new module**:

   ```bash
   mkdir src/my-feature
   ```

2. **Add to main module**:

   ```typescript
   // app.module.ts
   import { MyFeatureModule } from '../my-feature/my-feature.module';

   @Module({
     imports: [
       // ... other modules
       MyFeatureModule,
     ],
   })
   ```

3. **Update documentation**:
   - Add Swagger decorators for REST
   - Add GraphQL decorators for GraphQL
   - Regenerate Postman collection

### Custom Authentication

Extend the auth system by:

1. Modifying `AuthService`
2. Adding new strategies in `strategies/`
3. Creating custom guards in `guards/`

## 🚦 Status Codes

### REST API

- `200` - Success
- `201` - Created
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `409` - Conflict
- `422` - Validation Error
- `429` - Rate Limited
- `500` - Internal Server Error

### GraphQL

- Success: Data returned in `data` field
- Errors: Details in `errors` array
- HTTP status always 200 (unless server error)

## 🤝 Contributing

1. Follow NestJS conventions
2. Add appropriate decorators for documentation
3. Include error handling
4. Add rate limiting to new endpoints
5. Update Postman collection
6. Write tests for new functionality

## 📞 Support

For issues and questions:

- Check the logs for error details
- Verify environment configuration
- Test with Postman collection
- Review documentation endpoints

## 📄 License

MIT License - See LICENSE file for details.
