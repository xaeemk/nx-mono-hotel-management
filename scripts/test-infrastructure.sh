#!/bin/bash

# Infrastructure Test Script
# Tests the health and connectivity of all infrastructure services

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🔧 Testing NX Mono Repo Infrastructure"
echo "======================================"
echo

# Function to test HTTP endpoint
test_endpoint() {
    local name=$1
    local url=$2
    local expected_status=${3:-200}
    
    echo -n "Testing $name ($url)... "
    
    if response=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 10 --max-time 30 "$url" 2>/dev/null); then
        if [ "$response" -eq "$expected_status" ]; then
            echo -e "${GREEN}✓ OK${NC} (HTTP $response)"
            return 0
        else
            echo -e "${RED}✗ FAIL${NC} (HTTP $response, expected $expected_status)"
            return 1
        fi
    else
        echo -e "${RED}✗ FAIL${NC} (Connection failed)"
        return 1
    fi
}

# Function to test TCP port
test_port() {
    local name=$1
    local host=$2
    local port=$3
    
    echo -n "Testing $name ($host:$port)... "
    
    if timeout 5 bash -c "</dev/tcp/$host/$port" 2>/dev/null; then
        echo -e "${GREEN}✓ OK${NC}"
        return 0
    else
        echo -e "${RED}✗ FAIL${NC}"
        return 1
    fi
}

# Function to test database connection
test_database() {
    echo -n "Testing PostgreSQL database connection... "
    
    if docker-compose exec -T postgres psql -U postgres -d nx_mono_repo -c "SELECT 1;" >/dev/null 2>&1; then
        echo -e "${GREEN}✓ OK${NC}"
        return 0
    else
        echo -e "${RED}✗ FAIL${NC}"
        return 1
    fi
}

# Function to test Redis connection
test_redis() {
    echo -n "Testing Redis connection... "
    
    if docker-compose exec -T redis redis-cli ping | grep -q "PONG"; then
        echo -e "${GREEN}✓ OK${NC}"
        return 0
    else
        echo -e "${RED}✗ FAIL${NC}"
        return 1
    fi
}

# Function to test MCP Hub API
test_mcp_api() {
    echo -n "Testing MCP Hub API functionality... "
    
    # Test orchestrate endpoint
    response=$(curl -s -X POST http://localhost:8080/orchestrate \
        -H "Content-Type: application/json" \
        -d '{"taskType": "test", "payload": {"test": true}, "priority": "normal"}' \
        2>/dev/null)
    
    if echo "$response" | grep -q "taskId"; then
        echo -e "${GREEN}✓ OK${NC}"
        
        # Extract task ID and test status endpoint
        task_id=$(echo "$response" | grep -o '"taskId":"[^"]*"' | cut -d'"' -f4)
        if [ -n "$task_id" ]; then
            echo -n "Testing task status endpoint... "
            status_response=$(curl -s "http://localhost:8080/tasks/$task_id" 2>/dev/null)
            if echo "$status_response" | grep -q "taskId"; then
                echo -e "${GREEN}✓ OK${NC}"
            else
                echo -e "${YELLOW}⚠ PARTIAL${NC}"
            fi
        fi
        return 0
    else
        echo -e "${RED}✗ FAIL${NC}"
        return 1
    fi
}

# Check if Docker Compose is running
echo "🐳 Checking Docker Compose status..."
if ! docker-compose ps >/dev/null 2>&1; then
    echo -e "${RED}✗ Docker Compose is not running${NC}"
    echo "Please run 'docker-compose up -d' first"
    exit 1
fi

# Get running services
running_services=$(docker-compose ps --services --filter "status=running")
echo "Running services: $running_services"
echo

# Core Infrastructure Tests
echo "📊 Core Infrastructure"
echo "---------------------"

failed_tests=0

# Database connectivity
if echo "$running_services" | grep -q "postgres"; then
    test_database || ((failed_tests++))
else
    echo -e "PostgreSQL: ${YELLOW}⚠ NOT RUNNING${NC}"
    ((failed_tests++))
fi

if echo "$running_services" | grep -q "redis"; then
    test_redis || ((failed_tests++))
else
    echo -e "Redis: ${YELLOW}⚠ NOT RUNNING${NC}"
    ((failed_tests++))
fi

echo

# HTTP Service Tests
echo "🌐 HTTP Services"
echo "----------------"

# Test web services
test_endpoint "Prometheus" "http://localhost:9090/-/healthy" 200 || ((failed_tests++))
test_endpoint "Grafana" "http://localhost:3002/api/health" 200 || ((failed_tests++))
test_endpoint "Jaeger UI" "http://localhost:16686/" 200 || ((failed_tests++))
test_endpoint "BullMQ UI" "http://localhost:3001/" 200 || ((failed_tests++))
test_endpoint "MCP Hub Health" "http://localhost:8080/health" 200 || ((failed_tests++))
test_endpoint "MCP Hub Metrics" "http://localhost:8080/metrics" 200 || ((failed_tests++))
test_endpoint "Loki Ready" "http://localhost:3100/ready" 200 || ((failed_tests++))

echo

# API Functionality Tests
echo "🚀 API Functionality"
echo "--------------------"

test_mcp_api || ((failed_tests++))

echo

# Port Connectivity Tests
echo "🔌 Port Connectivity"
echo "--------------------"

test_port "PostgreSQL" "localhost" "5432" || ((failed_tests++))
test_port "Redis" "localhost" "6379" || ((failed_tests++))

echo

# Docker Health Checks
echo "🏥 Docker Health Status"
echo "-----------------------"

health_failed=0
for service in $running_services; do
    health_status=$(docker-compose ps --format "table {{.Service}}\t{{.Status}}" | grep "$service" | awk '{print $2}')
    if echo "$health_status" | grep -q "Up"; then
        echo -e "$service: ${GREEN}✓ Healthy${NC}"
    else
        echo -e "$service: ${RED}✗ Unhealthy${NC} ($health_status)"
        ((health_failed++))
    fi
done

if [ $health_failed -gt 0 ]; then
    ((failed_tests += health_failed))
fi

echo

# Summary
echo "📋 Test Summary"
echo "==============="

total_services=$(echo "$running_services" | wc -l)
if [ $failed_tests -eq 0 ]; then
    echo -e "${GREEN}✅ All tests passed!${NC}"
    echo "Infrastructure is healthy and ready to use."
    echo
    echo "🔗 Access Points:"
    echo "  • Grafana: http://localhost:3002 (admin/admin)"
    echo "  • Prometheus: http://localhost:9090"
    echo "  • Jaeger: http://localhost:16686"
    echo "  • BullMQ UI: http://localhost:3001"
    echo "  • MCP Hub: http://localhost:8080"
    exit 0
else
    echo -e "${RED}❌ $failed_tests test(s) failed${NC}"
    echo "Some infrastructure components may not be working correctly."
    echo
    echo "💡 Troubleshooting tips:"
    echo "  • Check service logs: docker-compose logs <service-name>"
    echo "  • Restart failed services: docker-compose restart <service-name>"
    echo "  • View service status: docker-compose ps"
    exit 1
fi
