# Feature 002 — Integración continua y preparación Git

## Estado

Completada y verificada localmente, incluido el primer commit auditable. No incluye repositorio remoto, publicación de imágenes ni despliegue.

## Objetivo

Permitir que un revisor compruebe automáticamente la calidad estática y el recorrido integrado de Substation SCD Manager en cada cambio relevante, usando el mismo lockfile, versiones principales de infraestructura y comandos documentados en el repositorio.

## Alcance

- Inicializar un repositorio Git local con rama principal `main`.
- Auditar exhaustivamente los archivos candidatos al primer commit.
- Añadir un único workflow de GitHub Actions con trabajos separados de calidad e integración.
- Ejecutar lint, TypeScript estricto, Vitest, integración PostgreSQL/BullMQ, Playwright y build.
- Documentar la CI y registrar la evidencia antes de crear el primer commit.

## Fuera de alcance

- Crear o configurar un repositorio remoto.
- Hacer `push`, abrir pull requests, publicar imágenes o desplegar.
- Añadir secretos de producción, Dependabot, releases o automatización de despliegue.
- Cambiar el dominio, la API o el generador SCD simulado de M1.

## Criterios de aceptación

### CI-01 — disparadores y permisos

El workflow se ejecuta en `push` a `main` y en `pull_request`, declara `contents: read` y no solicita permisos de escritura.

### CI-02 — calidad reproducible

Un job sobre Ubuntu 24.04 y Node.js 24 instala exclusivamente desde `package-lock.json` y ejecuta `lint`, `typecheck`, pruebas Vitest sin servicios y `build`.

### CI-03 — integración real

Un job independiente levanta PostgreSQL 17 y Redis 7 como servicios saludables, aplica las migraciones a una base de pruebas y ejecuta `test:db`, `test:queue` y `test:e2e` con Chrome.

### CI-04 — aislamiento y seguridad

La CI usa credenciales ficticias limitadas al runner efímero, Redis lógico de pruebas y ninguna variable de producción. No imprime ni requiere secretos del repositorio.

### CI-05 — documentación

README explica qué valida la CI, sus disparadores y la equivalencia con los comandos locales, sin mostrar un badge dependiente de una URL remota todavía inexistente.

### CI-06 — primer commit auditable

`.env`, dependencias, builds, cliente Prisma generado y salidas de pruebas quedan ignorados. El índice del primer commit no contiene secretos, rutas personales ni artefactos generados, y el commit se crea solo después de pasar las verificaciones.
