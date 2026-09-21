# Permisos IAM para desplegar

## Situación inicial (20/09/2026, antes de la preparación administrativa)

> **Estado actual (21/09/2026):** el administrador preparó la boundary, las
> políticas y la API `t10nkrm5h5`, y el despliegue terminó tras las dos
> incidencias de etiquetado que se describen más abajo. `terraform plan` ya no
> muestra cambios.

`master-semana05` se autentica (`sts:GetCallerIdentity`) y `terraform plan` funciona
con el estado vacío. Pero las lecturas `dynamodb:DescribeTable`, `lambda:GetFunction`,
`iam:GetRole`, `apigateway:GET`, `logs:DescribeLogGroups`,
`iam:ListAttachedUserPolicies` y `access-analyzer:ValidatePolicy` devuelven
**AccessDenied**. Por eso **`terraform apply` fallaría** con los permisos actuales.
No se ha concedido nada ni se ha usado otra identidad.

## Archivos de política (`iam/`)

| Archivo | Tipo | Lo crea | Se asocia a |
|---------|------|---------|-------------|
| `lambda-permissions-boundary.json` | Política gestionada `ms05-lambda-vite-lab-lambda-boundary` | Administrador | Rol de la Lambda, como *permissions boundary* (lo hace Terraform) |
| `deployer-iam-policy.json` | Política gestionada `ms05-lambda-vite-lab-deployer-iam` | Administrador | Usuario `master-semana05` |
| `deployer-services-policy.json` | Política gestionada `ms05-lambda-vite-lab-deployer-services` (con `__API_ID__` sustituido) | Administrador | Usuario `master-semana05` |
| `optional-dynamodb-data-inspection.json` | Opcional: `Scan` y `GetItem` sobre la tabla | Administrador, si se quiere | Usuario `master-semana05` |

La política del desplegador se divide en dos porque una política gestionada admite
como máximo 6144 caracteres sin espacios (juntas ocupan unos 6900).

