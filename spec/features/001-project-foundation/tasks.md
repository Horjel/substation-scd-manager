# Feature 001 — Tareas verificables

Implementación incremental de Substation SCD Manager. El milestone M1 está implementado y verificado, incluida la ejecución completa en Docker Compose. La evidencia de cierre permanece registrada en este documento.

## Uso

Las tareas se ejecutan por fase respetando sus dependencias; los identificadores existentes se conservan por trazabilidad (T077 precede al cierre T076). Marcar `[x]` solo después de completar la verificación indicada. Si cambia una decisión, actualizar primero `spec.md` o `plan.md`.

## Fase 0 — Confirmación SDD

- [x] **T001** Revisar constitución, spec y plan; resolver preguntas abiertas que bloqueen contratos. **Verificación:** decisiones registradas sin contradicciones.
- [x] **T002** Revisar la matriz de este documento y concretar nombres de pruebas al implementar. **Verificación:** cada criterio tiene al menos una evidencia asignada.

## Fase 1 — Esqueleto y calidad

- [x] **T010A** Crear workspace npm `apps/web` con scripts raíz. **Verificación:** npm descubre la web y delega dev/build/start. **Cubre:** BOOT-01.
- [x] **T010** Completar workspace con worker y paquetes compartidos cuando se implementen. **Depende de:** T001, T010A. **Verificación:** scripts descubren todos los workspaces.
- [x] **T011A** Configurar TypeScript estricto para web y herramientas de prueba. **Verificación:** typecheck pasa y `strict` está activo en ambas configuraciones efectivas. **Cubre:** BOOT-02.
- [x] **T011** Añadir límites de imports entre web, worker y paquetes cuando existan. **Depende de:** T011A, T010. **Verificación:** imports de generación desde web se rechazan.
- [x] **T012** Inicializar Next.js mínimo sin lógica de generación. **Verificación:** página de salud/inicio responde localmente.
- [x] **T013A** Configurar Vitest con prueba básica del contenido de la página y aviso de alcance simulado. **Verificación:** `npm test` pasa. **Cubre:** BOOT-02.
- [x] **T013** Configurar Playwright y una prueba mínima de navegador. **Verificación:** suite de navegador pasa.
- [x] **T015** Configurar ESLint y scripts lint/typecheck/test/build. **Verificación:** los cuatro comandos pasan. **Cubre:** BOOT-02.
- [x] **T016** Crear `.env.example` sin secretos, `.gitignore` y README inicial para GitHub. **Verificación:** arranque documentado funciona sin servicios externos, variables locales están ignoradas y README distingue implementado/pendiente. **Cubre:** BOOT-03.
- [x] **T014** Crear Docker Compose con PostgreSQL, Redis, web y worker, variables validadas y health checks. **Verificación:** servicios sanos desde un entorno limpio.

## Fase 2 — Dominio y persistencia

- [x] **T020** Implementar esquemas/tipos de proyecto y configuración mínima con validación de identificadores únicos. **Depende de:** T011A. **Verificación:** pruebas válidas e inválidas cubren AC-02.
- [x] **T021** Diseñar y validar Prisma schema para Substation, ConfigurationRevision y ScdGeneration. **Verificación:** Prisma validate/generate y revisión de constraints contra el plan. **Cubre:** DB-02, DB-04 (esquema).
- [x] **T022** Crear y aplicar migración inicial con índices y enums. **Depende de:** T021. **Verificación:** migración up funciona en base vacía y Prisma valida.
- [x] **T023** Implementar servicios de subestación, detalle y revisiones. **Depende de:** T020–T022. **Verificación:** integración de API usa conexiones nuevas y confirma la persistencia (AC-01).
- [x] **T024** Implementar normalización, hash y revisión inmutable. **Verificación:** mismo contenido normalizado comparte hash; edición posterior no cambia revisión (AC-07).
- [x] **T025** Implementar máquina de estados y updates condicionales. **Verificación:** pruebas rechazan transiciones y claims concurrentes inválidos.

### Subtareas de infraestructura y persistencia

