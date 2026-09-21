# ⚡ Todo List Serverless — AWS Lambda + DynamoDB + Vite

## 🎯 Objetivo del proyecto

Construir una aplicación de tareas **100% serverless**: el backend es una función Lambda en Python con DynamoDB, la infraestructura se define con Terraform y el frontend Vite/React se despliega en Vercel.

Con este proyecto el alumno aprende:

- La arquitectura **serverless**: sin servidores que mantener, pago por uso.
- **DynamoDB**, la base de datos NoSQL de AWS (partition key, `PAY_PER_REQUEST`).
- A exponer una Lambda mediante **API Gateway v2** con CORS.
- A separar **frontend y backend en plataformas distintas** (Vercel + AWS) unidas por una API.

## 🏗️ Arquitectura

```
┌──────────────────┐   HTTPS / JSON    ┌──────────────────┐        ┌───────────┐
│  Vite + React    │ ────────────────► │  API Gateway v2  │ ─────► │  Lambda   │
│  (Vercel)        │       CORS        │  (HTTP API)      │        │ Python3.12│
└──────────────────┘                   └──────────────────┘        └─────┬─────┘
                                                                         │ boto3
                                                                   ┌─────▼─────┐
                                                                   │ DynamoDB  │
                                                                   │ todo-tasks│
                                                                   └───────────┘
                              Todo definido con Terraform (terraform/)
```

| Pieza | Tecnología |
|------|------------|
| Backend | AWS Lambda (Python 3.12) — API REST completa en `lambda/handler.py` |
| Base de datos | DynamoDB `todo-tasks`, PK `id` (String), `PAY_PER_REQUEST` |
| Endpoint | API Gateway v2 (HTTP API) con CORS |
| IaC | Terraform (`terraform/`: lambda.tf, dynamodb.tf, outputs.tf...) |
| Frontend | Vite + React + TypeScript + Tailwind, diseño editorial (Playfair/Lora) |
| Hosting frontend | Vercel |

### API de la Lambda

| Método | Path | Acción |
|--------|------|--------|
| GET | `/tasks` | Listar tareas |
| POST | `/tasks` | Crear tarea |
| GET | `/tasks/{id}` | Obtener tarea |
| PUT | `/tasks/{id}` | Actualizar (título / completed) |
| DELETE | `/tasks/{id}` | Eliminar |

Modelo: `{ id (UUID), title, completed, createdAt, updatedAt }`.

## 💡 Solución

1. **Una sola Lambda hace de mini-framework**: el handler lee método y path del evento y enruta internamente a la operación de DynamoDB correspondiente, devolviendo siempre JSON con headers CORS.
2. **API Gateway v2 en vez de Function URL**: la Function URL pública devolvía `403 Forbidden` por el nuevo "Block Public Access" de AWS para Lambda (2024). Migrar a API Gateway v2 resolvió el problema — lección real de que los servicios cloud evolucionan bajo tus pies.
3. **IAM de mínimo privilegio**: el rol de la Lambda solo tiene los permisos DynamoDB que usa (`PutItem`, `GetItem`, `UpdateItem`, `DeleteItem`, `Scan`) sobre esa tabla concreta.
4. **El frontend recibe la URL de la API** vía `terraform output` → variable de entorno de Vite; el código no tiene URLs hardcodeadas.

## 🚀 Cómo ejecutar

### Backend (AWS)

```bash
cd terraform
terraform init
terraform apply        # crea DynamoDB + Lambda + API Gateway
terraform output       # → URL pública de la API
```

### Frontend

```bash
cd frontend
npm install
# apunta VITE_API_URL a la URL del output de Terraform
npm run dev            # local
vercel deploy          # producción
```

### Limpieza

```bash
cd terraform && terraform destroy
```

<!-- BEGIN cc:que-se-valora -->
¡Hola! Soy tu tutor y estoy aquí para ayudarte a entender qué busco cuando corrijo tu proyecto "Aws Lambda Vite". No te preocupes, no es tan complicado como parece. Aquí te dejo una sección para tu README que te lo explica de forma sencilla:

