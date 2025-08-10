# NX Mono Repo Infrastructure

## Quick Start

### Development Environment

Start all infrastructure services:

```bash
make -f Makefile.infrastructure dev-up
```

Access the services:

- **Grafana**: http://localhost:3002 (admin/admin)
- **Prometheus**: http://localhost:9090
- **Jaeger**: http://localhost:16686
- **BullMQ UI**: http://localhost:3001
- **MCP Hub**: http://localhost:8080/health

### Production Environment

Install in Kubernetes:

```bash
make -f Makefile.infrastructure prod-install
```

## Services Overview

| Service    | Purpose              | Port   | Technology        |
| ---------- | -------------------- | ------ | ----------------- |
| PostgreSQL | Primary Database     | 5432   | PostgreSQL 15     |
| Redis      | Cache & Queues       | 6379   | Redis 7           |
| BullMQ UI  | Queue Management     | 3001   | Bull Board        |
| Jaeger     | Distributed Tracing  | 16686  | Jaeger All-in-One |
| Prometheus | Metrics Collection   | 9090   | Prometheus        |
| Grafana    | Monitoring Dashboard | 3002   | Grafana           |
| Loki       | Log Aggregation      | 3100   | Loki              |
| Promtail   | Log Collection       | -      | Promtail          |
| MCP Hub    | Task Orchestration   | 8080   | Custom Node.js    |
| Nginx      | Reverse Proxy        | 80/443 | Nginx             |

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                            Nginx (Reverse Proxy)                │
├─────────────┬─────────────┬─────────────┬─────────────┬─────────┤
│     App     │   Grafana   │   Jaeger    │  BullMQ UI  │ MCP Hub │
├─────────────┴─────────────┴─────────────┴─────────────┴─────────┤
│                    Infrastructure Layer                         │
├─────────────┬─────────────┬─────────────┬─────────────┬─────────┤
│ PostgreSQL  │    Redis    │ Prometheus  │    Loki     │Promtail │
└─────────────┴─────────────┴─────────────┴─────────────┴─────────┘
```

## Configuration Files

### Docker Compose

- `../docker-compose.yml` - Main service definitions
- `prometheus/prometheus.yml` - Prometheus configuration
- `grafana/datasources/` - Grafana data sources
- `loki/loki.yml` - Loki configuration
- `promtail/promtail.yml` - Log collection config
- `nginx/nginx.conf` - Reverse proxy config
- `mcp-hub/server.js` - MCP orchestration service

### Kubernetes/Helm

- `../helm/nx-mono-infrastructure/` - Helm chart
- `../helm/nx-mono-infrastructure/values.yaml` - Configuration values
- `../helm/nx-mono-infrastructure/templates/` - Kubernetes manifests

## MCP Orchestration Hub

The MCP (Model Context Protocol) Hub provides task orchestration capabilities:

### Features

- **Queue Management**: BullMQ integration for reliable task processing
- **Health Monitoring**: Comprehensive health checks
- **Metrics Export**: Prometheus metrics for monitoring
- **Distributed Tracing**: Jaeger integration for request tracing
- **Structured Logging**: Loki integration for log aggregation

### API Endpoints

```bash
# Health check
GET /health

# Metrics (Prometheus format)
GET /metrics

# Queue a task
POST /orchestrate
{
  "taskType": "process_data",
  "payload": {"key": "value"},
  "priority": "high"
}

# Get task status
GET /tasks/{taskId}
```

### Example Usage

```bash
# Queue a high-priority task
curl -X POST http://localhost:8080/orchestrate \
  -H "Content-Type: application/json" \
  -d '{
    "taskType": "data_processing",
    "payload": {"dataset": "user_analytics", "format": "json"},
    "priority": "high"
  }'

# Response: {"taskId": "123", "status": "queued", ...}

# Check task status
curl http://localhost:8080/tasks/123

# Response: {"taskId": "123", "status": "completed", "result": {...}}
```

## Monitoring & Observability

### Grafana Dashboards

Access Grafana at http://localhost:3002 (admin/admin) to view:

- **Infrastructure Overview**: System metrics and health
- **Application Performance**: Request rates, latency, errors
- **Database Monitoring**: PostgreSQL and Redis metrics
- **Queue Monitoring**: BullMQ job statistics
- **Log Analysis**: Structured log queries via Loki

### Prometheus Metrics

Key metrics exposed:

```yaml
# HTTP Request metrics
http_request_duration_seconds - Request latency
http_requests_total - Request count by status

# Task Processing metrics
orchestration_tasks_total - Task count by status and type
orchestration_task_duration_seconds - Task processing time

