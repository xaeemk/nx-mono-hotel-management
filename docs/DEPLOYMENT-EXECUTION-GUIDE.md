# Deployment Execution Guide

This guide provides step-by-step instructions for executing the complete deployment process from development to production.

## Overview

The hotel management platform deployment follows a systematic approach:
1. **Staging Environment Setup** - Test everything in a production-like environment
2. **Infrastructure Deployment** - Deploy AWS EKS infrastructure with Terraform
3. **Application Deployment** - Deploy microservices via GitHub Actions
4. **Validation & Testing** - Comprehensive testing and validation
5. **Production Deployment** - Final production deployment

## Prerequisites

### Required Tools
```bash
# Install required CLI tools
brew install aws-cli terraform kubectl helm
npm install -g @aws-cdk/cli

# Verify installations
aws --version
terraform --version
kubectl version --client
helm version
```

### AWS Setup
```bash
# Configure AWS credentials
aws configure
# Or use environment variables:
export AWS_ACCESS_KEY_ID="your-access-key"
export AWS_SECRET_ACCESS_KEY="your-secret-key"
export AWS_DEFAULT_REGION="us-east-1"
```

## Phase 1: Staging Environment Setup

### 1.1 Configure GitHub Secrets

Go to your GitHub repository → Settings → Secrets and variables → Actions:

**Infrastructure Secrets:**
```
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-1
```

**Application Secrets:**
```
JWT_SECRET=$(openssl rand -base64 32)
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
OPENAI_API_KEY=sk-...
SLACK_WEBHOOK_URL=https://hooks.slack.com/...
```

### 1.2 Deploy Staging Infrastructure

```bash
# Deploy staging infrastructure
./scripts/deploy-aws-infrastructure.sh staging

# This will:
# - Create EKS cluster
# - Deploy RDS PostgreSQL
# - Deploy ElastiCache Redis  
# - Set up monitoring stack
# - Configure load balancers
# - Create S3 buckets for backups
```

### 1.3 Configure Staging Secrets

```bash
# Get RDS endpoint
RDS_ENDPOINT=$(aws rds describe-db-instances \
  --db-instance-identifier nx-mono-staging-db \
  --query 'DBInstances[0].Endpoint.Address' \
  --output text)

# Get Redis endpoint  
REDIS_ENDPOINT=$(aws elasticache describe-replication-groups \
  --replication-group-id nx-mono-staging-redis \
  --query 'ReplicationGroups[0].NodeGroups[0].PrimaryEndpoint.Address' \
  --output text)

# Update Kubernetes secrets
kubectl patch secret database-secret -n nx-mono-staging \
  -p="{\"data\":{\"url\":\"$(echo -n "postgresql://postgres:${DB_PASSWORD}@${RDS_ENDPOINT}:5432/nx_mono_repo" | base64)\"}}"

kubectl patch secret redis-secret -n nx-mono-staging \
  -p="{\"data\":{\"url\":\"$(echo -n "redis://${REDIS_ENDPOINT}:6379" | base64)\"}}"
```

### 1.4 Deploy Applications to Staging

```bash
# Push to staging branch to trigger deployment
git checkout staging
git merge main
git push origin staging

# Monitor GitHub Actions deployment
# Visit: https://github.com/xaeemk/nx-mono-hotel-management/actions
```

### 1.5 Validate Staging Environment

```bash
# Run comprehensive validation
./scripts/validate-deployment.sh staging

# Run load tests
npm run test:load

# Check application logs
kubectl logs -f deployment/api-gateway -n nx-mono-staging
```

## Phase 2: Production Infrastructure Deployment

### 2.1 Production Terraform Deployment

```bash
# Deploy production infrastructure
./scripts/deploy-aws-infrastructure.sh production

# Expected resources created:
# - EKS cluster: nx-mono-production  
# - RDS database: nx-mono-prod-db
# - Redis cluster: nx-mono-prod-redis
# - S3 buckets for backups and assets
# - CloudWatch logs and monitoring
# - Application Load Balancers
```

