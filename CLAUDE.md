# Práctica 1.4.50 — AWS Lambda + DynamoDB + Vite

## Objetivo

Construir la aplicación de tareas descrita en README.md.
La finalidad es comprender las herramientas y su integración mediante
una aplicación sencilla, funcional y probada.

Leer el README completo antes de implementar.
Conservar el enunciado original y añadir después la documentación propia.

## Entorno

- Windows 11 y PowerShell.
- Directorio: C:\MASTER-ING-SOFTWARE\semana-05\1.4.50-aws-lambda-vite
- Node.js: 24.19.0.
- npm: 11.17.0.
- Terraform: 1.16.3.
- Perfil AWS: master-semana05.
- Región AWS: us-east-1.
- Cuenta AWS autorizada: 336846061737.
- GitHub personal: jorgevera573.
- GitLab origin:
  https://gitlab.codecrypto.academy/jverav573/1.4.50-aws-lambda-vite.git

Verificar las herramientas antes de trabajar.
Comprobar si Python 3.12 está disponible para pruebas.
Si falta, indicar cómo instalarlo sin reemplazar otros intérpretes.

La identidad AWS ya se comprobó mediante STS.
Esto no acredita permisos para crear los recursos del ejercicio.

## Aislamiento

Trabajar exclusivamente en este proyecto.

- No modificar recursos de ALINA.
- No modificar la EC2 ni la infraestructura de la práctica Ansible.
- No copiar ni reutilizar estados Terraform de otros proyectos.
- Mantener un estado independiente dentro de terraform/.
- Configurar allowed_account_ids en el proveedor AWS.
- Usar nombres parametrizados y específicos del proyecto.
- Usar las etiquetas:
  Project=master-semana05-lambda-vite
  ManagedBy=Terraform
  Env=lab

No guardar credenciales, tokens o claves privadas en archivos versionados.

## Arquitectura

Implementar exactamente esta arquitectura:

- Frontend: Vite + React + TypeScript + Tailwind CSS.
- Backend: una función AWS Lambda con Python 3.12.
- Base de datos: DynamoDB.
- API pública: API Gateway v2 HTTP API.
- Infraestructura: Terraform.
- Hosting del frontend: Vercel, en una fase posterior.

Estructura principal:

- terraform/: recursos y variables de infraestructura.
- lambda/: handler, dependencias y pruebas del backend.
- frontend/: aplicación y pruebas del frontend.
- scripts/: comprobaciones de integración.
- docs/: documentación complementaria.

No crear EC2, VPC, NAT Gateway ni Lambda Function URL.
No usar Next.js para este ejercicio.

## Infraestructura Terraform

Crear:

1. Tabla DynamoDB:
   - Clave primaria id, tipo String.
   - Facturación PAY_PER_REQUEST.
   - Nombre parametrizado para evitar colisiones.

2. Lambda:
   - Runtime Python 3.12.
   - Código en lambda/handler.py.
   - Nombre de tabla mediante variable de entorno.
   - Empaquetado reproducible compatible con el runtime.
   - Grupo de logs con retención explícita.

3. IAM:
   - Rol de ejecución de Lambda.
   - Permisos DynamoDB exclusivamente sobre la tabla del proyecto.
   - Acciones necesarias: PutItem, GetItem, UpdateItem, DeleteItem y Scan.
   - Permisos de escritura en sus logs.
   - Permiso de invocación limitado al API Gateway del proyecto.

4. API Gateway v2:
   - HTTP API con integración Lambda.
   - Las cinco rutas del ejercicio.
   - Configuración CORS centralizada en API Gateway.
   - Límites de solicitudes razonables para una demostración.

5. Outputs:
   - URL de la API.
   - Nombre de tabla.
   - Nombre de Lambda.

Parametrizar los orígenes CORS:
localhost para desarrollo y dominio concreto de Vercel para producción.
Evitar cabeceras CORS duplicadas entre API Gateway y Lambda.

La API será pública y sin autenticación conforme al ejercicio.
Documentar que las tareas son compartidas y deben contener solo datos
de demostración. CORS no constituye autenticación.

## Backend y contrato de la API

Implementar:

| Método | Ruta | Operación |
|--------|------|-----------|
| GET | /tasks | Listar tareas |
| POST | /tasks | Crear tarea |
| GET | /tasks/{id} | Obtener una tarea |
| PUT | /tasks/{id} | Actualizar título o estado |
| DELETE | /tasks/{id} | Eliminar una tarea |

Modelo:

- id: UUID generado por el backend.
- title: texto.
- completed: booleano.
- createdAt: fecha UTC.
- updatedAt: fecha UTC.

Reglas:

- Crear las tareas inicialmente con completed=false.
- Validar JSON y que el cuerpo tenga la estructura esperada.
- Rechazar títulos vacíos o compuestos solo por espacios.
- Definir y documentar un límite de longitud para el título.
- Exigir un booleano real para completed.
- Permitir actualizar título, estado o ambos.
- Mantener id y createdAt inmutables.
- Actualizar updatedAt desde el backend.
- Responder 404 cuando la tarea no exista.
- Evitar que PUT cree una tarea inexistente.
- Considerar la paginación de Scan de DynamoDB.
- Usar códigos HTTP coherentes y respuestas documentadas.
- Las respuestas con cuerpo deben ser JSON.
- Si DELETE responde 204, no devolver cuerpo.
- No devolver trazas internas ni detalles sensibles al cliente.
- Registrar errores útiles para diagnóstico.

## Frontend

Crear una interfaz en español, sencilla y cuidada:

