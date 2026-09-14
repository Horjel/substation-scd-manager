# Feature 003 — Publicación inicial en GitHub

## Estado

Completada y verificada.

## Objetivo

Publicar el commit verificado de Substation SCD Manager como repositorio público de portfolio en la cuenta GitHub autorizada, sin desplegar la aplicación ni publicar imágenes.

## Criterios de aceptación

- **PUB-01:** existe el repositorio público `Horjel/substation-scd-manager` con descripción y temas técnicos adecuados.
- **PUB-02:** `origin` usa HTTPS, `main` es la rama predeterminada y el commit local coincide con `origin/main`.
- **PUB-03:** el repositorio no contiene `.env`, salidas generadas, rutas personales ni credenciales reales.
- **PUB-04:** la CI remota ejecuta y supera los jobs de calidad e integración.
- **PUB-05:** README enlaza el estado real de CI y conserva visible el límite del simulador IEC 61850.

## Fuera de alcance

- Despliegue externo de web, worker, PostgreSQL o Redis.
- Publicación de imágenes Docker, releases o paquetes.
- Protección de ramas, dominio personalizado o automatización de releases.
