#!/bin/bash

# Validate Deployment Script
# Usage: ./scripts/validate-deployment.sh [staging|production]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

ENVIRONMENT=${1:-staging}
NAMESPACE="nx-mono-${ENVIRONMENT}"

echo -e "${BLUE}🧪 Starting Deployment Validation${NC}"
echo -e "${YELLOW}Environment: ${ENVIRONMENT}${NC}"
echo -e "${YELLOW}Namespace: ${NAMESPACE}${NC}"

# Test results
TESTS_PASSED=0
TESTS_FAILED=0

# Function to run a test
run_test() {
    local test_name="$1"
    local command="$2"
    local expected_exit_code="${3:-0}"
    
    echo -e "\n${YELLOW}🧪 Testing: ${test_name}${NC}"
    
    if eval "$command" >/dev/null 2>&1; then
        if [ $? -eq $expected_exit_code ]; then
            echo -e "${GREEN}✅ PASSED: ${test_name}${NC}"
            ((TESTS_PASSED++))
        else
            echo -e "${RED}❌ FAILED: ${test_name} (unexpected exit code)${NC}"
            ((TESTS_FAILED++))
        fi
    else
        echo -e "${RED}❌ FAILED: ${test_name}${NC}"
        ((TESTS_FAILED++))
    fi
}

# Function to test HTTP endpoint
test_endpoint() {
    local name="$1"
    local url="$2"
    local expected_status="${3:-200}"
    
    echo -e "\n${YELLOW}🌐 Testing endpoint: ${name}${NC}"
    echo -e "${BLUE}URL: ${url}${NC}"
    
    if command -v curl >/dev/null 2>&1; then
        status_code=$(curl -s -o /dev/null -w "%{http_code}" "$url" --connect-timeout 10 --max-time 30 || echo "000")
        
        if [ "$status_code" = "$expected_status" ]; then
            echo -e "${GREEN}✅ PASSED: ${name} (HTTP ${status_code})${NC}"
            ((TESTS_PASSED++))
        else
            echo -e "${RED}❌ FAILED: ${name} (HTTP ${status_code}, expected ${expected_status})${NC}"
            ((TESTS_FAILED++))
        fi
    else
        echo -e "${YELLOW}⚠️ SKIPPED: ${name} (curl not available)${NC}"
    fi
}

# 1. Test Kubernetes cluster connectivity
run_test "Kubernetes cluster connectivity" "kubectl cluster-info"

# 2. Test namespace exists
run_test "Namespace exists" "kubectl get namespace ${NAMESPACE}"

# 3. Test infrastructure pods are running
echo -e "\n${BLUE}📦 Checking infrastructure pods...${NC}"
kubectl get pods -n ${NAMESPACE}

run_test "PostgreSQL pod running" "kubectl get pod -l app.kubernetes.io/name=postgresql -n ${NAMESPACE} -o jsonpath='{.items[0].status.phase}' | grep -q Running"
run_test "Redis pod running" "kubectl get pod -l app.kubernetes.io/name=redis -n ${NAMESPACE} -o jsonpath='{.items[0].status.phase}' | grep -q Running"
run_test "Prometheus pod running" "kubectl get pod -l app.kubernetes.io/name=prometheus -n ${NAMESPACE} -o jsonpath='{.items[0].status.phase}' | grep -q Running"
run_test "Grafana pod running" "kubectl get pod -l app.kubernetes.io/name=grafana -n ${NAMESPACE} -o jsonpath='{.items[0].status.phase}' | grep -q Running"

# 4. Test services are accessible
echo -e "\n${BLUE}🌐 Checking services...${NC}"
kubectl get svc -n ${NAMESPACE}

# 5. Test secrets exist
run_test "Database secret exists" "kubectl get secret database-secret -n ${NAMESPACE}"
run_test "Redis secret exists" "kubectl get secret redis-secret -n ${NAMESPACE}"
run_test "App secrets exist" "kubectl get secret app-secrets -n ${NAMESPACE}"

# 6. Test ingress controller
run_test "AWS Load Balancer Controller running" "kubectl get pod -n kube-system -l app.kubernetes.io/name=aws-load-balancer-controller"

# 7. Test cluster autoscaler
run_test "Cluster Autoscaler running" "kubectl get pod -n kube-system -l app=cluster-autoscaler"

# 8. Get service endpoints for testing
echo -e "\n${BLUE}🔍 Getting service endpoints...${NC}"

# Get ingress URL (if available)
INGRESS_HOST=$(kubectl get ingress -n ${NAMESPACE} -o jsonpath='{.items[0].status.loadBalancer.ingress[0].hostname}' 2>/dev/null || echo "")

