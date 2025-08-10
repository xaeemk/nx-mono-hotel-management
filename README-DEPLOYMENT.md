# Deployment Guide - NX Mono Repo on AWS EKS

This guide covers the complete deployment and monitoring setup for the NX Mono Repo application on AWS EKS with GitOps workflows, autoscaling, SSL certificates, and comprehensive monitoring.

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         AWS Cloud                               │
├─────────────────────────────────────────────────────────────────┤
│  Route 53 → ALB → EKS Cluster (Multiple AZs)                   │
│  ├─── API Gateway (HPA: 2-20 pods)                             │
│  ├─── Admin Console (HPA: 2-10 pods)                           │
│  ├─── Front Desk Board (HPA: 1-5 pods)                         │
│  ├─── Microservices (Various scaling configs)                  │
│  └─── Monitoring Stack                                          │
│       ├─── Prometheus (3 replicas)                             │
│       ├─── Grafana (2 replicas)                                │
│       ├─── Loki (3 replicas)                                   │
│       └─── Jaeger (Production setup)                           │
├─────────────────────────────────────────────────────────────────┤
│  External Managed Services                                      │
│  ├─── RDS PostgreSQL (Multi-AZ)                                │
│  ├─── ElastiCache Redis (Cluster mode)                         │
│  └─── S3 (Backups & Static assets)                             │
└─────────────────────────────────────────────────────────────────┘
```

## 🚀 Quick Start

### Prerequisites

1. **AWS CLI** configured with appropriate permissions
2. **Terraform** >= 1.0
3. **kubectl** >= 1.28
4. **Helm** >= 3.12
5. **Docker** for local development

### Required AWS Permissions

Your AWS user/role needs:

- EKS cluster management
- VPC/networking resources
- RDS and ElastiCache management
- S3 bucket operations
- IAM role creation
- Certificate Manager access

## 📋 Step-by-Step Deployment

### Step 1: Initial Setup

```bash
# Clone repository
git clone <your-repo>
cd nx-mono-repo

# Set environment variables
export DB_PASSWORD="your-secure-password"
export JWT_SECRET="your-jwt-secret"
export AWS_REGION="us-west-2"
```

### Step 2: Deploy Infrastructure

```bash
# Deploy staging environment
./scripts/deploy-infrastructure.sh staging

# Deploy production environment
./scripts/deploy-infrastructure.sh prod
```

The script will:

- ✅ Validate prerequisites
- ✅ Create EKS cluster with auto-scaling node groups
- ✅ Deploy RDS PostgreSQL and ElastiCache Redis
- ✅ Set up VPC with proper security groups
- ✅ Install AWS Load Balancer Controller
- ✅ Configure Cluster Autoscaler
- ✅ Deploy monitoring stack (Prometheus, Grafana, Loki, Jaeger)
- ✅ Set up nightly database backups
- ✅ Configure SSL certificates

### Step 3: Domain & SSL Setup

1. **Purchase/configure domain** in Route 53
2. **Request SSL certificate** in AWS Certificate Manager
3. **Update GitHub secrets** with certificate ARN:
   ```bash
   # Add to GitHub repository secrets:
   CERTIFICATE_ARN=arn:aws:acm:us-west-2:123456789:certificate/xyz
   ```

### Step 4: Configure GitHub Actions

1. **Set up GitHub OIDC** with AWS:

   ```bash
   # The Terraform configuration creates the OIDC provider
   # Add these secrets to your GitHub repository:
   AWS_ROLE_TO_ASSUME=arn:aws:iam::123456789:role/nx-mono-repo-github-actions
   AWS_ACCOUNT_ID=123456789
   DATABASE_URL=postgresql://user:pass@host:5432/db
   REDIS_URL=redis://host:6379
   JWT_SECRET=your-secret
   BACKUP_BUCKET=your-backup-bucket
   SLACK_WEBHOOK_URL=https://hooks.slack.com/...
   ```

2. **Configure branch protection** rules for `main` and `develop`

### Step 5: Deploy Applications

Push to `develop` for staging or `main` for production:

```bash
git push origin main  # Triggers production deployment
git push origin develop  # Triggers staging deployment
```

## 🔧 Configuration

### Environment-Specific Settings

#### Staging

- **Cluster**: 1-5 nodes (t3.medium)
- **RDS**: db.t3.micro, 1 day backup retention
- **Redis**: cache.t3.micro, single node
- **SSL**: Shared certificate or Let's Encrypt

#### Production

- **Cluster**: 3-20 nodes (t3.large/xlarge)
- **RDS**: db.t3.medium, 7 day backup retention, Multi-AZ
- **Redis**: cache.t3.medium, 3 node cluster
- **SSL**: Dedicated wildcard certificate

### Scaling Configuration

```yaml
# API Gateway Autoscaling
minReplicas: 2
maxReplicas: 20
targetCPUUtilization: 70%
targetMemoryUtilization: 80%

