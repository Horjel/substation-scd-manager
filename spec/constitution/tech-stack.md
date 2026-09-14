# Constitución técnica

Decisiones transversales de Substation SCD Manager, ejercicio de portfolio con arquitectura mínima reproducible.

## Stack obligatorio

- **Lenguaje:** TypeScript en modo `strict` para aplicación, worker, librerías y pruebas.
- **Web:** Next.js con rutas/API del framework y renderizado adecuado a cada pantalla.
- **Base de datos:** PostgreSQL.
- **ORM y migraciones:** Prisma.
- **Cola:** BullMQ sobre Redis.
- **Pruebas:** Vitest para unidad/integración y Playwright para extremo a extremo.
- **Entorno local:** Docker Compose para PostgreSQL, Redis y los procesos necesarios.

Las versiones exactas se fijarán al implementar la foundation y se documentarán en el lockfile. Deben ser versiones estables y compatibles entre sí en ese momento.

Versiones implementadas: PostgreSQL 17 y Redis 7 con imágenes de versión principal fijada, Prisma 7.10.0, BullMQ 6.3.4 e ioredis 6.0.0. El corte vertical incorpora outbox, artefactos, worker independiente y una interfaz mínima con seguimiento y descarga segura.

## Topología obligatoria

```text
Navegador
   │ HTTP
   ▼
Next.js ─────► PostgreSQL (trabajo + outbox; estado canónico)
                      │                          ▲
                      ▼                          │ estados/artefacto
             Publicador de outbox                │
                      │                          │
                      ▼                          │
               Redis + BullMQ ─────► Consumidor ──┘
                                         │
                                         ▼
                                Generador SCD simulado

Publicador y consumidor viven en un mismo proceso worker,
independiente del proceso Next.js. Solo el consumidor genera.
```

## Frontera asíncrona

La generación SCD no puede importarse ni invocarse desde el controlador de la petición. El endpoint:

1. valida la solicitud;
2. identifica una revisión inmutable de configuración;
3. crea atómicamente un trabajo `QUEUED` y su evento outbox en PostgreSQL;
4. confirma la transacción;
5. responde con `202 Accepted` y el identificador consultable sin esperar a Redis ni al generador.

Un publicador (dispatcher) del proceso worker publica posteriormente el identificador en BullMQ. El outbox conserva la intención de encolado si Redis no está disponible. `202` significa solicitud aceptada de forma persistente, no archivo generado ni mensaje ya entregado.

El worker recupera los datos canónicos desde PostgreSQL, marca transiciones, ejecuta el generador y persiste el resultado. Redis puede perderse y reconstruirse sin perder el historial de negocio; la reconciliación implementada republica trabajos persistidos ausentes de la cola y recupera leases vencidos.

## Persistencia y modelo

- Los identificadores son opacos y estables.
- Una configuración editable puede producir revisiones inmutables.
- Un trabajo referencia exactamente una revisión y una versión de generador.
- Estados mínimos: `QUEUED`, `RUNNING`, `SUCCEEDED`, `FAILED`.
- Guardar timestamps de creación, inicio y finalización, contador/intento útil y error sanitizado.
- El artefacto del MVP se guarda en PostgreSQL como bytes UTF-8, con límite de 1 MiB y metadatos en la misma base de datos.
- Las restricciones e índices que protegen invariantes deben residir también en la base de datos cuando sea viable.

## Contratos y validación

El acceso a artefactos usa una interfaz pequeña `ArtifactStore` para guardar y leer por clave estable. M1 solo implementa el adaptador PostgreSQL. Una feature posterior añadirá S3/MinIO manteniendo en PostgreSQL estados, checksum, tamaño y referencia de almacenamiento; el dominio y el generador no dependerán de un SDK S3.

- Validar toda entrada HTTP y payload de cola en el límite.
- El payload BullMQ contiene identificadores, no una copia autoritativa de la configuración.
- Compartir tipos de dominio sin acoplar el worker al runtime de Next.js.
- Los errores externos no deben exponer secretos, trazas internas o credenciales.
- Las APIs de mutación deben definir semántica de idempotencia y códigos de respuesta.

## Generador del milestone 1

El generador simulado recibe una representación normalizada de una revisión y devuelve XML UTF-8:

- bien formado y con un elemento raíz SCD identificable;
- estructurado en secciones predecibles (cabecera, subestación y elementos simulados);
- ordenado de forma canónica;
- sin timestamps de ejecución, valores aleatorios ni dependencias ambientales en el contenido;
- acompañado por versión del generador, tipo MIME, tamaño y checksum.

El resultado es un artefacto de demostración y debe etiquetarse como simulado/no conforme. No se implementarán reglas exhaustivas IEC 61850 en el MVP.

## Calidad y pruebas

- Typecheck estricto, lint y formato forman parte de la verificación básica.
- Vitest cubre reglas de dominio, serialización determinista y servicios.
- Las pruebas de integración cubren Prisma/PostgreSQL, BullMQ/Redis y ejecución real del worker en un entorno aislado.
- Playwright cubre el recorrido usuario → solicitud → procesamiento → descarga y la presentación de errores.
- Probar con procesos reales: con worker detenido, la API responde `202`; al arrancarlo, procesa el trabajo. Con ambos activos no se exige un orden temporal entre respuesta e inicio del worker, sino independencia y ausencia de generación en HTTP.

## Operación local y seguridad

- Docker Compose proporciona comprobaciones de salud y volúmenes nombrados.
- Los procesos web y worker se arrancan por separado y comparten contratos/configuración, no memoria.
- Configuración mediante variables de entorno validadas al inicio; nunca versionar secretos.
- Logs estructurados incluyen `jobId` y contexto suficiente, sin datos sensibles.
- Reintentos con backoff y límite explícito; los fallos terminales se persisten.
