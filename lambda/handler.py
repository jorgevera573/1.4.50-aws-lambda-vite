"""API REST de tareas: una única Lambda detrás de API Gateway v2 (HTTP API).

El handler lee ``routeKey`` del evento (formato de carga 2.0) y enruta cada
petición a la operación de DynamoDB correspondiente.

Las cabeceras CORS NO se añaden aquí: se configuran de forma centralizada en
API Gateway para evitar cabeceras duplicadas.
"""

from __future__ import annotations

import base64
import binascii
import json
import logging
import os
import uuid
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any

import boto3
from botocore.exceptions import BotoCoreError, ClientError

MAX_TITLE_LENGTH = 200
MAX_BODY_BYTES = 10 * 1024

logger = logging.getLogger()
logger.setLevel(os.environ.get("LOG_LEVEL", "INFO"))

_table: Any = None


class ApiError(Exception):
    """Error controlado que se traduce en una respuesta HTTP para el cliente."""

    def __init__(self, status: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message


def _get_table() -> Any:
    """Devuelve la tabla, creando el cliente solo una vez por contenedor."""
    global _table  # noqa: PLW0603 - caché deliberada entre invocaciones en caliente
    if _table is None:
        _table = boto3.resource("dynamodb").Table(os.environ["TABLE_NAME"])
    return _table


def _now() -> str:
    """Fecha UTC en ISO 8601 con milisegundos y sufijo Z."""
    return datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _response(status: int, body: Any = None) -> dict[str, Any]:
    if body is None:
        return {"statusCode": status, "headers": {}}
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json; charset=utf-8"},
        "body": json.dumps(body, ensure_ascii=False),
    }


def _error(status: int, code: str, message: str) -> dict[str, Any]:
    return _response(status, {"error": {"code": code, "message": message}})


def _not_found() -> ApiError:
    return ApiError(404, "not_found", "La tarea no existe.")


def _task_id(event: dict[str, Any]) -> str:
    """Obtiene el id de la ruta. Un id que no es UUID no puede existir: 404."""
    raw = (event.get("pathParameters") or {}).get("id", "")
    try:
        return str(uuid.UUID(raw))
    except (ValueError, TypeError, AttributeError):
        raise _not_found() from None


def _parse_body(event: dict[str, Any]) -> dict[str, Any]:
    raw = event.get("body")
    if raw is None or raw == "":
        raise ApiError(400, "invalid_body", "El cuerpo de la petición es obligatorio.")
    if event.get("isBase64Encoded"):
        try:
            raw = base64.b64decode(raw, validate=True).decode("utf-8")
        except (binascii.Error, UnicodeDecodeError):
            raise ApiError(400, "invalid_json", "El cuerpo no es JSON válido.") from None
    if len(raw.encode("utf-8")) > MAX_BODY_BYTES:
        raise ApiError(413, "body_too_large", "El cuerpo de la petición es demasiado grande.")
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        raise ApiError(400, "invalid_json", "El cuerpo no es JSON válido.") from None
    if not isinstance(data, dict):
        raise ApiError(400, "invalid_body", "El cuerpo debe ser un objeto JSON.")
    return data


def _reject_unknown_fields(data: dict[str, Any], allowed: set[str]) -> None:
    unknown = sorted(set(data) - allowed)
    if unknown:
        raise ApiError(
            400,
            "validation_error",
            f"Campos no permitidos: {', '.join(unknown)}. "
            f"Solo se aceptan: {', '.join(sorted(allowed))}.",
        )


def _validate_title(value: Any) -> str:
    if not isinstance(value, str):
        raise ApiError(400, "validation_error", "El título debe ser un texto.")
    title = value.strip()
    if not title:
        raise ApiError(400, "validation_error", "El título no puede estar vacío.")
    if len(title) > MAX_TITLE_LENGTH:
        raise ApiError(
            400,
            "validation_error",
            f"El título no puede superar {MAX_TITLE_LENGTH} caracteres.",
        )
    return title


def _validate_completed(value: Any) -> bool:
    # isinstance(1, bool) es False, pero comprobamos el tipo exacto por claridad.
    if type(value) is not bool:
        raise ApiError(400, "validation_error", "El campo completed debe ser true o false.")
    return value


def _serialize(item: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": item["id"],
        "title": item["title"],
        "completed": bool(item["completed"]),
        "createdAt": item["createdAt"],
        "updatedAt": item["updatedAt"],
    }


def _is_conditional_failure(error: ClientError) -> bool:
    return error.response.get("Error", {}).get("Code") == "ConditionalCheckFailedException"


# --------------------------------------------------------------------------- operaciones


