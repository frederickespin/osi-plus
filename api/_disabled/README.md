# Endpoints deshabilitados / reserva

Esta carpeta contiene handlers de API **no activos** en el despliegue actual. Vercel Functions solo ejecuta los archivos bajo `api/` que no están en carpetas con prefijo `_` o que no se consideran deshabilitados.

## Contenido actual

- **Reserva (sin equivalente activo en `api/`):**
  - `project-validate.js` – Validación de proyecto.
  - `project-release.js` – Liberación de proyecto.
  - `pgd/item.js` – Item PGD.
  - `pgd/apply.js` – Aplicar PGD.
  - `signal.js` – Actualización de señales de proyecto (ack/done).
  - `modules.js` – Listado estático de módulos (sustituido por `src/lib/roleModuleMap.ts` en el front).

Los duplicados de `api/templates/*` (version, submit, reject, publish, pending, draft, approve, approve-batch) fueron eliminados; los endpoints activos de plantillas están en **`api/templates/`**.

## Cómo reactivar

Si se necesita alguno de estos endpoints: mover el archivo a la ruta adecuada bajo `api/` (por ejemplo `api/projects/validate.js`) y asegurar que use `requireAuth` y los permisos correctos. Ver `docs/CODIGO_MUERTO.md` para el contexto completo.
