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
