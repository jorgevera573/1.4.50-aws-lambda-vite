# Decisiones técnicas

| Decisión | Motivo |
|----------|--------|
| Una sola Lambda enrutada por `routeKey` | Cinco rutas sencillas no justifican cinco funciones. API Gateway ya resuelve el enrutado y pasa `routeKey` (`"PUT /tasks/{id}"`), así que el handler solo busca en un diccionario. |
| API Gateway v2 (HTTP API) | Es la arquitectura solicitada. Aporta CORS gestionado, límites de peticiones por etapa y logs de acceso. |
| CORS solo en API Gateway | Evita cabeceras `Access-Control-*` duplicadas (el navegador rechaza valores repetidos). Una prueba comprueba que la Lambda no las emite. |
| Orígenes CORS explícitos | `cors_allow_origins` solo admite `http(s)://host[:puerto]`; la validación de Terraform rechaza `*`, rutas y barras finales. |
| Paquete ZIP con solo `handler.py` | El runtime `python3.12` incluye boto3; no hay dependencias que empaquetar. `archive_file` con `output_file_mode = "0644"` y finales LF forzados por `.gitattributes` dan un ZIP idéntico en cada máquina (hash comprobado dos veces). |
| `arm64` | Mismo código Python puro, menor precio por GB·s que x86_64. |
| `UpdateItem` con `attribute_exists(id)` | Sin la condición, `UpdateItem` crea el elemento si no existe (upsert). Con ella, PUT sobre un id inexistente devuelve 404 y no crea nada. |
| `DeleteItem` con `attribute_exists(id)` | Permite responder 404 a un borrado de algo que no existe, en lugar de un 204 engañoso. |
| Campos desconocidos → 400 | `id`, `createdAt`, `updatedAt` y `completed` (en POST) los controla el backend. Rechazarlos de forma explícita es más claro que ignorarlos en silencio. |
| id no UUID → 404 | Un identificador con otro formato nunca puede existir; no se consulta DynamoDB. |
| Límite de título: 200 caracteres | Suficiente para una tarea, evita abusos en una API pública. Se aplica tras recortar espacios. El frontend usa el mismo límite (`maxLength`). |
| Límite de cuerpo: 10 KB → 413 | Un título válido ocupa muy poco; evita procesar cuerpos grandes. |
| Scan paginado | `Scan` devuelve como máximo 1 MB por página. El handler sigue `LastEvaluatedKey` hasta el final. `SCAN_PAGE_SIZE` (no definido en producción) permite probar la paginación con páginas pequeñas. Para una demo es suficiente; con muchos datos convendría paginar también la respuesta HTTP. |
| Orden por `createdAt` descendente | `Scan` no garantiza orden; el backend ordena para que la interfaz sea estable. |
| Actualizaciones no optimistas en la UI | La interfaz refleja lo que confirma la API; mientras tanto desactiva los controles de esa tarea. Si falla, no hay nada que revertir. |
| Bloqueo síncrono con `useRef` | El estado de React no cambia hasta el siguiente render; una `ref` impide dos envíos seguidos antes de que el botón se desactive. |
| Fuentes autoalojadas (`@fontsource-variable`) | Playfair Display y Lora sin peticiones a Google Fonts. |
| ESLint 10 sin `eslint-plugin-jsx-a11y` | ESLint 9 ya no tiene soporte y `jsx-a11y` 6.10.2 aún no admite ESLint 10. La accesibilidad se verifica en las pruebas, que localizan los elementos por rol y nombre accesible (`getByRole`, `getByLabelText`). |
| `fetch` simulado en memoria en las pruebas del frontend | Reproduce el contrato real (códigos, JSON, 204 sin cuerpo) sin añadir MSW. Las pruebas usan la interfaz como un usuario (Testing Library + user-event). |
| Script de integración con la biblioteca estándar | Se ejecuta con cualquier Python 3 sin instalar nada ni usar credenciales AWS. |
| *Permissions boundary* en el rol de la Lambda | La crea un administrador y master-semana05 no puede modificarla, retirarla ni crear roles sin ella: aunque cambie la política inline del rol, los permisos efectivos no salen de la tabla y los logs del proyecto. Ver `docs/permisos-iam.md`. |
| HTTP API creada por un administrador e importada | En API Gateway V2 las rutas e integraciones no admiten etiquetas y la herencia de etiquetas solo existe en la V1, así que no se puede limitar su gestión por etiquetas. Se limita al ID concreto de la API y Terraform la importa con un bloque `import`. |
| Logs de acceso de API Gateway desactivados | Exigirían permisos globales `logs:*LogDelivery*` y `logs:PutResourcePolicy`. Se mantienen los logs de la Lambda. |
