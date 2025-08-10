# GitHub Repository Secrets Configuration

This guide covers setting up all required secrets for the CI/CD pipeline.

## Required Secrets

### AWS Infrastructure Secrets
1. **AWS_ACCESS_KEY_ID** - AWS access key for Terraform and deployment
2. **AWS_SECRET_ACCESS_KEY** - AWS secret key for Terraform and deployment
3. **AWS_REGION** - AWS region (e.g., `us-east-1`)

### Application Secrets
4. **DATABASE_URL** - PostgreSQL connection string
5. **REDIS_URL** - Redis connection string
6. **JWT_SECRET** - JWT signing secret (generate with: `openssl rand -base64 32`)

### Third-Party API Secrets
7. **TWILIO_ACCOUNT_SID** - Twilio account SID for voice services
8. **TWILIO_AUTH_TOKEN** - Twilio auth token
9. **OPENAI_API_KEY** - OpenAI API key for voice AI features

### Notification Secrets
10. **SLACK_WEBHOOK_URL** - Slack webhook for deployment notifications (optional)

## How to Add Secrets

1. Go to your GitHub repository
2. Navigate to **Settings** > **Secrets and variables** > **Actions**
3. Click **New repository secret**
4. Add each secret with the exact name and value

## AWS IAM Setup

Create an IAM user with the following permissions:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "ec2:*",
                "eks:*",
                "iam:*",
                "ecr:*",
                "rds:*",
                "elasticache:*",
                "s3:*",
                "logs:*",
                "autoscaling:*",
                "elasticloadbalancing:*",
                "route53:*",
                "acm:*",
                "kms:*",
                "secretsmanager:*"
            ],
            "Resource": "*"
        }
    ]
}
```

## Environment-Specific Values

### Staging Environment
- **AWS_REGION**: `us-east-1`
- **DATABASE_URL**: `postgresql://username:password@staging-db-endpoint:5432/nx_mono_repo`
- **REDIS_URL**: `redis://staging-redis-endpoint:6379`

### Production Environment
- **AWS_REGION**: `us-east-1` (or your preferred region)
- **DATABASE_URL**: `postgresql://username:password@prod-db-endpoint:5432/nx_mono_repo`
- **REDIS_URL**: `redis://prod-redis-endpoint:6379`

## Security Best Practices

1. **Use least privilege principle** for IAM permissions
2. **Rotate secrets regularly** (every 90 days)
3. **Never commit secrets** to version control
4. **Use separate secrets** for staging and production
5. **Enable GitHub secret scanning** in repository settings

## Testing Configuration

After adding secrets, test the configuration by:

1. Pushing to `staging` branch
2. Monitoring GitHub Actions logs
3. Verifying secret masking in logs
4. Confirming successful authentication with AWS

## Troubleshooting

### Common Issues:
- **Invalid AWS credentials**: Check IAM user permissions
- **Terraform state conflicts**: Ensure unique S3 bucket names
- **Secret not found**: Verify exact secret name matches workflow file
- **Permission denied**: Review IAM policy attachments

### Verification Commands:
```bash
# Test AWS credentials locally
aws sts get-caller-identity

# Validate Terraform configuration
terraform validate

# Check secret availability in Actions
echo "AWS_REGION is set: ${{ secrets.AWS_REGION }}"
```
