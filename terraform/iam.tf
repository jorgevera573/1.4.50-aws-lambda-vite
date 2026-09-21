data "aws_iam_policy_document" "lambda_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "lambda" {
  name               = "${local.name_prefix}-lambda-role"
  description        = "Rol de ejecucion de la Lambda de tareas (${local.name_prefix})."
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json

  # Boundary creada previamente por un administrador (iam/lambda-permissions-boundary.json).
  # Limita los permisos efectivos del rol aunque se modifique su política inline.
  permissions_boundary = local.lambda_boundary_arn
}

# Mínimo privilegio: solo las acciones que usa el handler, solo sobre esta tabla,
# y solo escritura en su propio grupo de logs (creado por Terraform).
data "aws_iam_policy_document" "lambda_permissions" {
  statement {
    sid = "TasksTable"
    actions = [
      "dynamodb:PutItem",
      "dynamodb:GetItem",
      "dynamodb:UpdateItem",
      "dynamodb:DeleteItem",
      "dynamodb:Scan",
    ]
    resources = [aws_dynamodb_table.tasks.arn]
  }

  statement {
    sid     = "OwnLogs"
    actions = ["logs:CreateLogStream", "logs:PutLogEvents"]
    # Ambas acciones actúan sobre el tipo de recurso log-stream:
    # arn:aws:logs:<región>:<cuenta>:log-group:<grupo>:log-stream:<stream>
    resources = ["${aws_cloudwatch_log_group.lambda.arn}:log-stream:*"]
  }
}

resource "aws_iam_role_policy" "lambda" {
  name   = "${local.name_prefix}-lambda-policy"
  role   = aws_iam_role.lambda.id
  policy = data.aws_iam_policy_document.lambda_permissions.json
}
