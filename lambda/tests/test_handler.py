"""Pruebas del contrato de la API de tareas."""

from __future__ import annotations

import base64
import json
import re
import uuid
from typing import Any

import pytest
from botocore.exceptions import ClientError

import handler
from tests.conftest import call, make_event

ISO_UTC = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$")


def create(title: str = "Comprar pan") -> dict[str, Any]:
    status, body = call("POST /tasks", body={"title": title})
    assert status == 201, body
    return body


# ------------------------------------------------------------------ creación (POST)


def test_create_returns_task_with_initial_values(table: Any) -> None:
    task = create("  Estudiar DynamoDB  ")

    assert uuid.UUID(task["id"]).version == 4
    assert task["title"] == "Estudiar DynamoDB"
    assert task["completed"] is False
    assert ISO_UTC.match(task["createdAt"])
    assert task["createdAt"] == task["updatedAt"]
    assert table.get_item(Key={"id": task["id"]})["Item"]["title"] == "Estudiar DynamoDB"


def test_create_response_is_json_without_cors_headers(table: Any) -> None:
    response = handler.lambda_handler(make_event("POST /tasks", body={"title": "x"}), None)

    assert response["headers"]["Content-Type"].startswith("application/json")
    assert not any(h.lower().startswith("access-control-") for h in response["headers"])


@pytest.mark.parametrize(
    "payload",
    [
        {"title": "x", "completed": True},
        {"title": "x", "id": "fijo"},
        {"title": "x", "createdAt": "2000-01-01T00:00:00.000Z"},
    ],
)
def test_create_rejects_fields_controlled_by_backend(table: Any, payload: dict[str, Any]) -> None:
    status, body = call("POST /tasks", body=payload)

    assert status == 400
    assert body["error"]["code"] == "validation_error"
    assert table.scan()["Count"] == 0


def test_create_accepts_base64_encoded_body(table: Any) -> None:
    event = make_event("POST /tasks")
    event["body"] = base64.b64encode(json.dumps({"title": "codificada"}).encode()).decode()
    event["isBase64Encoded"] = True

    response = handler.lambda_handler(event, None)

    assert response["statusCode"] == 201
    assert json.loads(response["body"])["title"] == "codificada"


# ------------------------------------------------------------------ validación


@pytest.mark.parametrize("raw", ["{no es json", "{'title': 'comillas simples'}", "[1,"])
def test_invalid_json_returns_400(table: Any, raw: str) -> None:
    status, body = call("POST /tasks", raw_body=raw)

    assert status == 400
    assert body["error"]["code"] == "invalid_json"


def test_missing_body_returns_400(table: Any) -> None:
    status, body = call("POST /tasks")

    assert status == 400
    assert body["error"]["code"] == "invalid_body"


@pytest.mark.parametrize("payload", [[], ["title"], "texto", 42, None, True])
def test_body_must_be_a_json_object(table: Any, payload: Any) -> None:
    status, body = call("POST /tasks", raw_body=json.dumps(payload))

    assert status == 400
    assert body["error"]["code"] == "invalid_body"


def test_create_requires_title(table: Any) -> None:
    status, body = call("POST /tasks", body={})

    assert status == 400
    assert "title" in body["error"]["message"]


@pytest.mark.parametrize("title", ["", "   ", "\t\n "])
def test_empty_or_blank_title_is_rejected(table: Any, title: str) -> None:
    status, body = call("POST /tasks", body={"title": title})

    assert status == 400
    assert body["error"]["code"] == "validation_error"
    assert table.scan()["Count"] == 0


@pytest.mark.parametrize("title", [123, None, ["a"], {"a": 1}, True])
def test_title_must_be_string(table: Any, title: Any) -> None:
    status, _ = call("POST /tasks", body={"title": title})

    assert status == 400


def test_title_length_limit(table: Any) -> None:
    ok = "a" * handler.MAX_TITLE_LENGTH
    status_ok, _ = call("POST /tasks", body={"title": ok})
    status_long, body = call("POST /tasks", body={"title": ok + "a"})

    assert status_ok == 201
    assert status_long == 400
    assert str(handler.MAX_TITLE_LENGTH) in body["error"]["message"]


def test_oversized_body_returns_413(table: Any) -> None:
    status, _ = call("POST /tasks", raw_body=json.dumps({"title": "a" * handler.MAX_BODY_BYTES}))

    assert status == 413


# ------------------------------------------------------------------ lectura (GET)


def test_get_existing_task(table: Any) -> None:
    task = create()

    status, body = call("GET /tasks/{id}", task_id=task["id"])

    assert status == 200
    assert body == task