- [x] **T014A** Crear Compose PostgreSQL 17/Redis 7, health checks y volúmenes. **Verificación:** compose config, servicios healthy y datos preservados tras reinicio. **Cubre:** DB-01.
- [x] **T022A** Crear SQL inicial con claves, índices, enum y trigger de inmutabilidad. **Verificación:** SQL de tablas coincide con Prisma migrate diff; aplicación real registrada por separado en T022.
- [x] **T024A** Preparar snapshots canónicos y SHA-256 determinista. **Verificación:** Vitest cubre orden, valores JSON inválidos y ausencia de mutación.
- [x] **T024B** Verificar revisiones inmutables y constraints en PostgreSQL real. **Depende de:** T022. **Verificación:** tests de integración rechazan UPDATE/DELETE, duplicados y referencias inválidas. **Cubre:** DB-03, DB-04.
- [x] **T026** Crear y ejecutar seed determinista dos veces sin duplicados ni sobrescrituras. **Depende de:** T022. **Verificación:** contenido/IDs/fechas se conservan. **Cubre:** DB-05.
- [x] **T027** Documentar entorno, migración y pruebas; repetir lint/typecheck/test/build. **Verificación:** cuatro comandos pasan y se distinguen verificaciones estáticas de las que requieren Docker.

## Fase 3 — API básica

- [x] **T030** Implementar endpoints de crear/listar/consultar subestaciones. **Depende de:** T023. **Verificación:** tests de contrato y persistencia.
- [x] **T031** Implementar endpoint de guardar configuración con control de versión/conflicto. **Verificación:** validación y `409` cubiertos.
- [x] **T032** Implementar consulta persistente de trabajos. **Depende de:** T025. **Verificación:** la respuesta se obtiene con Redis no disponible (AC-04).

## Fase 4 — Solicitud fiable y cola

- [x] **T040A** Persistir para una revisión existente un trabajo activo y su outbox en una única transacción. **Verificación:** Redis ausente no revierte la aceptación; solicitudes repetidas reutilizan la identidad activa. **Cubre:** QUEUE-01.
- [x] **T041A** Exponer la API mínima de aceptación/estado sin importar cola ni generador desde web. **Depende de:** T040A. **Verificación:** `202`, `400`, `404` y consulta PostgreSQL cubiertos; análisis de imports pasa.

- [x] **T040** Implementar transacción que identifica la revisión vigente y crea/reutiliza trabajo `QUEUED` + outbox. **Depende de:** T024–T025. **Verificación:** rollback no deja registros parciales.
- [x] **T041** Implementar endpoint de generación con respuesta `202` e idempotencia. **Depende de:** T040. **Verificación:** duplicados controlados y ninguna llamada/import del generador (AC-03).
- [x] **T042** Configurar BullMQ y contrato de mensaje `{ jobId }` validado. **Verificación:** payloads extraños/inválidos se rechazan con seguridad.
- [x] **T043** Implementar dispatcher outbox idempotente y reconciliación. **Depende de:** T040A, T042. **Verificación:** caída simulada entre commit/publicación termina publicando una sola identidad lógica.
- [x] **T044** Implementar worker independiente con publicador outbox, consumidor BullMQ, claim, lease y token de intento persistentes. **Depende de:** T025, T042. **Verificación:** integración multiproceso cubre AC-05 y rechaza resultados de un intento vencido.
- [x] **T045** Configurar reintentos, backoff, fallo terminal y logs correlacionados. **Verificación:** fallo controlado cubre AC-09.
- [x] **T046** Añadir cierre seguro SIGINT/SIGTERM y scripts operativos del worker. **Verificación:** una prueba de ciclo de vida cierra worker, dispatcher, Redis y Prisma sin trabajo huérfano. **Cubre:** QUEUE-08.

## Fase 5 — Generador simulado y artefacto

- [x] **T050** Implementar serializador XML simulado puro con escaping y orden canónico. **Depende de:** T020. **Verificación:** XML parseable y pruebas estructurales.
- [x] **T051** Eliminar fuentes de no determinismo y fijar `generatorVersion`. **Verificación:** ejecuciones repetidas producen bytes idénticos (AC-06).
- [x] **T052** Calcular SHA-256/metadatos y aplicar límite de 1 MiB. **Verificación:** tamaño/checksum coinciden con los bytes y un exceso se rechaza sin artefacto exitoso.
- [x] **T052A** Implementar `ArtifactStore` con adaptador PostgreSQL y unidad de trabajo transaccional. **Depende de:** T022, T052. **Verificación:** guardar/leer conserva bytes/checksum; repetir la misma clave/contenido es idempotente; contenido distinto se rechaza. **Cubre:** AC-12. S3/MinIO queda documentado, sin adaptador real en M1.
- [x] **T053** Integrar generador exclusivamente en worker y persistir artefacto + `SUCCEEDED` atómicamente. **Depende de:** T044, T050–T052, T052A. **Verificación:** imports confirman que web no depende del generador; un fallo de transacción no deja artefacto ni éxito parcial.
- [x] **T054** Implementar endpoint de descarga solo para trabajos exitosos. **Verificación:** cabeceras, bytes, errores de estado y AC-08.

