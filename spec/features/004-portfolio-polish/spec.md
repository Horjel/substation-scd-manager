# Feature 004 — Presentación profesional del portfolio

## Estado

En implementación.

## Objetivo

Mejorar la presentación pública de Substation SCD Manager sin alterar el alcance funcional de M1: mostrar el recorrido real con capturas reproducibles, declarar una licencia de código clara y proteger la rama principal mediante el flujo de pull request y la CI existente.

## Usuarios y valor

- Un reclutador puede comprender el producto y su calidad visual antes de ejecutar el proyecto.
- Una persona evaluadora conoce de inmediato qué puede reutilizar y bajo qué condiciones.
- La rama publicada conserva una barrera automática frente a cambios directos o que no superen la verificación.

## Requisitos

- **PORT-01:** el README incluye entre dos y tres capturas reales, legibles y coherentes del producto en escritorio.
- **PORT-02:** las capturas se obtienen desde un entorno aislado con datos ficticios; no contienen datos personales, secretos, trazas ni rutas locales.
- **PORT-03:** las imágenes muestran como mínimo la propuesta de valor, el listado de subestaciones y una generación simulada completada.
- **PORT-04:** el repositorio incluye una licencia MIT completa, fechada e identificable por GitHub.
- **PORT-05:** `main` exige pull request y los checks `Quality` y `PostgreSQL, queue and browser` actualizados antes de integrar cambios.
- **PORT-06:** `main` no admite force-push ni borrado, exige resolver conversaciones y mantiene historial lineal.
- **PORT-07:** la documentación sigue presentando el generador como simulado, determinista y no conforme con IEC 61850.

## Escenarios de aceptación

1. Al abrir el README en GitHub, las capturas cargan desde archivos versionados y permiten entender el recorrido sin iniciar la aplicación.
2. Al inspeccionar la licencia del repositorio, GitHub puede clasificarla como MIT y el texto no introduce restricciones adicionales.
3. Al consultar la protección de `main`, las respuestas de GitHub muestran pull request obligatorio, CI estricta con los dos checks, conversaciones resueltas, historial lineal y force-push/borrado deshabilitados.
4. El cambio se integra mediante pull request con ambos jobs en verde.

## Fuera de alcance

- Despliegue público o URL de demostración.
- Publicación de imágenes Docker, releases o paquetes.
- Capturas que simulen funciones no implementadas.
- Cambios de interfaz, dominio, cola, worker o generador.
- Conformidad o validación completa IEC 61850.