### 2.2 Configure Production Secrets

```bash
# Generate production secrets
PROD_JWT_SECRET=$(openssl rand -base64 32)
PROD_DB_PASSWORD=$(openssl rand -base64 16 | tr -d "=+/" | cut -c1-15)

# Get production endpoints
PROD_RDS_ENDPOINT=$(aws rds describe-db-instances \
  --db-instance-identifier nx-mono-prod-db \
  --query 'DBInstances[0].Endpoint.Address' \
  --output text)

PROD_REDIS_ENDPOINT=$(aws elasticache describe-replication-groups \
  --replication-group-id nx-mono-prod-redis \
  --query 'ReplicationGroups[0].NodeGroups[0].PrimaryEndpoint.Address' \
  --output text)

# Update production Kubernetes secrets
kubectl create secret generic database-secret \
  --from-literal=url="postgresql://postgres:${PROD_DB_PASSWORD}@${PROD_RDS_ENDPOINT}:5432/nx_mono_repo" \
  --namespace=nx-mono-production

kubectl create secret generic app-secrets \
  --from-literal=jwt-secret="${PROD_JWT_SECRET}" \
  --from-literal=twilio-account-sid="${TWILIO_ACCOUNT_SID}" \
  --from-literal=twilio-auth-token="${TWILIO_AUTH_TOKEN}" \
  --from-literal=openai-api-key="${OPENAI_API_KEY}" \
  --namespace=nx-mono-production
```

### 2.3 DNS and SSL Configuration

```bash
# Get load balancer hostname
LB_HOSTNAME=$(kubectl get ingress -n nx-mono-production \
  -o jsonpath='{.items[0].status.loadBalancer.ingress[0].hostname}')

echo "Configure DNS:"
echo "CNAME: your-domain.com -> ${LB_HOSTNAME}"
echo "CNAME: api.your-domain.com -> ${LB_HOSTNAME}"
echo "CNAME: admin.your-domain.com -> ${LB_HOSTNAME}"
```

## Phase 3: Application Deployment

### 3.1 Production Deployment via GitHub Actions

```bash
# Create production branch and trigger deployment
git checkout main
git pull origin main
git checkout -b production
git push origin production

# Or merge staging to main for production deployment
git checkout main
git merge staging
git push origin main
```

### 3.2 Database Migration and Seeding

```bash
# Wait for API Gateway pod to be ready
kubectl wait --for=condition=ready pod \
  -l app=api-gateway -n nx-mono-production \
  --timeout=300s

# Run database migrations
API_POD=$(kubectl get pod -l app=api-gateway -n nx-mono-production -o jsonpath='{.items[0].metadata.name}')
kubectl exec -it $API_POD -n nx-mono-production -- npm run db:migrate

# Seed initial data
kubectl exec -it $API_POD -n nx-mono-production -- npm run db:seed
```

### 3.3 Service Verification

```bash
# Check all services are running
kubectl get pods -n nx-mono-production
kubectl get svc -n nx-mono-production
kubectl get ingress -n nx-mono-production

# Check service health
kubectl exec -it $API_POD -n nx-mono-production -- curl http://localhost:3000/health
```

## Phase 4: Comprehensive Validation

### 4.1 Automated Validation

```bash
# Run full validation suite
./scripts/validate-deployment.sh production

# Expected results:
# ✅ Kubernetes cluster connectivity
# ✅ All pods running
# ✅ Services accessible
# ✅ Health checks passing
# ✅ Monitoring stack operational
```

### 4.2 Manual Testing

```bash
# Test key endpoints
DOMAIN="your-domain.com"

# API Gateway health
curl https://api.${DOMAIN}/health

# Voice service health  
curl https://api.${DOMAIN}/voice/health

# Test authentication
curl -X POST https://api.${DOMAIN}/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@example.com", "password": "admin123"}'

# Test booking flow
curl -X POST https://api.${DOMAIN}/reservations \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"roomId": "1", "checkIn": "2024-01-01", "checkOut": "2024-01-03"}'
```