def list_tasks(event: dict[str, Any]) -> dict[str, Any]:
    """Lee todas las páginas de Scan (cada página devuelve como máximo 1 MB)."""
    table = _get_table()
    scan_kwargs: dict[str, Any] = {}
    page_size = int(os.environ.get("SCAN_PAGE_SIZE", "0"))
    if page_size > 0:
        scan_kwargs["Limit"] = page_size

    items: list[dict[str, Any]] = []
    while True:
        page = table.scan(**scan_kwargs)
        items.extend(page.get("Items", []))
        last_key = page.get("LastEvaluatedKey")
        if not last_key:
            break
        scan_kwargs["ExclusiveStartKey"] = last_key

    tasks = sorted((_serialize(i) for i in items), key=lambda t: t["createdAt"], reverse=True)
    return _response(200, {"tasks": tasks, "count": len(tasks)})


def create_task(event: dict[str, Any]) -> dict[str, Any]:
    data = _parse_body(event)
    _reject_unknown_fields(data, {"title"})
    if "title" not in data:
        raise ApiError(400, "validation_error", "El campo title es obligatorio.")
    now = _now()
    item = {
        "id": str(uuid.uuid4()),
        "title": _validate_title(data["title"]),
        "completed": False,
        "createdAt": now,
        "updatedAt": now,
    }
    _get_table().put_item(Item=item, ConditionExpression="attribute_not_exists(id)")
    return _response(201, _serialize(item))


def get_task(event: dict[str, Any]) -> dict[str, Any]:
    task_id = _task_id(event)
    item = _get_table().get_item(Key={"id": task_id}).get("Item")
    if item is None:
        raise _not_found()
    return _response(200, _serialize(item))


def update_task(event: dict[str, Any]) -> dict[str, Any]:
    task_id = _task_id(event)
    data = _parse_body(event)
    _reject_unknown_fields(data, {"title", "completed"})
    if not data:
        raise ApiError(400, "validation_error", "Indica title, completed o ambos.")

    names = {"#updatedAt": "updatedAt"}
    values: dict[str, Any] = {":updatedAt": _now()}
    sets = ["#updatedAt = :updatedAt"]
    if "title" in data:
        names["#title"] = "title"
        values[":title"] = _validate_title(data["title"])
        sets.append("#title = :title")
    if "completed" in data:
        names["#completed"] = "completed"
        values[":completed"] = _validate_completed(data["completed"])
        sets.append("#completed = :completed")

    try:
        result = _get_table().update_item(
            Key={"id": task_id},
            UpdateExpression="SET " + ", ".join(sets),
            # Sin esta condición UpdateItem crearía (upsert) una tarea inexistente.
            ConditionExpression="attribute_exists(id)",
            ExpressionAttributeNames=names,
            ExpressionAttributeValues=values,
            ReturnValues="ALL_NEW",
        )
    except ClientError as error:
        if _is_conditional_failure(error):
            raise _not_found() from None
        raise
    return _response(200, _serialize(result["Attributes"]))


def delete_task(event: dict[str, Any]) -> dict[str, Any]:
    task_id = _task_id(event)
    try:
        _get_table().delete_item(Key={"id": task_id}, ConditionExpression="attribute_exists(id)")
    except ClientError as error:
        if _is_conditional_failure(error):
            raise _not_found() from None
        raise
    return _response(204)


ROUTES: dict[str, Callable[[dict[str, Any]], dict[str, Any]]] = {
    "GET /tasks": list_tasks,
    "POST /tasks": create_task,
    "GET /tasks/{id}": get_task,
    "PUT /tasks/{id}": update_task,
    "DELETE /tasks/{id}": delete_task,
}


def lambda_handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    route_key = event.get("routeKey", "")
    request_id = (event.get("requestContext") or {}).get("requestId", "-")
    route = ROUTES.get(route_key)
    if route is None:
        return _error(404, "route_not_found", "Ruta no encontrada.")
    try:
        return route(event)
    except ApiError as error:
        logger.info("%s %s -> %s %s", request_id, route_key, error.status, error.code)
        return _error(error.status, error.code, error.message)
    except (ClientError, BotoCoreError):
        # El detalle completo queda en CloudWatch; el cliente recibe un mensaje genérico.
        logger.exception("%s %s -> error de DynamoDB", request_id, route_key)
        return _error(500, "internal_error", "Error interno. Inténtalo de nuevo más tarde.")
    except Exception:
        logger.exception("%s %s -> error inesperado", request_id, route_key)
        return _error(500, "internal_error", "Error interno. Inténtalo de nuevo más tarde.")
