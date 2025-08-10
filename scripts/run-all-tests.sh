#!/bin/bash

# Comprehensive Testing Suite Runner
# Runs all types of tests: unit, API, e2e, load, mutation, and contract tests

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SKIP_LOAD_TESTS=${SKIP_LOAD_TESTS:-false}
SKIP_MUTATION_TESTS=${SKIP_MUTATION_TESTS:-false}
SKIP_E2E_TESTS=${SKIP_E2E_TESTS:-false}
RUN_IN_CI=${CI:-false}

# Function to print colored output
print_status() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

# Function to check if services are running
check_services() {
    print_status "Checking if required services are running..."
    
    # Check if API Gateway is running
    if ! curl -sf http://localhost:3000/health > /dev/null 2>&1; then
        print_warning "API Gateway is not running. Starting services..."
        
        # Start services in background
        npm run docker:up &
        DOCKER_PID=$!
        
        # Wait for services to be ready
        print_status "Waiting for services to be ready..."
        sleep 30
        
        # Check again
        for i in {1..30}; do
            if curl -sf http://localhost:3000/health > /dev/null 2>&1; then
                print_success "Services are ready"
                break
            fi
            
            if [ $i -eq 30 ]; then
                print_error "Services failed to start within timeout"
                exit 1
            fi
            
            sleep 5
        done
    else
        print_success "Services are already running"
    fi
}

# Function to run unit tests
run_unit_tests() {
    print_status "Running Unit Tests..."
    
    # Run Jest unit tests for all apps and libs
    if npm run test:unit; then
        print_success "Unit tests passed"
    else
        print_error "Unit tests failed"
        return 1
    fi
}

# Function to run API tests
run_api_tests() {
    print_status "Running API Integration Tests..."
    
    # Ensure services are running
    check_services
    
    # Run Supertest API tests
    if npm run test:api; then
        print_success "API tests passed"
    else
        print_error "API tests failed"
        return 1
    fi
}

# Function to run E2E tests
run_e2e_tests() {
    if [ "$SKIP_E2E_TESTS" == "true" ]; then
        print_warning "Skipping E2E tests"
        return 0
    fi
    
    print_status "Running E2E Tests..."
    
    # Ensure services are running
    check_services
    
    # Start dashboard applications
    print_status "Starting dashboard applications..."
    npm run admin-console:build &
    npm run front-desk:build &
    wait
    
    # Run Cypress E2E tests
    if [ "$RUN_IN_CI" == "true" ]; then
        # Run headless in CI
        npx cypress run --config baseUrl=http://localhost:3001
    else
        # Interactive mode for local development
        npx cypress run --config baseUrl=http://localhost:3001 --browser chrome
    fi
    
    if [ $? -eq 0 ]; then
        print_success "E2E tests passed"
    else
        print_error "E2E tests failed"
        return 1
    fi
}

# Function to run load tests
run_load_tests() {
    if [ "$SKIP_LOAD_TESTS" == "true" ]; then
        print_warning "Skipping load tests"
        return 0
    fi
    
    print_status "Running Load Tests..."
    
    # Ensure services are running
    check_services
    
    # Check if k6 is installed
    if ! command -v k6 &> /dev/null; then
        print_error "k6 is not installed. Please install k6 to run load tests."
        print_status "Install k6: https://k6.io/docs/getting-started/installation/"
        return 1
    fi
    
    # Run k6 load tests
    if npm run test:load; then
        print_success "Load tests completed"
    else
        print_error "Load tests failed"
        return 1
    fi
}

# Function to run mutation tests
run_mutation_tests() {
    if [ "$SKIP_MUTATION_TESTS" == "true" ]; then
        print_warning "Skipping mutation tests"
        return 0
    fi
    
    print_status "Running Mutation Tests..."
    
    # Run Stryker mutation tests
    if npm run test:mutation; then
        print_success "Mutation tests completed"
    else
        print_error "Mutation tests failed"
        return 1
    fi
}

# Function to run contract tests
run_contract_tests() {
    print_status "Running Contract Tests..."
    
    # Run Pact contract tests
    if npm run test:contract; then
        print_success "Contract tests passed"
    else
        print_error "Contract tests failed"
        return 1
    fi
}

# Function to generate test reports
generate_reports() {
    print_status "Generating Test Reports..."
    
    # Create reports directory
    mkdir -p reports/test-results
    
    # Copy test results
    find . -name "*.xml" -path "*/test-results/*" -exec cp {} reports/test-results/ \;
    find . -name "coverage" -type d -exec cp -r {} reports/ \;
    find . -name "cypress-reports" -type d -exec cp -r {} reports/ \;
    find . -name "mutation-report.html" -exec cp {} reports/ \;
    find . -name "load-test-results.json" -exec cp {} reports/ \;
    
    print_success "Test reports generated in ./reports directory"
}

# Function to cleanup
cleanup() {
    print_status "Cleaning up..."
    
    # Stop Docker services if we started them
    if [ ! -z "$DOCKER_PID" ]; then
        npm run docker:down
    fi
    
    # Kill any remaining processes
    pkill -f "cypress" || true
    pkill -f "k6" || true
}

# Main execution
main() {
    print_status "Starting Comprehensive Test Suite"
    print_status "=================================="
    
    # Set trap to cleanup on exit
    trap cleanup EXIT
    
    # Track test results
    declare -a failed_tests=()
    
    # Run each test suite
    if ! run_unit_tests; then
        failed_tests+=("Unit Tests")
    fi
    
    if ! run_api_tests; then
        failed_tests+=("API Tests")
    fi
    
    if ! run_contract_tests; then
        failed_tests+=("Contract Tests")
    fi
    
    if ! run_e2e_tests; then
        failed_tests+=("E2E Tests")
    fi
    
    if ! run_load_tests; then
        failed_tests+=("Load Tests")
    fi
    
    if ! run_mutation_tests; then
        failed_tests+=("Mutation Tests")
    fi
    
    # Generate reports
    generate_reports
    
    # Final summary
    print_status "Test Suite Summary"
    print_status "=================="
    
    if [ ${#failed_tests[@]} -eq 0 ]; then
        print_success "All tests passed successfully! 🎉"
        exit 0
    else
        print_error "Some tests failed:"
        for test in "${failed_tests[@]}"; do
            print_error "  - $test"
        done
        exit 1
    fi
}

# Handle command line arguments
case "${1:-all}" in
    "unit")
        run_unit_tests
        ;;
    "api")
        run_api_tests
        ;;
    "e2e")
        run_e2e_tests
        ;;
    "load")
        run_load_tests
        ;;
    "mutation")
        run_mutation_tests
        ;;
    "contract")
        run_contract_tests
        ;;
    "all"|"")
        main
        ;;
    *)
        echo "Usage: $0 {unit|api|e2e|load|mutation|contract|all}"
        echo ""
        echo "Environment variables:"
        echo "  SKIP_LOAD_TESTS=true     Skip load tests"
        echo "  SKIP_MUTATION_TESTS=true Skip mutation tests"
        echo "  SKIP_E2E_TESTS=true      Skip E2E tests"
        echo "  CI=true                  Run in CI mode"
        exit 1
        ;;
esac