---

## 📋 Qué se valora

Cuando revise tu proyecto, me fijaré principalmente en que **funcione y cumpla con todo lo que se pide en el enunciado**, esto es, con diferencia, lo que más pesa en la evaluación. También le doy un peso importante a la **calidad de tu código y cómo has estructurado el proyecto**, para ver que está bien organizado y es fácil de entender. El **video demo** también es importante, ya que me permite ver tu proyecto en acción y cómo lo presentas. Finalmente, aunque con un peso menor, valoro que **documentes tus decisiones y expliques por qué hiciste las cosas de cierta manera**.

Recuerda que el detalle de lo que se pide está en el enunciado del proyecto, y la evaluación no penalizará nada que no se haya solicitado explícitamente allí.
<!-- END cc:que-se-valora -->

---

# 📘 Documentación de la implementación

> Todo lo anterior es el enunciado original, sin cambios. A partir de aquí se
> documenta la implementación realizada.

**Aplicación pública:** <https://ms05-lambda-vite.vercel.app>. Es una demo
pública y sin autenticación: las tareas son compartidas; usar solo datos de prueba.
**API:** `https://t10nkrm5h5.execute-api.us-east-1.amazonaws.com`.

## Arquitectura y responsabilidad de cada servicio

| Servicio | Responsabilidad | Definido en |
|----------|-----------------|-------------|
| **Vite + React + TS + Tailwind** | Interfaz en español. Lee la URL de la API de `VITE_API_URL`; los datos vienen siempre de la API, no de `localStorage`. | `frontend/` |
| **API Gateway v2 (HTTP API)** | Punto de entrada HTTPS público. Enruta las 5 rutas a la Lambda (carga 2.0), **gestiona CORS** y limita las peticiones (10 req/s, ráfaga 20). La API la crea un administrador (bootstrap) y Terraform la importa. Logs de acceso desactivados (`enable_api_access_logs = false`). | `terraform/apigateway.tf` |
| **AWS Lambda (Python 3.12, arm64)** | Valida las peticiones, aplica las reglas del modelo y opera sobre DynamoDB. No emite cabeceras CORS. | `lambda/handler.py`, `terraform/lambda.tf` |
| **DynamoDB** | Persistencia. Tabla `ms05-lambda-vite-lab-tasks`, clave `id` (String), `PAY_PER_REQUEST`. | `terraform/dynamodb.tf` |
| **IAM** | Rol de ejecución con *permissions boundary* (creada por un administrador) y permisos solo sobre la tabla del proyecto (`PutItem`, `GetItem`, `UpdateItem`, `DeleteItem`, `Scan`) y sobre su propio grupo de logs. Solo esta API puede invocar la Lambda. | `terraform/iam.tf` |
| **CloudWatch Logs** | Logs de la Lambda, con retención de 14 días. | `terraform/lambda.tf` |
| **Terraform** | Toda la infraestructura, con estado local independiente en `terraform/` y `allowed_account_ids = ["336846061737"]`. | `terraform/` |
| **Vercel** | Hosting del frontend estático en <https://ms05-lambda-vite.vercel.app>, con `VITE_API_URL` apuntando a la API. | `frontend/` (Root Directory en Vercel) |

Sobre el punto 2 de la «Solución» del enunciado: la explicación del 403 de la
Function URL forma parte del enunciado original y **no se ha reproducido ni
comprobado** en este trabajo. Aquí se usa API Gateway porque es la arquitectura
solicitada. No se crean Function URL, EC2, VPC ni NAT Gateway.

Todos los recursos llevan las etiquetas `Project=master-semana05-lambda-vite`,
`ManagedBy=Terraform` y `Env=lab`, y sus nombres empiezan por
`ms05-lambda-vite-lab-` (configurable con `project_name` y `environment`).

