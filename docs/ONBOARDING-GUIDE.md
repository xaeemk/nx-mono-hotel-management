# Hotel Management Platform - Onboarding Guide

Welcome to the Hotel Management Platform team! This comprehensive guide will help you get up to speed with our system, processes, and development workflow.

## 📋 Table of Contents

1. [Welcome & Overview](#welcome--overview)
2. [Prerequisites & Setup](#prerequisites--setup)
3. [Development Environment](#development-environment)
4. [System Architecture](#system-architecture)
5. [Key Technologies](#key-technologies)
6. [Development Workflow](#development-workflow)
7. [Testing Strategy](#testing-strategy)
8. [Deployment & Infrastructure](#deployment--infrastructure)
9. [Monitoring & Observability](#monitoring--observability)
10. [Team Processes](#team-processes)
11. [Resources & References](#resources--references)

## 👋 Welcome & Overview

### About the Platform

The Hotel Management Platform is a comprehensive, production-ready solution for hotel operations management featuring:

- **Voice AI Integration**: Twilio + OpenAI Whisper + Intent Router
- **Microservices Architecture**: 8+ independent services
- **Real-time Analytics**: BI service with Metabase dashboards
- **Multi-channel Communication**: Voice, SMS, WhatsApp, email
- **Production Infrastructure**: EKS deployment with auto-scaling

### Team Structure

- **Lead Developer**: System architecture and technical decisions
- **Backend Developers**: Microservices development and APIs
- **Frontend Developers**: Dashboard and mobile applications
- **DevOps Engineers**: Infrastructure and deployment
- **QA Engineers**: Testing and quality assurance
- **Product Managers**: Requirements and roadmap

### Development Philosophy

- **Code Quality**: High standards with comprehensive testing
- **Documentation**: Everything is documented and kept up-to-date
- **Collaboration**: Open communication and knowledge sharing
- **Innovation**: Embracing new technologies and best practices
- **User Focus**: Solutions that solve real hotel management problems

## 🔧 Prerequisites & Setup

### Required Software

Before starting, ensure you have the following installed:

```bash
# Essential tools
- Node.js 18+ (with npm)
- Docker & Docker Compose
- Git (with SSH keys configured)
- VS Code (recommended IDE)

# Development tools
- AWS CLI (for production access)
- kubectl & Helm 3.0+ (for Kubernetes)
- Postman (for API testing)
- k6 (for load testing)

# Optional but helpful
- Cursor AI (AI-powered development)
- GitHub Copilot
- Docker Desktop
```

### Account Setup

You'll need access to:

1. **GitHub Repository**: Request access from your manager
2. **AWS Account**: For production infrastructure access
3. **Twilio Account**: For voice service development
4. **OpenAI API**: For AI features
5. **Slack Workspace**: For team communication
6. **Grafana/Monitoring**: For system observability

### IDE Setup

Recommended VS Code extensions:

```json
{
  "recommendations": [
    "ms-vscode.vscode-typescript-next",
    "bradlc.vscode-tailwindcss",
    "esbenp.prettier-vscode",
    "ms-vscode.vscode-eslint",
    "ms-vscode.vscode-docker",
    "ms-kubernetes-tools.vscode-kubernetes-tools",
    "GraphQL.vscode-graphql",
    "humao.rest-client",
    "streetsidesoftware.code-spell-checker"
  ]
}
```

## 🚀 Development Environment

### Initial Setup (30 minutes)

```bash
# 1. Clone the repository
git clone git@github.com:hotel-platform/nx-mono-repo.git
cd nx-mono-repo

# 2. Install dependencies
npm install

# 3. Set up environment variables
cp .env.example .env
# Edit .env with your API keys and configuration

# 4. Start infrastructure services
docker-compose up -d postgres redis

# 5. Initialize the database
npm run db:migrate
npm run db:seed

# 6. Start development services
npm start

# 7. Verify setup
curl http://localhost:3000/health
```

### Environment Configuration

Create your `.env` file with the following structure:

```bash
# Database Configuration
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/nx_mono_repo"
REDIS_URL="redis://localhost:6379"

# JWT Configuration
JWT_SECRET="your-secure-jwt-secret-key"
JWT_EXPIRES_IN="24h"

# Twilio Configuration (get from team lead)
TWILIO_ACCOUNT_SID="your_twilio_account_sid"
TWILIO_AUTH_TOKEN="your_twilio_auth_token"
TWILIO_VOICE_NUMBER="+1234567890"

# OpenAI Configuration (get from team lead)
OPENAI_API_KEY="your_openai_api_key"
OPENAI_MODEL="gpt-4"
WHISPER_MODEL="whisper-1"

# Payment Providers (test credentials)
BKASH_APP_KEY="sandbox_bkash_key"
NAGAD_MERCHANT_ID="sandbox_nagad_id"
SSLCOMMERZ_STORE_ID="sandbox_ssl_id"

# Email Configuration
SMTP_HOST="smtp.gmail.com"
SMTP_PORT=587
SMTP_USER="your_email@gmail.com"
SMTP_PASS="your_app_password"

# Development Settings
NODE_ENV="development"
LOG_LEVEL="debug"
```

### Verification Checklist

After setup, verify everything works:

- [ ] API Gateway: `http://localhost:3000/health`
- [ ] API Documentation: `http://localhost:3000/docs`
- [ ] Admin Console: `http://localhost:4200`
- [ ] Grafana: `http://localhost:3002` (admin/admin)
- [ ] Database connection: `npm run db:studio`
- [ ] Tests pass: `npm run test:unit`

## 🏗️ System Architecture

### High-Level Overview

```mermaid
graph TB
    subgraph "Frontend Applications"
        AC[Admin Console :4200]
        FD[Front Desk Board :4201]
        HM[Housekeeping Mobile :4202]
    end

    subgraph "API Layer"
        AG[API Gateway :3000]
    end

    subgraph "Core Services"
        VS[Voice Service :3006]
        CS[Checkin Service :3001]
        HS[Housekeeping Service :3002]
        AS[Allocation Service :3003]
        PS[Payment Service :3004]
        RS[Reservation Service :3005]
        BS[BI Service :3007]
        NS[Notification Service :3008]
    end

    subgraph "Data & Infrastructure"
        PG[(PostgreSQL)]
        RD[(Redis)]
        MCP[MCP Hub :8080]
    end

    AC --> AG
    FD --> AG
    HM --> AG

    AG --> VS
    AG --> CS
    AG --> HS
    AG --> AS
    AG --> PS
    AG --> RS
    AG --> BS
    AG --> NS

    VS --> RD
    CS --> PG
    MCP --> RD
```

### Key Components

| Component         | Port | Purpose                | Technology           |
| ----------------- | ---- | ---------------------- | -------------------- |
| **API Gateway**   | 3000 | Central API hub        | NestJS, JWT, GraphQL |
| **Voice Service** | 3006 | AI voice processing    | Twilio, OpenAI       |
| **Admin Console** | 4200 | Management dashboard   | Next.js, Chakra UI   |
| **MCP Hub**       | 8080 | Workflow orchestration | Node.js, Bull/Redis  |

### Service Communication

- **Synchronous**: HTTP/REST APIs for real-time operations
- **Asynchronous**: Redis queues for background processing
- **Event-driven**: MCP orchestration for complex workflows
- **Real-time**: WebSockets for dashboard updates

## 💻 Key Technologies

### Backend Stack

- **Node.js**: JavaScript runtime environment
- **TypeScript**: Type-safe JavaScript development
- **NestJS**: Scalable Node.js framework
- **PostgreSQL**: Primary database
- **Redis**: Caching and queues
- **Prisma**: Database ORM and migrations

### Frontend Stack

- **Next.js**: React framework for web applications
- **React**: Component-based UI library
- **Chakra UI**: Component library
- **TypeScript**: Type safety in frontend
- **SWR**: Data fetching and caching

### AI & Voice

- **Twilio**: Voice communication platform
- **OpenAI Whisper**: Speech-to-text transcription
- **OpenAI GPT-4**: Intent detection and responses
- **Text-to-Speech**: Voice response generation

### Infrastructure

- **Docker**: Containerization
- **Kubernetes**: Container orchestration
- **AWS EKS**: Managed Kubernetes service
- **Helm**: Kubernetes package manager
- **Terraform**: Infrastructure as code

### Monitoring

- **Prometheus**: Metrics collection
- **Grafana**: Visualization dashboards
- **Loki**: Log aggregation
- **Jaeger**: Distributed tracing

## 🔄 Development Workflow

### Git Workflow

We use a feature-branch workflow with pull request reviews:

```bash
# 1. Create feature branch
git checkout -b feature/new-feature-name
git push -u origin feature/new-feature-name

# 2. Make changes and commit
git add .
git commit -m "feat: implement new feature"

# 3. Push changes
git push origin feature/new-feature-name

# 4. Create pull request on GitHub
# 5. Address review feedback
# 6. Merge after approval
```

### Commit Message Convention

We follow conventional commits:

```bash
feat: add new feature
fix: resolve bug issue
docs: update documentation
style: format code changes
refactor: restructure code
test: add or update tests
chore: maintenance tasks
```

### Branch Naming

- `feature/feature-name` - New features
- `bugfix/issue-description` - Bug fixes
- `hotfix/critical-fix` - Production fixes
- `docs/documentation-update` - Documentation
- `chore/maintenance-task` - Maintenance

### Code Review Process

1. **Self-review**: Check your own code before submitting
2. **Automated checks**: Ensure all CI checks pass
3. **Peer review**: At least one team member must approve
4. **Testing**: Verify functionality works as expected
5. **Merge**: Squash and merge after approval

### Development Commands

```bash
# Development
npm run dev                    # Start all services in development
npm run gateway:dev           # Start API gateway only
npm run voice:dev             # Start voice service only

# Testing
npm run test:unit             # Run unit tests
npm run test:api              # Run API integration tests
npm run test:e2e              # Run end-to-end tests
npm run test:all              # Run complete test suite

# Code Quality
npm run lint                  # Run linting
npm run format                # Format code
npm run type-check            # TypeScript type checking

# Database
npm run db:migrate            # Run database migrations
npm run db:seed               # Seed database with test data
npm run db:studio             # Open Prisma Studio
npm run db:reset              # Reset database (destructive)

# Building
npm run build                 # Build all applications
npm run docker:build          # Build Docker images
```

## 🧪 Testing Strategy

### Test Types & Coverage

We maintain high test coverage across multiple layers:

- **Unit Tests (Jest)**: 95%+ coverage target
- **API Tests (Supertest)**: All endpoints tested
- **E2E Tests (Cypress)**: Critical user flows
- **Load Tests (k6)**: Performance verification
- **Contract Tests (Pact)**: Service integration

### Running Tests

```bash
# Quick test run (development)
npm run test:unit:watch       # Watch mode for unit tests
npm run test:api              # API integration tests

# Complete test suite (CI/CD)
npm run test:all              # All tests
npm run test:ci               # CI-optimized test run

# Specific test suites
npm run test:voice            # Voice service tests
npm run test:reservation      # Reservation service tests
nx test api-gateway           # Gateway-specific tests
```

### Writing Tests

Follow these patterns when writing tests:

```typescript
// Unit test example
describe('ReservationService', () => {
  let service: ReservationService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [ReservationService, mockDependencies],
    }).compile();

    service = module.get<ReservationService>(ReservationService);
  });

  describe('createReservation', () => {
    it('should create a reservation successfully', async () => {
      // Arrange
      const createDto = {
        /* test data */
      };

      // Act
      const result = await service.createReservation(createDto);

      // Assert
      expect(result).toBeDefined();
      expect(result.status).toBe('confirmed');
    });
  });
});
```

### Test Data Management

- Use factory functions for test data creation
- Mock external services in unit tests
- Use test database for integration tests
- Clean up test data after each test

## 🚀 Deployment & Infrastructure

### Environments

| Environment     | Purpose           | URL                          | Branch      |
| --------------- | ----------------- | ---------------------------- | ----------- |
| **Development** | Local development | `localhost`                  | `feature/*` |
| **Staging**     | Testing & QA      | `staging.hotel-platform.com` | `develop`   |
| **Production**  | Live system       | `hotel-platform.com`         | `main`      |

### Deployment Process

1. **Development**: Local Docker Compose setup
2. **Staging**: Automatic deployment on `develop` branch
3. **Production**: Automatic deployment on `main` branch merge

### Infrastructure Access

```bash
# AWS CLI configuration
aws configure --profile hotel-platform

# Kubernetes access
aws eks update-kubeconfig --region us-west-2 --name hotel-platform-prod

# Check deployment status
kubectl get pods -n hotel-platform
kubectl get services -n hotel-platform
kubectl get ingress -n hotel-platform
```

### Local Development with Docker

```bash
# Start full environment
npm run docker:up

# Start specific services
docker-compose up -d postgres redis
docker-compose up -d monitoring

# View logs
docker-compose logs -f api-gateway
docker-compose logs -f voice-service

# Stop services
npm run docker:down
```

## 📊 Monitoring & Observability

### Monitoring Stack

- **Grafana**: `http://localhost:3002` (admin/admin)
- **Prometheus**: `http://localhost:9090`
- **Jaeger**: `http://localhost:16686`
- **Loki**: `http://localhost:3100`

### Key Dashboards

1. **System Overview**: Infrastructure health and performance
2. **Application Metrics**: Service response times and errors
3. **Voice Analytics**: Call success rates and intent accuracy
4. **Business Metrics**: Bookings, revenue, occupancy rates

### Logging Best Practices

Use structured logging in all services:

```typescript
// Good logging example
this.logger.info('Reservation created successfully', {
  reservationId: reservation.id,
  guestId: guest.id,
  roomType: reservation.roomType,
  amount: reservation.amount,
  correlationId: context.correlationId,
});

// Error logging
this.logger.error('Payment processing failed', {
  paymentId: payment.id,
  error: error.message,
  stack: error.stack,
  correlationId: context.correlationId,
});
```

### Alerting

Critical alerts are configured for:

- Service downtime
- High error rates
- Payment failures
- Voice service issues
- Database connectivity

## 👥 Team Processes

### Daily Workflow

1. **Daily Standup** (9:00 AM): Quick status updates
2. **Code Review**: Review assigned pull requests
3. **Development**: Feature development and bug fixes
4. **Testing**: Write and maintain tests
5. **Documentation**: Update docs as needed

### Weekly Processes

- **Sprint Planning** (Mondays): Plan upcoming work
- **Architecture Review** (Wednesdays): Technical decisions
- **Retrospective** (Fridays): Process improvements

### Communication

- **Slack**: Daily communication and quick questions
- **GitHub Issues**: Bug reports and feature requests
- **Pull Requests**: Code reviews and discussions
- **Meetings**: Complex technical discussions

### Code Standards

- **TypeScript**: Strict mode enabled
- **ESLint**: Enforce coding standards
- **Prettier**: Consistent code formatting
- **Documentation**: JSDoc for complex functions
- **Testing**: Test coverage requirements

## 📚 Resources & References

### Documentation

- **System Architecture**: [ARCHITECTURE-DIAGRAMS.md](./ARCHITECTURE-DIAGRAMS.md)
- **API Documentation**: [API-HANDBOOK.md](./API-HANDBOOK.md)
- **MCP Workflows**: [MCP-WORKFLOW-GUIDE.md](./MCP-WORKFLOW-GUIDE.md)
- **Testing Guide**: [testing-guide.md](./testing-guide.md)
- **Deployment Guide**: [DEPLOYMENT-SUMMARY.md](./DEPLOYMENT-SUMMARY.md)

### Interactive Resources

- **API Documentation**: http://localhost:3000/docs
- **GraphQL Playground**: http://localhost:3000/graphql
- **Database Studio**: `npm run db:studio`
- **Monitoring**: http://localhost:3002

### External Documentation

- **NestJS**: https://nestjs.com/
- **Next.js**: https://nextjs.org/docs
- **Prisma**: https://www.prisma.io/docs
- **Twilio**: https://www.twilio.com/docs
- **OpenAI**: https://platform.openai.com/docs

### Team Contacts

- **Lead Developer**: @tech-lead (Slack)
- **DevOps Engineer**: @devops (Slack)
- **Product Manager**: @product (Slack)
- **QA Lead**: @qa-lead (Slack)

### Getting Help

1. **Check Documentation**: Start with relevant docs
2. **Search Slack**: Previous discussions might help
3. **Ask Team**: Don't hesitate to ask questions
4. **Create Issues**: For bugs or feature requests

## 🎯 Your First Week

### Day 1-2: Environment Setup

- [ ] Set up development environment
- [ ] Clone repository and install dependencies
- [ ] Configure environment variables
- [ ] Run initial tests to verify setup
- [ ] Explore codebase structure

### Day 3-4: Understanding the System

- [ ] Read architecture documentation
- [ ] Test API endpoints with Postman
- [ ] Explore dashboards and monitoring
- [ ] Understand database schema
- [ ] Review existing pull requests

### Day 5: First Contribution

- [ ] Pick a "good first issue" from GitHub
- [ ] Create feature branch and implement fix
- [ ] Write tests for your changes
- [ ] Create pull request and address feedback
- [ ] Celebrate your first contribution! 🎉

### Week 1 Goals

- [ ] Complete environment setup
- [ ] Understand system architecture
- [ ] Make first code contribution
- [ ] Meet with team members
- [ ] Identify learning opportunities

## 💡 Tips for Success

### Technical Tips

- **Start Small**: Begin with small changes to understand the system
- **Test Everything**: Write tests for all your code
- **Document Changes**: Update documentation when needed
- **Ask Questions**: Better to ask than make assumptions
- **Review Code**: Learn from others by reviewing their PRs

### Collaboration Tips

- **Be Proactive**: Take initiative on tasks
- **Communicate Early**: Share blockers and concerns quickly
- **Help Others**: Contributing to team success
- **Learn Continuously**: Technology evolves rapidly
- **Have Fun**: Enjoy building great software!

### Learning Resources

- Complete NestJS course (if new to NestJS)
- Understand TypeScript advanced features
- Learn Docker and Kubernetes basics
- Explore AWS services we use
- Practice with Twilio and OpenAI APIs

## 🎉 Welcome to the Team!

We're excited to have you on board! This platform represents months of careful planning and development, and your contributions will help make it even better.

Remember:

- **Ask questions** - We're here to help
- **Take your time** - Learning takes time
- **Experiment** - Try new approaches and ideas
- **Contribute** - Your perspective is valuable
- **Have fun** - Building great software should be enjoyable!

### Next Steps

1. **Complete Environment Setup**: Follow the setup instructions carefully
2. **Schedule 1:1s**: Meet with team members individually
3. **Join Slack Channels**: Get added to relevant channels
4. **Pick First Issue**: Look for "good first issue" labels
5. **Start Contributing**: Begin with small, manageable tasks

Welcome aboard! We look forward to working with you and seeing what amazing things we'll build together.

---

**Questions?** Reach out to your mentor or post in the #onboarding Slack channel.

**Feedback?** This guide is continuously improved based on team feedback. Let us know how we can make it better!
