"""Fixtures comunes. Las pruebas usan Moto: nunca contactan con AWS."""

from __future__ import annotations

import json
import sys
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import boto3
import pytest
from moto import mock_aws

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import handler

TABLE_NAME = "test-tasks"
# Ruta que nunca existe: evita leer ~/.aws/config y ~/.aws/credentials.
NO_FILE = Path(__file__).parent / "__no_aws_files__"


@pytest.fixture(autouse=True)
def fake_aws_env(monkeypatch: pytest.MonkeyPatch) -> None:
    """Credenciales ficticias: impide usar perfiles o claves reales por accidente."""
    for var in ("AWS_PROFILE", "AWS_SESSION_TOKEN", "AWS_SECURITY_TOKEN"):
        monkeypatch.delenv(var, raising=False)
    monkeypatch.setenv("AWS_ACCESS_KEY_ID", "testing")
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "testing")
    monkeypatch.setenv("AWS_DEFAULT_REGION", "us-east-1")
    monkeypatch.setenv("AWS_CONFIG_FILE", str(NO_FILE))
    monkeypatch.setenv("AWS_SHARED_CREDENTIALS_FILE", str(NO_FILE))
    monkeypatch.setenv("TABLE_NAME", TABLE_NAME)
    monkeypatch.delenv("SCAN_PAGE_SIZE", raising=False)


@pytest.fixture
def table() -> Iterator[Any]:
    with mock_aws():
        handler._table = None
        dynamodb = boto3.resource("dynamodb", region_name="us-east-1")
        tbl = dynamodb.create_table(
            TableName=TABLE_NAME,
            KeySchema=[{"AttributeName": "id", "KeyType": "HASH"}],
            AttributeDefinitions=[{"AttributeName": "id", "AttributeType": "S"}],
            BillingMode="PAY_PER_REQUEST",
        )
        yield tbl
        handler._table = None


def make_event(
    route_key: str,
    *,
    task_id: str | None = None,
    body: Any = None,
    raw_body: str | None = None,
) -> dict[str, Any]:
    """Construye un evento de API Gateway v2 (payload 2.0) mínimo."""
    method, path = route_key.split(" ", 1)
    event: dict[str, Any] = {
        "version": "2.0",
        "routeKey": route_key,
        "rawPath": path.replace("{id}", task_id or ""),
        "requestContext": {"requestId": "test-request", "http": {"method": method}},
        "isBase64Encoded": False,
    }
    if task_id is not None:
        event["pathParameters"] = {"id": task_id}
    if raw_body is not None:
        event["body"] = raw_body
    elif body is not None:
        event["body"] = json.dumps(body)
    return event


def call(route_key: str, **kwargs: Any) -> tuple[int, Any]:
    """Invoca el handler y devuelve (status, cuerpo JSON decodificado o None)."""
    response = handler.lambda_handler(make_event(route_key, **kwargs), None)
    body = response.get("body")
    return response["statusCode"], (json.loads(body) if body else None)