```
.
├── lambda/            handler.py, requirements*.txt, pyproject.toml (ruff/pytest), tests/
├── frontend/          Vite + React + TS + Tailwind, pruebas con Vitest
├── terraform/         *.tf, .terraform.lock.hcl, terraform.tfvars.example
├── scripts/           integration_test.py (prueba tras el despliegue)
├── iam/               políticas JSON: boundary del rol y permisos del desplegador
├── docs/              decisiones.md, permisos-iam.md
└── .gitlab-ci.yml     pipeline de calidad (sin despliegue)
```

Las decisiones de diseño y sus motivos están en [docs/decisiones.md](docs/decisiones.md).

## Requisitos y versiones utilizadas

| Herramienta | Versión verificada | Uso |
|-------------|--------------------|-----|
| Node.js / npm | 24.19.0 / 11.17.0 | Frontend (requiere Node ≥ 22.12) |
| Python | 3.12.10 | Pruebas del backend (mismo runtime que la Lambda) |
| Terraform | 1.16.3 | Infraestructura (requiere ≥ 1.9) |
| Proveedor AWS / archive | 6.65.0 / 2.8.1 | Fijados en `.terraform.lock.hcl` (hashes windows_amd64, linux_amd64 y linux_arm64) |
| AWS CLI | 2.35.23 | Consultas y perfil `master-semana05` |

Dependencias fijadas (versión exacta):

- **Backend** (`lambda/requirements-dev.txt`): boto3 1.43.98, moto 5.2.3, pytest 9.1.1, ruff 0.16.8.
  En ejecución la Lambda solo usa boto3 del propio runtime: el ZIP contiene únicamente `handler.py`.
- **Frontend** (`frontend/package.json` + `package-lock.json`): React 19.3.0, Vite 8.3.0,
  TypeScript 6.0.3, Tailwind CSS 4.3.3, Vitest 5.0.1, Testing Library (React 16.3.3,
  user-event 14.6.7), ESLint 10.11.0 con typescript-eslint 8.70.0.

### Python 3.12 en Windows

Se usa el lanzador `py` para elegir 3.12 sin reemplazar otros intérpretes:

```powershell
py -0p                 # lista los intérpretes instalados
py -3.12 --version     # debe mostrar 3.12.x
```

Si faltara, se instala **junto** a los demás con
`winget install --id Python.Python.3.12 -e` (o el instalador de python.org
desmarcando «Add python.exe to PATH»), y se usa siempre mediante `py -3.12`.

> **Nota del entorno local:** en este equipo, una regla del Firewall de Windows
> ajena al proyecto (`ALINA LAB PDF-RAG BLOCK BASE PYTHON OUTBOUND`) bloquea las
> conexiones salientes del Python 3.12 base, por lo que `pip install` falla con
> `WinError 10013`. No se ha modificado esa regla. Solución usada: descargar las
> ruedas para 3.12 con otro intérprete y luego instalarlas sin red:
>
> ```powershell
> py -3.9 -m pip download --dest $env:TEMP\wheelhouse --only-binary=:all: `
>   --python-version 3.12 --implementation cp --platform win_amd64 -r lambda\requirements-dev.txt
> lambda\.venv\Scripts\python.exe -m pip install --no-index --find-links $env:TEMP\wheelhouse -r lambda\requirements-dev.txt
> ```

## Instalación y ejecución local

### Backend (pruebas, sin AWS)

```powershell
cd lambda
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.\.venv\Scripts\python.exe -m pytest
.\.venv\Scripts\ruff.exe check .
.\.venv\Scripts\ruff.exe format --check .
```

Las pruebas usan Moto: fijan credenciales ficticias, anulan `AWS_PROFILE` y
los ficheros `~/.aws`, así que nunca contactan con la cuenta real.

### Frontend

```powershell
cd frontend
npm ci
Copy-Item .env.example .env.local     # y poner la URL real de la API
npm run dev                            # http://localhost:5173
```

Para probar la interfaz en local hace falta una API desplegada cuyo CORS
permita `http://localhost:5173` (incluido por defecto en `cors_allow_origins`).

## Contrato de la API

URL base: output `api_url` de Terraform. Todas las respuestas con cuerpo son
`application/json; charset=utf-8`.