## Fase 6 — UI vertical

- [x] **T060** Crear vistas mínimas para lista/alta/detalle de subestación y edición de configuración. **Depende de:** T030–T031. **Verificación:** estados vacío, válido y errores de validación son utilizables.
- [x] **T061** Añadir acción de generación y seguimiento por polling acotado del estado persistente. **Depende de:** T041, T032. **Verificación:** la UI no consulta BullMQ/Redis directamente.
- [x] **T062** Añadir descarga y presentación segura de fallos, con etiqueta visible de simulación/no conformidad. **Depende de:** T054. **Verificación:** estados terminales muestran la acción/mensaje correcto.
- [x] **T063** Señalar generaciones obsoletas y revalidar vigencia al descargar. **Depende de:** T031, T054. **Verificación:** una nueva revisión deshabilita el enlace anterior y el endpoint devuelve `409`.

## Fase 7 — Verificación integral

- [x] **T070** Integración: comprobar `202` y trabajo/outbox persistidos con worker detenido; arrancar el worker separado y verificar finalización. **Cubre:** AC-03, AC-05.
- [x] **T071** Integración aislada: reiniciar/vaciar Redis y confirmar que historial/estado siguen consultables; recuperar mensajes perdidos incluso con outbox publicado y trabajos con lease vencido. **Cubre:** AC-04, AC-05.
- [x] **T072** Integración: crear una revisión posterior después de encolar y verificar el snapshot original. **Cubre:** AC-07.
- [x] **T073** Playwright camino feliz completo con descarga y parseo básico. **Cubre:** AC-10.
- [x] **T074** Playwright escenario de fallo controlado sin descarga. **Cubre:** AC-09.
- [x] **T075** Ejecutar typecheck, lint, Vitest, Playwright y arranque Docker Compose desde limpio. **Verificación:** todos pasan; registrar comandos/resultados.
- [x] **T076** Revisar matriz de aceptación, límites del MVP y documentación operativa. **Depende de:** T070–T075, T077. **Verificación:** AC-01…AC-12 tienen evidencia; ninguna afirmación de conformidad IEC 61850.
- [x] **T077** Ampliar el README inicial con demo completa, migraciones y resultados de M1 para reclutadores. **Depende de:** T016, T062, T075. **Verificación:** seguir sus comandos desde un entorno limpio y distinguir resultados comprobados de planes. **Cubre:** AC-11.

## Tareas posteriores explícitamente excluidas

- Implementación normativa IEC 61850/SCL completa.
- Importación de SCD de terceros.
- Autenticación, permisos y multi-tenancy.
- Adaptador S3/MinIO real y despliegue de producción.

Estas tareas requieren nuevas feature specs; no deben incorporarse incidentalmente a la foundation.

## Matriz de trazabilidad

