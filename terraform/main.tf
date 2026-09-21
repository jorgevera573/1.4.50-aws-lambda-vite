locals {
  name_prefix = "${var.project_name}-${var.environment}"

  # Política gestionada que crea el administrador antes del despliegue (no la gestiona Terraform).
  lambda_boundary_arn = "arn:aws:iam::${var.allowed_account_id}:policy/${local.name_prefix}-lambda-boundary"

  tags = {
    Project   = "master-semana05-lambda-vite"
    ManagedBy = "Terraform"
    Env       = var.environment
  }
}
