# Feature 004 — Plan técnico

## Secuencia spec-anchored

1. Documentar criterios y tareas antes de modificar la presentación pública.
2. Crear un entorno Docker Compose aislado con base de datos y volúmenes propios.
3. Introducir únicamente datos de demostración ficticios y generar un SCD simulado mediante el worker real.
4. Capturar portada, listado y detalle completado a 1440 px, revisar visualmente y versionar las imágenes en `docs/images/`.
5. Añadir las capturas y la licencia MIT al README/repositorio.
6. Ejecutar la verificación local, publicar una rama y abrir un pull request.
7. Tras una primera CI correcta, proteger `main`, registrar la evidencia, repetir CI e integrar mediante el pull request.

## Decisiones

### Capturas reales y aisladas

Se usa el mismo `compose.yaml` con un nombre de proyecto y puertos alternativos. Esto demuestra el producto real sin mezclar datos del entorno habitual. El coste es construir y arrancar una pila temporal; se descarta retocar imágenes o usar mockups porque podrían divergir de lo implementado.

Las capturas PNG se conservan en el repositorio para que el README funcione sin servicios externos. Se limita el conjunto a tres imágenes para evitar peso y repetición.

### Licencia MIT

MIT es breve, ampliamente reconocida y permite que una muestra de portfolio sea revisada y reutilizada conservando el aviso de copyright. No añade garantías y encaja con un ejercicio demostrativo. Se descarta dejar el repositorio sin licencia, porque eso reserva todos los derechos de forma implícita, y licencias copyleft más extensas, porque no existe un requisito de reciprocidad.

### Protección de rama

La regla clásica de protección se configura sobre `main` con:

- pull request obligatorio sin imponer revisores externos a un repositorio individual;
- checks estrictos `Quality` y `PostgreSQL, queue and browser`;
- conversaciones resueltas e historial lineal;
- force-push y borrado deshabilitados;
- aplicación también al administrador para evitar bypass accidental.

La protección se aplica solo después de que los nombres reales de los checks hayan pasado en el pull request. Así se evita exigir un contexto inexistente. La configuración se valida leyendo la API de GitHub, no solo observando la interfaz.

## Seguridad y privacidad

- No se incorpora `.env` ni se muestra su contenido.
- El entorno de capturas emplea únicamente nombres técnicos ficticios.
- Antes de retirar recursos se enumeran los contenedores y volúmenes exactos del proyecto temporal.
- Los volúmenes habituales de PostgreSQL no se eliminan ni se modifican para preparar las capturas.

## Verificación

- Inspección visual de las tres imágenes.
- Comprobación de rutas Markdown y de archivos versionables.
- `npm run lint`, `npm run typecheck`, `npm test` y `npm run build`.
- CI completa del pull request, incluidos PostgreSQL, Redis, BullMQ y Playwright.
- Consulta de la licencia y de la protección de `main` mediante GitHub.
