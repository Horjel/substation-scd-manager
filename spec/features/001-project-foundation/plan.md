# Feature 001 — Plan técnico

## Enfoque

Construir Substation SCD Manager en un único repositorio TypeScript con una aplicación Next.js y un worker BullMQ independiente. Los módulos compartidos mantienen límites de responsabilidad sin convertirse en servicios ni paquetes publicables. La entrega avanza por capas y termina en un corte vertical probado para una entrevista.

## Arquitectura propuesta

### Alcance de la primera entrega

Crear únicamente el workspace npm `apps/web`, con App Router en `src/app`. Los demás workspaces del esquema siguiente se incorporan cuando tengan implementación real. Usar Node.js 24, npm 11, Next.js 16.3.5, React 19.3, TypeScript 5.9 y Vitest 5; las resoluciones exactas quedan en el lockfile. ESLint usa flat config con reglas Next.js y TypeScript. Vitest ejecuta en Node una prueba del renderizado estático de la página síncrona; no necesita navegador ni servidor de base de datos.

TypeScript comparte opciones estrictas; la web y la configuración de pruebas se comprueban por separado. `typecheck` genera primero los tipos Next.js para funcionar desde un checkout limpio. La página usa CSS y fuentes de sistema, sin descargas de fuentes durante build. El README inicial describe solo el arranque comprobado; se ampliará al completar M1. La verificación ejecuta lint, tipos, Vitest, build y una consulta HTTP al servidor local de producción. Playwright e infraestructura se aplazan por alcance explícito del usuario.

Desactivar `agentRules` en Next.js para que `next dev` no añada instrucciones AGENTS/CLAUDE alternativas a las del repositorio. Se mantiene ESLint 9 por compatibilidad del plugin React de la configuración oficial; su aviso de fin de soporte se documenta en README y debe revisarse cuando los plugins admitan ESLint 10.

### Estructura objetivo de M1

```text
apps/web        Next.js: UI, consultas y comandos HTTP
apps/worker     Proceso Node independiente: publicador outbox y consumidor BullMQ
packages/domain Tipos, validaciones y transiciones puras
packages/db     Prisma client, esquema y repositorios
packages/queue  Nombres de cola, payloads y publicación
packages/scd    Generador simulado puro y determinista
packages/storage Interfaz de artefactos y adaptador PostgreSQL
tests/e2e       Playwright
```

La estructura puede ajustarse durante la tarea de bootstrap si conserva separación, TypeScript estricto y ausencia de imports del generador desde rutas HTTP.

## Decisiones iniciales

### Entrega de infraestructura y persistencia

La petición actual sustituye el modelo inicial por `Substation`, `ConfigurationRevision` y `ScdGeneration`, exclusivamente. Prisma 7.10.0 se fija con su cliente y adaptador PostgreSQL de la misma versión; se evita la etiqueta latest, que actualmente apunta a una release candidate. `prisma.config.ts` carga `.env` desde la raíz. El cliente usa `@prisma/adapter-pg` y se crea explícitamente, sin conexiones al importar módulos ni durante el build web.

Compose arranca solo `postgres:17-alpine` y `redis:7-alpine`; puertos ligados a 127.0.0.1, volúmenes nombrados, `pg_isready`/`redis-cli ping` y AOF de Redis. El volumen Redis conserva infraestructura, no estado canónico. Web y worker no se añaden a Compose en esta fase.

La migración contiene claves externas RESTRICT, versión positiva y única por subestación, snapshot JSON objeto, hash SHA-256 y enum de estado. Un trigger PostgreSQL rechaza UPDATE/DELETE de revisiones completas; el código expone creación, no edición. La protección se refiere a operaciones ordinarias: el administrador de la base puede alterar el esquema. La numeración se proporciona al insertar; una colisión concurrente se rechaza por constraint, sin introducir un servicio de versionado.

Se incluye seed opt-in determinista (IDs y fecha fijos) con subestación y revisión; verifica datos existentes y falla ante incompatibilidad en vez de modificarlos. No genera trabajos. Tests unitarios verifican canonicalización/hash; integración Prisma usa transacciones con rollback para probar relaciones, unicidad, inmutabilidad y estados sin borrar datos de desarrollo. Se exige `TEST_DATABASE_URL` separado para habilitar estas pruebas; no se omiten silenciosamente.

