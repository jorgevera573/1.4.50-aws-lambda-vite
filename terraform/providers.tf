provider "aws" {
  region  = var.aws_region
  profile = var.aws_profile

  # Protección: Terraform se niega a operar en cualquier otra cuenta.
  allowed_account_ids = [var.allowed_account_id]

  default_tags {
    tags = local.tags
  }
}
