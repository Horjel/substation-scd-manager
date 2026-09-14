# Feature 001 — Project Foundation

## Estado

Milestone M1 implementado: arranque web, persistencia, cola, worker independiente, API, experiencia vertical, generador simulado y ejecución completa mediante Docker Compose. El cierre exige conservar evidencia de AC-01…AC-12 en `tasks.md`.

## Entrega anterior — arranque web

Incluye Next.js App Router, TypeScript estricto, ESLint, scripts `lint`, `typecheck`, `test`, `build`, una prueba básica Vitest, `.env.example`, `.gitignore` y README inicial. No configura PostgreSQL, Prisma, Redis, BullMQ, Docker Compose ni Playwright en esta entrega.

- **BOOT-01:** la página inicial responde HTTP 200 y presenta el nombre del ejercicio y su estado de desarrollo, sin acciones de generación ficticias.
- **BOOT-02:** lint, comprobación estricta de tipos, prueba Vitest y build de producción finalizan con código 0.
- **BOOT-03:** README permite instalar y arrancar la web sin servicios externos; `.env.example` no contiene secretos y los archivos locales de entorno están ignorados.

Estos criterios verifican solo el arranque; no cierran AC-01…AC-12 del milestone completo.

## Objetivo

### Entrega actual — infraestructura y persistencia

Alcance autorizado: Compose con PostgreSQL y Redis, Prisma, migración inicial y tres modelos: `Substation`, `ConfigurationRevision`, `ScdGeneration`. Se conserva la página del arranque sin cambios. Cola BullMQ, worker, nuevas rutas HTTP, UI y generador quedan fuera de esta entrega.

- **DB-01:** Compose valida y levanta PostgreSQL 17 y Redis 7 con health checks y volúmenes nombrados; reiniciar los servicios conserva datos de desarrollo.
- **DB-02:** Prisma valida el esquema y aplica la migración inicial a PostgreSQL; una segunda ejecución no crea cambios pendientes.
- **DB-03:** cada revisión referencia una subestación y almacena versión, snapshot JSON y SHA-256; no se puede actualizar ni eliminar mediante Prisma o SQL ordinario. Una nueva revisión preserva la anterior. La unicidad de versión se garantiza en PostgreSQL.
- **DB-04:** cada generación referencia una revisión existente y tiene estado `QUEUED` por defecto; el enum solo permite `QUEUED`, `RUNNING`, `SUCCEEDED`, `FAILED`. En esta fase no se ejecutan transiciones operativas ni generación.
- **DB-05:** el seed explícito e idempotente crea una subestación ficticia y una revisión con IDs y contenido fijos; no crea trabajos ni sobrescribe revisiones existentes.

Los checks de contenedores, migración aplicada y pruebas de integración requieren Docker o un PostgreSQL accesible; no se consideran superados mediante mocks.

### Entrega actual — cola, worker y simulador

Alcance autorizado: partir de una revisión inmutable existente, persistir una generación y su outbox, publicarla mediante BullMQ, procesarla en un worker Node independiente y guardar el XML simulado en PostgreSQL. Se permite una API mínima sin interfaz gráfica:

- `POST /api/generations` recibe exclusivamente `{ "revisionId": "<uuid>" }`, persiste la aceptación y responde `202`;
- `GET /api/generations/:jobId` consulta estado y metadatos solamente en PostgreSQL;
- `GET /api/generations/:jobId/artifact` entrega el XML únicamente si el estado es `SUCCEEDED`.

Esta entrada mínima no crea ni edita subestaciones o revisiones. El seed proporciona una revisión ficticia para demostrar el flujo.

- **QUEUE-01:** generación y evento outbox se crean en una transacción; aceptar la solicitud no requiere Redis ni ejecuta/importa el generador.
- **QUEUE-02:** el contrato BullMQ se identifica como `generate-scd.v1` y su payload exacto es `{ jobId: UUID }`; no transporta configuración, rutas ni contenido.
- **QUEUE-03:** el dispatcher del worker reintenta outbox pendientes y usa el UUID de generación como `jobId` BullMQ. Si Redis recibe el mensaje pero PostgreSQL no registra la publicación, repetir el envío no duplica la identidad lógica.
- **QUEUE-04:** el worker reclama condicionalmente `QUEUED → RUNNING` con token de intento y lease; solo ese intento puede finalizar. Un trabajo terminal o una entrega duplicada no se regenera.
- **QUEUE-05:** los fallos transitorios vuelven a `QUEUED` y se reintentan hasta tres intentos con backoff exponencial; los permanentes o agotados terminan en `FAILED` con mensaje sanitizado.
- **QUEUE-06:** el simulador genera XML UTF-8 bien formado, marcado como no conforme, con orden, bytes, tamaño y SHA-256 deterministas.
- **QUEUE-07:** el artefacto se almacena como bytes en PostgreSQL detrás de `ArtifactStore`, con máximo 1 MiB. No se escribe bajo `public/` ni se devuelven claves o rutas internas.
- **QUEUE-08:** SIGINT/SIGTERM detienen nuevas reclamaciones, esperan el trabajo activo, cierran dispatcher, BullMQ, Redis y Prisma.