# Cluster Autoscaling
minNodes: 2 (staging) / 3 (production)
maxNodes: 10 (staging) / 20 (production)
```

## 📊 Monitoring & Observability

### Access Monitoring Services

**Staging:**

- Grafana: https://monitoring-staging.nx-mono-repo.com/grafana
- Prometheus: https://monitoring-staging.nx-mono-repo.com/prometheus
- Jaeger: https://monitoring-staging.nx-mono-repo.com/jaeger

**Production:**

- Grafana: https://monitoring.nx-mono-repo.com/grafana
- Prometheus: https://monitoring.nx-mono-repo.com/prometheus
- Jaeger: https://monitoring.nx-mono-repo.com/jaeger

### Port Forwarding (Development)

```bash
# Grafana
kubectl port-forward -n infrastructure svc/nx-infra-grafana 3000:3000

# Prometheus
kubectl port-forward -n infrastructure svc/nx-infra-prometheus-server 9090:80

# Jaeger
kubectl port-forward -n infrastructure svc/nx-infra-jaeger 16686:16686
```

### Key Dashboards

1. **Kubernetes Cluster Overview** - Resource utilization, node health
2. **Application Performance** - Request rates, latency, error rates
3. **Database Monitoring** - PostgreSQL metrics, slow queries
4. **Queue Monitoring** - BullMQ job statistics
5. **Infrastructure Health** - System metrics, disk usage

### Alerting Rules

Configure in `infrastructure/prometheus/rules/alerts.yml`:

- High CPU/Memory usage
- Pod crash loops
- Database connection errors
- High response times
- SSL certificate expiration
- Backup job failures

## 🔐 Security Features

### Network Security

- Private subnets for all application workloads
- Security groups restricting traffic
- Network policies between pods
- WAF rules on ALB (optional)

### Container Security

- Non-root containers
- Read-only root filesystems
- Security contexts with minimal privileges
- Container image scanning with Trivy

### Data Security

- RDS encryption at rest
- Redis encryption in transit and at rest
- S3 bucket encryption
- Kubernetes secrets for sensitive data

## 💾 Backup & Recovery

### Automated Backups

**PostgreSQL:**

- Nightly automated backups via CronJob
- S3 storage with 30-day retention (staging) / 90-day (prod)
- Point-in-time recovery support

**Redis:**

- Automated snapshots to S3
- 1-day retention (staging) / 7-day (production)

### Manual Backup

```bash
# Trigger manual database backup
kubectl create job --from=cronjob/postgres-backup postgres-backup-manual-$(date +%s)

# Check backup status
kubectl get jobs -l app=postgres-backup

# List backups in S3
aws s3 ls s3://your-backup-bucket/postgres/
```

### Disaster Recovery

1. **Database Recovery:**

   ```bash
   # Download backup from S3
   aws s3 cp s3://backup-bucket/postgres/backup.sql.gz ./

   # Restore to new RDS instance
   gunzip backup.sql.gz
   psql -h new-rds-endpoint -U postgres -d nx_mono_repo < backup.sql
   ```

2. **Full Environment Recovery:**
   - Re-run Terraform with backup data sources
   - Deploy applications via GitHub Actions
   - Update DNS records if needed

## 🚨 Troubleshooting

### Common Issues

#### Deployment Failures

```bash
# Check deployment status
kubectl get deployments
kubectl describe deployment api-gateway

# Check pod logs
kubectl logs -f deployment/api-gateway
kubectl logs -f deployment/api-gateway --previous
```

#### Ingress Issues

```bash
# Check ALB status
kubectl get ingress nx-mono-repo-ingress
kubectl describe ingress nx-mono-repo-ingress

