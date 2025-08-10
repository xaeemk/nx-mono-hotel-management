#!/bin/bash

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
AWS_REGION="us-west-2"
TERRAFORM_DIR="infrastructure/terraform"
ENVIRONMENT="${1:-staging}"

# Functions
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING: $1${NC}"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $1${NC}"
    exit 1
}

info() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')] INFO: $1${NC}"
}

check_prerequisites() {
    log "Checking prerequisites..."
    
    # Check if required tools are installed
    command -v aws >/dev/null 2>&1 || error "AWS CLI is required but not installed"
    command -v terraform >/dev/null 2>&1 || error "Terraform is required but not installed"
    command -v kubectl >/dev/null 2>&1 || error "kubectl is required but not installed"
    command -v helm >/dev/null 2>&1 || error "Helm is required but not installed"
    
    # Check AWS credentials
    aws sts get-caller-identity >/dev/null 2>&1 || error "AWS credentials not configured"
    
    log "Prerequisites check completed ✓"
}

validate_environment() {
    if [[ ! "$ENVIRONMENT" =~ ^(staging|prod)$ ]]; then
        error "Environment must be either 'staging' or 'prod'"
    fi
    
    log "Deploying to environment: $ENVIRONMENT"
}

setup_terraform_backend() {
    log "Setting up Terraform backend..."
    
    # Create S3 bucket for Terraform state if it doesn't exist
    BUCKET_NAME="nx-mono-repo-terraform-state-$(date +%s)"
    
    if ! aws s3 ls "s3://$BUCKET_NAME" 2>/dev/null; then
        info "Creating Terraform state bucket: $BUCKET_NAME"
        aws s3 mb "s3://$BUCKET_NAME" --region "$AWS_REGION"
        
        # Enable versioning
        aws s3api put-bucket-versioning \
            --bucket "$BUCKET_NAME" \
            --versioning-configuration Status=Enabled
        
        # Enable server-side encryption
        aws s3api put-bucket-encryption \
            --bucket "$BUCKET_NAME" \
            --server-side-encryption-configuration '{
                "Rules": [{
                    "ApplyServerSideEncryptionByDefault": {
                        "SSEAlgorithm": "AES256"
                    }
                }]
            }'
            
        # Block public access
        aws s3api put-public-access-block \
            --bucket "$BUCKET_NAME" \
            --public-access-block-configuration \
            "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"
    fi
    
    # Update Terraform configuration with bucket name
    sed -i.bak "s/# bucket = \"nx-mono-repo-terraform-state\"/bucket = \"$BUCKET_NAME\"/" "$TERRAFORM_DIR/main.tf"
    sed -i.bak "s/# key    = \"infrastructure\/terraform.tfstate\"/key    = \"$ENVIRONMENT\/terraform.tfstate\"/" "$TERRAFORM_DIR/main.tf"
    sed -i.bak "s/# region = \"us-west-2\"/region = \"$AWS_REGION\"/" "$TERRAFORM_DIR/main.tf"
    
    log "Terraform backend configured ✓"
}

deploy_infrastructure() {
    log "Deploying infrastructure with Terraform..."
    
    cd "$TERRAFORM_DIR"
    
    # Initialize Terraform
    terraform init
    
    # Plan the deployment
    log "Planning Terraform deployment..."
    terraform plan -var-file="$ENVIRONMENT.tfvars" -out="$ENVIRONMENT.tfplan"
    
    # Apply the deployment
    log "Applying Terraform deployment..."
    terraform apply "$ENVIRONMENT.tfplan"
    
    # Save outputs
    terraform output -json > "outputs-$ENVIRONMENT.json"
    
    cd - >/dev/null
    
    log "Infrastructure deployment completed ✓"
}

setup_kubectl() {
    log "Setting up kubectl configuration..."
    
    # Get cluster name from Terraform output
    CLUSTER_NAME=$(cd "$TERRAFORM_DIR" && terraform output -raw cluster_name)
    
    # Update kubeconfig
    aws eks update-kubeconfig --region "$AWS_REGION" --name "$CLUSTER_NAME"
    
    # Test cluster connection
    kubectl cluster-info
    
    log "kubectl configured for cluster: $CLUSTER_NAME ✓"
}