### Entrega actual — API y experiencia vertical

La web incorpora las pantallas `/`, `/substations` y `/substations/:id`. Los manejadores HTTP delegan validación, numeración de revisiones, consultas y vigencia en servicios reutilizables.

- **WEB-01:** `GET/POST /api/substations` lista y crea subestaciones; nombre 1–100 caracteres y descripción opcional hasta 1000.
- **WEB-02:** `GET /api/substations/:id` devuelve detalle, revisiones y generaciones sin claves/rutas internas.
- **WEB-03:** `POST /api/substations/:id/revisions` valida el contrato de configuración y crea una nueva versión inmutable; una colisión concurrente responde `409`.
- **WEB-03A:** la interfaz envía en `If-Match` la última versión observada; si ya existe otra revisión, la API responde `409` y obliga a recargar antes de crear un snapshot.
- **WEB-04:** `POST /api/substations/:id/generations` toma la revisión más reciente y persiste trabajo + outbox; responde `202` y no importa cola o generador.
- **WEB-05:** la UI consulta periódicamente PostgreSQL mediante HTTP solo mientras existan trabajos `QUEUED` o `RUNNING`, sin bloquear formularios.
- **WEB-06:** una generación es vigente únicamente si referencia la revisión más reciente. Una revisión posterior la marca obsoleta y su descarga responde `409`, aunque haya terminado correctamente.
- **WEB-07:** la interfaz muestra los cuatro estados, mensajes seguros, estados vacíos y señalización visible de simulación/no conformidad.
- **WEB-08:** Playwright cubre crear subestación, crear revisión, solicitar, observar éxito, descargar XML y comprobar obsolescencia tras una revisión posterior.

### Entrega de cierre — resiliencia y verificación limpia

- **RES-01:** una prueba aislada publica un trabajo `QUEUED`, vacía únicamente la base lógica Redis de pruebas y demuestra que el dispatcher reconstruye el mensaje desde PostgreSQL. Conserva el mismo `jobId`, una sola generación y transiciones válidas.
- **RES-02:** vaciar Redis no cambia generaciones, outbox ni revisiones en PostgreSQL. Los volúmenes y la base de desarrollo quedan fuera de la prueba destructiva.
- **RES-03:** Playwright provoca un fallo determinista mediante un generador inyectado solo en pruebas; la UI llega a `FAILED`, no ofrece descarga y no muestra el detalle interno del error.
- **RES-04:** la verificación limpia usa un proyecto Compose desechable, con contenedores y volúmenes distintos a desarrollo, y sigue únicamente comandos documentados en README. Antes de retirar esos recursos se enumeran y validan sus nombres.

### Entrega final — ejecución completa en Compose

- **DOCKER-01:** Compose construye y ejecuta `web` y `worker` como contenedores independientes; ninguno comparte proceso ni responsabilidad de generación HTTP.
- **DOCKER-02:** las imágenes de aplicación usan etapas separadas de build/runtime, usuario no privilegiado y no contienen `.env`, secretos ni dependencias de desarrollo en su etapa final.
- **DOCKER-03:** un servicio efímero `migrate` aplica `prisma migrate deploy` una sola vez. Web y worker esperan su finalización correcta y nunca ejecutan migraciones al arrancar.
- **DOCKER-04:** dentro de Compose, web y worker usan `postgres:5432`; el worker usa además `redis:6379`. Los puertos publicados solo sirven al host local.
- **DOCKER-05:** PostgreSQL, Redis y web tienen health checks funcionales. El worker está saludable solo con heartbeat reciente de su runtime y conexiones válidas a PostgreSQL y Redis.
- **DOCKER-06:** `docker compose up --build --wait` desde datos vacíos permite el recorrido completo y `down` sin `-v` conserva configuraciones, trabajos y artefactos.