# Check AWS Load Balancer Controller
kubectl logs -n kube-system deployment/aws-load-balancer-controller
```

#### Database Connectivity

```bash
# Test database connection
kubectl run postgres-client --rm -ti --restart=Never --image=postgres:15 -- psql -h your-db-endpoint -U postgres -d nx_mono_repo

# Check database secret
kubectl get secret database-secret -o yaml
```

#### Monitoring Issues

```bash
# Check Prometheus targets
kubectl port-forward -n infrastructure svc/prometheus-server 9090:80
# Visit http://localhost:9090/targets

# Check Grafana datasources
kubectl logs -n infrastructure deployment/nx-infra-grafana
```

### Debug Commands

```bash
# Cluster info
kubectl cluster-info
kubectl get nodes -o wide

# Resource usage
kubectl top nodes
kubectl top pods -A

# Events and issues
kubectl get events --sort-by='.lastTimestamp'
kubectl describe node <node-name>

# Network debugging
kubectl exec -ti deployment/api-gateway -- nslookup kubernetes.default
```

## 🔄 Operational Tasks

### Scaling Applications

```bash
# Manual scaling
kubectl scale deployment api-gateway --replicas=5

# Update HPA
kubectl patch hpa api-gateway-hpa -p '{"spec":{"maxReplicas":25}}'

# Scale cluster nodes
aws eks update-nodegroup-config --cluster-name nx-mono-repo-prod --nodegroup-name general --scaling-config minSize=5,maxSize=25,desiredSize=8
```

### Rolling Updates

```bash
# Update application image
kubectl set image deployment/api-gateway api-gateway=new-image:tag

# Check rollout status
kubectl rollout status deployment/api-gateway

# Rollback if needed
kubectl rollout undo deployment/api-gateway
```

### Certificate Management

```bash
# Check certificate status
kubectl describe certificate nx-mono-tls

# Renew certificate (cert-manager)
kubectl delete certificate nx-mono-tls
# Certificate will be automatically recreated
```

### Database Maintenance

```bash
# Connect to database
kubectl exec -ti deployment/api-gateway -- node -e "
const { Client } = require('pg');
const client = new Client(process.env.DATABASE_URL);
client.connect().then(() => console.log('Connected'));
"

# Run migrations
kubectl exec -ti deployment/api-gateway -- npm run db:migrate
```

## 📈 Performance Optimization

### Resource Tuning

1. **Monitor resource usage** in Grafana
2. **Adjust requests/limits** based on actual usage
3. **Tune JVM/Node.js** settings for memory-intensive apps
4. **Database query optimization** using slow query logs

### Cost Optimization

1. **Use Spot instances** for non-critical workloads
2. **Implement cluster autoscaler** for dynamic scaling
3. **Set up resource quotas** to prevent over-allocation
4. **Monitor unused resources** via AWS Cost Explorer

## 🧪 Testing

### Health Checks

```bash
# Application health
curl -H "Host: api-staging.nx-mono-repo.com" http://load-balancer-url/health

# Infrastructure health
kubectl get pods -A | grep -v Running
```

### Load Testing

```bash
# Install k6
npm install -g k6

# Run load tests
k6 run tests/load/api-gateway-auth.js \
  -e API_BASE_URL=https://api-staging.nx-mono-repo.com \
  --duration=5m --vus=50
```

## 📞 Support & Monitoring

### Alerts & Notifications

Configure Slack/email notifications via:

- Grafana alert rules
- AWS CloudWatch alarms
- GitHub Actions workflow notifications

### Runbooks

1. **High CPU usage**: Scale pods/nodes, investigate memory leaks
2. **Database issues**: Check connections, slow queries, failover
3. **SSL certificate expiration**: Renew certificate, update ingress
4. **Backup failures**: Check S3 permissions, CronJob logs

---

## 🎯 Next Steps

1. **Set up GitOps** with ArgoCD for advanced deployment workflows
2. **Implement chaos engineering** with Chaos Mesh
3. **Add security scanning** with Falco or similar tools
4. **Set up multi-region** deployment for disaster recovery
5. **Implement blue/green** or canary deployment strategies

For additional support, check the [troubleshooting guide](./docs/troubleshooting.md) or reach out to the DevOps team.
