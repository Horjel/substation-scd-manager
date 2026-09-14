# Feature 004 — Tareas

## Documentación y presentación

- [x] **T400** Definir especificación, plan y tareas antes de implementar. **Verificación:** existen los tres documentos con PORT-01…PORT-07 y una secuencia observable.
- [x] **T401** Crear y revisar tres capturas reales con datos ficticios. **Verificación:** portada, listado y generación completada son legibles y no contienen información sensible.
- [x] **T402** Integrar las capturas en el README. **Depende de:** T401. **Verificación:** las rutas existen, Git las incluye y el límite IEC 61850 continúa visible.
- [x] **T403** Añadir licencia MIT. **Verificación:** texto completo, año/titular y detección remota de GitHub.

## Protección y cierre

- [x] **T404** Publicar la rama y abrir un pull request. **Depende de:** T402 y de que el archivo de T403 esté preparado. **Verificación:** PR público con cambios acotados y ambos jobs de CI correctos.
- [x] **T405** Proteger `main` con PR, CI estricta, conversaciones resueltas e historial lineal; bloquear force-push y borrado. **Depende de:** primera CI de T404. **Verificación:** respuesta de la API de GitHub coincide con PORT-05 y PORT-06.
- [x] **T406** Ejecutar la verificación final e integrar mediante el PR protegido. **Depende de:** T404–T405. **Verificación:** CI verde sobre el commit final, merge correcto, `main` sincronizada y árbol local limpio.

## Trazabilidad

| Criterio | Tareas |
| --- | --- |
| PORT-01 | T401, T402 |
| PORT-02 | T401 |
| PORT-03 | T401, T402 |
| PORT-04 | T403 |
| PORT-05 | T404, T405, T406 |
| PORT-06 | T405 |
| PORT-07 | T402, T406 |

## Evidencia local — 2026-09-14

- Pila aislada `substation-scd-manager-screenshots`: PostgreSQL, Redis, web y worker saludables; migrador finalizado con código 0.
- Recorrido ficticio: revisión v1 y generación `QUEUED → SUCCEEDED` al primer intento.
- Imágenes revisadas: tres PNG de 1440 px, entre 56 y 140 KB, sin secretos, rutas ni datos personales.
- README: los tres enlaces resuelven a archivos existentes y conserva visible la advertencia IEC 61850.
- Recursos temporales: cinco contenedores, una red y dos volúmenes del proyecto aislado eliminados tras inventario; recursos habituales intactos.
- Verificación: lint 0; typecheck 0; Vitest 23/23; build 0.

## Evidencia remota previa al cierre — 2026-09-14

- Pull request: `#1`, de `feature/portfolio-polish` hacia `main`.
- Primera CI del PR: ejecución `34857390053`; `Quality` y `PostgreSQL, queue and browser` finalizan correctamente.
- Protección de `main`: PR obligatorio con 0 aprobaciones externas, checks estrictos anteriores, conversaciones resueltas, historial lineal y aplicación a administradores.
- Force-push y borrado están deshabilitados.
- La detección remota de MIT queda pendiente hasta que `LICENSE` alcance `main`; por ello T403 y T406 continúan abiertas.

## Evidencia final — 2026-09-14

- El PR `#1` se integró mediante squash sobre la rama protegida; commit `0dbe2aaeeb566ed1a68e02a1a4ff0b0641d9b577`.
- GitHub identifica `LICENSE` como `MIT License` con SPDX `MIT`.
- CI de `main`: ejecución `34858508923`; `Quality` pasa en 56 s y `PostgreSQL, queue and browser` en 1 min 11 s.
- `main`, `origin/main` y el commit integrado coinciden; el árbol local quedó limpio antes de preparar este registro documental.
- PORT-01…PORT-07 quedan verificados. El alcance sigue siendo un simulador sin conformidad IEC 61850 y no existe despliegue externo.