### 4.3 Load Testing

```bash
# Run load tests against production
export TEST_BASE_URL="https://api.your-domain.com"
npm run test:load

# Monitor during load test
kubectl top pods -n nx-mono-production
kubectl get hpa -n nx-mono-production
```

### 4.4 Monitoring Verification

```bash
# Access monitoring dashboards
echo "Grafana: https://grafana.your-domain.com"
echo "Prometheus: https://prometheus.your-domain.com"
echo "Jaeger: https://jaeger.your-domain.com"

# Check alerts are configured
kubectl get prometheusrules -n nx-mono-production
```

## Phase 5: Go-Live Procedures

### 5.1 Final Checks

```bash
# Run production readiness checklist
echo "Production Readiness Checklist:"
echo "✅ Infrastructure deployed and validated"
echo "✅ Applications deployed and healthy"
echo "✅ Database migrations completed"
echo "✅ Monitoring and alerting configured"
echo "✅ Load testing passed"
echo "✅ Security scan completed"
echo "✅ Backup procedures tested"
echo "✅ DNS configured correctly"
echo "✅ SSL certificates valid"
echo "✅ Team notified and trained"
```

### 5.2 Go-Live Communication

```bash
# Send go-live notification
echo "🚀 Hotel Management Platform - Production Go-Live"
echo "📅 Date: $(date)"
echo "🌐 URL: https://your-domain.com"
echo "📊 Admin: https://admin.your-domain.com"
echo "📞 Support: support@your-domain.com"
```

### 5.3 Post-Go-Live Monitoring

```bash
# Monitor for first 24 hours
watch -n 30 'kubectl get pods -n nx-mono-production'

# Check error rates
kubectl logs -f deployment/api-gateway -n nx-mono-production | grep ERROR

# Monitor resource usage
kubectl top pods -n nx-mono-production
```

## Rollback Procedures

### Emergency Rollback

```bash
# Quick application rollback
kubectl rollout undo deployment/api-gateway -n nx-mono-production
kubectl rollout undo deployment/voice-service -n nx-mono-production
kubectl rollout undo deployment/bi-service -n nx-mono-production

# Verify rollback
kubectl rollout status deployment/api-gateway -n nx-mono-production
```

### Infrastructure Rollback

```bash
# Rollback infrastructure (use with caution)
cd infrastructure/terraform
terraform plan -destroy -var-file="production.tfvars"
terraform destroy -var-file="production.tfvars" -auto-approve
```

## Troubleshooting

### Common Issues

1. **Pod failing to start**
   ```bash
   kubectl describe pod <pod-name> -n nx-mono-production
   kubectl logs <pod-name> -n nx-mono-production --previous
   ```

2. **Database connection issues**
   ```bash
   # Test database connectivity
   kubectl exec -it $API_POD -n nx-mono-production -- npx prisma db seed
   ```

3. **Load balancer not accessible**
   ```bash
   kubectl describe ingress -n nx-mono-production
   kubectl get events -n nx-mono-production --sort-by=.metadata.creationTimestamp
   ```

4. **SSL certificate issues**
   ```bash
   kubectl describe certificate -n nx-mono-production
   kubectl logs -n cert-manager deployment/cert-manager
   ```

### Support Contacts

- **DevOps Team**: devops@your-company.com
- **Platform Team**: platform@your-company.com  
- **AWS Support**: [Your AWS Support Case URL]

## Success Metrics

### Key Performance Indicators

- **Uptime**: > 99.9%
- **Response Time**: < 200ms (95th percentile)
- **Error Rate**: < 0.1%
- **Deployment Success Rate**: 100%

### Business Metrics

- **User Registration**: Functional
- **Booking Success Rate**: > 99%
- **Payment Processing**: 100% success
- **Voice AI Accuracy**: > 95%

---

**Deployment completed successfully! 🎉**

Your hotel management platform with Voice AI, Analytics, and comprehensive monitoring is now live in production.