if [ -n "$INGRESS_HOST" ]; then
    echo -e "${GREEN}Ingress Host: https://${INGRESS_HOST}${NC}"
    
    # Test main application endpoints
    test_endpoint "API Gateway Health" "https://${INGRESS_HOST}/api/health"
    test_endpoint "Voice Service Health" "https://${INGRESS_HOST}/voice/health"
    test_endpoint "BI Service Health" "https://${INGRESS_HOST}/bi/health"
    
    # Test monitoring endpoints
    test_endpoint "Prometheus" "https://${INGRESS_HOST}/prometheus/-/healthy"
    test_endpoint "Grafana" "https://${INGRESS_HOST}/grafana/api/health"
    
else
    echo -e "${YELLOW}⚠️ No ingress found, skipping endpoint tests${NC}"
fi

# 9. Test node health
echo -e "\n${BLUE}🖥️ Checking node health...${NC}"
kubectl get nodes
run_test "All nodes ready" "kubectl get nodes --no-headers | awk '{print \$2}' | grep -v Ready | wc -l | grep -q '^0$'"

# 10. Test resource quotas and limits
echo -e "\n${BLUE}📊 Checking resource usage...${NC}"
kubectl top nodes 2>/dev/null || echo -e "${YELLOW}⚠️ Metrics server not available${NC}"

# 11. Test persistent volumes
echo -e "\n${BLUE}💾 Checking persistent volumes...${NC}"
kubectl get pv
kubectl get pvc -n ${NAMESPACE}

# 12. Test horizontal pod autoscalers
echo -e "\n${BLUE}⚖️ Checking autoscalers...${NC}"
kubectl get hpa -n ${NAMESPACE} 2>/dev/null || echo -e "${YELLOW}⚠️ No HPAs configured${NC}"

# 13. Test network policies (if any)
run_test "Network policies" "kubectl get networkpolicy -n ${NAMESPACE}" 1  # Allow failure

# 14. Check logs for errors
echo -e "\n${BLUE}📝 Checking recent logs for errors...${NC}"
PODS=$(kubectl get pods -n ${NAMESPACE} -o jsonpath='{.items[*].metadata.name}')
ERROR_COUNT=0

for pod in $PODS; do
    ERRORS=$(kubectl logs "$pod" -n ${NAMESPACE} --tail=50 2>/dev/null | grep -i "error\|fatal\|panic" | wc -l)
    if [ "$ERRORS" -gt 0 ]; then
        echo -e "${YELLOW}⚠️ Found ${ERRORS} error(s) in pod ${pod}${NC}"
        ((ERROR_COUNT++))
    fi
done

if [ "$ERROR_COUNT" -eq 0 ]; then
    echo -e "${GREEN}✅ No critical errors found in recent logs${NC}"
    ((TESTS_PASSED++))
else
    echo -e "${RED}❌ Found errors in ${ERROR_COUNT} pod(s)${NC}"
    ((TESTS_FAILED++))
fi

# 15. Test backup jobs (if configured)
BACKUP_JOBS=$(kubectl get jobs -n ${NAMESPACE} -l app=postgres-backup --no-headers 2>/dev/null | wc -l)
if [ "$BACKUP_JOBS" -gt 0 ]; then
    run_test "Backup jobs exist" "kubectl get jobs -n ${NAMESPACE} -l app=postgres-backup"
else
    echo -e "${YELLOW}⚠️ No backup jobs found${NC}"
fi

# Summary
echo -e "\n${BLUE}📊 Validation Summary${NC}"
echo -e "=============================="
echo -e "${GREEN}✅ Tests Passed: ${TESTS_PASSED}${NC}"
echo -e "${RED}❌ Tests Failed: ${TESTS_FAILED}${NC}"

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "\n${GREEN}🎉 All tests passed! Deployment is healthy.${NC}"
    echo -e "\n${BLUE}🔗 Access URLs:${NC}"
    if [ -n "$INGRESS_HOST" ]; then
        echo -e "${GREEN}• Main Application: https://${INGRESS_HOST}${NC}"
        echo -e "${GREEN}• Grafana Dashboard: https://${INGRESS_HOST}/grafana${NC}"
        echo -e "${GREEN}• Prometheus: https://${INGRESS_HOST}/prometheus${NC}"
        echo -e "${GREEN}• Jaeger Tracing: https://${INGRESS_HOST}/jaeger${NC}"
    fi
    exit 0
else
    echo -e "\n${RED}❌ Some tests failed. Please review the issues above.${NC}"
    echo -e "\n${YELLOW}💡 Common troubleshooting steps:${NC}"
    echo -e "1. Check pod logs: kubectl logs <pod-name> -n ${NAMESPACE}"
    echo -e "2. Check pod events: kubectl describe pod <pod-name> -n ${NAMESPACE}"
    echo -e "3. Check service endpoints: kubectl get endpoints -n ${NAMESPACE}"
    echo -e "4. Check ingress status: kubectl describe ingress -n ${NAMESPACE}"
    echo -e "5. Verify secrets are properly configured"
    exit 1
fi