Validación: `prisma validate`, `prisma generate`, revisión del SQL contra `migrate diff`, checks del arranque y pruebas unitarias. Con Docker: `compose config`, `up --wait`, `migrate deploy`, `migrate status`, seed dos veces y tests de base de datos. Si no hay motor disponible, documentar la aplicación y las pruebas reales como pendientes. No ejecutar `migrate reset` ni `down -v`.

### Entrega de cola y procesamiento asíncrono

La entrada mínima acepta una `revisionId` UUID ya existente. Una transacción crea o reutiliza el trabajo activo `ScdGeneration` y crea exactamente un `GenerationOutbox`. La ruta HTTP termina después del commit: no abre conexión Redis y no depende de los paquetes de cola, worker o generador.

El proceso `apps/worker` contiene dos bucles:

1. un dispatcher consulta outbox pendientes, publica `generate-scd.v1` con payload exacto `{ jobId }` y marca `publishedAt`;
2. un consumidor BullMQ valida el contrato, reclama el trabajo en PostgreSQL y ejecuta el simulador.

El UUID persistente es también el `jobId` personalizado de BullMQ. Esto hace inocuo repetir `Queue.add` cuando la publicación Redis tuvo éxito pero falló el update del outbox. El dispatcher también reconcilia generaciones `QUEUED` ya publicadas cuyo mensaje no exista. Redis utiliza la base indicada por `REDIS_URL`; las pruebas usan `TEST_REDIS_URL` separada.

Parámetros de M1: máximo tres intentos, backoff exponencial de un segundo, lease de 60 segundos y barrido del dispatcher cada segundo. Las pruebas inyectan intervalos menores sin cambiar la política de producción. Un error de configuración/revisión es permanente; los errores operativos clasificados como transitorios vuelven condicionalmente a `QUEUED`. Al agotarse intentos se persiste `FAILED`. Los mensajes públicos se limitan a una taxonomía segura.

La segunda migración añade outbox, artefacto, contador de intentos, token y lease. Un índice parcial impide dos trabajos activos para la misma revisión y versión del generador. El artefacto permanece fuera del árbol público porque se guarda como bytes en PostgreSQL, con nombre de descarga, MIME, tamaño y checksum. La API nunca expone `storageKey`.

La verificación combina Vitest puro, PostgreSQL y Redis reales. Cubre contrato estricto, determinismo/escaping XML, caída de publicación con recuperación, reintento transitorio, fallo terminal, entrega duplicada, claim condicional, artefacto atómico y cierre seguro. La demostración manual arranca Next.js y el worker como procesos distintos sobre la revisión determinista del seed.

### Entrega de API y experiencia vertical

Se añaden servicios de aplicación en `packages/db` para crear/listar subestaciones, crear revisiones inmutables, consultar detalle y construir proyecciones seguras de generaciones. Las rutas Next.js se limitan a parsear entrada, invocar el servicio y mapear errores a `201/202/400/404/409/422/500`.

Contratos:

- `GET /api/substations` y `POST /api/substations`;
- `GET /api/substations/:substationId`;
- `POST /api/substations/:substationId/revisions`;
- `GET/POST /api/substations/:substationId/generations`;
- se conservan las rutas mínimas `GET /api/generations/:jobId` y artefacto.

La creación de revisión normaliza/valida con `packages/domain`, calcula el snapshot y asigna `max(version)+1` dentro de transacción. `If-Match` compara la versión observada por la UI y la restricción única protege carreras concurrentes; ambos conflictos devuelven `409`. No se añade tabla de borrador en M1.

La generación de subestación selecciona la última revisión existente y crea trabajo + outbox atómicamente. Crear una revisión posterior no altera el trabajo ni artefacto: las proyecciones calculan `isCurrent` comparando `revisionId` con la última versión. La descarga vuelve a comprobar esa condición en PostgreSQL para evitar enlaces vigentes solo en el cliente.

La página de detalle es server-rendered para la carga inicial y usa componentes cliente pequeños para formularios y polling. El polling se activa cada 1,5 segundos solo con estados activos y se detiene en estados terminales o al desmontar. No hay WebSockets, caché Redis de estado ni estado global.

Playwright usa la base PostgreSQL de pruebas y la base Redis aislada. Arranca Next.js y un runtime worker durante el test, crea los datos desde la UI y valida descarga/obsolescencia. Vitest cubre servicios y contratos HTTP, incluidas respuestas seguras.

### Cierre de resiliencia y entorno limpio

