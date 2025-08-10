environment = "staging"
aws_region = "us-west-2"

# EKS Configuration
cluster_name = "nx-mono-repo"
node_instance_types = ["t3.medium"]
min_size = 1
max_size = 5
desired_size = 2