@pytest.mark.parametrize("task_id", [str(uuid.uuid4()), "no-es-un-uuid", ""])
def test_get_missing_task_returns_404(table: Any, task_id: str) -> None:
    status, body = call("GET /tasks/{id}", task_id=task_id)

    assert status == 404
    assert body["error"]["code"] == "not_found"


def test_list_empty(table: Any) -> None:
    status, body = call("GET /tasks")

    assert status == 200
    assert body == {"tasks": [], "count": 0}


def test_list_returns_all_tasks_newest_first(table: Any) -> None:
    first = create("primera")
    second = create("segunda")

    status, body = call("GET /tasks")

    assert status == 200
    assert body["count"] == 2
    assert {t["id"] for t in body["tasks"]} == {first["id"], second["id"]}
    created = [t["createdAt"] for t in body["tasks"]]
    assert created == sorted(created, reverse=True)


def test_list_follows_scan_pagination(table: Any, monkeypatch: pytest.MonkeyPatch) -> None:
    """Con páginas de 2 elementos, 7 tareas requieren al menos 4 llamadas a Scan."""
    for i in range(7):
        table.put_item(
            Item={
                "id": str(uuid.uuid4()),
                "title": f"t{i}",
                "completed": False,
                "createdAt": f"2026-01-01T00:00:0{i}.000Z",
                "updatedAt": f"2026-01-01T00:00:0{i}.000Z",
            }
        )
    monkeypatch.setenv("SCAN_PAGE_SIZE", "2")
    real_table = handler._get_table()
    calls: list[dict[str, Any]] = []
    original_scan = real_table.scan

    def spy_scan(**kwargs: Any) -> Any:
        calls.append(dict(kwargs))
        return original_scan(**kwargs)

    monkeypatch.setattr(real_table, "scan", spy_scan)

    status, body = call("GET /tasks")

    assert status == 200
    assert body["count"] == 7
    assert len({t["id"] for t in body["tasks"]}) == 7
    assert len(calls) >= 4
    assert "ExclusiveStartKey" not in calls[0]
    assert all("ExclusiveStartKey" in c for c in calls[1:])


# ------------------------------------------------------------------ actualización (PUT)


def test_update_title(table: Any) -> None:
    task = create("original")

    status, body = call("PUT /tasks/{id}", task_id=task["id"], body={"title": "  nuevo  "})

    assert status == 200
    assert body["title"] == "nuevo"
    assert body["completed"] is False
    assert body["updatedAt"] >= task["updatedAt"]
    assert table.get_item(Key={"id": task["id"]})["Item"]["title"] == "nuevo"


def test_update_completed_and_back(table: Any) -> None:
    task = create()

    _, done = call("PUT /tasks/{id}", task_id=task["id"], body={"completed": True})
    _, undone = call("PUT /tasks/{id}", task_id=task["id"], body={"completed": False})

    assert done["completed"] is True
    assert undone["completed"] is False
    assert done["title"] == task["title"]
    assert table.get_item(Key={"id": task["id"]})["Item"]["completed"] is False


def test_update_title_and_completed_together(table: Any) -> None:
    task = create()

    status, body = call(
        "PUT /tasks/{id}", task_id=task["id"], body={"title": "ambos", "completed": True}
    )

    assert status == 200
    assert (body["title"], body["completed"]) == ("ambos", True)