T071 usa exclusivamente `TEST_REDIS_URL`, que debe terminar en `/1`. La prueba crea un único trabajo en PostgreSQL, lo publica sin consumidor, registra los conteos e identidad canónicos y ejecuta `FLUSHDB` solo sobre esa base lógica efímera. Después arranca el runtime del worker: la reconciliación detecta el `QUEUED` con outbox publicado y mensaje ausente, vuelve a publicar el mismo UUID y lo completa sin crear otra generación. No se elimina ni recrea ningún volumen para esta prueba.

T074 inyecta en el runtime Playwright un generador envolvente. Una entrada centinela fija provoca siempre un error con texto interno sensible ficticio; las entradas restantes delegan al simulador real. Esto evita rutas de producción para forzar fallos y prueba que la UI solo presenta su mensaje seguro, llega a `FAILED` tras la política normal de intentos y no habilita descarga.

T075 preserva el entorno de desarrollo: detiene sus contenedores sin borrar volúmenes y crea el proyecto Compose `substation-scd-manager-clean`, cuyos volúmenes esperados son `substation-scd-manager-clean_postgres_data` y `substation-scd-manager-clean_redis_data`. Se ejecutan desde README instalación, salud, migraciones, seed idempotente, bases de prueba, web/worker mediante Playwright, suites y build. Al terminar se inspeccionan los recursos desechables, se eliminan únicamente esos contenedores/red/volúmenes y se reactiva el proyecto de desarrollo.

### Contenedorización de producción local

`apps/web/Dockerfile` construye Next.js con `output: standalone` y copia a la etapa final únicamente el servidor trazado y los estáticos. `apps/worker/Dockerfile` separa instalación completa, dependencias de producción y runtime; copia el cliente Prisma generado y el código de los workspaces requeridos. Ambas etapas finales ejecutan con usuario no privilegiado y Node.js 24 Alpine. `.dockerignore` excluye variables locales, Git, pruebas, documentación y salidas generadas.

Compose añade un servicio one-shot `migrate`, construido desde una etapa operativa del Dockerfile del worker con la CLI Prisma. Solo este servicio recibe la responsabilidad de ejecutar `migrate deploy`; `web` y `worker` dependen de `service_completed_successfully`. Es una imagen efímera de operación y puede contener la toolchain necesaria, mientras las dos imágenes finales de aplicación se verifican sin `prisma`, Vitest, ESLint ni TypeScript.

Web expone `/api/health`, que devuelve `200` solo si su proceso y PostgreSQL responden. El worker mantiene un heartbeat en `/tmp` desde que su runtime conecta y el health command exige que sea reciente, además de ejecutar `SELECT 1` y `PING` contra PostgreSQL/Redis. El marcador se elimina durante SIGINT/SIGTERM; Compose usa `init`, reinicio `unless-stopped` y margen de parada superior al lease del worker.

La validación de T014 usa un proyecto Compose desechable y volúmenes nombrados aislados. Se inspeccionan imágenes para confirmar ausencia de `.env` y paquetes de desarrollo, se ejecuta el recorrido HTTP completo, se reinicia el stack con `down` sin `-v` y se comprueba que los conteos y el artefacto persisten. Solo después se eliminan los volúmenes desechables, nunca los habituales.

### Persistencia del artefacto MVP

Guardar el XML como bytes UTF-8 en PostgreSQL junto con checksum y metadatos, hasta 1 MiB por artefacto. Es simple, transaccional y suficiente para este ejercicio. La alternativa S3/MinIO requiere otro servicio y coordinación de escrituras, por lo que se aplaza.

`ArtifactStore` ofrece `put(key, bytes)` y `get(key)`; `put` es idempotente para los mismos bytes y rechaza contenido distinto en una clave existente. M1 implementa solo PostgreSQL. Una unidad de trabajo proporciona al adaptador la transacción que guarda artefacto, metadatos y éxito del trabajo, sin exponer Prisma a sus consumidores.

Para S3/MinIO, usar clave estable derivada de revisión, versión de generador y checksum, y metadatos `storageProvider`/`storageKey` en PostgreSQL. La feature futura subirá el objeto antes de confirmar éxito, verificará su checksum y resolverá reintentos/objetos huérfanos. La migración copiará y verificará bytes antes de cambiar la referencia; conservará el contenido original hasta validar la reversión. La descarga seguirá pasando por el mismo contrato de aplicación. No se instala SDK ni se añade MinIO en M1.