| Criterio | Estado | Tareas | Evidencia principal |
| --- | --- | --- | --- |
| AC-01 | Cumplido | T023, T030 | `tests/db/api.test.ts` crea/lista/consulta en PostgreSQL; T014 conserva registros tras retirar y reconstruir contenedores sin borrar volúmenes. |
| AC-02 | Cumplido | T020, T031, T041 | `tests/domain.test.ts` rechaza duplicados/campos extra; `tests/db/api.test.ts` devuelve validación sin crear revisiones o trabajos inválidos. |
| AC-03 | Cumplido | T041, T053, T070 | `tests/api-contract.test.ts` prueba payload y ausencia de imports de cola/generador; `tests/db/api.test.ts` prueba trabajo + outbox y rollback atómico. |
| AC-04 | Cumplido | T032, T043, T071 | `tests/queue/async-generation.test.ts` vacía solo Redis /1 y reconstruye la cola desde PostgreSQL conservando el mismo UUID y una sola generación. |
| AC-05 | Cumplido | T044, T070 | Suite de cola prueba claim/transiciones/leases; T014 ejecuta web y worker en contenedores separados y registra `generation_completed`. |
| AC-06 | Cumplido | T051, T052 | `tests/scd.test.ts` compara bytes/checksum repetidos, parsea XML y verifica la marca explícita de no conformidad. |
| AC-07 | Cumplido | T024, T072 | `tests/snapshot.test.ts`, integración de inmutabilidad y la prueba de cola “processes the queued immutable snapshot…” conservan la revisión original. |
| AC-08 | Cumplido | T054, T073 | Playwright descarga y parsea el XML; T014 descarga 355 bytes con MIME/XML y SHA-256 estable antes/después del reinicio. |
| AC-09 | Cumplido | T045, T074 | Suite de cola cubre reintento/fallo terminal; Playwright llega a `FAILED`, muestra mensaje seguro, oculta ruta/token ficticios y no ofrece descarga. |
| AC-10 | Cumplido | T073 | `tests/e2e/main-flow.spec.ts` recorre alta, revisión, generación asíncrona, polling, descarga y obsolescencia. |
| AC-11 | Cumplido | T077 | README documenta propósito, arquitectura, límites, dos modos de ejecución y matriz de pruebas; T075/T014 siguieron la guía en proyectos Compose aislados. |
| AC-12 | Cumplido | T052A | `ArtifactStore` desacopla consumidores; la suite de cola prueba guardar/leer, repetición idempotente y rechazo de contenido conflictivo. |

## Verificación del arranque — 2026-09-13

Entorno: Windows, Node.js 24.16.0, npm 11.13.0. Solo BOOT-01…BOOT-03 están verificados; AC-01…AC-12 continúan pendientes.

| Comprobación | Resultado |
| --- | --- |
| `npm ci` | Código 0; instalación desde lockfile; auditoría: 0 vulnerabilidades |
| `npm run lint` | Código 0, sin avisos de lint |
| `npm run typecheck` | Código 0; `strict`, `noUncheckedIndexedAccess` y `exactOptionalPropertyTypes` activos en web y herramientas |
| `npm test` | Código 0; 1 prueba de `tests/home.test.tsx` superada |
| `npm run build` | Código 0; página `/` prerenderizada |
| `npm start` y consulta HTTP | HTTP 200; nombre y aviso de simulación presentes |
| `npm run dev` y consulta HTTP | HTTP 200; sin variables ni servicios externos |
| `.gitignore` | Ignora `.env`, `apps/web/.env.local`, dependencias y salidas; conserva `.env.example` |

Los servidores temporales se detuvieron tras la comprobación. Se desactivó `agentRules` para conservar el AGENTS.md del repositorio. La instalación advierte del fin de soporte de ESLint 9; se documenta su restricción de compatibilidad con el plugin React en README. No se configuraron PostgreSQL, Prisma, Redis, BullMQ, Docker Compose ni Playwright.

En este corte inicial T001/T002 seguían abiertos. Las verificaciones y decisiones posteriores se documentan a continuación.

## Verificación de infraestructura y persistencia — 2026-09-13

La primera revisión estática detectó que faltaba un motor Docker accesible; la comprobación se reanudó cuando Docker Desktop estuvo disponible. Evidencia final:

| Comprobación | Resultado |
| --- | --- |
| `docker compose config --quiet` | Código 0; configuración válida |
| `docker compose up -d --wait` | PostgreSQL 17 y Redis 7 en estado `healthy` |
| Health checks directos | PostgreSQL acepta conexiones; Redis responde `PONG` |
| Reinicio y persistencia | Ambos servicios recuperan estado saludable; permanecen 1 subestación y 1 revisión deterministas |
| `npm run db:generate` / `db:validate` | Código 0; Prisma 7.10.0 y esquema válido |
| Migración de desarrollo | Migración inicial aplicada; segunda ejecución informa que no hay migraciones pendientes |
| Migración de pruebas | Migración inicial aplicada sobre `substation_test`, inicialmente vacía |
| `npm run db:status` | Código 0; esquema de desarrollo al día |
| `npm run db:seed` dos veces | Código 0 en ambas ejecuciones; IDs, fechas y contenido se conservan; 0 generaciones creadas |
| `npm run test:db` | Código 0; 6 pruebas reales en 1 archivo |
| `npm run lint` | Código 0, sin avisos |
| `npm run typecheck` | Código 0 para web, paquete db y herramientas |
| `npm test` | Código 0; 13 pruebas en 2 archivos |
| `npm run build` | Código 0; ruta `/` prerenderizada |

