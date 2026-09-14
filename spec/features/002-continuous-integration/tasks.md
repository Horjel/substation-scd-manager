# Feature 002 — Tareas verificables

- [x] **T200** Definir alcance, criterios y plan de CI antes de implementarla. **Verificación:** `spec.md` y `plan.md` no contradicen la constitución ni Feature 001.
- [x] **T201** Crear `.github/workflows/ci.yml` con jobs `quality` e `integration`. **Verificación:** disparadores, permisos, versiones, servicios y comandos coinciden con CI-01…CI-04.
- [x] **T202** Documentar la CI en README. **Verificación:** explica cobertura y ejecución local sin afirmar resultados remotos inexistentes.
- [x] **T203** Ejecutar y registrar la verificación equivalente local. **Verificación:** lint, typecheck, unitarias, PostgreSQL/API, cola, Playwright y build pasan.
- [x] **T204** Inicializar Git y auditar el primer commit. **Depende de:** T201–T203. **Verificación:** rama `main`, ningún remoto, ignorados correctos, índice sin secretos/rutas personales/generados y commit local creado con la identidad Git configurada.

## Evidencia — 2026-09-14

| Criterio | Resultado |
| --- | --- |
| CI-01 | `push` a `main`, `pull_request` y `contents: read`; sin permisos de escritura ni `pull_request_target`. |
| CI-02 | Job `quality` sobre Ubuntu 24.04/Node 24; localmente: lint 0, typecheck 0, Vitest 23/23 y build 0 después de `npm ci`. |
| CI-03 | Job `integration` con PostgreSQL 17/Redis 7 y health checks; migraciones al día, PostgreSQL/API 12/12, cola 7/7 y Playwright 2/2. |
| CI-04 | URLs de desarrollo y pruebas deliberadamente distintas; base `substation_test`, Redis `/1` y credenciales efímeras `ci_only_password`. |
| CI-05 | README describe cobertura, disparadores, equivalencia local y ausencia temporal de badge/remoto. |
| Workflow | Prettier 3.6.2 analiza `.github/workflows/ci.yml` sin errores de sintaxis/formato. |
| Git | Rama `main`, 96 archivos intencionados, ninguno mayor de 1 MiB, `git diff --cached --check` limpio, cero remotos y primer commit local `feat: bootstrap Substation SCD Manager`. |

La primera simulación detectó correctamente que igualar `DATABASE_URL` y `TEST_DATABASE_URL` violaba la barrera de seguridad. El workflow se corrigió para mantener entornos distintos y las tres suites integradas pasaron después. No existe todavía ejecución remota; esa evidencia aparecerá únicamente tras publicar el repositorio en otra tarea.
