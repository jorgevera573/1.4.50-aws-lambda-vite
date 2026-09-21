#!/usr/bin/env python3
"""Prueba de integración contra la API desplegada.

Recorre el ciclo completo de UNA tarea creada por el propio script:
crear -> consultar -> encontrar en la lista -> actualizar título y estado ->
eliminar -> comprobar que ya no existe. Solo borra la tarea que crea.

Uso:
    python scripts/integration_test.py --api-url https://xxxx.execute-api.us-east-1.amazonaws.com
    # o bien, con la URL en una variable de entorno:
    API_URL=https://... python scripts/integration_test.py
    # comprobar además la cabecera CORS para un origen concreto:
    python scripts/integration_test.py --api-url ... --origin http://localhost:5173

Solo usa la biblioteca estándar: no necesita credenciales de AWS.
Código de salida 0 si todo va bien; 1 si falla alguna comprobación.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
import uuid
from typing import Any

TIMEOUT_SECONDS = 15


class CheckFailedError(Exception):
    pass


def http(
    method: str, url: str, body: Any = None, headers: dict[str, str] | None = None
) -> tuple[int, dict[str, str], Any]:
    data = None
    all_headers = {"Accept": "application/json", **(headers or {})}
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        all_headers["Content-Type"] = "application/json"
    request = urllib.request.Request(url, data=data, method=method, headers=all_headers)  # noqa: S310
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:  # noqa: S310
            status, resp_headers, raw = response.status, dict(response.headers), response.read()
    except urllib.error.HTTPError as error:
        status, resp_headers, raw = error.code, dict(error.headers), error.read()
    payload = json.loads(raw) if raw else None
    return status, {k.lower(): v for k, v in resp_headers.items()}, payload


def check(condition: bool, message: str) -> None:
    if not condition:
        raise CheckFailedError(message)
    print(f"  OK  {message}")


def check_validation(base: str, task_id: str) -> None:
    status, _, _ = http("PUT", f"{base}/tasks/{task_id}", {"completed": "sí"})
    check(status == 400, f"completed no booleano -> 400 (recibido {status})")
    missing = str(uuid.uuid4())
    status, _, _ = http("PUT", f"{base}/tasks/{missing}", {"title": "no debe crearse"})
    check(status == 404, f"PUT sobre id inexistente -> 404 (recibido {status})")
    status, _, _ = http("GET", f"{base}/tasks/{missing}")
    check(status == 404, "el PUT anterior no creó ninguna tarea")


def check_cors(base: str, origin: str) -> None:
    _, headers, _ = http(
        "OPTIONS",
        f"{base}/tasks",
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )
    allowed = headers.get("access-control-allow-origin")
    check(allowed == origin, f"preflight permite el origen (recibido {allowed!r})")


def run(api_url: str, origin: str | None) -> None:
    base = api_url.rstrip("/")
    marker = f"[integration-test {uuid.uuid4().hex[:8]}]"
    created_id: str | None = None

    try:
        print(f"API: {base}")

        print("1. Crear tarea")
        status, headers, task = http("POST", f"{base}/tasks", {"title": f"{marker} crear"})
        check(status == 201, f"POST /tasks -> 201 (recibido {status})")
        created_id = task["id"]
        check(task["completed"] is False, "la tarea nueva tiene completed=false")
        check(headers.get("content-type", "").startswith("application/json"), "respuesta JSON")

        print("2. Consultar la tarea")
        status, _, fetched = http("GET", f"{base}/tasks/{created_id}")
        check(status == 200, f"GET /tasks/{{id}} -> 200 (recibido {status})")
        check(fetched == task, "la tarea consultada coincide con la creada")

        print("3. Encontrarla en la lista")
        status, _, listing = http("GET", f"{base}/tasks")
        check(status == 200, f"GET /tasks -> 200 (recibido {status})")
        check(any(t["id"] == created_id for t in listing["tasks"]), "aparece en la lista")

        print("4. Actualizar título y estado")
        new_title = f"{marker} actualizada"
        status, _, updated = http(
            "PUT", f"{base}/tasks/{created_id}", {"title": new_title, "completed": True}
        )
        check(status == 200, f"PUT /tasks/{{id}} -> 200 (recibido {status})")
        check(updated["title"] == new_title and updated["completed"] is True, "cambios aplicados")
        check(updated["createdAt"] == task["createdAt"], "createdAt no cambia")
        check(updated["id"] == created_id, "id no cambia")
        _, _, reread = http("GET", f"{base}/tasks/{created_id}")
        check(reread["title"] == new_title and reread["completed"] is True, "cambios persistidos")

        print("5. Validación")
        check_validation(base, created_id)

        if origin:
            print(f"6. CORS para {origin}")
            check_cors(base, origin)

        print("7. Eliminar la tarea")
        status, _, body = http("DELETE", f"{base}/tasks/{created_id}")
        check(status == 204 and body is None, f"DELETE -> 204 sin cuerpo (recibido {status})")
        deleted_id, created_id = created_id, None

        print("8. Comprobar que ya no existe")
        status, _, _ = http("GET", f"{base}/tasks/{deleted_id}")
        check(status == 404, f"GET tras borrar -> 404 (recibido {status})")
        _, _, listing = http("GET", f"{base}/tasks")
        check(all(t["id"] != deleted_id for t in listing["tasks"]), "ya no aparece en la lista")
    finally:
        # Limpieza: solo la tarea creada por este script, si algo falló a mitad.
        if created_id is not None:
            status, _, _ = http("DELETE", f"{base}/tasks/{created_id}")
            print(f"  Limpieza de {created_id}: HTTP {status}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--api-url", default=os.environ.get("API_URL"))
    parser.add_argument("--origin", help="Origen para comprobar la respuesta CORS (opcional).")
    args = parser.parse_args()
    if not args.api_url:
        parser.error("indica --api-url o la variable de entorno API_URL")
    try:
        run(args.api_url, args.origin)
    except CheckFailedError as error:
        print(f"  FALLO {error}", file=sys.stderr)
        return 1
    except (urllib.error.URLError, TimeoutError, KeyError, ValueError) as error:
        print(f"  ERROR {type(error).__name__}: {error}", file=sys.stderr)
        return 1
    print("Integración correcta.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
