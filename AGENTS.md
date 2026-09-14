# Substation SCD Manager — instrucciones para agentes

## Propósito

Este repositorio desarrolla una plataforma web para gestionar configuraciones de subestaciones y solicitar la generación de archivos SCD. La documentación bajo `spec/` es la fuente de requisitos y decisiones del producto.

Es un ejercicio técnico de entrevista y portfolio para publicar posteriormente en GitHub. La documentación debe permitir a reclutadores entender el problema, el recorrido de demostración, las decisiones y sus límites. Describir capacidades implementadas solo cuando exista evidencia; el estado de cada entrega se registra en `tasks.md` y en el README.

## Flujo obligatorio

Todo cambio debe seguir, en este orden:

**especificación → plan → tareas → implementación → verificación**.

1. **spec**: definir o actualizar comportamiento, alcance, criterios de aceptación e invariantes.
2. **plan**: documentar arquitectura, modelo de datos, interfaces, riesgos y estrategia de pruebas.
3. **tasks**: descomponer el plan en unidades pequeñas, ordenadas y verificables.
4. **implementación**: ejecutar únicamente tareas documentadas y mantener trazabilidad con la feature.
5. **verificación**: ejecutar comprobaciones relevantes y registrar el resultado contra los criterios de aceptación.

No se debe implementar una feature sin especificación, plan y tareas aprobables. Si el código revela que la especificación es insuficiente, se actualiza primero la documentación.

## Invariantes de arquitectura

- TypeScript debe usar modo estricto; no introducir `any` sin una justificación explícita y localizada.
- La aplicación web usa Next.js; PostgreSQL y Prisma gestionan el estado persistente.
- PostgreSQL es la única fuente de verdad del estado de proyectos, configuraciones y trabajos.
- Redis se usa solamente como infraestructura efímera de cola para BullMQ; no almacena estado de negocio canónico.
- La generación SCD jamás se ejecuta dentro del ciclo de una petición HTTP.
- Una petición de generación persiste atómicamente trabajo y evento outbox; responde `202` tras el commit. Un dispatcher publica en BullMQ sin ejecutar generación en HTTP.
- Un worker independiente consume la cola, genera el SCD y persiste resultado, errores y transiciones de estado.
- El primer milestone usa un generador SCD simulado, determinista y estructurado. IEC 61850 completo queda fuera del MVP.
- Las pruebas unitarias y de integración usan Vitest; los recorridos críticos de navegador usan Playwright.
- El entorno local reproducible se define con Docker Compose.

## Reglas de cambio

- Favorecer una aplicación modular y un worker independiente en un único repositorio. Evitar microservicios adicionales, Kubernetes, buses genéricos o abstracciones sin un caso concreto.
- Explicar cada decisión relevante con su motivo, coste y alternativa descartada en el plan.
- Mantener visible que el archivo SCD es simulado y no demuestra conformidad ni interoperabilidad IEC 61850.
- Preparar una interfaz mínima de almacenamiento de artefactos para una futura implementación S3/MinIO, sin instalarla ni desplegarla en M1.

- No ampliar el alcance a autenticación, colaboración en tiempo real, importación SCL ni validación IEC 61850 completa sin una nueva feature spec.
- Las transiciones de trabajos deben ser explícitas, persistentes e idempotentes cuando sea posible.
- No confiar en el estado de BullMQ para mostrar el estado de negocio: consultar PostgreSQL.
- Los contratos compartidos entre web y worker deben tener tipos y validación en límites de entrada.
- Los tests no deben depender del reloj, UUID o contenido aleatorio sin inyección/control determinista.
- No declarar una tarea terminada sin cumplir su verificación y los criterios de aceptación relacionados.

## Convenciones SDD

Cada feature vive en `spec/features/NNN-nombre/` y contiene:

- `spec.md`: problema, alcance, requisitos, escenarios y criterios de aceptación.
- `plan.md`: diseño técnico y estrategia de entrega/verificación.
- `tasks.md`: tareas ordenadas con dependencias y comprobaciones observables.

Las decisiones transversales residen en `spec/constitution/`. Ante conflicto, prevalecen las invariantes constitucionales; el conflicto debe resolverse en la documentación antes de programar.

## Prompts progresivos para futuras sesiones de Codex

Ejecutar en secuencia, revisando el resultado entre etapas:

### Prompt 1 — preparar el esqueleto

> Lee `AGENTS.md`, toda `spec/constitution/` y la feature `spec/features/001-project-foundation/`. Implementa solamente la fase de esqueleto indicada en `tasks.md`: estructura de workspace, configuración TypeScript estricta, Next.js mínimo y scripts base. No implementes todavía la cola ni el generador. Verifica tipos y pruebas mínimas, y actualiza las casillas de tareas únicamente si pasan.

### Prompt 2 — persistencia y dominio

> Relee la documentación SDD y continúa la feature 001 con PostgreSQL y Prisma. Implementa el modelo de dominio y las migraciones para proyectos, configuraciones, revisiones, trabajos de generación y artefactos, respetando PostgreSQL como fuente de verdad. Añade pruebas Vitest de invariantes y transiciones. No añadas UI avanzada ni generación SCD real.

### Prompt 3 — cola y worker

> Relee la feature 001 e implementa la frontera asíncrona con Redis, BullMQ y un proceso worker independiente. La ruta HTTP persiste trabajo y outbox; el publicador del proceso worker entrega el mensaje a BullMQ. Solo el consumidor BullMQ llama al generador. Implementa idempotencia, reintentos acotados y persistencia de estados en PostgreSQL. Demuestra con pruebas que el generador no se ejecuta dentro de la petición.

### Prompt 4 — generador simulado

> Implementa el generador SCD simulado definido en la feature 001. Debe producir XML estructurado, estable y determinista a partir de una revisión inmutable. Persiste metadatos y referencia del artefacto, añade pruebas snapshot/estructurales y conserva IEC 61850 completo fuera del alcance.

### Prompt 5 — experiencia vertical y E2E

> Completa la experiencia mínima de la feature 001: crear proyecto, editar configuración, solicitar generación y observar estados hasta descargar el SCD simulado. Añade Playwright para el camino feliz y un fallo del worker. Prepara la guía de demostración y el README para reclutadores definidos en las tareas futuras. Ejecuta la verificación del plan y entrega la matriz de aceptación con evidencia, distinguiendo lo implementado de la evolución S3/MinIO.