Entregar el primer corte vertical de Substation SCD Manager: crear y editar una configuración mínima de subestación, congelarla como revisión, solicitar de forma asíncrona un SCD simulado y descargar el resultado, con PostgreSQL como fuente de verdad.

Es un ejercicio de entrevista y portfolio. Debe ser fácil de ejecutar y explicar; la demostración prueba arquitectura y calidad de software, no conformidad IEC 61850.

## Actores

- **Usuario:** administra proyectos/configuraciones y solicita artefactos.
- **Aplicación web:** valida comandos, persiste estado y presenta resultados.
- **Worker:** consume trabajos BullMQ y ejecuta el generador fuera de HTTP.

## Historias de usuario

1. Como usuario, quiero crear un proyecto con nombre y descripción para agrupar una configuración.
2. Como usuario, quiero guardar datos mínimos de subestación para preparar una generación.
3. Como usuario, quiero solicitar un archivo sin mantener abierta una petición larga.
4. Como usuario, quiero ver si la generación está en cola, ejecutándose, terminada o fallida.
5. Como usuario, quiero descargar un XML reproducible cuando el trabajo termina.
6. Como operador, quiero diagnosticar fallos desde registros persistentes aunque Redis se reinicie.

## Alcance funcional

### Proyecto y configuración

- Crear y listar proyectos.
- Consultar un proyecto.
- Editar una configuración mínima: nombre de subestación y una colección ordenable de elementos simulados con identificador, nombre y tipo controlado.
- Validar campos obligatorios y unicidad de identificadores. Nombres: 1–100 caracteres tras recortar espacios; descripción opcional: hasta 1000 caracteres; configuración: 1–100 elementos ficticios, identificadores de 1–64 caracteres ASCII alfanuméricos, guion o guion bajo, y tipo `IED` o `BAY`. Estos tipos son etiquetas de simulación, no modelos normativos.
- Crear una revisión inmutable al solicitar generación. Cambios posteriores no alteran trabajos existentes.

### Solicitud de generación

- Aceptar una solicitud para una configuración válida.
- Persistir revisión y trabajo antes de publicar en BullMQ.
- Responder `202 Accepted` con `jobId` y una ubicación/forma de consultar estado.
- Evitar trabajos duplicados activos para la misma revisión y versión de generador mediante una clave de idempotencia o restricción equivalente.
- No ejecutar ni importar el generador desde el código de la ruta HTTP.

### Procesamiento

- Un worker desplegable/ejecutable por separado reclama el trabajo.
- El worker lee la revisión desde PostgreSQL, transiciona a `RUNNING`, genera y finaliza en `SUCCEEDED` o `FAILED`.
- Los reintentos son acotados. Un intento repetido no crea resultados contradictorios.
- El error persistido es útil y sanitizado.

### Resultado simulado

- Producir XML UTF-8 bien formado con estructura estable: cabecera de simulación, subestación y elementos ordenados canónicamente.
- Incluir en metadatos `generatorVersion`, MIME, nombre sugerido, tamaño y checksum SHA-256.
- El XML indica claramente que es simulado/no conforme.
- Misma revisión + misma versión de generador = mismos bytes y checksum.
- Límite de artefacto: 1 MiB; MIME `application/xml`, extensión `.scd` y señalización explícita de simulación. La extensión no implica un archivo SCL normativamente válido.

### Consulta y descarga

- Mostrar/listar trabajos asociados al proyecto y su estado persistido.
- La descarga solo está disponible para `SUCCEEDED`.
- Estados de cola no se leen directamente desde Redis para construir la respuesta de negocio.
- Un trabajo fallido muestra un mensaje seguro y permite una nueva solicitud explícita conforme a la política de idempotencia.

## Modelo conceptual

- `Substation`: contenedor mínimo con nombre y descripción; sustituye el concepto inicial `Project` para esta entrega. La UI futura usa esta entidad como proyecto de subestación.
- `ConfigurationRevision`: snapshot inmutable y normalizado perteneciente a una subestación; cada cambio crea una nueva versión. El borrador mutable sigue siendo trabajo posterior.
- `ScdGeneration`: registro persistente de una solicitud, revisión y versión de generador; sustituye el nombre inicial `GenerationJob`.
- `GeneratedArtifact` y `GenerationOutbox`: tablas incorporadas en la entrega de cola para persistir bytes/metadatos y la intención fiable de publicación.

Los nombres físicos y campos finales se fijarán en el plan de Prisma, manteniendo estas responsabilidades.

