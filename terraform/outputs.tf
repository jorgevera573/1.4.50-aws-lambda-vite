output "api_url" {
  description = "URL base de la API (usar como VITE_API_URL)."
  value       = trimsuffix(aws_apigatewayv2_stage.default.invoke_url, "/")
}

output "table_name" {
  description = "Nombre de la tabla DynamoDB."
  value       = aws_dynamodb_table.tasks.name
}

output "lambda_function_name" {
  description = "Nombre de la función Lambda."
  value       = aws_lambda_function.api.function_name
}

output "cors_allow_origins" {
  description = "Orígenes permitidos por CORS."
  value       = var.cors_allow_origins
}
