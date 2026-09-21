# El paquete contiene solo handler.py: boto3 lo aporta el runtime python3.12.
# El modo de fichero fijo mantiene estable el hash del ZIP entre máquinas.
data "archive_file" "lambda" {
  type             = "zip"
  source_file      = "${path.module}/../lambda/handler.py"
  output_path      = "${path.module}/build/lambda.zip"
  output_file_mode = "0644"
}

resource "aws_cloudwatch_log_group" "lambda" {
  name              = "/aws/lambda/${local.name_prefix}-api"
  retention_in_days = var.log_retention_days
}

resource "aws_lambda_function" "api" {
  function_name = "${local.name_prefix}-api"
  description   = "API REST de tareas (${local.name_prefix})."
  role          = aws_iam_role.lambda.arn
  runtime       = "python3.12"
  handler       = "handler.lambda_handler"
  architectures = ["arm64"]
  memory_size   = var.lambda_memory_mb
  timeout       = var.lambda_timeout_seconds

  filename         = data.archive_file.lambda.output_path
  source_code_hash = data.archive_file.lambda.output_base64sha256

  environment {
    variables = {
      TABLE_NAME = aws_dynamodb_table.tasks.name
      LOG_LEVEL  = "INFO"
    }
  }

  logging_config {
    log_format = "Text"
    log_group  = aws_cloudwatch_log_group.lambda.name
  }

  depends_on = [
    aws_iam_role_policy.lambda,
    aws_cloudwatch_log_group.lambda,
  ]
}