install_kubernetes_addons() {
    log "Installing Kubernetes add-ons..."
    
    # Get values from Terraform outputs
    cd "$TERRAFORM_DIR"
    CLUSTER_NAME=$(terraform output -raw cluster_name)
    VPC_ID=$(terraform output -raw vpc_id)
    cd - >/dev/null
    
    # Add required Helm repositories
    helm repo add eks https://aws.github.io/eks-charts
    helm repo add bitnami https://charts.bitnami.com/bitnami
    helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
    helm repo add grafana https://grafana.github.io/helm-charts
    helm repo update
    
    # Install AWS Load Balancer Controller
    log "Installing AWS Load Balancer Controller..."
    kubectl apply -k "https://github.com/aws/eks-charts/stable/aws-load-balancer-controller//crds?ref=master"
    
    helm upgrade --install aws-load-balancer-controller eks/aws-load-balancer-controller \
        -n kube-system \
        --set clusterName="$CLUSTER_NAME" \
        --set serviceAccount.create=true \
        --set serviceAccount.annotations."eks\.amazonaws\.com/role-arn"="$(cd "$TERRAFORM_DIR" && terraform output -raw aws_load_balancer_controller_role_arn 2>/dev/null || echo '')" \
        --wait
    
    # Install Cluster Autoscaler
    log "Installing Cluster Autoscaler..."
    CLUSTER_AUTOSCALER_ROLE_ARN=$(cd "$TERRAFORM_DIR" && terraform output -raw cluster_autoscaler_role_arn 2>/dev/null || echo '')
    
    envsubst <<EOF | kubectl apply -f -
$(cat k8s/base/cluster-autoscaler/autoscaler.yaml)
EOF
    
    log "Kubernetes add-ons installed ✓"
}

deploy_monitoring_stack() {
    log "Deploying monitoring and observability stack..."
    
    # Update Helm dependencies
    helm dependency update helm/nx-mono-infrastructure/
    
    # Install infrastructure services
    helm upgrade --install nx-infra helm/nx-mono-infrastructure/ \
        --namespace infrastructure \
        --create-namespace \
        --values helm/nx-mono-infrastructure/values.yaml \
        --set global.environment="$ENVIRONMENT" \
        --wait --timeout=10m
    
    log "Monitoring stack deployed ✓"
}

setup_secrets() {
    log "Setting up Kubernetes secrets..."
    
    # Get database and Redis endpoints from Terraform
    cd "$TERRAFORM_DIR"
    DB_ENDPOINT=$(terraform output -raw rds_endpoint)
    REDIS_ENDPOINT=$(terraform output -raw redis_endpoint)
    cd - >/dev/null
    
    # Create database secret (you'll need to set these environment variables)
    kubectl create secret generic database-secret \
        --from-literal=url="postgresql://postgres:${DB_PASSWORD}@${DB_ENDPOINT}:5432/nx_mono_repo" \
        --from-literal=host="$DB_ENDPOINT" \
        --from-literal=username="postgres" \
        --from-literal=password="${DB_PASSWORD}" \
        --from-literal=database="nx_mono_repo" \
        --dry-run=client -o yaml | kubectl apply -f -
    
    # Create Redis secret
    kubectl create secret generic redis-secret \
        --from-literal=url="redis://${REDIS_ENDPOINT}:6379" \
        --dry-run=client -o yaml | kubectl apply -f -
    
    # Create app secrets
    kubectl create secret generic app-secrets \
        --from-literal=jwt-secret="${JWT_SECRET:-$(openssl rand -base64 32)}" \
        --dry-run=client -o yaml | kubectl apply -f -
    
    log "Secrets created ✓"
}

