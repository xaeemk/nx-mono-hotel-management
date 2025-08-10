#!/bin/bash

# Deploy AWS EKS Infrastructure with Terraform
# Usage: ./scripts/deploy-aws-infrastructure.sh [staging|production]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default environment
ENVIRONMENT=${1:-staging}

echo -e "${BLUE}🚀 Starting AWS EKS Infrastructure Deployment${NC}"
echo -e "${YELLOW}Environment: ${ENVIRONMENT}${NC}"

# Validate environment
if [[ ! "$ENVIRONMENT" =~ ^(staging|production)$ ]]; then
    echo -e "${RED}❌ Error: Environment must be 'staging' or 'production'${NC}"
    exit 1
fi

# Change to Terraform directory
cd infrastructure/terraform

# Check if Terraform is installed
if ! command -v terraform &> /dev/null; then
    echo -e "${RED}❌ Terraform is not installed. Please install Terraform first.${NC}"
    exit 1
fi

# Check if AWS CLI is installed and configured
if ! command -v aws &> /dev/null; then
    echo -e "${RED}❌ AWS CLI is not installed. Please install AWS CLI first.${NC}"
    exit 1
fi

# Verify AWS credentials
echo -e "${YELLOW}🔐 Verifying AWS credentials...${NC}"
if ! aws sts get-caller-identity &> /dev/null; then
    echo -e "${RED}❌ AWS credentials not configured. Please run 'aws configure'${NC}"
    exit 1
fi

# Get AWS account ID and region
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
AWS_REGION=${AWS_REGION:-us-east-1}

echo -e "${GREEN}✅ AWS Account: ${AWS_ACCOUNT_ID}${NC}"
echo -e "${GREEN}✅ AWS Region: ${AWS_REGION}${NC}"

# Initialize Terraform
echo -e "${YELLOW}📦 Initializing Terraform...${NC}"
terraform init -upgrade

# Validate Terraform configuration
echo -e "${YELLOW}🔍 Validating Terraform configuration...${NC}"
terraform validate

# Plan the deployment
echo -e "${YELLOW}📋 Planning Terraform deployment...${NC}"
terraform plan -var-file="${ENVIRONMENT}.tfvars" -out="${ENVIRONMENT}.tfplan"

# Ask for confirmation
echo -e "${YELLOW}❓ Do you want to apply this Terraform plan? (y/N)${NC}"
read -r response
if [[ ! "$response" =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}⏹️ Deployment cancelled${NC}"
    exit 0
fi

# Apply the deployment
echo -e "${YELLOW}🏗️ Applying Terraform deployment...${NC}"
terraform apply "${ENVIRONMENT}.tfplan"

# Get important outputs
echo -e "${GREEN}📊 Deployment completed! Getting cluster information...${NC}"

# Get EKS cluster name
CLUSTER_NAME=$(terraform output -raw eks_cluster_name 2>/dev/null || echo "nx-mono-${ENVIRONMENT}")

# Update kubeconfig
echo -e "${YELLOW}🔧 Updating kubeconfig...${NC}"
aws eks update-kubeconfig --region ${AWS_REGION} --name ${CLUSTER_NAME}

# Install AWS Load Balancer Controller
echo -e "${YELLOW}🔧 Installing AWS Load Balancer Controller...${NC}"
cd ../../k8s

# Apply service account
kubectl apply -f base/aws-load-balancer-controller/controller.yaml

# Apply cluster autoscaler
kubectl apply -f base/cluster-autoscaler/autoscaler.yaml

# Create secrets (these will be populated by the user)
kubectl create namespace nx-mono-${ENVIRONMENT} --dry-run=client -o yaml | kubectl apply -f -

# Create placeholder secrets (users need to populate these)
echo -e "${YELLOW}🔑 Creating secret placeholders...${NC}"
kubectl create secret generic database-secret \
    --from-literal=url="postgresql://placeholder" \
    --namespace=nx-mono-${ENVIRONMENT} \
    --dry-run=client -o yaml | kubectl apply -f -

kubectl create secret generic redis-secret \
    --from-literal=url="redis://placeholder" \
    --namespace=nx-mono-${ENVIRONMENT} \
    --dry-run=client -o yaml | kubectl apply -f -

kubectl create secret generic app-secrets \
    --from-literal=jwt-secret="placeholder" \
    --from-literal=twilio-account-sid="placeholder" \
    --from-literal=twilio-auth-token="placeholder" \
    --from-literal=openai-api-key="placeholder" \
    --namespace=nx-mono-${ENVIRONMENT} \
    --dry-run=client -o yaml | kubectl apply -f -

# Deploy infrastructure Helm chart
cd ../helm
echo -e "${YELLOW}🎯 Installing infrastructure with Helm...${NC}"
helm upgrade --install nx-mono-infrastructure ./nx-mono-infrastructure \
    --namespace nx-mono-${ENVIRONMENT} \
    --create-namespace \
    --values ./nx-mono-infrastructure/values.yaml \
    --values ./nx-mono-infrastructure/values-production.yaml \
    --wait

# Get service URLs
echo -e "${GREEN}🌐 Getting service endpoints...${NC}"
kubectl get svc -n nx-mono-${ENVIRONMENT}

# Display completion message
echo -e "${GREEN}✅ Infrastructure deployment completed!${NC}"
echo -e "${BLUE}📋 Next steps:${NC}"
echo -e "${YELLOW}1. Update the secrets in Kubernetes with real values${NC}"
echo -e "${YELLOW}2. Configure DNS records for your domain${NC}"
echo -e "${YELLOW}3. Deploy applications using GitHub Actions${NC}"
echo -e "${YELLOW}4. Monitor the deployment in AWS Console${NC}"

echo -e "\n${BLUE}🔗 Important URLs:${NC}"
echo -e "${GREEN}• EKS Cluster: ${CLUSTER_NAME}${NC}"
echo -e "${GREEN}• Region: ${AWS_REGION}${NC}"
echo -e "${GREEN}• Namespace: nx-mono-${ENVIRONMENT}${NC}"

echo -e "\n${YELLOW}💡 To update secrets, run:${NC}"
echo -e "kubectl patch secret database-secret -n nx-mono-${ENVIRONMENT} -p='{\"data\":{\"url\":\"$(echo -n 'your-database-url' | base64)\"}}'"
echo -e "kubectl patch secret redis-secret -n nx-mono-${ENVIRONMENT} -p='{\"data\":{\"url\":\"$(echo -n 'your-redis-url' | base64)\"}}'"

cd ../..
