# Substation SCD Manager

[![CI](https://github.com/Horjel/substation-scd-manager/actions/workflows/ci.yml/badge.svg)](https://github.com/Horjel/substation-scd-manager/actions/workflows/ci.yml)

Ejercicio técnico de entrevista y portfolio: una plataforma web para gestionar configuraciones de subestaciones y solicitar archivos SCD de forma asíncrona.

**Estado actual:** recorrido vertical implementado y verificado. La web permite crear y consultar subestaciones, guardar revisiones inmutables, solicitar una generación, seguir sus estados y descargar únicamente el SCD vigente. PostgreSQL, Redis, BullMQ, el worker independiente y el generador simulado se prueban también de forma aislada.

El generador del primer milestone es **simulado y determinista**. No implementa el estándar IEC 61850 completo ni acredita conformidad o interoperabilidad con herramientas industriales.

## Capturas

### Propuesta de valor

![Portada de Substation SCD Manager con la arquitectura asíncrona del proyecto](docs/images/home.png)

### Gestión de subestaciones

![Listado de subestaciones con una configuración de demostración](docs/images/substations.png)

### Generación SCD completada

![Detalle de una subestación con una generación simulada completada y disponible para descarga](docs/images/generation-success.png)

Las imágenes proceden de un entorno Docker Compose aislado y contienen únicamente datos ficticios. La generación mostrada recorrió la cola y el worker real del proyecto; el XML continúa siendo el simulador no conforme del MVP.

## Ejecutar el proyecto

Requisitos comunes: Docker Desktop con motor Linux y Compose v2. Para desarrollo local también se requieren Node.js 24 y npm 11. Ejecutar siempre desde la raíz y crear la configuración local solo si aún no existe:

```powershell
if (!(Test-Path .env)) { Copy-Item .env.example .env }
docker compose config --quiet
```

Revisar `.env` antes de arrancar. Sus valores son ejemplos públicos para desarrollo local, no credenciales de producción. El archivo está excluido tanto de Git como del contexto Docker.

### Opción A — desarrollo local

Instala dependencias en el host y arranca únicamente la infraestructura:

```powershell
npm ci
docker compose up -d --wait postgres redis
npm run db:generate
npm run db:validate
npm run db:migrate
npm run db:status
npm run db:seed
```

`db:migrate` ejecuta `prisma migrate deploy`. En este modo es el comando explícito del desarrollador; ni la web ni el worker aplican migraciones. Evitar `prisma db push`, porque no instala la protección SQL de inmutabilidad. El seed es opcional e idempotente: crea una subestación/revisión ficticias con IDs fijos, no crea generaciones y rechaza datos incompatibles en lugar de sobrescribirlos.

Después inicia los dos procesos en terminales separadas:

```powershell
# Terminal 1
npm run dev

# Terminal 2
npm run worker
```

### Opción B — aplicación completa con Docker Compose

Esta opción construye imágenes de producción locales y no requiere instalar dependencias npm en el host:

```powershell
docker compose up -d --build --wait
docker compose ps -a
```

Abrir [localhost:3000](http://localhost:3000). El servicio one-shot `migrate` es el único que ejecuta `prisma migrate deploy`; debe aparecer como `Exited (0)` antes de que web y worker arranquen. PostgreSQL, Redis, web y worker deben aparecer `healthy`. La web usa PostgreSQL; el worker separado usa PostgreSQL y Redis mediante los nombres internos `postgres` y `redis`.

La salud web comprueba el proceso y una consulta PostgreSQL en `/api/health`. La salud del worker exige un heartbeat reciente del runtime y conexiones reales a PostgreSQL y Redis. `init`, los periodos de gracia y SIGTERM permiten un cierre ordenado.

```powershell
docker compose logs -f web worker
docker compose stop
# o bien retirar contenedores y red, conservando datos:
docker compose down
```

`stop` y `down` conservan los volúmenes nombrados de PostgreSQL, Redis y los artefactos guardados en PostgreSQL. `down -v` los elimina y no forma parte del uso normal.

### Verificación desde un entorno limpio y aislado

Este procedimiento usa el nombre `substation-scd-manager-clean` y no toca los volúmenes habituales. Antes de ejecutarlo, comprobar que ese proyecto desechable no contiene datos que deban conservarse. Como los puertos locales son los mismos, primero detiene —sin eliminar— la pila habitual:

```powershell
npm ci
if (!(Test-Path .env)) { Copy-Item .env.example .env }

$cleanProject = 'substation-scd-manager-clean'
docker compose stop
docker compose -p $cleanProject config --quiet
docker compose -p $cleanProject up -d --build --wait
docker compose -p $cleanProject ps -a
```

Crear y migrar la base de pruebas separada, y ejecutar la matriz completa:

```powershell
docker compose -p $cleanProject exec postgres createdb -U substation substation_test
$testDatabaseUrl = ((Get-Content .env | Where-Object { $_ -like 'TEST_DATABASE_URL=*' } | Select-Object -First 1) -split '=', 2)[1]
$previousDatabaseUrl = $env:DATABASE_URL
try {
  $env:DATABASE_URL = $testDatabaseUrl
  npm run db:migrate
  npm run db:status
} finally {
  if ($null -eq $previousDatabaseUrl) { Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue }
  else { $env:DATABASE_URL = $previousDatabaseUrl }
}

# Mantener PostgreSQL/Redis y liberar el puerto web para Playwright.
docker compose -p $cleanProject stop web worker
npm run db:generate
npm run db:validate
npm run db:seed
npm run db:seed
npm run lint
npm run typecheck
npm test
npm run test:db
npm run test:queue
npm run test:e2e
npm run build
docker compose -p $cleanProject up -d --wait web worker
```

`test:e2e` usa la base de pruebas, arranca procesos temporales web/worker y cubre éxito y fallo controlado. Para retirar el entorno, enumerar primero sus cinco contenedores y dos volúmenes exactos. Solo después, `down -v` con `-p $cleanProject` elimina esos recursos desechables; nunca ejecutar ese borrado contra el proyecto habitual:

```powershell
docker compose -p $cleanProject ps -a
docker volume ls --filter "label=com.docker.compose.project=$cleanProject"
docker compose -p $cleanProject down -v
docker compose up -d --build --wait
```

## Modelo persistente

- `Substation`: identidad, nombre y descripción de la subestación.
- `ConfigurationRevision`: referencia a subestación, versión positiva y única, snapshot JSON y SHA-256. Un trigger rechaza UPDATE/DELETE; cada cambio requiere una nueva fila. Las claves externas impiden borrar sus padres.
- `ScdGeneration`: trabajo persistente con estado, número de intento, token y lease.
- `GenerationOutbox`: intención transaccional de publicar `generate-scd.v1`; permite recuperarse si Redis falla.
- `GeneratedArtifact`: XML, MIME, nombre, tamaño y checksum almacenados como bytes en PostgreSQL.

La canonicalización, validación, máquina de estados, outbox, artefactos y restricciones están cubiertos por pruebas unitarias o integradas reales. El artefacto no se escribe en `public/`; la API devuelve bytes y metadatos sin exponer `storageKey` ni rutas internas.

## Probar el recorrido asíncrono

### Desde la interfaz

Con la infraestructura y las migraciones preparadas, abrir dos terminales desde la raíz:

```sh
# Terminal 1
npm run dev

# Terminal 2
npm run worker
```

Abrir [localhost:3000/substations](http://localhost:3000/substations), crear una subestación, guardar una revisión y pulsar **Generar SCD**. La interfaz consulta periódicamente PostgreSQL sin bloquearse y muestra `En cola`, `Procesando`, `Completado` o `Fallido`. La descarga aparece solo al completar la revisión vigente. Al guardar otra revisión, los resultados anteriores se muestran como obsoletos y el servidor vuelve a rechazar su descarga con `409` aunque se use directamente la URL antigua.

Detener ambos procesos con Ctrl+C. El worker deja de reclamar trabajos, espera el activo y cierra sus conexiones.

### Desde la API mínima

La revisión ficticia del seed tiene ID `00000000-0000-4000-8000-000000000002`. Para demostrar que HTTP no genera ni depende del worker:

1. Arrancar solo la web con `npm run dev`.
2. Solicitar una generación en otra terminal:

```powershell
$body = @{ revisionId = '00000000-0000-4000-8000-000000000002' } | ConvertTo-Json
$job = Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/generations -ContentType application/json -Body $body
$job
Invoke-RestMethod -Uri ("http://localhost:3000" + $job.statusUrl)
```

La respuesta es `202` y el estado permanece `QUEUED` aunque el worker esté detenido. Después, arrancar `npm run worker` en una tercera terminal y consultar hasta obtener un estado terminal:

```powershell
do {
  Start-Sleep -Milliseconds 250
  $status = Invoke-RestMethod -Uri ("http://localhost:3000" + $job.statusUrl)
} while ($status.status -in @('QUEUED', 'RUNNING'))
$status
if ($status.status -ne 'SUCCEEDED') { throw 'La generación no terminó correctamente.' }

$artifactPath = Join-Path $env:TEMP ("substation-demo-{0}.scd" -f $job.jobId)
Invoke-WebRequest -Uri ("http://localhost:3000" + $job.artifactUrl) -OutFile $artifactPath
[xml]$scd = Get-Content -LiteralPath $artifactPath -Raw
if ($scd.SCD.'data-conformance' -ne 'none') { throw 'El artefacto no está marcado como simulado.' }
Get-FileHash -LiteralPath $artifactPath -Algorithm SHA256
Remove-Item -LiteralPath $artifactPath
```

Solicitudes repetidas mientras el trabajo está activo reutilizan su `jobId`.

## API del recorrido

| Método y ruta | Responsabilidad |
| --- | --- |
| `GET /api/substations` | Lista subestaciones y resumen de revisiones. |
| `POST /api/substations` | Crea una subestación validada. |
| `GET /api/substations/:id` | Consulta detalle, revisiones y generaciones persistidas. |
| `POST /api/substations/:id/revisions` | Crea el siguiente snapshot inmutable. |
| `POST /api/substations/:id/generations` | Acepta la generación vigente con `202` y outbox transaccional. |
| `GET /api/substations/:id/generations` | Proyecta historial, vigencia y disponibilidad desde PostgreSQL. |
| `GET /api/generations/:jobId` | Consulta un trabajo sin depender de Redis. |
| `GET /api/generations/:jobId/artifact` | Entrega bytes solo si terminó y continúa vigente. |

Los errores HTTP son deliberadamente acotados: no incluyen trazas, credenciales, claves de almacenamiento ni rutas internas.

## Pruebas con PostgreSQL real

`npm test` no necesita base de datos. `npm run test:db` es una suite separada que exige una base de pruebas migrada; no se omite silenciosamente cuando falta configuración. Sus operaciones se ejecutan en transacciones que se revierten, incluso al provocar errores de constraints.

Con las credenciales locales de `.env.example`, crear la base una sola vez y migrarla (si ya existe, no volver a crearla):

```powershell
docker compose exec postgres createdb -U substation substation_test
$sddPreviousUrl = $env:DATABASE_URL
try {
  $env:DATABASE_URL = 'postgresql://substation:local_development_only@127.0.0.1:5432/substation_test?schema=public'
  npm run db:migrate
} finally {
  if ($null -eq $sddPreviousUrl) { Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue }
  else { $env:DATABASE_URL = $sddPreviousUrl }
}
npm run test:db
npm run test:queue
npm run test:e2e
```

Adaptar la URL si cambiaste las credenciales locales. `TEST_DATABASE_URL` debe identificar esa base de pruebas, no la de desarrollo; `TEST_REDIS_URL` usa la base Redis 1 para aislar la cola de pruebas. La suite PostgreSQL cubre constraints y contratos HTTP; la de cola cubre outbox, reintentos, duplicados, fallos, leases, atomicidad y uso del snapshot encolado. Playwright usa un Chrome local y arranca temporalmente web y worker contra los servicios de prueba.

Para ejecutar la versión de producción:

```sh
npm run build
npm start
```

Detener el servidor con Ctrl+C. `npm ci` instala las resoluciones del lockfile.

## Comprobaciones

```sh
npm run lint
npm run typecheck
npm test
npm run test:db
npm run test:queue
npm run test:e2e
npm run build
```

- `lint`: ESLint con reglas de Next.js y TypeScript; los avisos también hacen fallar el comando.
- `typecheck`: genera los tipos Next.js y comprueba web y herramientas con TypeScript estricto.
- `test`: Vitest verifica dominio, XML determinista y presentación segura de los cuatro estados.
- `test:db`: Vitest comprueba constraints y contratos de API sobre PostgreSQL real.
- `test:queue`: ejecuta BullMQ, Redis y PostgreSQL reales; cubre recuperación, reintentos, duplicados, fallos, leases y snapshots.
- `test:e2e`: Playwright recorre alta, revisión, worker, polling, descarga XML y obsolescencia en Chrome.
- `build`: crea la versión optimizada de producción.
- `npm run test:watch`: modo interactivo de Vitest durante desarrollo.

La última verificación contiene 23 pruebas sin servicios externos, 12 pruebas PostgreSQL, 7 pruebas integradas de cola y 2 recorridos Playwright. La prueba de navegador requiere PostgreSQL/Redis de pruebas migrados y Chrome instalado.

## Integración continua

`.github/workflows/ci.yml` ejecuta GitHub Actions en cada pull request y en cada push a `main`, con permisos de solo lectura:

- **Quality:** Node.js 24, instalación desde lockfile, lint, TypeScript estricto, 23 pruebas Vitest y build.
- **PostgreSQL, queue and browser:** PostgreSQL 17 y Redis 7 reales, migraciones, 12 pruebas PostgreSQL/API, 7 de BullMQ/worker y 2 recorridos Playwright.

El runner Ubuntu 24.04 ya incluye Google Chrome. Las credenciales declaradas en el workflow son valores ficticios que solo existen dentro de sus servicios efímeros; la CI no usa secretos de producción, no publica imágenes y no despliega. Los mismos comandos pueden ejecutarse localmente mediante la sección “Comprobaciones”. El badge superior enlaza el resultado actual del workflow remoto.

## Decisiones técnicas

- **Un repositorio con web y worker separado:** comparte contratos tipados sin ejecutar generación dentro del proceso HTTP.
- **App Router y componentes de servidor:** las páginas cargan su estado inicial desde PostgreSQL; solo formularios y polling son componentes cliente pequeños.
- **TypeScript estricto y ESLint:** detectan errores antes de ejecutar la aplicación.
- **CSS y fuentes de sistema:** mantienen el arranque simple y evitan descargar fuentes al construir.
- **Servicios antes que rutas:** validación, versionado, transacciones y proyecciones viven en `packages/db`; los handlers solo traducen HTTP.
- **Vigencia derivada:** un resultado es descargable si pertenece a la revisión más reciente y está `SUCCEEDED`; la API lo revalida al servir los bytes.

Stack instalado: Next.js 16.3.5, React 19.3, TypeScript 5.9, ESLint 9, Vitest 5, Prisma 7.10.0, BullMQ 6.3.4 e ioredis 6.0.0. El lockfile contiene las versiones exactas.

Limitación de herramientas: npm avisa de que ESLint 9 ha terminado su soporte. Se conserva porque el plugin React usado por la configuración oficial de Next.js aún no declara compatibilidad con ESLint 10. La actualización se revisará cuando esos plugins la admitan; no se fuerzan dependencias incompatibles. TypeScript 5.9 también respeta el rango compatible del analizador de ESLint.

Compose configura PostgreSQL 17 y Redis 7. La petición HTTP persiste trabajo y outbox y responde `202`; el dispatcher del worker publica después un payload que contiene únicamente `jobId`. **La generación nunca se ejecuta dentro de HTTP.** PostgreSQL es la fuente de verdad y Redis solo infraestructura de cola.

La auditoría actual de npm informa cuatro avisos altos asociados a dependencias de la CLI de Prisma (`deepmerge-ts` y `mysql2`, este último no usado por el adaptador PostgreSQL). No se ejecutó `npm audit fix --force`, que propone cambiar la versión principal. Revisar `npm audit` al actualizar herramientas; no se declara una auditoría limpia.

Los artefactos pequeños del MVP se guardan en PostgreSQL detrás de `ArtifactStore`, con límite de 1 MiB. Una feature posterior incorporará S3/MinIO manteniendo metadatos, estado y referencias en PostgreSQL.

## Licencia

Este proyecto se distribuye bajo la [licencia MIT](LICENSE).

## Estructura

```text
apps/web/src/app/    App Router, páginas y handlers HTTP pequeños
apps/web/src/components/ Formularios y polling interactivo
apps/worker/        Dispatcher outbox y consumidor BullMQ independiente
packages/domain/    Validación de configuración simulada
packages/queue/     Contrato versionado y publicación BullMQ
packages/scd/       Generador XML simulado determinista
packages/storage/   Contrato ArtifactStore sustituible
packages/db/        Prisma, servicios transaccionales, migraciones y seed
compose.yaml        PostgreSQL, Redis, migrador, web y worker
prisma.config.ts    Configuración CLI, conexión y migraciones
tests/              Suites unitarias, PostgreSQL, cola real y Playwright
.github/workflows/  Integración continua de calidad y recorrido real
docs/images/         Capturas reales con datos ficticios para el portfolio
spec/constitution/  Misión, stack y roadmap
spec/features/001-project-foundation/
                    Especificación, plan y tareas de M1
spec/features/002-continuous-integration/
                    Especificación, plan y tareas de CI
spec/features/003-github-publication/
                    Evidencia de la publicación inicial
spec/features/004-portfolio-polish/
                    Capturas, licencia y protección de la rama principal
AGENTS.md           Instrucciones de trabajo spec-anchored
```

## Guía de revisión

El flujo obligatorio es **especificación → plan → tareas → implementación → verificación**.

1. [Misión](spec/constitution/mission.md): propósito y límites del ejercicio.
2. [Especificación](spec/features/001-project-foundation/spec.md): criterios BOOT de esta entrega y AC del milestone completo.
3. [Plan técnico](spec/features/001-project-foundation/plan.md): decisiones y evolución.
4. [Tareas](spec/features/001-project-foundation/tasks.md): estado verificado y trabajo pendiente.
5. [Roadmap](spec/constitution/roadmap.md): hitos posteriores.
6. [Feature 002](spec/features/002-continuous-integration/spec.md): preparación Git e integración continua.
7. [Feature 003](spec/features/003-github-publication/spec.md): publicación inicial y evidencia remota.
8. [Feature 004](spec/features/004-portfolio-polish/spec.md): presentación visual, licencia y protección de `main`.

El milestone M1 se controla y cierra con evidencia en `tasks.md`. El simulador sigue presentado como una demostración arquitectónica, no como un producto conforme con IEC 61850.