- Formulario para añadir tareas.
- Lista de tareas.
- Edición del título.
- Marcar y desmarcar como completada.
- Eliminar tareas.
- Estados de carga, lista vacía y error.
- Evitar envíos duplicados mientras una operación está pendiente.
- Diseño adaptable a móvil y escritorio.
- Etiquetas accesibles y navegación por teclado.
- Estética editorial acorde con el README.

Leer la URL del backend desde VITE_API_URL.
Incluir .env.example sin secretos.
No escribir URLs reales directamente en el código.

Las variables VITE_* son públicas en el navegador:
nunca incluir credenciales AWS ni tokens privados.

Los datos persistentes deben provenir de la API y DynamoDB.
No simular persistencia mediante localStorage como sustituto del backend.

## Pruebas

Las pruebas forman parte obligatoria del trabajo.

### Backend

Utilizar pytest y una simulación de DynamoDB, por ejemplo Moto.

Cubrir:

- Las cinco operaciones.
- Valores iniciales de una tarea.
- Actualización del título y del estado.
- Persistencia de los campos inmutables.
- JSON inválido y cuerpos con estructura incorrecta.
- Título vacío o demasiado largo.
- completed con tipo incorrecto.
- Tareas inexistentes.
- PUT sobre un id inexistente sin crear un registro.
- Paginación de la lista.

Las pruebas locales no deben necesitar credenciales reales ni acceder
a la cuenta AWS.

### Frontend

Utilizar Vitest y React Testing Library, o alternativa justificada.

Probar:

- Carga y visualización de tareas.
- Lista vacía.
- Creación de tarea.
- Edición.
- Cambio de estado.
- Eliminación.
- Errores de la API y recuperación de la interfaz.

Simular la API en estas pruebas.
Probar comportamientos observables, no detalles internos de implementación.

### Integración después del despliegue

Preparar un script que:

1. Cree una tarea de prueba.
2. La consulte.
3. La encuentre en la lista.
4. Actualice su título y estado.
5. La elimine.
6. Compruebe que ya no existe.

Limpiar únicamente la tarea creada por el propio script.
No borrar tareas ajenas.

Después del despliegue también comprobar en navegador que los cambios
persisten al recargar la página.

## Calidad y dependencias

- Elegir versiones compatibles y fijar dependencias.
- Conservar package-lock.json y .terraform.lock.hcl.
- Usar npm ci cuando exista el archivo de bloqueo.
- Ejecutar lint, comprobación de tipos, tests y build del frontend.
- Ejecutar pruebas y revisión estática del backend.
- Ejecutar terraform fmt, init, validate y plan.
- Corregir los fallos encontrados.
- No inventar resultados ni afirmar verificaciones no realizadas.

## Git y archivos excluidos

Preparar .gitignore antes de generar artefactos.

Excluir:

- .terraform/
- Estados Terraform y sus copias.
- Planes Terraform.
- terraform.tfvars y otros tfvars locales con valores reales.
- Archivos .env reales.
- Claves privadas y credenciales.
- Entornos virtuales.
- node_modules/
- Builds, paquetes ZIP generados y cachés.
- Configuración local de Vercel.

Versionar las plantillas de ejemplo sin secretos y los archivos de bloqueo.
Usar finales de línea LF.

## Integración continua

Preparar un pipeline de calidad sin despliegue y sin credenciales AWS.

Debe ejecutar:

- Pruebas y revisión estática del backend.
- Lint, tipos, pruebas y build del frontend.
- Formato y validación de Terraform.
- terraform init con -backend=false.

Para GitLab CI:

- El runner conocido tiene etiqueta cloudrun y ejecutor shell.
- No depender de image:.
- Comprobar las herramientas del runner.
- Preparar las dependencias en directorios temporales.
- Limpiar esos directorios al terminar.
- Evitar modificar globalmente las herramientas instaladas.

Las pruebas del pipeline deben funcionar sin conexión a los recursos
AWS desplegados.

## Documentación

Añadir al README:

- Arquitectura y responsabilidad de cada servicio.
- Requisitos y versiones utilizadas.
- Instalación y ejecución local.
- Contrato de la API.
- Variables de entorno.
- Comandos de pruebas.
- Despliegue del backend y del frontend.
- Configuración de Vercel.
- Costes por uso, sin prometer coste cero.
- Limpieza de los recursos exclusivos del ejercicio.
- Limitaciones de una API pública con datos compartidos.
- Resultados comprobados y verificaciones pendientes.

Conservar el enunciado original.

No presentar como diagnóstico propio comprobado la explicación histórica
del README sobre el error 403 de Function URL.
API Gateway se utiliza porque es la arquitectura solicitada.

## Primera fase de trabajo

Está autorizado:

- Crear y modificar los archivos de este proyecto.
- Implementar infraestructura, backend y frontend.
- Preparar pruebas, CI y documentación.
- Ejecutar pruebas y validaciones locales.
- Realizar consultas de lectura necesarias a AWS.
- Preparar y guardar un plan de Terraform para revisión.

En esta fase no ejecutar:

- terraform apply.
- terraform destroy.
- Despliegues en Vercel.
- Commit ni push.
- Modificaciones de permisos IAM del usuario.

Si aparece AccessDenied:
indicar la operación, el recurso y el permiso que falta.
No intentar resolverlo concediendo AdministratorAccess.

Antes del despliegue revisaremos los recursos concretos del plan.
No ejecutar limpieza ni destrucción automáticamente.

## Informe final de la primera fase

Entregar:

1. Resumen de lo implementado.
2. Archivos creados o modificados.
3. Herramientas y versiones verificadas.
4. Comandos de validación y resultados reales.
5. Número de pruebas y fallos, si los hubiera.
6. Resumen del plan: recursos a crear, modificar y destruir.
7. Herramientas o permisos pendientes.
8. Pasos para probar la interfaz localmente.
9. Pasos pendientes para desplegar en AWS y Vercel.