# Misión del producto

## Visión

Substation SCD Manager será una plataforma web que centralice la definición, revisión y generación de configuraciones de subestaciones. Su primera capacidad vertical permitirá capturar una configuración estructurada y obtener un archivo SCD simulado reproducible mediante un proceso asíncrono y observable.

## Lectura para reclutadores

Este ejercicio técnico de entrevista demuestra diseño de APIs, persistencia transaccional, procesamiento asíncrono, pruebas y decisiones de alcance. El dominio de subestaciones sirve como contexto de una aplicación full-stack; el simulador no es una herramienta de ingeniería certificada ni implementa IEC 61850.

Recorrido de la demo: crear proyecto → guardar configuración → solicitar generación → consultar estado → descargar XML simulado. Para revisar el proyecto, leer esta misión, los criterios de aceptación de `spec/features/001-project-foundation/spec.md` y las decisiones de su `plan.md`. `tasks.md` distingue con evidencia las capacidades verificadas del trabajo futuro.

La publicación en GitHub se realizará en una etapa posterior. El README actual documenta la demo completa de M1, sus pruebas, decisiones y limitaciones con datos ficticios, y distingue lo implementado de los planes posteriores.

## Problema

Las configuraciones de subestaciones suelen distribuirse entre documentos, herramientas y archivos difíciles de versionar y auditar. El producto debe ofrecer un flujo coherente en el que el estado de una configuración, la solicitud de generación y el resultado producido puedan rastrearse desde una única fuente persistente.

## Principios

1. **Especificación antes que código.** Cada cambio parte de requisitos y criterios verificables.
2. **Persistencia explícita.** PostgreSQL representa el estado canónico y auditable.
3. **Trabajo pesado asíncrono.** Generar archivos nunca bloquea una petición HTTP.
4. **Resultados reproducibles.** Una misma revisión y versión de generador producen el mismo contenido.
5. **Evolución incremental.** El MVP valida el flujo con un SCD simulado antes de abordar IEC 61850 completo.
6. **Operación observable.** Los trabajos exponen estados, errores y artefactos sin depender de inspeccionar Redis.
7. **Límites claros.** La aplicación web, el dominio, la persistencia, la cola y el worker tienen responsabilidades separadas.
8. **Simplicidad justificable.** Un repositorio, una web y un worker; cada componente debe resolver una necesidad verificable del ejercicio.

## Usuarios iniciales

- Ingenieros de configuración que crean y revisan datos de subestaciones.
- Equipos técnicos que necesitan generar y descargar artefactos SCD.
- Operadores/desarrolladores que diagnostican trabajos fallidos y garantizan reproducibilidad.

## Resultado del MVP

Un usuario puede crear un proyecto, guardar una configuración básica, congelar una revisión, solicitar una generación, consultar su progreso persistente y descargar un XML SCD simulado. El sistema demuestra la arquitectura de cola y worker sin afirmar conformidad IEC 61850.

## Fuera de alcance inicial

- Implementación completa o certificación de IEC 61850/SCL.
- Interoperabilidad garantizada con herramientas de fabricantes.
- Edición gráfica avanzada de diagramas unifilares.
- Importación y combinación general de archivos SCL existentes.
- Colaboración en tiempo real, permisos empresariales y flujos complejos de aprobación.
- Alta disponibilidad, despliegue productivo multirregión o almacenamiento de artefactos en la nube.

## Métricas de éxito del primer milestone

- El camino vertical se completa de extremo a extremo en entorno Docker Compose.
- Ninguna petición HTTP ejecuta el generador.
- Cada trabajo y transición observable queda persistido en PostgreSQL.
- Repetir la generación de la misma revisión con la misma versión produce bytes idénticos.
- La suite automatizada cubre dominio, integración de cola y recorrido crítico de navegador.
- Un evaluador puede seguir la guía de demostración y relacionar sus resultados con criterios de aceptación y pruebas.
- La evolución S3/MinIO está descrita sin exigir servicios de almacenamiento adicionales para ejecutar M1.