### Snapshot de configuración

Al solicitar generación, normalizar el borrador y crear/reutilizar una `ConfigurationRevision` inmutable identificada por hash de contenido. El trabajo referencia esa revisión; nunca el borrador mutable como entrada directa.

### Encolado fiable

Usar un patrón outbox persistente en la misma transacción que crea el trabajo. Un dispatcher publica eventos pendientes a BullMQ y marca la entrega. Una tarea de reconciliación reintenta eventos pendientes. El worker recibe solo `jobId` y vuelve a leer PostgreSQL.

Publicador y consumidor se ejecutan en el mismo proceso worker, con responsabilidades separadas; solo el consumidor genera. El outbox evita perder solicitudes entre el commit y Redis sin introducir un servicio adicional. La entrega puede repetirse: no se promete procesamiento exactamente una vez.

Reconciliar también trabajos `QUEUED` cuyos eventos estén publicados pero cuyo mensaje se haya perdido. Para `RUNNING` abandonados, usar lease persistente y token de intento: solo el intento vigente puede finalizar; al vencer se recupera el trabajo. Esta entrega fija lease de 60 segundos, dispatcher cada segundo y tres intentos máximos; T044/T071 prueban recuperación y rechazo de resultados tardíos. Las pruebas usan una base Redis aislada.

### Idempotencia y concurrencia

- Clave lógica activa: revisión + versión de generador. Una solicitud repetida devuelve el trabajo activo existente; una nueva solicitud después de estado terminal puede crear otro trabajo.
- Restricción que impida duplicados activos equivalentes.
- `jobId` persistente también se usa como identificador BullMQ.
- El worker adquiere el trabajo mediante actualización condicional; entregas repetidas no regeneran un trabajo terminal exitoso.
- Transiciones permitidas: `QUEUED → RUNNING → SUCCEEDED|FAILED` y `RUNNING → QUEUED` para un fallo reintentable o lease vencido. Guardar intento/error antes de reencolar. Máximo tres intentos totales, backoff exponencial con base de un segundo para fallos transitorios; datos inválidos fallan sin reintento. Un estado terminal no se reabre.
- PostgreSQL conserva trabajos y artefactos durante M1 sin purga automática. Redis puede retirar entradas terminales tras su confirmación persistente; nunca decide la retención del historial.

### API del milestone

- `POST /api/substations`
- `GET /api/substations`
- `GET /api/substations/:substationId`
- `POST /api/substations/:substationId/revisions`
- `GET /api/substations/:substationId/generations`
- `POST /api/substations/:substationId/generations`
- `GET /api/generations/:jobId`
- `GET /api/generations/:jobId/artifact`

Los contratos deben validarse y probar códigos `201`, `200`, `202`, `400/422`, `404`, `409` y fallos internos seguros según corresponda.

## Modelo de datos previsto

- `Substation`: UUID, name, description opcional, createdAt, updatedAt.
- `ConfigurationRevision`: UUID, substationId, version entero positivo, content JSON, contentHash SHA-256, createdAt; unicidad subestación/versión e índice subestación/hash. Toda la fila es inmutable.
- `ScdGeneration`: UUID, revisionId, generatorVersion, status, createdAt, updatedAt, startedAt/finishedAt opcionales y errorMessage opcional; índice revisión/fecha y estado/fecha.

Fuera de la migración inicial: borradores, artefactos, outbox, intentos y leases. La migración de cola añade todos salvo el borrador mutable. Las referencias a proyecto y trabajo en el diseño futuro corresponden a Substation y ScdGeneration.

Prisma migration debe crear enums, claves externas, restricciones únicas e índices para consultas por proyecto/estado/fecha.

## Flujo de generación

1. Web valida el borrador existente.
2. Una transacción normaliza y crea/reutiliza revisión, trabajo `QUEUED` y evento outbox.
3. La web responde `202` después del commit.
4. Dispatcher publica `jobId` en BullMQ de forma idempotente.
5. Worker reclama condicionalmente el trabajo y persiste `RUNNING`.
6. Worker carga y valida la revisión, llama al generador puro y calcula metadatos.
7. Una transacción crea artefacto y marca `SUCCEEDED`; ante fallo clasifica y persiste/reintenta.
8. UI consulta PostgreSQL hasta estado terminal y habilita descarga.

## Generador simulado