| Método | Ruta | Cuerpo | Éxito | Errores |
|--------|------|--------|-------|---------|
| GET | `/tasks` | — | `200` `{"tasks": [Task…], "count": n}` (más recientes primero) | `500` |
| POST | `/tasks` | `{"title": "…"}` | `201` Task creada | `400`, `413`, `500` |
| GET | `/tasks/{id}` | — | `200` Task | `404`, `500` |
| PUT | `/tasks/{id}` | `{"title"?: "…", "completed"?: bool}` (al menos uno) | `200` Task actualizada | `400`, `404`, `413`, `500` |
| DELETE | `/tasks/{id}` | — | `204` **sin cuerpo** | `404`, `500` |

Además, API Gateway puede responder `429` si se superan los límites de peticiones.

**Task:**

```json
{
  "id": "3f1c…-uuid-v4",
  "title": "Estudiar DynamoDB",
  "completed": false,
  "createdAt": "2026-09-20T21:05:03.123Z",
  "updatedAt": "2026-09-20T21:05:03.123Z"
}
```

**Errores:** `{"error": {"code": "…", "message": "…"}}`, con mensajes en español
y sin trazas ni detalles internos (esos van a CloudWatch).

| code | HTTP | Cuándo |
|------|------|--------|
| `invalid_json` | 400 | El cuerpo no es JSON válido |
| `invalid_body` | 400 | Falta el cuerpo o no es un objeto JSON |
| `validation_error` | 400 | Título ausente, no texto, vacío o solo espacios, o de más de **200 caracteres**; `completed` no booleano (`"true"`, `1`, `null` se rechazan); campos no permitidos (`id`, `createdAt`, `updatedAt`, o `completed` en POST); PUT con `{}` |
| `body_too_large` | 413 | Cuerpo de más de 10 KB |
| `not_found` | 404 | La tarea no existe (o el id no es un UUID). PUT **no** crea tareas |
| `route_not_found` | 404 | Ruta no reconocida |
| `internal_error` | 500 | Error de DynamoDB u otro inesperado |

Reglas: el backend genera `id` (UUID v4), `createdAt` y `updatedAt` (UTC, ISO 8601
con milisegundos); las tareas nacen con `completed=false`; el título se guarda
recortado; `id` y `createdAt` no cambian nunca; `updatedAt` se renueva en cada PUT.
`GET /tasks` recorre todas las páginas de `Scan` (`LastEvaluatedKey`).

## Variables de entorno

| Variable | Dónde | Descripción |
|----------|-------|-------------|
| `VITE_API_URL` | `frontend/.env.local` y Vercel | URL base de la API (sin barra final). **Es pública**: se incrusta en el JavaScript; nunca poner credenciales ni tokens en variables `VITE_*`. |
| `TABLE_NAME` | Lambda (la define Terraform) | Nombre de la tabla DynamoDB. |
| `LOG_LEVEL` | Lambda (Terraform) | Nivel de log, `INFO` por defecto. |
| `SCAN_PAGE_SIZE` | Solo pruebas | Tamaño de página de `Scan` para probar la paginación. No se define en AWS. |
| `API_URL` | `scripts/integration_test.py` | Alternativa a `--api-url`. |

Variables de Terraform principales (`terraform/terraform.tfvars.example`):
`aws_profile`, `aws_region`, `allowed_account_id`, `project_name`, `environment`,
`cors_allow_origins`, `enable_api_access_logs` (false), `http_api_id` (ID de la API del bootstrap), `log_retention_days`,
`throttle_rate_limit`, `throttle_burst_limit`.

## Pruebas

| Ámbito | Comando | Resultado comprobado |
|--------|---------|----------------------|
| Backend | `cd lambda; .\.venv\Scripts\python.exe -m pytest` | **63 pruebas, 63 superadas** |
| Backend, estático | `ruff check .` y `ruff format --check .` (también sobre `scripts/`) | Sin avisos |
| Frontend | `npm test` | **20 pruebas, 20 superadas** |
| Frontend, estático | `npm run lint` (ESLint, 0 avisos permitidos) y `npm run typecheck` | Sin errores |
| Frontend, build | `npm run build` | Correcto |
| Terraform | `terraform fmt -check -recursive`, `init`, `validate`, `plan` | Correcto; plan: 14 a crear |
| Script de integración | contra un servidor local que envuelve el handler con Moto | 19 comprobaciones superadas |
| Script de integración en AWS | `py -3.9 scripts\integration_test.py` contra la API real con el origen de Vercel (ejecutado por el alumno) | 19 comprobaciones correctas, incluido el preflight CORS; «Integración correcta» |

