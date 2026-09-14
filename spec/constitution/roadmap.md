# Roadmap

## Criterio de planificación

El roadmap de Substation SCD Manager entrega primero un corte vertical verificable para entrevista y portfolio. Cada milestone requiere su propia feature spec o una ampliación explícita de una existente antes de implementación. Los hitos posteriores son opciones de evolución, no requisitos para cerrar el ejercicio inicial.

## M1 — Project Foundation y SCD simulado (verificado)

Objetivo: validar arquitectura, persistencia y recorrido completo con un generador determinista simulado.

Incluye:

- workspace TypeScript estricto con aplicación Next.js y worker independiente;
- entorno Docker Compose con PostgreSQL y Redis;
- proyectos, configuración mínima y revisiones inmutables;
- trabajos persistentes y cola BullMQ;
- estados consultables y manejo de fallos;
- generador XML SCD simulado, estructurado y determinista;
- descarga del artefacto y pruebas Vitest/Playwright;
- guía para reclutadores, demo con datos ficticios y explicación de decisiones y límites;
- interfaz mínima de artefactos con adaptador PostgreSQL, preparada para S3/MinIO.

No incluye conformidad IEC 61850. La definición completa está en `spec/features/001-project-foundation/`.

## Feature 002 — Integración continua y preparación Git

Objetivo: automatizar la matriz de calidad e integración de M1 y preparar un primer commit local auditable. No incluye repositorio remoto, publicación de imágenes ni despliegue. La definición vive en `spec/features/002-continuous-integration/`.

## Evolución opcional de almacenamiento tras M1

Una feature separada puede añadir un adaptador S3/MinIO antes o en paralelo a M2. Guardará objetos por clave estable y conservará metadatos y estado en PostgreSQL. Su aceptación exigirá ejecutar las mismas pruebas de contrato de almacenamiento, migrar un artefacto sin alterar bytes/checksum y conservar la descarga desde la API. Debe contemplar fallos entre escritura de objeto y commit, limpieza de huérfanos y reversión al adaptador anterior. No se añade MinIO a Docker Compose en M1.

## M2 — Modelo de configuración enriquecido

Objetivo: ampliar el dominio para describir subestaciones, niveles de tensión, bahías, IED y relaciones básicas, conservando revisiones y validaciones claras.

Condiciones de entrada: M1 verificado, telemetría suficiente de fallos y decisiones sobre almacenamiento de artefactos documentadas.

## M3 — Motor SCL/IEC 61850 incremental

Objetivo: sustituir partes del simulador por generación basada en un subconjunto IEC 61850 explícitamente definido y probado con fixtures de referencia.

Requiere una matriz normativa/versionada, expertos de dominio y límites de conformidad. No se prometerá compatibilidad general mientras el subconjunto no esté validado.

## M4 — Importación, comparación y validación

Objetivo: importar artefactos compatibles, comparar revisiones y ofrecer diagnósticos accionables. La importación debe tratar archivos como entrada no confiable.

## M5 — Colaboración y operación empresarial

Objetivo: permisos, auditoría ampliada, aprobaciones y capacidades de despliegue/observabilidad productivas. El almacenamiento de objetos puede incorporarse mediante la feature opcional posterior a M1.

## Gates comunes por milestone

- especificación y no-objetivos claros;
- plan con migración/rollback y riesgos;
- tareas trazables a criterios de aceptación;
- pruebas automatizadas adecuadas al riesgo;
- documentación operativa actualizada;
- verificación registrada antes de cerrar el milestone.