Comprobación: `node scripts/check-iam-policies.mjs`. Valida la sintaxis, los Sids,
el tamaño y los marcadores, y contrasta **cada acción y cada clave de condición**
con la [Service Authorization Reference](https://servicereference.us-east-1.amazonaws.com/)
oficial de AWS, en su versión legible por máquina. La opción `--offline` omite ese
contraste y es la que ejecuta el CI.

## 1. Rol de la Lambda: *permissions boundary*

- **Boundary** (`lambda-permissions-boundary.json`): solo permite
  `dynamodb:PutItem/GetItem/UpdateItem/DeleteItem/Scan` sobre
  `table/ms05-lambda-vite-lab-tasks`, y `logs:CreateLogStream/PutLogEvents` sobre
  `log-group:/aws/lambda/ms05-lambda-vite-lab-api:log-stream:*`. Los permisos
  efectivos del rol son la intersección entre la boundary y su política inline.
- **Terraform** (`terraform/iam.tf`): el rol declara
  `permissions_boundary = arn:aws:iam::336846061737:policy/ms05-lambda-vite-lab-lambda-boundary`.
  Terraform no gestiona la boundary, solo la referencia.
- **Política del usuario** (`deployer-iam-policy.json`):
  - `iam:CreateRole` solo sobre el ARN exacto del rol y con
    `iam:PermissionsBoundary` = ARN de la boundary. Un `Deny` con `StringNotEquals`
    impide crear **cualquier** rol sin esa boundary. Si la clave falta en la
    petición, los operadores negados se cumplen y el `Deny` se aplica.
  - `PutRolePolicy`, `DeleteRolePolicy`, `UpdateAssumeRolePolicy`, `UpdateRole`,
    `UpdateRoleDescription` y `DeleteRole` solo mientras el rol tenga la boundary.
  - `Deny` de `PutRolePermissionsBoundary` y `DeleteRolePermissionsBoundary` sobre
    el rol, para que no se pueda retirar ni sustituir la boundary. También de
    `AttachRolePolicy` y `DetachRolePolicy`, que Terraform no necesita.
  - `Deny` de `CreatePolicyVersion`, `DeletePolicyVersion`, `SetDefaultPolicyVersion`,
    `DeletePolicy`, `TagPolicy` y `UntagPolicy` sobre la boundary.
  - `iam:PassRole` solo sobre el ARN exacto del rol, con
    `iam:PassedToService = lambda.amazonaws.com`.
  - El usuario no recibe ningún permiso sobre usuarios ni sobre sus propias
    políticas, así que tampoco puede quitarse estos `Deny`.

### Condiciones IAM verificadas por acción

Según la referencia oficial, estas son las claves de condición que admite cada
acción. Solo se usan donde la acción las admite:

| Acción | Claves admitidas (relevantes) | Uso aquí |
|--------|-------------------------------|----------|
| `CreateRole` | `iam:PermissionsBoundary`, `aws:RequestTag/*`, `aws:TagKeys` | Boundary exacta y etiqueta `Project` |
| `PutRolePolicy`, `DeleteRolePolicy`, `DeleteRole`, `UpdateRole`, `UpdateRoleDescription`, `UpdateAssumeRolePolicy` | `iam:PermissionsBoundary` | Boundary exacta |
| `PutRolePermissionsBoundary`, `DeleteRolePermissionsBoundary` | `iam:PermissionsBoundary` | Denegadas sin condición |
| `TagRole` | `aws:RequestTag/*`, `aws:TagKeys` (**no** `iam:PermissionsBoundary`) | `aws:TagKeys` ⊆ {Project, ManagedBy, Env} |
| `UntagRole` | `aws:TagKeys` | Igual |
| `GetRolePolicy`, `ListRolePolicies`, `ListAttachedRolePolicies`, `ListInstanceProfilesForRole` | ninguna | Sin condición, solo el ARN del rol |
| `PassRole` | `iam:PassedToService`, `iam:AssociatedResourceArn` | `iam:PassedToService` |
| `CreatePolicyVersion`, `DeletePolicyVersion`, `SetDefaultPolicyVersion`, `DeletePolicy`, `GetPolicy`, `GetPolicyVersion` | ninguna | ARN exacto de la boundary |
| `lambda:AddPermission`, `lambda:RemovePermission` | `lambda:Principal`, `lambda:FunctionUrlAuthType` | `lambda:Principal = apigateway.amazonaws.com` |
| `lambda:CreateFunction`, `dynamodb:CreateTable`, `logs:CreateLogGroup` | `aws:RequestTag/*`, `aws:TagKeys` | Etiqueta `Project` obligatoria |
| `*:TagResource` / `*:UntagResource` | `aws:RequestTag/*` / `aws:TagKeys` | `aws:TagKeys` ⊆ {Project, ManagedBy, Env} |

## 2. API Gateway: bootstrap administrativo

Lo que establecen la referencia de autorización y la
[guía de etiquetado de API Gateway](https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-tagging-supported-resources.html):

- En la API V2 solo se pueden etiquetar `Api`, `Stage`, `DomainName` y `VpcLink`.
  La herencia de etiquetas para el control de acceso basado en atributos (ABAC)
  solo está documentada para la **API V1** (REST).
- Las rutas, integraciones, despliegues y CORS de una HTTP API **no tienen
  etiquetas propias**. Una condición `aws:ResourceTag` sobre ellos no puede
  confirmar que pertenecen al proyecto.
- Las acciones IAM son los verbos HTTP (`apigateway:GET/POST/PUT/PATCH/DELETE`).
  El nombre de la API (`apigateway:Request/ApiName`) solo sirve al crearla. Un
  permiso `POST /apis` con etiqueta obligatoria permitiría crear la API, pero no
  limitaría después la gestión de sus recursos hijos.

Por eso no se restringe con etiquetas: **un administrador crea la API vacía** y la
política del usuario se limita a **ese ID concreto**. En `deployer-services-policy.json`:

| Recurso (ARN) | Acciones | Para qué |
|---------------|----------|----------|
| `arn:aws:apigateway:us-east-1::/apis/<API_ID>` | GET, PATCH, DELETE | Leer, configurar (CORS, descripción) y borrar en la limpieza |
| `arn:aws:apigateway:us-east-1::/apis/<API_ID>/*` | GET, POST, PATCH, DELETE | Rutas, integraciones, etapa, despliegues y CORS |
| `arn:aws:apigateway:us-east-1::/tags/<ARN de la API o sus etapas>` | GET, PUT, DELETE | Etiquetas (tipo de recurso `Tags`) |
| `arn:aws:apigateway:us-east-1::/tags/arn:aws:apigateway:us-east-1::/apis/<API_ID>` | POST | `TagResource` de la API (ver la incidencia más abajo) |
| `arn:aws:apigateway:us-east-1::/apis/<API_ID>/stages` | `apigateway:TagResource` (acción no documentada) | Crear la etapa con etiquetas (ver la segunda incidencia) |

El usuario **no** puede crear APIs (`POST /apis`) ni listar o modificar otras.
Para las etiquetas la referencia indica `/tags/${UrlEncodedResourceARN}`, así que
se incluyen tanto la forma codificada como la literal del ARN.

### Incidencia en el primer apply (21/09/2026): `TagResource` requiere `apigateway:POST`

Según la Service Authorization Reference, el tipo de recurso `Tags` figura en
`apigateway:PUT` y no en `apigateway:POST`, así que la política inicial solo
concedía GET, PUT y DELETE sobre `/tags/...`. En la práctica, la operación V2
`TagResource` (`POST /v2/tags/{resource-arn}`) se autorizó como `apigateway:POST`.

- **Síntoma:** el primer `terraform apply` fue **parcial**. Creó la tabla, el rol,
  la política inline, el grupo de logs y la Lambda, e importó la API, pero falló
  al etiquetar la API importada, que se había creado sin etiquetas:
  AccessDenied de `apigateway:POST` sobre
  `arn:aws:apigateway:us-east-1::/tags/arn:aws:apigateway:us-east-1::/apis/t10nkrm5h5`.
- **Qué revela:** IAM evalúa el ARN de etiquetas con el ARN de la API **literal**,
  sin codificar.
- **Corrección** (aplicada en AWS por el administrador y reflejada en la plantilla):
  la sentencia `ApiGatewayTagResourceOnBootstrappedApi` concede **solo**
  `apigateway:POST` y **solo** sobre ese ARN exacto (`__API_ID__` en la plantilla).
  No se ha ampliado a etapas ni a otros recursos. Si hiciera falta etiquetar la
  etapa en el futuro, se añadiría su ARN exacto
  (`…/apis/<API_ID>/stages/$default`).
- **Estado:** se conserva el `terraform.tfstate` del apply parcial y el siguiente
  plan continúa desde él (`tfplan-continuacion`).

### Incidencia en el segundo apply (21/09/2026): `apigateway:TagResource` al crear la etapa

- **Síntoma:** el segundo apply completó la modificación de la API, la
  integración, las cinco rutas y el permiso de invocación. Solo falló
  `aws_apigatewayv2_stage.default`: AccessDenied de **`apigateway:TagResource`**
  sobre `arn:aws:apigateway:us-east-1::/apis/t10nkrm5h5/stages`.
- **Qué revela:** crear una etapa **con etiquetas** exige, además de
  `apigateway:POST` sobre `/apis/<API_ID>/stages` (ya concedido), una acción con
  nombre propio, `apigateway:TagResource`, evaluada sobre la **colección** de
  etapas. No sobre la etapa ni sobre `/tags/...`.
- **Discrepancia con la documentación:** `apigateway:TagResource` **no figura** en
  la Service Authorization Reference, ni en la versión consultada el 20/09 ni en la
  del 21/09 (esa referencia solo recoge los verbos HTTP y acciones de portales y
  dominios). No hay documentación oficial de qué claves de condición admite, así
  que la sentencia **no lleva condiciones**. La evidencia es el propio AccessDenied.
- **Corrección** (aplicada en AWS por el administrador y reflejada en la plantilla):
  la sentencia `ApiGatewayTagOnCreateStageOfBootstrappedApi` concede solo
  `apigateway:TagResource` y solo sobre `arn:aws:apigateway:us-east-1::/apis/__API_ID__/stages`.
- **Comprobador:** `scripts/check-iam-policies.mjs` sigue rechazando cualquier
  acción desconocida, salvo las de la lista `OBSERVED_ACTIONS_NOT_IN_REFERENCE`,
  que hoy solo contiene esta. Para esas acciones muestra un aviso y exige que la
  sentencia no lleve condiciones.
- **Estado:** se conserva el estado. El plan `tfplan-etapa` solo crea la etapa.

Una prueba de `terraform plan` con un ID ficticio confirmó el ARN que evalúa IAM
para leer la API: `arn:aws:apigateway:us-east-1::/apis/<id>`.

### Incorporación al estado de Terraform

`terraform/apigateway.tf` incluye un bloque `import` que se activa con la variable
`http_api_id`:

```hcl
import {
  for_each = var.http_api_id == null ? toset([]) : toset([var.http_api_id])
  to       = aws_apigatewayv2_api.http
  id       = each.value
}
```

Con `http_api_id` definido, el primer `plan`/`apply` **importa** la API en lugar de
crearla y después ajusta con PATCH lo que difiera (CORS, descripción). Una vez en
el estado, el bloque ya no hace nada. La alternativa manual equivalente es
`terraform import aws_apigatewayv2_api.http <API_ID>`.

## 3. Logs

- `enable_api_access_logs = false` (valor por defecto y en `terraform.tfvars.example`).
  No se crea el grupo de logs de acceso de API Gateway, y ya no hacen falta los
  permisos globales `logs:CreateLogDelivery`, `logs:*LogDelivery*`,
  `logs:PutResourcePolicy` ni `logs:DescribeResourcePolicies`.
- Se conservan los logs de la Lambda (`/aws/lambda/ms05-lambda-vite-lab-api`, 14 días).
- Formatos ARN según la referencia:
  - Acciones de grupo (`CreateLogGroup`, `DeleteLogGroup`, `PutRetentionPolicy`,
    `DeleteRetentionPolicy`, `ListTagsForResource`, `TagResource`, `UntagResource`):
    `arn:aws:logs:us-east-1:336846061737:log-group:<nombre>`. Se añade también
    `log-group:<nombre>:*`, la forma con la que CloudWatch Logs devuelve el ARN del
    grupo. Como `:` no es válido en nombres de grupo, esa forma solo abarca los
    streams de ese mismo grupo.
  - `CreateLogStream` y `PutLogEvents` (rol de la Lambda y boundary):
    `arn:aws:logs:us-east-1:336846061737:log-group:<nombre>:log-stream:*`.
  - `DescribeLogGroups` **no admite permisos a nivel de recurso**: es la única
    lectura global y requiere `"Resource": "*"`. Terraform la usa para leer el grupo.

## 4. Otros ajustes

- Inspección de datos separada: `dynamodb:Scan` y `GetItem` están en
  `optional-dynamodb-data-inspection.json`. No hacen falta para desplegar.
- Todos los ARN son exactos: tabla, función, rol, grupo de logs y boundary. No
  quedan comodines de prefijo `ms05-lambda-vite-*`.
- `sts:GetCallerIdentity` no admite recursos, así que usa `"*"`. Terraform la
  necesita para `allowed_account_ids`.
- Algunas lecturas del proveedor AWS 6.65.0 (`lambda:GetFunctionRecursionConfig`,
  `GetRuntimeManagementConfig`, `dynamodb:DescribeContinuousBackups`,
  `DescribeTimeToLive`) se incluyen porque el proveedor las realiza al refrescar.
  Si aparece un AccessDenied no previsto, se añade **solo** esa acción sobre el
  mismo ARN, sin ampliar recursos ni recurrir a `AdministratorAccess`.

## Procedimiento

### Administrador (con su propia identidad; una sola vez)

```powershell
$acct = "336846061737"; $region = "us-east-1"; $p = "--profile", "<perfil-admin>"

# 1. Boundary del rol de la Lambda
aws iam create-policy @p --policy-name ms05-lambda-vite-lab-lambda-boundary `
  --description "Boundary del rol Lambda de ms05-lambda-vite-lab" `
  --policy-document file://iam/lambda-permissions-boundary.json

# 2. Bootstrap de la HTTP API vacía (sin rutas, integraciones ni etapa)
$apiId = aws apigatewayv2 create-api @p --region $region `
  --name ms05-lambda-vite-lab-http-api --protocol-type HTTP `
  --description "API publica de tareas (ms05-lambda-vite-lab). Sin autenticacion: solo datos de demostracion." `
  --tags Project=master-semana05-lambda-vite,ManagedBy=Terraform,Env=lab `
  --query ApiId --output text
$apiId

# 3. Políticas del desplegador (sustituyendo el ID) y asociación al usuario
(Get-Content iam/deployer-services-policy.json -Raw) -replace '__API_ID__', $apiId |
  Set-Content -Encoding utf8NoBOM "$env:TEMP\deployer-services.json"
aws iam create-policy @p --policy-name ms05-lambda-vite-lab-deployer-iam `
  --policy-document file://iam/deployer-iam-policy.json
aws iam create-policy @p --policy-name ms05-lambda-vite-lab-deployer-services `
  --policy-document "file://$env:TEMP\deployer-services.json"
aws iam attach-user-policy @p --user-name master-semana05 `
  --policy-arn "arn:aws:iam::${acct}:policy/ms05-lambda-vite-lab-deployer-iam"
aws iam attach-user-policy @p --user-name master-semana05 `
  --policy-arn "arn:aws:iam::${acct}:policy/ms05-lambda-vite-lab-deployer-services"

# 4. (Opcional) inspección de datos de la tabla
# aws iam create-policy ... optional-dynamodb-data-inspection.json + attach-user-policy
```

El administrador comunica `$apiId` a quien despliega.

### `master-semana05`

```powershell
cd terraform
# En terraform.tfvars: http_api_id = "<API_ID>" y enable_api_access_logs = false
terraform plan -out=tfplan      # revisar: previsiblemente 1 a importar (la API), 13 a crear y ajustes in-place de la API
terraform apply tfplan          # solo tras la revisión acordada
py -3.9 ..\scripts\integration_test.py --api-url (terraform output -raw api_url)
```

### Limpieza

1. `master-semana05`: `terraform destroy`. Borra los 14 recursos, **incluida la API
   importada** (`DELETE /apis/<API_ID>` está permitido).
2. Administrador: desasociar y borrar `ms05-lambda-vite-lab-deployer-iam`,
   `ms05-lambda-vite-lab-deployer-services`, la política opcional si se creó y, por
   último, `ms05-lambda-vite-lab-lambda-boundary`, que no puede borrarse mientras
   siga asociada al rol.
