# Hotel Management Platform - Complete System Documentation

[![CI/CD Pipeline](https://github.com/hotel-platform/nx-mono-repo/actions/workflows/ci.yml/badge.svg)](https://github.com/hotel-platform/nx-mono-repo/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Coverage Status](https://codecov.io/gh/hotel-platform/nx-mono-repo/branch/main/graph/badge.svg)](https://codecov.io/gh/hotel-platform/nx-mono-repo)

> **A comprehensive, production-ready hotel management platform built with modern microservices architecture, featuring voice AI, real-time analytics, and complete operational dashboards.**

## 🏨 System Overview

This platform provides a complete hotel management solution with:

- **Voice AI Integration**: Twilio + OpenAI Whisper + Intent Router
- **Real-time Analytics**: BI service with Metabase dashboards
- **Microservices Architecture**: Payment, reservation, housekeeping, and allocation services
- **Multi-channel Communication**: Voice, SMS, WhatsApp, and email
- **Production Infrastructure**: EKS deployment with monitoring and auto-scaling

## 📋 Table of Contents

1. [Quick Start](#quick-start)
2. [System Architecture](#system-architecture)
3. [Core Features](#core-features)
4. [Development Setup](#development-setup)
5. [Deployment Guide](#deployment-guide)
6. [API Documentation](#api-documentation)
7. [Testing Strategy](#testing-strategy)
8. [Monitoring & Observability](#monitoring--observability)
9. [Security](#security)
10. [Troubleshooting](#troubleshooting)

## 🚀 Quick Start

### Prerequisites

- **Node.js** 18+ with npm
- **Docker & Docker Compose**
- **Git** with SSH keys configured
- **AWS CLI** (for production deployment)
- **kubectl** and **Helm** 3.0+ (for Kubernetes deployment)

### 30-Second Setup

```bash
# Clone and setup
git clone <repository-url>
cd nx-mono-repo
npm install

# Start infrastructure services
docker-compose up -d postgres redis

# Run database migrations
npm run db:migrate

# Start the development environment
npm start
```

**🎉 Access Points:**

- **API Gateway**: http://localhost:3000
- **API Documentation**: http://localhost:3000/docs
- **Admin Console**: http://localhost:4200
- **Front Desk Board**: http://localhost:4201
- **Grafana Monitoring**: http://localhost:3002

## 🏗️ System Architecture

### High-Level Architecture

```mermaid
graph TB
    subgraph "Client Applications"
        AC[Admin Console]
        FD[Front Desk Board]
        HM[Housekeeping Mobile]
    end

    subgraph "API Layer"
        AG[API Gateway]
        GQL[GraphQL Endpoint]
        REST[REST APIs]
    end

    subgraph "Core Services"
        VS[Voice Service]
        CS[Checkin Service]
        HS[Housekeeping Service]
        AS[Allocation Service]
        PS[Payment Service]
        RS[Reservation Service]
        NS[Notification Service]
        BS[BI Service]
    end

    subgraph "Voice AI Pipeline"
        TW[Twilio Voice]
        WH[Whisper STT]
        IR[Intent Router]
        MCP[MCP Pipeline]
        TTS[Text-to-Speech]
    end

    subgraph "Data Layer"
        PG[(PostgreSQL)]
        RD[(Redis)]
        S3[(S3 Storage)]
    end

    subgraph "External Services"
        SMS[SMS/WhatsApp]
        PAY[Payment Providers]
        N8N[n8n Workflows]
        MB[Metabase]
    end

    AC --> AG
    FD --> AG
    HM --> AG

    AG --> GQL
    AG --> REST

    REST --> VS
    REST --> CS
    REST --> HS
    REST --> AS

    VS --> TW
    TW --> WH
    WH --> IR
    IR --> MCP
    MCP --> TTS
    MCP --> SMS

    CS --> PG
    HS --> PG
    AS --> PG
    PS --> PAY
    RS --> PG
    NS --> SMS
    BS --> MB

    MCP --> RD
    VS --> RD
```

### Service Portfolio

| Service                  | Port | Purpose                         | Tech Stack                 |
| ------------------------ | ---- | ------------------------------- | -------------------------- |
| **API Gateway**          | 3000 | Central API hub, GraphQL & REST | NestJS, JWT, Rate Limiting |
| **Voice Service**        | 3006 | AI voice processing             | Twilio, OpenAI, Whisper    |
| **Checkin Service**      | 3001 | Guest check-in/out              | NestJS, QR codes, OTP      |
| **Housekeeping Service** | 3002 | Room management                 | State machines, XState     |
| **Allocation Service**   | 3003 | Room allocation                 | Algorithm engine           |
| **Payment Service**      | 3004 | Payment processing              | bKash, Nagad, SSLCommerz   |
| **Reservation Service**  | 3005 | Booking management              | State machines             |
| **BI Service**           | 3007 | Business intelligence           | Analytics, Reports         |
| **Admin Console**        | 4200 | Management dashboard            | Next.js, Chakra UI         |
| **Front Desk Board**     | 4201 | Reception display               | Real-time updates          |
| **Housekeeping Mobile**  | 4202 | Mobile app for staff            | PWA, offline support       |

## 🎯 Core Features

### 🎙️ Voice AI Integration

- **Multi-language STT**: Whisper-powered speech recognition
- **Smart Intent Detection**: OpenAI function calling
- **Natural Conversations**: Context-aware responses
- **Multi-channel Follow-up**: Voice + SMS + WhatsApp
- **Real-time Processing**: Async MCP pipeline

### 📊 Business Intelligence

- **Real-time Analytics**: Guest behavior, revenue metrics
- **Automated Reports**: Daily digest emails
- **KPI Dashboards**: ADR, RevPAR, occupancy trends
- **Cohort Analysis**: Guest lifetime value tracking
- **Predictive Insights**: Demand forecasting

### 🏨 Hotel Operations

- **Digital Check-in**: QR codes and OTP verification
- **Smart Room Allocation**: Algorithm-based assignment
- **Housekeeping Workflows**: Task automation and tracking
- **Payment Processing**: Multi-provider support
- **Guest Communication**: Automated notifications

### 🔄 Workflow Automation

- **n8n Integration**: Visual workflow designer
- **Rate Synchronization**: Real-time availability updates
- **Ghost Booking Detection**: Automated cancellation
- **Notification Flows**: Smart alert routing

### 🛡️ Security & Compliance

- **JWT Authentication**: Secure token-based auth
- **Rate Limiting**: Multi-tier protection
- **Data Encryption**: At rest and in transit
- **Audit Logging**: Comprehensive activity trails
- **PII Protection**: GDPR-compliant data handling

## 🛠️ Development Setup

### Environment Configuration

```bash
# Copy environment template
cp .env.example .env

# Required environment variables
cat > .env << EOF
# Database Configuration
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/nx_mono_repo"
REDIS_URL="redis://localhost:6379"

# JWT Configuration
JWT_SECRET="your-secure-jwt-secret-key"
JWT_EXPIRES_IN="24h"

# Twilio Configuration
TWILIO_ACCOUNT_SID="your_twilio_account_sid"
TWILIO_AUTH_TOKEN="your_twilio_auth_token"
TWILIO_VOICE_NUMBER="+1234567890"

# OpenAI Configuration
OPENAI_API_KEY="your_openai_api_key"
OPENAI_MODEL="gpt-4"
WHISPER_MODEL="whisper-1"

# Payment Providers
BKASH_APP_KEY="your_bkash_key"
NAGAD_MERCHANT_ID="your_nagad_id"
SSLCOMMERZ_STORE_ID="your_sslcommerz_id"

# Email Configuration
SMTP_HOST="smtp.gmail.com"
SMTP_PORT=587
SMTP_USER="your_email@gmail.com"
SMTP_PASS="your_app_password"
EOF
```

### Development Commands

```bash
# Infrastructure
npm run docker:up                 # Start PostgreSQL, Redis, monitoring
npm run db:migrate                # Run database migrations
npm run db:seed                   # Seed with sample data

# Individual Services
npm run gateway:dev               # API Gateway (Port 3000)
npm run voice:dev                 # Voice Service (Port 3006)
npm run checkin:dev               # Checkin Service (Port 3001)
npm run housekeeping:dev          # Housekeeping Service (Port 3002)
npm run allocation:dev            # Allocation Service (Port 3003)

# Dashboard Applications
npm run admin-console:dev         # Admin Console (Port 4200)
npm run front-desk:dev           # Front Desk Board (Port 4201)
npm run housekeeping:dev         # Mobile App (Port 4202)

# Phase-based Development
npm run phase2:dev               # Backend services
npm run phase3:dev               # Advanced features
npm run phase4:dev               # Voice + Analytics
npm run web-dashboards:dev       # Frontend applications
```

### Development Workflow

1. **Feature Development**:

   ```bash
   git checkout -b feature/new-feature
   npm run lint                   # Code quality check
   npm run test:unit             # Run unit tests
   npm run test:api              # API integration tests
   ```

2. **Testing**:

   ```bash
   npm run test:all              # Full test suite
   npm run test:e2e              # End-to-end tests
   npm run test:load             # Performance tests
   ```

3. **Build & Deploy**:
   ```bash
   npm run build                 # Build all applications
   npm run docker:build          # Build Docker images
   git push origin feature/new-feature
   ```

## 🚀 Deployment Guide

### Production Deployment (AWS EKS)

#### Prerequisites Setup

```bash
# Install required tools
aws configure                     # Configure AWS credentials
kubectl version                  # Verify kubectl installation
helm version                     # Verify Helm installation

# Configure environment
export AWS_REGION="us-west-2"
export CLUSTER_NAME="hotel-platform-prod"
```

#### Infrastructure Deployment

```bash
# Deploy infrastructure with Terraform
cd infrastructure/terraform
terraform init
terraform plan -var-file="prod.tfvars"
terraform apply -var-file="prod.tfvars"

# Deploy application stack
cd ../../
helm install hotel-platform helm/nx-mono-infrastructure/ \
  --namespace hotel-platform \
  --create-namespace \
  --values helm/nx-mono-infrastructure/values-production.yaml
```

#### Application Deployment

```bash
# Build and push Docker images
npm run docker:build:prod
docker push your-registry/api-gateway:latest
docker push your-registry/voice-service:latest
# ... push all service images

# Deploy applications
kubectl apply -f k8s/production/
kubectl rollout status deployment/api-gateway

# Verify deployment
kubectl get pods -n hotel-platform
kubectl get services -n hotel-platform
kubectl get ingress -n hotel-platform
```

### Development/Staging Deployment

```bash
# Local development with Docker Compose
npm run docker:up:build

# Staging deployment
git push origin develop          # Triggers staging deployment
```

### Environment-specific Configurations

- **Development**: `docker-compose.yml`
- **Staging**: `docker-compose.phase*.yml`
- **Production**: `k8s/production/` + Helm charts

## 📚 API Documentation

### REST API Documentation

- **Interactive Swagger UI**: http://localhost:3000/docs
- **OpenAPI Specification**: `/libs/shared/contracts/openapi.yaml`
- **Postman Collection**: `/docs/api-gateway-postman-collection.json`

### GraphQL Documentation

- **Interactive Playground**: http://localhost:3000/graphql
- **Schema Definition**: Auto-generated from code decorators
- **Introspection**: Full schema exploration

### Authentication Flow

```bash
# 1. Login to get JWT token
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"admin123"}'

# 2. Use token in subsequent requests
curl -X GET http://localhost:3000/api/users \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Core API Endpoints

| Method | Endpoint                      | Description         | Auth Required |
| ------ | ----------------------------- | ------------------- | ------------- |
| POST   | `/api/auth/login`             | User authentication | No            |
| GET    | `/api/users`                  | List all users      | Yes           |
| POST   | `/api/v1/voice/transcribe`    | Voice transcription | Yes           |
| POST   | `/api/v1/checkin`             | Guest check-in      | Yes           |
| GET    | `/api/v1/rooms/availability`  | Room availability   | Yes           |
| POST   | `/api/v1/payments/initiate`   | Start payment       | Yes           |
| GET    | `/api/v1/analytics/dashboard` | Analytics data      | Yes           |

## 🧪 Testing Strategy

### Test Suite Overview

- **Unit Tests**: 95%+ coverage with Jest
- **API Tests**: Integration testing with Supertest
- **E2E Tests**: User workflow testing with Cypress
- **Load Tests**: Performance testing with k6
- **Contract Tests**: API contract validation with Pact
- **Mutation Tests**: Test quality assessment with Stryker

### Running Tests

```bash
# Full test suite
npm run test:all

# Individual test types
npm run test:unit                 # Jest unit tests
npm run test:api                  # API integration tests
npm run test:e2e                  # Cypress E2E tests
npm run test:load                 # k6 load tests
npm run test:contract             # Pact contract tests
npm run test:mutation             # Stryker mutation tests

# Continuous testing
npm run test:watch               # Watch mode for development
npm run test:ci                  # CI/CD optimized test run
```

### Test Configuration

- **Jest**: `jest.preset.js` with TypeScript support
- **Cypress**: Individual configs per dashboard app
- **k6**: Performance thresholds and load scenarios
- **Pact**: Consumer-driven contract testing

## 📊 Monitoring & Observability

### Monitoring Stack

- **Metrics**: Prometheus + Grafana dashboards
- **Logging**: Loki + Promtail log aggregation
- **Tracing**: Jaeger distributed tracing
- **Alerts**: AlertManager with Slack/email notifications
- **Health Checks**: Kubernetes-ready probes

### Access Points

- **Grafana**: http://localhost:3002 (admin/admin)
- **Prometheus**: http://localhost:9090
- **Jaeger**: http://localhost:16686
- **Loki**: http://localhost:3100

### Key Metrics

- **Application Performance**: Response times, error rates
- **Business Metrics**: Bookings, revenue, occupancy
- **Infrastructure**: CPU, memory, disk, network
- **Voice AI**: Call success rates, intent accuracy

### Dashboard Categories

1. **Infrastructure Overview**: Cluster health, resource usage
2. **Application Performance**: Service metrics, SLA tracking
3. **Business Intelligence**: Revenue, occupancy, guest metrics
4. **Voice Analytics**: Call volumes, intent distribution
5. **Operational Efficiency**: Staff productivity, response times

## 🔒 Security

### Security Features

- **Authentication**: JWT-based with refresh tokens
- **Authorization**: Role-based access control (RBAC)
- **Rate Limiting**: Multi-tier protection (3/sec, 20/10sec, 100/min)
- **Data Encryption**: TLS in transit, AES-256 at rest
- **Input Validation**: Comprehensive request validation
- **Audit Logging**: All actions logged with correlation IDs

### Security Best Practices

- **Container Security**: Non-root users, minimal base images
- **Network Security**: VPC isolation, security groups
- **Secret Management**: Kubernetes secrets, AWS Secrets Manager
- **Vulnerability Scanning**: Automated container scanning
- **Compliance**: GDPR-compliant data handling

### Security Monitoring

- **Failed Login Attempts**: Automated detection and blocking
- **Suspicious Activity**: Real-time threat detection
- **Compliance Audits**: Automated compliance checking
- **Penetration Testing**: Regular security assessments

## 🔧 Troubleshooting

### Common Issues

#### Service Connection Issues

```bash
# Check service health
curl http://localhost:3000/health
kubectl get pods -n hotel-platform

# Restart services
docker-compose restart api-gateway
kubectl rollout restart deployment/api-gateway
```

#### Database Connection Problems

```bash
# Check database status
docker-compose ps postgres
kubectl exec -it postgres-pod -- psql -U postgres

# Run migrations
npm run db:migrate
kubectl exec -it api-gateway-pod -- npm run db:migrate
```

#### Voice Service Issues

```bash
# Check Twilio connectivity
curl -X POST http://localhost:3006/api/v1/voice/test

# Verify OpenAI API key
export OPENAI_API_KEY="your-key"
curl -H "Authorization: Bearer $OPENAI_API_KEY" https://api.openai.com/v1/models
```

#### Performance Issues

```bash
# Check resource usage
docker stats
kubectl top nodes
kubectl top pods -n hotel-platform

# Scale services
kubectl scale deployment api-gateway --replicas=5
```

### Debugging Tools

- **Application Logs**: Structured JSON logging
- **Distributed Tracing**: Jaeger for request flow analysis
- **Performance Monitoring**: Real-time metrics in Grafana
- **Database Queries**: Query performance monitoring

### Support Resources

- **Documentation**: Comprehensive guides in `/docs`
- **API Testing**: Postman collections and Swagger UI
- **Monitoring**: Real-time dashboards and alerts
- **Community**: Internal knowledge base and team support

## 📞 Support & Contact

### Documentation Resources

- **API Documentation**: http://localhost:3000/docs
- **System Architecture**: [ARCHITECTURE.md](./docs/ARCHITECTURE.md)
- **Deployment Guide**: [DEPLOYMENT.md](./docs/DEPLOYMENT.md)
- **Testing Guide**: [TESTING.md](./docs/testing-guide.md)

### Getting Help

1. **Check Documentation**: Comprehensive guides available
2. **Review Logs**: Application and infrastructure logs
3. **Monitor Dashboards**: Real-time system status
4. **Contact Team**: Development team support

### Contributing

1. Fork the repository
2. Create a feature branch
3. Run tests and linting
4. Submit a pull request
5. Follow code review process

## 📄 License

MIT License - see [LICENSE](./LICENSE) file for details.

---

**🎉 The hotel management platform is production-ready with comprehensive features, monitoring, and documentation!**

For questions, issues, or feature requests, please refer to the project documentation or contact the development team.
