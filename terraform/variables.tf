variable "aws_region" {
  description = "Región AWS donde se despliegan los recursos."
  type        = string
  default     = "us-east-1"
}

variable "aws_profile" {
  description = "Perfil de AWS CLI. null usa la cadena de credenciales por defecto (p. ej. AWS_PROFILE)."
  type        = string
  default     = null
}

variable "allowed_account_id" {
  description = "Única cuenta AWS en la que se permite operar."
  type        = string
  default     = "336846061737"

  validation {
    condition     = can(regex("^[0-9]{12}$", var.allowed_account_id))
    error_message = "allowed_account_id debe tener 12 dígitos."
  }
}

variable "project_name" {
  description = "Prefijo de los nombres de recursos, específico de este proyecto para evitar colisiones."
  type        = string
  default     = "ms05-lambda-vite"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,30}$", var.project_name))
    error_message = "project_name: minúsculas, dígitos y guiones (3-31 caracteres)."
  }
}

variable "environment" {
  description = "Entorno. Se añade al prefijo de nombres y a la etiqueta Env."
  type        = string
  default     = "lab"
}

variable "cors_allow_origins" {
  description = "Orígenes CORS permitidos: localhost en desarrollo y el dominio concreto de Vercel en producción."
  type        = list(string)
  default     = ["http://localhost:5173", "http://127.0.0.1:5173"]

  validation {
    condition = length(var.cors_allow_origins) > 0 && alltrue([
      for o in var.cors_allow_origins : can(regex("^https?://[a-z0-9.-]+(:[0-9]+)?$", o))
    ])
    error_message = "Cada origen debe ser http(s)://host[:puerto], sin ruta, sin barra final y sin comodines."
  }
}

variable "log_retention_days" {
  description = "Días de retención de los logs de Lambda y API Gateway."
  type        = number
  default     = 14
}

variable "enable_api_access_logs" {
  description = "Registrar los accesos de API Gateway en CloudWatch Logs. Desactivado: exigiría permisos globales logs:*LogDelivery* y logs:PutResourcePolicy."
  type        = bool
  default     = false
}

variable "http_api_id" {
  description = "ID de la HTTP API creada en el bootstrap administrativo (docs/permisos-iam.md). null = Terraform la crearía."
  type        = string
  default     = null

  validation {
    condition     = var.http_api_id == null || can(regex("^[a-z0-9]{10}$", var.http_api_id))
    error_message = "http_api_id debe ser el ID de 10 caracteres de la API (p. ej. a1b2c3d4e5)."
  }
}

variable "lambda_memory_mb" {
  description = "Memoria asignada a la Lambda (MB)."
  type        = number
  default     = 128
}

variable "lambda_timeout_seconds" {
  description = "Tiempo máximo de ejecución de la Lambda (s)."
  type        = number
  default     = 10
}

variable "throttle_rate_limit" {
  description = "Peticiones por segundo sostenidas permitidas por la API (demo)."
  type        = number
  default     = 10
}

variable "throttle_burst_limit" {
  description = "Ráfaga máxima de peticiones permitida por la API (demo)."
  type        = number
  default     = 20
}