## Requisitos no funcionales

- Todo el código de producción y pruebas es TypeScript estricto.
- La respuesta de creación de trabajo no depende del tiempo de generación.
- Las transiciones de estado son válidas y resistentes a doble procesamiento.
- El entorno local se levanta con Docker Compose y documenta health checks.
- El sistema ofrece correlación por `jobId` en logs.
- Los tests son repetibles y limpian/aislan sus datos.

## Criterios de aceptación

### AC-01 — subestación y configuración

**Dado** un entorno vacío, **cuando** el usuario crea un proyecto y guarda una configuración mínima válida, **entonces** puede recuperarlos desde PostgreSQL tras reiniciar la aplicación.

### AC-02 — validación

**Dada** una configuración incompleta o con identificadores duplicados, **cuando** se guarda o solicita generación, **entonces** se rechaza con errores de campo y no se encola ningún trabajo.

### AC-03 — frontera HTTP

**Dada** una configuración válida, **cuando** se solicita generar, **entonces** la API persiste atómicamente un trabajo `QUEUED` y su evento outbox y responde `202` sin ejecutar el generador en el proceso/petición web. El dispatcher publica posteriormente el identificador en BullMQ; la aceptación funciona también con worker detenido.

### AC-04 — fuente de verdad

**Dado** un trabajo en cualquier estado, **cuando** la UI/API consulta su progreso, **entonces** el estado procede de PostgreSQL y sigue disponible aunque Redis sea vaciado o reiniciado.

### AC-05 — worker independiente

**Dado** un trabajo `QUEUED`, **cuando** un worker independiente lo procesa, **entonces** persiste `RUNNING` y finalmente `SUCCEEDED` con artefacto o `FAILED` con error sanitizado.

### AC-06 — determinismo

**Dada** la misma revisión y versión de generador, **cuando** se genera más de una vez, **entonces** los bytes y SHA-256 del XML son idénticos.

### AC-07 — snapshot inmutable

**Dado** un trabajo ya creado, **cuando** se crea una revisión posterior antes de que el worker lo procese, **entonces** el artefacto refleja la revisión original, no la revisión nueva.

### AC-08 — descarga

**Dado** un trabajo exitoso, **cuando** el usuario descarga el resultado, **entonces** recibe XML con MIME y nombre adecuados, estructura simulada válida y metadatos coincidentes.

### AC-09 — fallo y reintentos

**Dado** un fallo controlado del generador, **cuando** se agotan los reintentos configurados, **entonces** PostgreSQL registra `FAILED`, no ofrece descarga y la UI presenta una explicación segura.

### AC-10 — recorrido E2E

**Dado** el stack local levantado, **cuando** Playwright ejecuta el camino principal, **entonces** crea proyecto/configuración, solicita generación, observa la transición y descarga un artefacto verificable.

### AC-11 — documentación de portfolio

**Dado** un evaluador que no conoce el proyecto, **cuando** lee la documentación de entrega de M1, **entonces** encuentra propósito, arranque reproducible, demo con datos ficticios, comandos de pruebas, razones arquitectónicas y límites del simulador. El README de la implementación enlaza estos documentos y distingue funcionalidades comprobadas de trabajo futuro. En esta etapa SDD solo se especifica ese README.

### AC-12 — almacenamiento sustituible

**Dado** el adaptador PostgreSQL del MVP, **cuando** se ejecuta la prueba de contrato de guardar y recuperar por clave estable, **entonces** bytes y checksum coinciden. Los consumidores usan `ArtifactStore` sin depender de Prisma o de un SDK S3 para acceder al contenido. El plan describe cómo incorporar S3/MinIO conservando estados y metadatos canónicos en PostgreSQL.

## Fuera de alcance

- Generación IEC 61850 completa, validación normativa o certificación.
- Autenticación, roles, multi-tenancy y colaboración simultánea.
- Importación de SCD/SCL, edición gráfica y plantillas de fabricante.
- Escalado horizontal avanzado, HA, almacenamiento cloud y despliegue productivo.

## Decisiones y detalles pendientes

- Decidido: artefactos pequeños en PostgreSQL detrás de `ArtifactStore`; S3/MinIO es evolución posterior.
- Decidido: trabajo y outbox transaccionales; publicador dentro del worker y reconciliación desde PostgreSQL.
- Cerrado para M1: contratos, parámetros de recuperación y versiones compatibles están fijados en el plan y el lockfile. Nuevas decisiones requieren otra feature spec.
