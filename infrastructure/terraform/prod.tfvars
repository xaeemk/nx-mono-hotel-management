environment = "prod"
aws_region = "us-west-2"

# EKS Configuration
cluster_name = "nx-mono-repo"
node_instance_types = ["t3.large", "t3.xlarge"]
min_size = 3
max_size = 20
desired_size = 5
