# Feature 002 — Plan técnico

## Diseño

Se usará `.github/workflows/ci.yml` con dos jobs sobre `ubuntu-24.04`:

1. `quality`: checkout, Node.js 24 con caché npm, `npm ci`, lint, typecheck, Vitest y build.
2. `integration`: checkout e instalación equivalentes, servicios `postgres:17-alpine` y `redis:7-alpine`, migración de `substation_test` y suites PostgreSQL, cola y Playwright.

Las actions oficiales se fijan por versión principal vigente (`actions/checkout@v7` y `actions/setup-node@v7`). El runner oficial Ubuntu 24.04 incluye Google Chrome, que coincide con el canal configurado por Playwright. No se descarga otro navegador ni se añade una action de terceros.

## Decisiones

- **Dos jobs, no una matriz:** separa feedback rápido de pruebas con servicios sin duplicar combinaciones que no aportan señal al ejercicio.
- **Servicios de GitHub Actions:** reproducen PostgreSQL/Redis reales con health checks y evitan Docker Compose anidado dentro del runner.
- **Base única de pruebas:** PostgreSQL arranca directamente con `substation_test`; los pasos de migración apuntan explícitamente a ella y las suites revierten o limpian sus propios datos. `DATABASE_URL` conserva un nombre distinto en el job para que la barrera de seguridad pueda detectar una configuración accidentalmente compartida.
- **Redis `/1`:** conserva la misma barrera destructiva usada localmente por las pruebas de recuperación y permanece distinta de `REDIS_URL` (`/0`).
- **Credenciales literales de CI:** son valores ficticios y efímeros, no GitHub Secrets. Usar secretos para esos servicios locales ocultaría el carácter no productivo sin mejorar la seguridad.
- **Sin artefactos ni despliegue:** los reportes quedan en logs; publicar reportes, paquetes o imágenes ampliaría el alcance.

## Seguridad

- Permisos del token limitados a lectura de contenido.
- No se usa `pull_request_target`.
- No se interpolan datos de la pull request dentro de comandos.
- `npm ci` consume el lockfile y la caché almacena el caché global, no `node_modules`.
- Ningún job recibe `.env` ni credenciales externas.

## Verificación

- Validar estructura YAML y claves esperadas mediante un parser local.
- Ejecutar localmente todos los comandos de ambos jobs contra PostgreSQL/Redis reales.
- Revisar que las imágenes de servicios, runner, Node y actions estén fijadas según el criterio anterior.
- Inicializar Git, comprobar ignorados y revisar el contenido staged antes del commit.
- Confirmar que no existe remoto y que no se ejecuta ninguna operación de red Git.

## Riesgos

- Las imágenes hospedadas pueden actualizar Chrome. Playwright usa el canal estable incluido por el runner; si deja de estar disponible, una feature posterior deberá instalar explícitamente el navegador.
- Las tags mayores de actions reciben correcciones compatibles pero no son hashes inmutables. Fijarlas por SHA mejoraría supply-chain hardening, a cambio de mantenimiento periódico; queda fuera de esta entrega pequeña.
- Las pruebas integradas serán más lentas que el job de calidad, pero constituyen evidencia central del portfolio.