setup_backup_jobs() {
    log "Setting up backup jobs..."
    
    # Get backup bucket from Terraform
    cd "$TERRAFORM_DIR"
    BACKUP_BUCKET=$(terraform output -raw backup_bucket)
    BACKUP_ROLE_ARN=$(terraform output -raw backup_role_arn 2>/dev/null || echo '')
    cd - >/dev/null
    
    # Deploy backup CronJob
    envsubst <<EOF | kubectl apply -f -
$(cat k8s/base/backup/postgres-backup.yaml)
EOF
    
    log "Backup jobs configured ✓"
}

verify_deployment() {
    log "Verifying deployment..."
    
    # Check cluster status
    kubectl cluster-info
    
    # Check nodes
    kubectl get nodes -o wide
    
    # Check system pods
    kubectl get pods -n kube-system
    
    # Check infrastructure pods
    kubectl get pods -n infrastructure
    
    # Check services
    kubectl get svc -A
    
    log "Deployment verification completed ✓"
}

print_access_info() {
    log "Deployment completed successfully!"
    info ""
    info "Access Information:"
    info "=================="
    
    # Get load balancer URL
    LB_HOSTNAME=$(kubectl get ingress nx-mono-repo-ingress -o jsonpath='{.status.loadBalancer.ingress[0].hostname}' 2>/dev/null || echo "Pending...")
    
    if [[ "$ENVIRONMENT" == "prod" ]]; then
        info "Production API: https://api.nx-mono-repo.com"
        info "Production App: https://app.nx-mono-repo.com"
        info "Monitoring: https://monitoring.nx-mono-repo.com"
    else
        info "Staging API: https://api-staging.nx-mono-repo.com"
        info "Staging App: https://app-staging.nx-mono-repo.com"
        info "Monitoring: https://monitoring-staging.nx-mono-repo.com"
    fi
    
    info "Load Balancer: $LB_HOSTNAME"
    info ""
    info "Port Forward Commands:"
    info "====================="
    info "Grafana: kubectl port-forward -n infrastructure svc/nx-infra-grafana 3000:3000"
    info "Prometheus: kubectl port-forward -n infrastructure svc/nx-infra-prometheus-server 9090:80"
    info "Jaeger: kubectl port-forward -n infrastructure svc/nx-infra-jaeger 16686:16686"
    info ""
    info "Useful Commands:"
    info "==============="
    info "Check pods: kubectl get pods -A"
    info "Check deployments: kubectl get deployments"
    info "Check ingress: kubectl get ingress"
    info "View logs: kubectl logs -f deployment/api-gateway"
    info "Manual backup: kubectl create job --from=cronjob/postgres-backup postgres-backup-manual"
    info ""
}

print_help() {
    echo "Usage: $0 [ENVIRONMENT]"
    echo ""
    echo "Deploy NX Mono Repo infrastructure to AWS EKS"
    echo ""
    echo "Arguments:"
    echo "  ENVIRONMENT    Target environment (staging|prod) [default: staging]"
    echo ""
    echo "Required Environment Variables:"
    echo "  DB_PASSWORD    PostgreSQL password"
    echo "  JWT_SECRET     JWT secret for authentication (optional, will be generated)"
    echo ""
    echo "Examples:"
    echo "  $0 staging     Deploy to staging environment"
    echo "  $0 prod        Deploy to production environment"
    echo ""
}

# Main execution
main() {
    if [[ "$1" == "-h" ]] || [[ "$1" == "--help" ]]; then
        print_help
        exit 0
    fi
    
    if [[ -z "${DB_PASSWORD:-}" ]]; then
        error "DB_PASSWORD environment variable is required"
    fi
    
    log "Starting infrastructure deployment for $ENVIRONMENT environment..."
    
    check_prerequisites
    validate_environment
    setup_terraform_backend
    deploy_infrastructure
    setup_kubectl
    install_kubernetes_addons
    deploy_monitoring_stack
    setup_secrets
    setup_backup_jobs
    verify_deployment
    print_access_info
    
    log "Infrastructure deployment completed successfully! 🎉"
}

# Run main function with all arguments
main "$@"