def test_update_keeps_id_and_created_at_and_refreshes_updated_at(
    table: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(handler, "_now", lambda: "2026-01-01T00:00:00.000Z")
    task = create()
    monkeypatch.setattr(handler, "_now", lambda: "2026-02-02T00:00:00.000Z")

    _, body = call("PUT /tasks/{id}", task_id=task["id"], body={"completed": True})
    stored = table.get_item(Key={"id": task["id"]})["Item"]

    assert body["id"] == task["id"] == stored["id"]
    assert body["createdAt"] == "2026-01-01T00:00:00.000Z" == stored["createdAt"]
    assert body["updatedAt"] == "2026-02-02T00:00:00.000Z" == stored["updatedAt"]


@pytest.mark.parametrize(
    "payload",
    [
        {"id": str(uuid.uuid4())},
        {"createdAt": "2000-01-01T00:00:00.000Z"},
        {"updatedAt": "2000-01-01T00:00:00.000Z"},
        {"title": "ok", "createdAt": "2000-01-01T00:00:00.000Z"},
        {"otro": 1},
    ],
)
def test_update_rejects_immutable_and_unknown_fields(table: Any, payload: dict[str, Any]) -> None:
    task = create()

    status, body = call("PUT /tasks/{id}", task_id=task["id"], body=payload)
    stored = table.get_item(Key={"id": task["id"]})["Item"]

    assert status == 400
    assert body["error"]["code"] == "validation_error"
    assert stored["createdAt"] == task["createdAt"]
    assert stored["title"] == task["title"]


@pytest.mark.parametrize("completed", ["true", 1, 0, None, "false", [True]])
def test_update_requires_real_boolean(table: Any, completed: Any) -> None:
    task = create()

    status, body = call("PUT /tasks/{id}", task_id=task["id"], body={"completed": completed})

    assert status == 400
    assert "completed" in body["error"]["message"]
    assert table.get_item(Key={"id": task["id"]})["Item"]["completed"] is False


@pytest.mark.parametrize("title", ["", "    ", "a" * (handler.MAX_TITLE_LENGTH + 1), 5])
def test_update_rejects_invalid_title(table: Any, title: Any) -> None:
    task = create()

    status, _ = call("PUT /tasks/{id}", task_id=task["id"], body={"title": title})

    assert status == 400
    assert table.get_item(Key={"id": task["id"]})["Item"]["title"] == task["title"]


def test_update_with_empty_object_returns_400(table: Any) -> None:
    task = create()

    status, _ = call("PUT /tasks/{id}", task_id=task["id"], body={})

    assert status == 400


def test_update_invalid_json_returns_400(table: Any) -> None:
    task = create()

    status, body = call("PUT /tasks/{id}", task_id=task["id"], raw_body="{roto")

    assert status == 400
    assert body["error"]["code"] == "invalid_json"


def test_update_missing_task_returns_404_and_does_not_create_it(table: Any) -> None:
    missing_id = str(uuid.uuid4())

    status, body = call("PUT /tasks/{id}", task_id=missing_id, body={"title": "fantasma"})

    assert status == 404
    assert body["error"]["code"] == "not_found"
    assert "Item" not in table.get_item(Key={"id": missing_id})
    assert table.scan()["Count"] == 0


# ------------------------------------------------------------------ borrado (DELETE)


def test_delete_returns_204_without_body(table: Any) -> None:
    task = create()

    response = handler.lambda_handler(make_event("DELETE /tasks/{id}", task_id=task["id"]), None)

    assert response["statusCode"] == 204
    assert "body" not in response
    assert "Item" not in table.get_item(Key={"id": task["id"]})


def test_delete_only_removes_the_target(table: Any) -> None:
    keep = create("se queda")
    remove = create("se va")

    call("DELETE /tasks/{id}", task_id=remove["id"])
    _, body = call("GET /tasks")

    assert [t["id"] for t in body["tasks"]] == [keep["id"]]


def test_delete_missing_task_returns_404(table: Any) -> None:
    status, body = call("DELETE /tasks/{id}", task_id=str(uuid.uuid4()))

    assert status == 404
    assert body["error"]["code"] == "not_found"


def test_get_after_delete_returns_404(table: Any) -> None:
    task = create()
    call("DELETE /tasks/{id}", task_id=task["id"])

    status, _ = call("GET /tasks/{id}", task_id=task["id"])

    assert status == 404


# ------------------------------------------------------------------ enrutado y errores


def test_unknown_route_returns_404(table: Any) -> None:
    status, body = call("PATCH /tasks/{id}", task_id=str(uuid.uuid4()))

    assert status == 404
    assert body["error"]["code"] == "route_not_found"


def test_dynamodb_failure_returns_generic_500_and_is_logged(
    table: Any, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    real_table = handler._get_table()

    def boom(**_: Any) -> Any:
        raise ClientError(
            {"Error": {"Code": "ProvisionedThroughputExceededException", "Message": "secreto"}},
            "Scan",
        )

    monkeypatch.setattr(real_table, "scan", boom)

    status, body = call("GET /tasks")

    assert status == 500
    assert body == {
        "error": {
            "code": "internal_error",
            "message": "Error interno. Inténtalo de nuevo más tarde.",
        }
    }
    assert "secreto" not in json.dumps(body)
    assert "ProvisionedThroughputExceededException" in caplog.text


def test_unexpected_error_does_not_leak_traceback(
    table: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    def boom(_: Any) -> Any:
        raise RuntimeError("detalle interno sensible")

    monkeypatch.setitem(handler.ROUTES, "GET /tasks", boom)

    status, body = call("GET /tasks")

    assert status == 500
    assert "sensible" not in json.dumps(body)
    assert "Traceback" not in json.dumps(body)