**Backend** (`lambda/tests/test_handler.py`): las cinco operaciones; valores
iniciales; actualización de título, estado y ambos; inmutabilidad de `id` y
`createdAt` y renovación de `updatedAt`; JSON inválido, cuerpo ausente o que no
es un objeto; título vacío, solo espacios, no texto y demasiado largo; `completed`
con tipos incorrectos; campos no permitidos; tareas inexistentes e ids no UUID;
PUT sobre un id inexistente sin crear registro; borrado selectivo; paginación de
`Scan` (7 tareas en páginas de 2); errores de DynamoDB convertidos en un 500
genérico que no filtra detalles pero sí se registra; ausencia de cabeceras CORS
en la Lambda.

**Frontend** (`frontend/src/App.test.tsx`), contra una API simulada en memoria
que sustituye a `fetch` y respeta el contrato: carga y visualización; lista
vacía; error de carga y recuperación con «Reintentar»; error de red; falta de
`VITE_API_URL`; creación (y título vacío, límite de longitud, rechazo de la API,
**envíos duplicados**); edición con teclado, cancelación con Escape y título
vacío; marcar y desmarcar; controles desactivados durante la operación; error al
actualizar con recuperación; eliminación, error al eliminar y tarea ya borrada;
persistencia al «recargar» la aplicación sin usar `localStorage`.

### Integración después del despliegue

```powershell
$api = terraform -chdir=terraform output -raw api_url
py -3.9 scripts\integration_test.py --api-url $api --origin https://ms05-lambda-vite.vercel.app
```

Con `--origin` se comprueba el preflight CORS de ese origen: el de producción
(Vercel) o `http://localhost:5173` en desarrollo.

Crea una tarea marcada `[integration-test xxxxxxxx]`, la consulta, la busca en
la lista, actualiza título y estado, comprueba la validación y que PUT no crea
tareas, verifica el preflight CORS del origen indicado, la elimina y confirma
que ya no existe. Si falla a mitad, borra **solo** la tarea que ha creado.

(En este equipo `py -3.12` no tiene salida a Internet por la regla de firewall
indicada arriba; el script no tiene dependencias y funciona con otro Python 3,
p. ej. `py -3.9`.)

## Integración continua (GitLab CI)

`.gitlab-ci.yml` define tres jobs en la etapa `quality`, con la etiqueta
`cloudrun` (ejecutor shell, sin `image:`):

- **backend**: comprueba Python 3.12, crea un venv en un directorio temporal,
  instala `requirements-dev.txt`, ejecuta ruff (lint y formato) y pytest.
- **frontend**: comprueba Node ≥ 22.12, valida las políticas `iam/*.json` sin red (`scripts/check-iam-policies.mjs --offline`), `npm ci` con caché temporal, lint,
  tipos, pruebas (informe JUnit) y build.
- **terraform**: prepara su propio Terraform (ver abajo) y ejecuta `fmt -check`,
  `init -backend=false -lockfile=readonly` y `validate`, con `TF_DATA_DIR` y la
  caché de proveedores en el directorio temporal. No ejecuta `plan`, `apply` ni
  `destroy` y no usa credenciales.

Cada job crea `/tmp/ms05-lambda-vite-<pipeline>-<job>` y `after_script` lo
borra junto con `node_modules`, `dist` y `terraform/build`. No se instala nada
globalmente. Las variables AWS del pipeline son ficticias: ningún job usa
credenciales ni contacta con los recursos desplegados.

### Terraform en el runner efímero

El job `terraform` no depende de una instalación global. Hace lo siguiente:

1. Detecta la plataforma con `uname`. Solo admite Linux `x86_64`/`amd64` y
   `aarch64`/`arm64`; con cualquier otra falla con un mensaje explícito.
2. Comprueba que existen `curl`, `sha256sum` y `awk`.
3. Descarga `terraform_1.16.3_linux_<arch>.zip` y `terraform_1.16.3_SHA256SUMS`
   de `https://releases.hashicorp.com`, solo por HTTPS.
4. Verifica **antes de extraer** que el ZIP aparece exactamente una vez en
   `SHA256SUMS` y que `sha256sum -c` da `OK`. Si no, el job falla sin extraer nada.
5. Extrae solo el binario, con `unzip` o, si falta, con `python3`, en
   `$JOB_TMP/terraform-bin`. Lo antepone al `PATH` solo dentro del job y
   comprueba que `terraform` apunta a ese binario y es la versión `v1.16.3`.

La versión se fija en la variable `TF_VERSION` del job. El `.terraform.lock.hcl`
incluye hashes de `windows_amd64`, `linux_amd64` y `linux_arm64` para que
`-lockfile=readonly` funcione en ambas arquitecturas de Linux.

> Queda como posible mejora verificar la firma GPG de HashiCorp sobre
> `SHA256SUMS`. Hoy se comprueba la integridad contra el fichero oficial
> descargado por HTTPS.

#### Incidencia: pipeline #3105 (commit `2f1b37e`)