# Infrastructure metrics
up - Service availability
node_memory_usage - Memory utilization
node_cpu_usage - CPU utilization
```

### Jaeger Tracing

View distributed traces at http://localhost:16686:

- End-to-end request flow
- Service dependency mapping
- Performance bottleneck identification
- Error propagation analysis

### Loki Logging

Structured logs collected from:

- Application containers
- Infrastructure services
- System logs
- Custom application logs

Query examples:

```
{service="mcp-orchestration-hub"} |= "error"
{service="nx-mono-app"} | json | level="error"
```

## Development Workflow

### Starting Services

```bash
# Start all services
make -f Makefile.infrastructure dev-up

# View logs
make -f Makefile.infrastructure dev-logs

# Stop services
make -f Makefile.infrastructure dev-down
```

### Health Checks

```bash
# Run health checks
make -f Makefile.infrastructure health-check

# Debug information
make -f Makefile.infrastructure dev-debug
```

### Configuration Changes

1. Update configuration files in `infrastructure/`
2. Restart affected services:
   ```bash
   docker-compose restart <service-name>
   ```
3. Verify changes in monitoring dashboards

## Production Deployment

### Prerequisites

- Kubernetes cluster (1.20+)
- Helm 3.0+
- Persistent storage class
- Load balancer (for ingress)

### Installation

```bash
# Install infrastructure
make -f Makefile.infrastructure prod-install

# Check status
make -f Makefile.infrastructure prod-status

# Port forward for local access
make -f Makefile.infrastructure prod-forward-grafana
```

### Updates

```bash
# Upgrade infrastructure
make -f Makefile.infrastructure prod-upgrade

# Check rollout status
kubectl rollout status deployment/nx-infra-mcp-hub -n infrastructure
```

### Scaling

```bash
# Scale MCP Hub
kubectl scale deployment nx-infra-mcp-hub --replicas=3 -n infrastructure

# Scale database
kubectl patch statefulset nx-infra-postgresql -n infrastructure -p '{"spec":{"replicas":2}}'
```

## Troubleshooting

### Common Issues

1. **Service startup failures**

   ```bash
   # Check logs
   docker-compose logs <service-name>

   # Or in Kubernetes
   kubectl logs deployment/<service-name> -n infrastructure
   ```

2. **Database connection issues**

   ```bash
   # Test PostgreSQL connection
   docker-compose exec postgres psql -U postgres -d nx_mono_repo -c "SELECT 1;"

   # Test Redis connection
   docker-compose exec redis redis-cli ping
   ```

3. **Memory/CPU issues**
   - Check resource usage in Grafana
   - Adjust resource limits in docker-compose.yml or values.yaml
   - Scale services horizontally

### Debug Commands

```bash
# Development
make -f Makefile.infrastructure dev-debug

# Production
make -f Makefile.infrastructure prod-debug

# Service-specific debugging
docker-compose exec <service> sh
kubectl exec -it deployment/<service> -n infrastructure -- sh
```

### Log Analysis

Use Grafana + Loki for log analysis:

1. Open Grafana: http://localhost:3002
2. Go to Explore
3. Select Loki data source
4. Query logs: `{service="mcp-orchestration-hub"}`

## Backup & Recovery

### Development

```bash
# Backup PostgreSQL
docker-compose exec postgres pg_dump -U postgres nx_mono_repo > backup.sql

# Backup Redis
docker-compose exec redis redis-cli --rdb backup.rdb
```

### Production

```bash
# PostgreSQL backup
kubectl exec -it nx-infra-postgresql-0 -n infrastructure -- \
  pg_dump -U postgres nx_mono_repo > backup.sql

# Restore
kubectl exec -i nx-infra-postgresql-0 -n infrastructure -- \
  psql -U postgres -d nx_mono_repo < backup.sql
```

## Security

### Development

- Default passwords (change in production)
- Local network access only
- No TLS encryption

### Production

- Secrets managed via Kubernetes secrets
- Network policies for service isolation
- TLS encryption for external access
- RBAC for resource access

## Performance Tuning

### Database Optimization

```sql
-- PostgreSQL tuning (adjust for your workload)
ALTER SYSTEM SET shared_buffers = '256MB';
ALTER SYSTEM SET effective_cache_size = '1GB';
ALTER SYSTEM SET work_mem = '4MB';
```

### Redis Tuning

```bash
# Redis configuration
docker-compose exec redis redis-cli CONFIG SET maxmemory 512mb
docker-compose exec redis redis-cli CONFIG SET maxmemory-policy allkeys-lru
```

### Resource Limits

Adjust in `docker-compose.yml`:

```yaml
services:
  mcp-orchestration-hub:
    deploy:
      resources:
        limits:
          memory: 512M
          cpus: '0.5'
```

## Contributing

1. Test changes locally with Docker Compose
2. Update documentation
3. Test production deployment
4. Submit pull request

For detailed information, see [../docs/INFRASTRUCTURE.md](../docs/INFRASTRUCTURE.md)