Con esta evidencia se cierran T014A, T022, T024B y T026, además de las tareas ya verificadas T021, T022A, T024A y T027. DB-01…DB-05 quedan satisfechos para esta entrega acotada; AC-01…AC-12 siguen abiertos porque pertenecen al corte vertical completo.

Este párrafo cierra el registro histórico de infraestructura: en ese corte T014 seguía abierto porque web y worker aún no formaban parte de Compose. La verificación final posterior deja constancia de su cierre.

## Verificación de cola, worker y simulador — 2026-09-13

| Comprobación | Resultado |
| --- | --- |
| Infraestructura final | PostgreSQL/Redis healthy; 2 migraciones al día; seed idempotente |
| `npm run lint` | Código 0, sin avisos |
| `npm run typecheck` | Código 0 en web, worker y cinco paquetes compartidos |
| `npm test` | Código 0; 21 pruebas en 6 archivos |
| `npm run test:db` | Código 0; 6 pruebas PostgreSQL |
| `npm run test:queue` | Código 0; 5 pruebas BullMQ/Redis/PostgreSQL |
| `npm run build` | Código 0; web y worker verificados |
| HTTP con worker detenido | `POST /api/generations` devuelve `202`; estado PostgreSQL `QUEUED`, intento 0 |
| Procesos separados | `npm run worker` publica outbox y completa `QUEUED → RUNNING → SUCCEEDED` |
| Artefacto real | HTTP 200, `application/xml`, 369 bytes y SHA-256 coincidente; no expone clave/ruta interna |
| Errores HTTP | `400` UUID inválido, `404` revisión/trabajo ausente, `409` artefacto no disponible |
| Reintentos y duplicados | Dos fallos transitorios terminan en éxito al intento 3; payload/publicaciones repetidas no regeneran un trabajo terminal |
| Fallo controlado | Estado `FAILED`, intento 1, mensaje sanitizado y sin artefacto |
| Lease/atomicidad | Intento vencido no puede finalizar; conflicto de artefacto revierte `SUCCEEDED` |
| Cierre seguro | SIGINT registra `worker_shutdown`; dispatcher y conexiones se cierran |

En aquel corte se cerraron T001, T010, T011, T020, T025, T040A, T041A, T042–T046, T050–T054 y T070. T002, T040/T041, T071, T072 y Playwright quedaban pendientes entonces; las secciones posteriores registran su estado actualizado.

Siguiente bloque recomendado: T023, T030 y T031 para completar repositorios y API de subestaciones/configuración antes de la interfaz web.

## Verificación de API e interfaz vertical — 2026-09-14

| Comprobación | Resultado |
| --- | --- |
| Compose y servicios | Configuración válida; PostgreSQL 17 y Redis 7 `healthy`. |
| Migraciones | 2 migraciones encontradas; esquema de desarrollo al día. |
| Consulta sin Redis | Redis detenido; 11 pruebas PostgreSQL/API pasan; Redis reiniciado `healthy` y responde `PONG`. |
| `npm run lint` | Código 0, sin avisos de lint. |
| `npm run typecheck` | Código 0 en web, worker, paquetes y herramientas con TypeScript estricto. |
| `npm test` | Código 0; 23 pruebas en 7 archivos, incluidos los cuatro estados y errores seguros. |
| `npm run test:db` | Código 0; 12 pruebas en 2 archivos contra PostgreSQL real, incluidos contratos HTTP, `409` optimista, rollback de outbox y obsolescencia. |
| `npm run test:queue` | Código 0; 6 pruebas reales, incluida la generación desde el snapshot original tras crear una revisión posterior. |
| `npm run test:e2e` | Código 0; 1 recorrido Chrome: alta, revisión, polling, éxito, descarga XML y obsolescencia. |
| `npm run build` | Código 0; portada estática y páginas/API dinámicas compiladas; worker comprobado por TypeScript. |

La descarga del navegador administrado por Playwright agotó el tiempo de red; la suite se ejecutó con el Chrome local detectado y terminó correctamente. En aquel corte se cerraron T002, T013, T023–T024, T030–T032, T040–T041, T060–T063 y T072–T073; T071 y T074–T077 quedaron pendientes hasta la verificación posterior.

## Verificación de resiliencia y entorno limpio — 2026-09-14

