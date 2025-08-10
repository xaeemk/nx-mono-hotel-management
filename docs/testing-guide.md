# Comprehensive Testing Suite Guide

This guide covers the complete testing strategy implemented in our NX monorepo, including Jest unit tests, Supertest API tests, Cypress E2E tests, k6 load tests, Stryker mutation tests, and Pact contract tests.

## Table of Contents

1. [Overview](#overview)
2. [Test Types](#test-types)
3. [Quick Start](#quick-start)
4. [Running Individual Test Suites](#running-individual-test-suites)
5. [Test Configuration](#test-configuration)
6. [CI/CD Integration](#cicd-integration)
7. [Best Practices](#best-practices)
8. [Troubleshooting](#troubleshooting)

## Overview

Our testing strategy implements multiple layers of testing to ensure code quality, reliability, and performance:

- **Unit Tests**: Fast, isolated tests for individual components and functions
- **API Tests**: Integration tests for RESTful and GraphQL endpoints
- **Contract Tests**: API contract validation between services
- **E2E Tests**: Full user journey testing on dashboard applications
- **Load Tests**: Performance and scalability testing
- **Mutation Tests**: Test quality assessment through code mutation

## Test Types

### 1. Unit Tests (Jest)

**Location**: `apps/*/src/**/*.spec.ts`, `libs/*/src/**/*.spec.ts`
**Framework**: Jest with TypeScript support
**Purpose**: Test individual functions, classes, and components in isolation

**Features**:

- Comprehensive mocking capabilities
- Code coverage reporting
- Snapshot testing support
- Async/await testing
- NestJS testing utilities

**Example**:

```typescript
describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [AuthService, mockJwtService],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should authenticate user with valid credentials', async () => {
    const result = await service.login({
      email: 'admin@example.com',
      password: 'admin123',
    });

    expect(result).toHaveProperty('access_token');
    expect(result.user.email).toBe('admin@example.com');
  });
});
```

### 2. API Tests (Supertest)

**Location**: `tests/api-tests/**/*.test.ts`
**Framework**: Supertest with Jest
**Purpose**: Test HTTP endpoints, authentication, and API contracts

**Features**:

- Full HTTP request/response testing
- Authentication flow testing
- Error handling validation
- GraphQL endpoint testing
- Rate limiting verification

**Example**:

```typescript
describe('POST /auth/login', () => {
  it('should login with valid credentials', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'admin@example.com',
        password: 'admin123',
      })
      .expect(201);

    expect(response.body).toEqual({
      access_token: expect.any(String),
      user: expect.objectContaining({
        email: 'admin@example.com',
      }),
    });
  });
});
```

### 3. E2E Tests (Cypress)

**Location**: `apps/*/cypress/e2e/**/*.cy.ts`
**Framework**: Cypress
**Purpose**: Test complete user workflows on dashboard applications

**Features**:

- Real browser automation
- Network request mocking
- Screenshots and video recording
- Custom commands for common operations
- Mobile responsive testing

**Example**:

```typescript
describe('Admin Dashboard', () => {
  beforeEach(() => {
    cy.login();
    cy.visit('/dashboard');
  });

  it('should display dashboard metrics', () => {
    cy.getByTestId('total-reservations')
      .should('be.visible')
      .and('contain', '150');

    cy.getByTestId('occupancy-rate').should('contain', '78.5%');
  });
});
```

### 4. Load Tests (k6)

**Location**: `tests/load/**/*.js`
**Framework**: k6
**Purpose**: Performance and scalability testing

**Features**:

- Configurable load patterns
- Custom metrics tracking
- Performance thresholds
- Multiple scenario testing
- Real-time monitoring

**Key Scenarios**:

- Authentication endpoints
- Protected API routes
- Database operations
- Redis caching
- Concurrent user simulation

### 5. Mutation Tests (Stryker)

**Location**: Configuration in `stryker.conf.json`
**Framework**: Stryker Mutator
**Purpose**: Assess test quality by introducing code mutations

**Features**:

- TypeScript support
- Jest integration
- Incremental testing
- HTML reporting
- Configurable mutation operators

### 6. Contract Tests (Pact)

**Location**: `tests/contract-tests/**/*.pact.test.ts`
**Framework**: Pact
**Purpose**: Validate API contracts between consumer and provider services

**Features**:

- Consumer-driven contracts
- Mock provider generation
- Contract verification
- API evolution safety
- Cross-service compatibility

## Quick Start

### Prerequisites

1. **Install dependencies**:

   ```bash
   npm install
   ```

2. **Install k6** (for load testing):

   ```bash
   # macOS
   brew install k6

   # Ubuntu/Debian
   sudo apt-get install k6

   # Windows
   choco install k6
   ```

3. **Start required services**:
   ```bash
   npm run docker:up
   ```

### Run All Tests

```bash
# Run comprehensive test suite
./scripts/run-all-tests.sh

# Skip time-intensive tests
SKIP_LOAD_TESTS=true SKIP_MUTATION_TESTS=true ./scripts/run-all-tests.sh
```

## Running Individual Test Suites

### Unit Tests

```bash
# Run all unit tests
npm run test:unit

# Run specific app tests
nx test api-gateway

# Run with coverage
nx test api-gateway --coverage

# Watch mode
nx test api-gateway --watch
```

### API Tests

```bash
# Run all API tests
npm run test:api

# Run with specific pattern
npm run test:api -- --testNamePattern="auth"
```

### E2E Tests

```bash
# Run all E2E tests
npm run test:e2e

# Run specific app E2E tests
cd apps/admin-console
npx cypress run

# Interactive mode
npx cypress open
```

### Load Tests

```bash
# Run all load tests
npm run test:load

# Run specific test
k6 run tests/load/api-gateway-auth.js

# Custom configuration
BASE_URL=http://staging-api.example.com k6 run tests/load/api-gateway-auth.js
```

### Mutation Tests

```bash
# Run mutation tests
npm run test:mutation

# Run for specific files
npx stryker run --files="apps/api-gateway/src/auth/**/*.ts"
```

### Contract Tests

```bash
# Run contract tests
npm run test:contract

# Publish contracts (CI/CD)
npx pact-broker publish pacts --consumer-app-version=$(git rev-parse HEAD)
```

## Test Configuration

### Jest Configuration

Global Jest settings are in `jest.preset.js`. Individual apps can override these in their `jest.config.ts` files.

Key configurations:

- **Test environment**: Node.js for backend, jsdom for frontend
- **Coverage thresholds**: 80% minimum
- **Setup files**: Global test utilities and mocks
- **Module mapping**: Path aliases and mock modules

### Cypress Configuration

Located in `apps/*/cypress.config.ts` for each dashboard application.

Key configurations:

- **Base URL**: Application URL for testing
- **Viewport**: Desktop and mobile sizes
- **Retry logic**: Flaky test handling
- **Screenshot/video**: Failure documentation

### Stryker Configuration

Located in `stryker.conf.json` at the root level.

Key configurations:

- **Mutation score thresholds**: Quality gates
- **Files to mutate**: Source code inclusion/exclusion
- **Test runner**: Jest integration
- **Reporters**: HTML, dashboard, console

### k6 Configuration

Each test file contains its own configuration:

- **Load stages**: Ramp-up and steady-state periods
- **Performance thresholds**: Response time and error rate limits
- **Custom metrics**: Business-specific measurements

## CI/CD Integration

### GitHub Actions

The comprehensive test suite runs automatically on:

- **Pull Requests**: Unit, API, Contract, and E2E tests
- **Main Branch**: All tests including Load and Mutation tests
- **Scheduled Runs**: Nightly comprehensive testing

### Test Stages

1. **Fast Feedback** (< 5 minutes):

   - Unit tests
   - Linting and formatting

2. **Integration Testing** (< 15 minutes):

   - API integration tests
   - Contract tests

3. **User Experience** (< 30 minutes):

   - E2E tests on multiple browsers

4. **Performance & Quality** (< 60 minutes):
   - Load testing
   - Mutation testing (main branch only)

### Parallel Execution

Tests run in parallel across multiple jobs to minimize CI/CD time:

- Unit tests: Parallel by project
- API tests: Single job with service dependencies
- E2E tests: Parallel by browser
- Load tests: Single job with dedicated resources

## Best Practices

### Writing Unit Tests

1. **Follow AAA Pattern**: Arrange, Act, Assert
2. **Use descriptive test names**: `should return user data when valid token provided`
3. **Mock external dependencies**: Database, HTTP clients, third-party services
4. **Test edge cases**: Error conditions, boundary values
5. **Maintain high coverage**: Aim for 80%+ code coverage

### Writing API Tests

1. **Test complete request/response cycle**
2. **Validate status codes and response structure**
3. **Test authentication and authorization**
4. **Verify error handling**
5. **Use realistic test data**

### Writing E2E Tests

1. **Focus on user workflows**: Complete business processes
2. **Use stable selectors**: `data-testid` attributes
3. **Minimize test interdependence**: Each test should be independent
4. **Use page object models**: Reusable component abstractions
5. **Handle asynchronous operations**: Proper waiting strategies

### Writing Load Tests

1. **Define realistic user scenarios**
2. **Set appropriate performance thresholds**
3. **Gradually increase load**: Ramp-up periods
4. **Monitor system resources**: CPU, memory, database connections
5. **Test failure scenarios**: Network issues, service unavailability

### Contract Testing

1. **Consumer-driven approach**: Consumers define expectations
2. **Version contracts**: Track API evolution
3. **Verify on both sides**: Consumer and provider validation
4. **Fail fast**: Catch breaking changes early
5. **Document contracts**: Clear API specifications

## Troubleshooting

### Common Issues

#### Unit Tests Failing

```bash
# Clear Jest cache
npx jest --clearCache

# Run with verbose output
npm run test:unit -- --verbose

# Debug specific test
npm run test:unit -- --testNamePattern="specific test"
```

#### API Tests Timing Out

```bash
# Check service status
curl http://localhost:3000/health

# Restart services
npm run docker:down && npm run docker:up

# Increase timeout
JEST_TIMEOUT=60000 npm run test:api
```

#### E2E Tests Flaky

```bash
# Run in headed mode to debug
npx cypress open

# Check for timing issues
cy.wait('@api-call')  // Wait for specific requests

# Increase timeouts
cy.get('[data-testid="element"]', { timeout: 10000 })
```

#### Load Tests Failing

```bash
# Check k6 installation
k6 version

# Verify service capacity
curl -I http://localhost:3000/health

# Reduce load configuration
# Edit VU counts and duration in test files
```

#### Mutation Tests Taking Too Long

```bash
# Use incremental mode
npx stryker run --incremental

# Limit scope
npx stryker run --files="specific-file.ts"

# Adjust timeout
# Edit timeoutMS in stryker.conf.json
```

### Performance Optimization

1. **Parallel test execution**: Use Jest's `--maxWorkers` option
2. **Test isolation**: Avoid shared state between tests
3. **Resource cleanup**: Properly close database connections
4. **Selective testing**: Run only affected tests during development
5. **CI optimization**: Cache dependencies and test results

### Debugging

#### Unit Tests

- Use `console.log()` for simple debugging
- Use `debugger` statement with Node.js inspector
- VSCode Jest extension for integrated debugging

#### API Tests

- Check network requests in test output
- Use Postman for manual API testing
- Enable verbose logging in services

#### E2E Tests

- Use Cypress Test Runner for visual debugging
- Check browser developer tools
- Review screenshots and videos from failed tests

#### Load Tests

- Monitor system metrics during test runs
- Use k6's real-time dashboard
- Check application logs for errors

### Getting Help

1. **Check logs**: Application and test runner logs
2. **Review documentation**: Framework-specific guides
3. **Community support**: Stack Overflow, GitHub issues
4. **Team knowledge sharing**: Internal testing guidelines

---

## Summary

This comprehensive testing suite provides multiple layers of quality assurance:

- **Development**: Fast unit tests for immediate feedback
- **Integration**: API and contract tests for service reliability
- **User Experience**: E2E tests for workflow validation
- **Performance**: Load tests for scalability assurance
- **Quality**: Mutation tests for test effectiveness

The suite is designed to run efficiently in both local development and CI/CD environments, providing confidence in code quality while maintaining developer productivity.

For questions or improvements to the testing suite, please refer to the team's testing guidelines or create an issue in the repository.