- **Síntoma:** los jobs `backend` y `frontend` pasaron. El job `terraform` (#12958,
  runner #3 `cloudrun-ephemeral`, ejecutor shell con bash) falló en la
  comprobación inicial con «ERROR: el runner necesita Terraform >= 1.9.».
- **Causa:** el job suponía un Terraform instalado en el runner, y el runner
  efímero no lo tiene.
- **Corrección:** el job descarga y verifica su propio Terraform, como se
  describe arriba. Se ha tomado como referencia el CI de la práctica
  1.4.30-ansible-aws, sin modificarlo. Los jobs `backend` y `frontend` no
  cambian.
- **Verificación local:** el job extraído del YAML se ejecutó en contenedores
  Ubuntu 24.04 `linux/amd64` limpios, sin Terraform:
  - con `unzip`: correcto;
  - sin `unzip`, extrayendo con `python3`: correcto;
  - arquitectura simulada no soportada: falla con el mensaje previsto;
  - ZIP manipulado: `sha256sum` da `FAILED`, el job falla y no se extrae nada;
  - sin `curl`: falla con el mensaje previsto.

  La rama `arm64` no se ejecutó porque no había emulación disponible; solo se
  comprobó que su ZIP figura en `SHA256SUMS`.
- **Resultado (confirmado por el alumno, 21/09/2026):** en el pipeline #3106
  (commit `4105848`) aprobaron `backend`, `frontend` y `terraform` en el runner
  `cloudrun`. La rama `arm64` sigue sin ejercitarse, porque el runner usado no
  la necesitó.

## Despliegue

### Backend (AWS)

> Requiere la preparación administrativa (boundary, políticas y bootstrap de la API) descrita en
> [docs/permisos-iam.md](docs/permisos-iam.md).

```powershell
cd terraform
Copy-Item terraform.tfvars.example terraform.tfvars   # revisar valores
terraform init
# En terraform.tfvars: http_api_id = "<ID creado en el bootstrap>"
terraform plan -out=tfplan                            # revisar: importa la API y crea el resto
terraform apply tfplan
terraform output
```

### Frontend (Vercel)

1. Importar el repositorio en Vercel con **Root Directory** = `frontend`.
2. Framework: **Vite**; build `npm run build`; salida `dist`; instalación `npm ci`.
3. Variable de entorno `VITE_API_URL` = `terraform output -raw api_url`
   (entornos Production y, si se usan, Preview). Tras cambiarla hay que redesplegar,
   porque se incrusta en el build.
4. Desplegar y anotar el dominio de producción. En esta práctica es
   `https://ms05-lambda-vite.vercel.app`.
5. Añadir ese dominio **exacto** a `cors_allow_origins` en `terraform.tfvars` y
   ejecutar `terraform plan` / `apply`. Solo cambia la configuración CORS de la API.

Configuración CORS de producción (`terraform.tfvars`), sin comodines ni barra final:

```hcl
cors_allow_origins = [
  "http://localhost:5173",               # desarrollo
  "http://127.0.0.1:5173",               # desarrollo
  "https://ms05-lambda-vite.vercel.app", # producción (Vercel)
]
```

El plan de este cambio (`tfplan-cors`) solo modificaba la API `t10nkrm5h5`
(`allow_origins`): 0 recursos nuevos y 0 destruidos. Que el origen de producción
está activo lo confirma el preflight CORS del script de integración ejecutado
desde el equipo del alumno.

Los despliegues *Preview* de Vercel usan dominios distintos: no funcionarán
contra la API salvo que se añada también su dominio (no se recomienda un comodín).

## Costes

El modelo es de **pago por uso**; no se garantiza coste cero. Con el tráfico de
una demo el importe esperado es muy bajo y puede quedar dentro de la capa
gratuita, según la antigüedad y el uso de la cuenta. Conceptos que facturan:

- **API Gateway HTTP API**: por millón de peticiones.
- **Lambda**: por petición y por GB·s de ejecución (128 MB, arm64).
- **DynamoDB on-demand**: por unidades de lectura/escritura y por GB almacenado.
- **CloudWatch Logs**: por GB ingerido y almacenado (retención de 14 días).
- Transferencia de datos de salida.

Los límites de peticiones de API Gateway (10 req/s, ráfaga 20) acotan el coste
ante abusos. Consultar los precios vigentes de us-east-1 en las páginas de
precios de AWS y revisar AWS Budgets / Cost Explorer tras el despliegue.

## Limpieza

Solo afecta a los recursos de este proyecto, registrados en su propio estado:

```powershell
cd terraform
terraform plan -destroy        # revisar: solo recursos ms05-lambda-vite-lab-*
terraform destroy
```

Borra la tabla **con todas sus tareas**. Después se pueden eliminar
`terraform/build/` y, en Vercel, el proyecto del frontend. No se usa ningún
estado ni recurso de ALINA ni de la práctica de Ansible.

## Limitaciones de una API pública con datos compartidos

- **No hay autenticación**, conforme al enunciado: cualquiera que conozca la URL
  puede leer, crear, modificar y borrar **todas** las tareas.
- Las tareas son **compartidas** entre todos los visitantes. Usar solo datos de
  demostración; la interfaz lo advierte.
- **CORS no es un mecanismo de seguridad**: solo impide que *otros sitios web*
  lean las respuestas desde un navegador. `curl` o cualquier script ignoran CORS.
- Los límites de peticiones reducen abusos y costes, pero no impiden el acceso.
- `GET /tasks` devuelve todas las tareas con `Scan`: adecuado para una demo,
  no para tablas grandes.
- Sin control de concurrencia: dos ediciones simultáneas se resuelven con
  «la última gana».

## Resultados comprobados y verificaciones pendientes

Aplicación: <https://ms05-lambda-vite.vercel.app> ·
API: `https://t10nkrm5h5.execute-api.us-east-1.amazonaws.com`

### 1. Pruebas y comprobaciones locales (automatizadas, 20-21/09/2026)

- Herramientas: Node 24.19.0, npm 11.17.0, Terraform 1.16.3, Python 3.12.10,
  AWS CLI 2.35.23; identidad `master-semana05` en la cuenta 336846061737.
- Backend: 63/63 pruebas con pytest y Moto; ruff sin avisos.
- Frontend: `npm ci`, lint, tipos, 20/20 pruebas (Vitest) y build correctos.
- Políticas IAM: `scripts/check-iam-policies.mjs` correcto, con y sin conexión
  (un aviso esperado por `apigateway:TagResource`, ver
  [docs/permisos-iam.md](docs/permisos-iam.md)).
- Terraform: `fmt`, `init` y `validate` correctos; `init -backend=false` con
  lockfile de solo lectura (como en CI) correcto; ZIP de la Lambda reproducible.
- Job `terraform` del CI ejecutado en contenedores Ubuntu 24.04 `linux/amd64`
  limpios: descarga verificada correcta y casos de error esperados (ver
  «Terraform en el runner efímero»).
- Script de integración: correcto también contra un servidor local con Moto.

### 2. Integración continua en el runner (confirmado por el alumno, 21/09/2026)

- Pipeline #3105 (commit `2f1b37e`): pasaron `backend` y `frontend`; falló
  `terraform` porque el runner no tenía Terraform (incidencia documentada en
  «Terraform en el runner efímero»).
- Pipeline **#3106** (commit **`4105848`**): **aprobados `backend`, `frontend` y
  `terraform`** en el runner `cloudrun`.

### 3. Despliegue (21/09/2026)

- **AWS:** tras la preparación administrativa (boundary, políticas del
  desplegador y bootstrap de la HTTP API `t10nkrm5h5`, según
  [docs/permisos-iam.md](docs/permisos-iam.md)), Terraform importó la API y creó
  los demás recursos en tres `apply` sucesivos. Los dos primeros fueron parciales
  por permisos de etiquetado de API Gateway que no estaban documentados; las
  incidencias están descritas en ese documento. Después, `terraform plan
  -detailed-exitcode` terminó con **«No changes»**: 14 recursos y ninguna deriva.
- Outputs: `api_url = https://t10nkrm5h5.execute-api.us-east-1.amazonaws.com`,
  `table_name = ms05-lambda-vite-lab-tasks`,
  `lambda_function_name = ms05-lambda-vite-lab-api`.
- **Vercel:** frontend publicado en <https://ms05-lambda-vite.vercel.app>
  (confirmado por el alumno).
- **CORS de producción:** se añadió `https://ms05-lambda-vite.vercel.app` a
  `cors_allow_origins`, junto con los dos orígenes locales. El plan `tfplan-cors`
  solo modificaba `allow_origins` de la API: 0 recursos nuevos y 0 destruidos.

### 4. Integración automatizada contra AWS real (ejecutada por el alumno, 21/09/2026)

`scripts/integration_test.py` se ejecutó con `py -3.9` contra
`https://t10nkrm5h5.execute-api.us-east-1.amazonaws.com` y con el origen de
Vercel:

- **19 comprobaciones correctas**, incluido el **preflight CORS para
  `https://ms05-lambda-vite.vercel.app`**; terminó con «Integración correcta».
- Recorrido: crear, consultar, encontrar en la lista, actualizar título y
  estado (con persistencia comprobada), validación (`completed` no booleano →
  400; PUT sobre id inexistente → 404 sin crear nada), eliminar y comprobar 404.
- La tarea creada por el script se eliminó; no se tocaron tareas ajenas.

### 5. Pruebas manuales realizadas por el alumno (21/09/2026)

Pruebas manuales, no automatizadas:

- **API real:** `POST /tasks` creó una tarea; `GET /tasks/{id}` y `GET /tasks`
  la recuperaron; `PUT /tasks/{id}` cambió título y `completed`, y una consulta
  posterior confirmó los cambios; `DELETE /tasks/{id}` la eliminó y el `GET`
  posterior devolvió `404`.
- **Interfaz local** (`http://localhost:5173` contra la API real): crear,
  editar, completar, **persistencia tras recargar** y eliminar. Todo conforme.
- **Interfaz en producción** (<https://ms05-lambda-vite.vercel.app>): crear,
  editar, completar, **recargar para verificar la persistencia** y eliminar.
  Todo conforme.

### Pendiente

- Grabar el vídeo de demostración.
- Opcional: ejercitar la rama `arm64` del job `terraform` si alguna vez se usa
  un runner ARM, y verificar la firma GPG de `SHA256SUMS`.
- Cuando termine la evaluación, limpiar los recursos siguiendo «Limpieza» y
  [docs/permisos-iam.md](docs/permisos-iam.md).