| Evidencia | Resultado |
| --- | --- |
| T071 — pérdida de Redis | `FLUSHDB` afectó solo `TEST_REDIS_URL` (`/1`). PostgreSQL conservó revisión, outbox, estado `QUEUED` e identidad; el dispatcher republicó el mismo UUID y terminó con 1 generación y 1 artefacto. Suite de cola: 7/7. |
| T074 — fallo controlado | El generador de prueba falló siempre con una ruta y token ficticios. Tras 3 intentos la UI mostró `FAILED`, mensaje seguro y 0 enlaces de descarga; ni UI ni `errorMessage` persistido contienen el secreto. Playwright: 2/2. |
| Entorno limpio | `npm ci`, Compose nuevo, 2 migraciones sobre bases vacías, seed doble, web/worker, descarga XML y todas las comprobaciones se ejecutaron siguiendo README. |
| Recursos desechables | Proyecto `substation-scd-manager-clean`; solo sus dos contenedores, red y volúmenes fueron eliminados tras inspección. No queda ningún recurso con esa etiqueta. |
| Datos habituales | Antes y después: 1 subestación, 1 revisión, 2 generaciones y 2 artefactos. PostgreSQL/Redis habituales regresaron `healthy`. |
| Matriz limpia | lint 0; typecheck 0; Vitest 23/23; PostgreSQL/API 12/12; cola 7/7; Playwright 2/2; build 0. |
| Recorrido operativo | Web y worker arrancados por scripts separados; `202 QUEUED → SUCCEEDED`, intento 1, descarga de 369 bytes y SHA-256 `7513410caf6b76e23bd8dccd3ed504a458eb2c9f3e07565b454807060c310bf3`. |

Se cierran T071, T074, T075 y T077. El cierre final de T014/T076 se registra a continuación.

## Verificación final de T014 y T076 — 2026-09-14

Entorno aislado: proyecto Compose `substation-scd-manager-compose-test`, creado inicialmente sin contenedores, red ni volúmenes asociados. Los volúmenes habituales se detuvieron sin borrarse.

| Evidencia | Resultado |
| --- | --- |
| Configuración y build | `docker compose config --quiet` código 0; `docker compose up -d --build --wait` construye web/worker/migrador. |
| Orden de arranque | PostgreSQL y Redis `healthy`; `migrate` aplica dos migraciones sobre la base vacía y termina `Exited (0)`; web/worker arrancan después y quedan `healthy`. |
| Separación | Web y worker son contenedores/procesos distintos. Web no recibe `REDIS_URL`; worker conecta internamente a `postgres` y `redis`. |
| Imágenes finales | Usuarios no privilegiados `nextjs` (uid 1001) y `node` (uid 1000); sin `.env`, Prisma CLI, TypeScript, ESLint, Vitest o Playwright. El worker conserva `tsx` como dependencia exacta de runtime. |
| Salud y cierre | `/api/health` devuelve `{"status":"ok"}`; worker exige heartbeat reciente + PostgreSQL + Redis. SIGTERM registra `worker_shutdown` y el reinicio vuelve a estado `healthy`. |
| Recorrido Compose | API crea subestación/revisión, acepta un trabajo y el worker termina `SUCCEEDED` al intento 1; descarga XML simulado de 355 bytes, SHA-256 `7e00174762340e24cd67f6c6357e5a3ac555065b4998dc18a77679af3ebd7c5d`. |
| Persistencia | Antes y después de `down` sin `-v`: 2 subestaciones, 1 revisión, 1 generación y 1 artefacto; descarga idéntica por tamaño/checksum. Los dos volúmenes aislados permanecieron. |
| Dependencias y secretos | `npm ci` desde lockfile; árbol productivo sin paquetes extraneous. Sin rutas personales ni firmas de claves/tokens; el único `API_TOKEN` es un valor ficticio de la prueba de fallo. `.env` existe solo localmente y las reglas excluyen entorno, dependencias, builds, cliente generado y salidas de pruebas. |
| Matriz automatizada | lint 0; typecheck 0; Vitest 23/23; PostgreSQL/API 12/12; cola 7/7; Playwright 2/2; build 0. |

AC-01…AC-12 quedan cumplidos con la evidencia de la matriz. El XML continúa marcado `simulated="true"` y `data-conformance="none"`; no implementa ni certifica IEC 61850. Con T014 y T076 verificadas, no quedan tareas abiertas de M1.
