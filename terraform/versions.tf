terraform {
  required_version = ">= 1.9.0, < 2.0.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.7"
    }
  }

  # Estado local e independiente de cualquier otro proyecto (ALINA, Ansible...).
  # Se guarda en terraform/terraform.tfstate y está excluido de Git.
  backend "local" {
    path = "terraform.tfstate"
  }
}
