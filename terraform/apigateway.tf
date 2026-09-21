locals {
  routes = toset([
    "GET /tasks",
    "POST /tasks",
    "GET /tasks/{id}",
    "PUT /tasks/{id}",
    "DELETE /tasks/{id}",
  ])
}

# La API la crea un administrador (bootstrap) porque la política de master-semana05
# solo permite gestionar ese ID concreto. Este bloque la incorpora al estado en el
# primer plan/apply; cuando ya está en el estado, Terraform lo ignora.
import {
  for_each = var.http_api_id == null ? toset([]) : toset([var.http_api_id])
  to       = aws_apigatewayv2_api.http
  id       = each.value
}

resource "aws_apigatewayv2_api" "http" {
  name          = "${local.name_prefix}-http-api"
  description   = "API publica de tareas (${local.name_prefix}). Sin autenticacion: solo datos de demostracion."
  protocol_type = "HTTP"

  # CORS centralizado aquí; la Lambda no añade cabeceras Access-Control-*.
  cors_configuration {
    allow_origins = var.cors_allow_origins
    allow_methods = ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
    allow_headers = ["content-type"]
    max_age       = 3600
  }
}

resource "aws_apigatewayv2_integration" "lambda" {
  api_id                 = aws_apigatewayv2_api.http.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.api.invoke_arn
  payload_format_version = "2.0"
  timeout_milliseconds   = 12000
}

resource "aws_apigatewayv2_route" "tasks" {
  for_each = local.routes

  api_id    = aws_apigatewayv2_api.http.id
  route_key = each.value
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_cloudwatch_log_group" "api_access" {
  count = var.enable_api_access_logs ? 1 : 0

  name              = "/aws/apigateway/${local.name_prefix}-http-api"
  retention_in_days = var.log_retention_days
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.http.id
  name        = "$default"
  auto_deploy = true

  # Límites modestos para una demo pública: frenan abusos y acotan el coste.
  default_route_settings {
    throttling_rate_limit  = var.throttle_rate_limit
    throttling_burst_limit = var.throttle_burst_limit
  }

  dynamic "access_log_settings" {
    for_each = aws_cloudwatch_log_group.api_access

    content {
      destination_arn = access_log_settings.value.arn
      format = jsonencode({
        requestId      = "$context.requestId"
        ip             = "$context.identity.sourceIp"
        requestTime    = "$context.requestTime"
        httpMethod     = "$context.httpMethod"
        routeKey       = "$context.routeKey"
        status         = "$context.status"
        responseLength = "$context.responseLength"
        latencyMs      = "$context.integrationLatency"
        errorMessage   = "$context.error.message"
        integrationErr = "$context.integrationErrorMessage"
      })
    }
  }
}

# Solo este API Gateway puede invocar la Lambda.
resource "aws_lambda_permission" "api_gateway" {
  statement_id  = "AllowInvokeFromProjectHttpApi"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.http.execution_arn}/*/*"
}