Entrada normalizada y tipada; salida `{ bytes/xml, metadata }`. Ordenar elementos por identificador normalizado. Usar serialización XML explícita con escaping correcto, saltos de línea y encoding fijos. No incluir fecha actual, ids aleatorios ni orden de objetos no controlado. `generatorVersion` será constante versionada.

Estructura conceptual:

```xml
<SCD data-generator="substation-scd-manager-simulator" data-conformance="none">
  <Header generatorVersion="simulator-v1" simulated="true" />
  <Substation name="Demo">
    <SimulatedElements>
      <Element id="IED_01" name="Equipo ficticio" type="IED" />
    </SimulatedElements>
  </Substation>
</SCD>
```

Esta raíz `SCD` y sus elementos constituyen un formato propio de demostración, no el esquema SCL de IEC 61850. La prueba estructural valida este contrato simulado; no se presentará como validación normativa.

## Estrategia de pruebas

- **Unidad (Vitest):** normalización, validación, hash, máquina de estados, escaping/orden/determinismo.
- **Persistencia (Vitest + PostgreSQL):** constraints, snapshot, transiciones condicionales, outbox e idempotencia.
- **Cola/worker (Vitest + Redis/PostgreSQL):** publicación, consumo en proceso separado, retry, duplicados y reinicio de Redis.
- **API:** contratos, códigos y prueba de que el módulo de generación no forma parte de la ejecución HTTP.
- **E2E (Playwright):** AC-10 y presentación de fallo.
- **Artefacto:** parsear XML, comprobar estructura, MIME, tamaño y checksum; snapshot estable solo donde aporte señal.

## Entorno Docker Compose

El stack final contiene `postgres`, `redis`, el one-shot `migrate`, `web` y `worker`. Health checks y condiciones de dependencia ordenan el arranque; solo `migrate` aplica el SQL versionado. Web y worker son contenedores y procesos separados, se ejecutan como usuarios no privilegiados y gestionan SIGTERM. Los volúmenes conservan datos; los tests usan una base PostgreSQL y una base lógica Redis aisladas.

## Decisiones de alcance para el portfolio

Next.js concentra UI y HTTP para reducir coordinación; PostgreSQL/Prisma ofrecen persistencia y migraciones; BullMQ usa Redis para aislar la generación y sus reintentos del ciclo HTTP. Polling sencillo permite consultar progreso sin WebSockets. El borrador JSON validado evita modelar todo IEC 61850 antes de entender el dominio. Vitest verifica reglas e integración; Playwright comprueba lo que experimenta el usuario. No se añaden microservicios, CQRS, Kubernetes ni frameworks de repositorios genéricos.

El README presenta las dos modalidades verificadas —desarrollo local y stack completo en Compose—, la demo, migraciones, pruebas y límites de M1. Publicar en GitHub sigue siendo una acción posterior.

## Observabilidad

- Logs estructurados por evento y `jobId` en operaciones asociadas a un trabajo; errores públicos y persistidos permanecen sanitizados.
- Estados y errores operativos consultables desde PostgreSQL.
- Health/readiness independientes para web y worker cuando corresponda.
- No registrar contenido completo de configuraciones o artefactos por defecto.

## Riesgos y mitigaciones

- **Dual write DB/Redis:** outbox y reconciliación.
- **Procesamiento duplicado:** identificador estable, claims condicionales y constraints.
- **Falso sentido de conformidad:** marcado visible “simulado/no conforme” en UI y XML.
- **XML no determinista:** normalización, serializador controlado y pruebas de bytes.
- **Tests frágiles asíncronos:** polling acotado por estado persistido, sin esperas fijas largas.
- **Crecimiento de artefactos DB:** límite MVP e interfaz de almacenamiento sustituible.

## Secuencia de entrega

1. Bootstrap y controles de calidad.
2. Dominio y esquema Prisma.
3. API de proyectos/configuración.
4. Creación transaccional de revisión/trabajo/outbox.
5. Cola, dispatcher y worker independiente.
6. Generador simulado y persistencia de artefacto.
7. UI vertical y descarga.
8. Pruebas integradas/E2E y documentación operativa.

## Definition of Done

- Todas las tareas obligatorias cerradas con evidencia.
- AC-01 a AC-12 trazados a tests o verificación documental justificada.
- Typecheck, lint, Vitest y Playwright pasan.
- Docker Compose reproduce el recorrido desde un checkout limpio.
- No existe una ruta de código HTTP que invoque el generador.
- La documentación refleja cualquier decisión modificada durante implementación.
