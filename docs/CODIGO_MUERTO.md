# Informe de código muerto e inoperante – OSi-plus

**Fecha de revisión:** Febrero 2025  
**Alcance:** APIs deshabilitadas, módulos no referenciados, imports obsoletos, bloques comentados.

---

## 1. APIs deshabilitadas (`api/_disabled/`)

En la carpeta `api/_disabled/` hay 14 archivos que corresponden a endpoints que no están activos en la API actual (Vercel Functions solo ejecuta handlers bajo `api/` que se exportan desde archivos no ignorados; los que están en `_disabled` no se invocan).

| Archivo | Propósito (inferido) | Recomendación |
|---------|----------------------|---------------|
| `version.js` | GET versión de plantilla (por id) | **Conservar o eliminar:** La API activa tiene `api/templates/version.js`. Este es duplicado antiguo. Eliminar si `api/templates/version.js` cubre el caso. |
| `submit.js` | Envío de plantilla a aprobación | Duplicado de `api/templates/submit.js`. **Eliminar.** |
| `signal.js` | (no revisado en detalle) | Revisar si existe equivalente en `api/`; si no se usa, **eliminar.** |
| `reject.js` | Rechazo de plantilla | Duplicado de `api/templates/reject.js`. **Eliminar.** |
| `publish.js` | Publicación de plantilla | Duplicado de `api/templates/publish.js`. **Eliminar.** |
| `pending.js` | Listado de pendientes de aprobación | Duplicado de `api/templates/pending.js`. **Eliminar.** |
| `draft.js` | Edición de borrador de plantilla | Duplicado de `api/templates/draft.js`. **Eliminar.** |
| `approve.js` | Aprobación de plantilla | Duplicado de `api/templates/approve.js`. **Eliminar.** |
| `approve-batch.js` | Aprobación en lote | Duplicado de `api/templates/approve-batch.js`. **Eliminar.** |
| `project-validate.js` | Validación de proyecto | No existe equivalente bajo `api/` en la estructura actual. **Documentar como “reserva”** o mover a `api/projects/` si se va a usar. |
| `project-release.js` | Liberación de proyecto | Igual que arriba. **Documentar como “reserva”** o integrar si se necesita. |
| `pgd/item.js` | Item PGD | No hay equivalente activo obvio. **Documentar como “reserva”.** |
| `pgd/apply.js` | Aplicar PGD | Igual. **Documentar como “reserva”.** |
| `modules.js` | (módulos?) | Revisar contenido; si no se usa, **eliminar.** |

**Resumen:**  
- **Eliminados** (duplicados de `api/templates/*`): `submit.js`, `reject.js`, `publish.js`, `pending.js`, `draft.js`, `approve.js`, `approve-batch.js`, `version.js`.  
- **Conservados como reserva** (documentados en `api/_disabled/README.md`): `project-validate.js`, `project-release.js`, `pgd/item.js`, `pgd/apply.js`, `signal.js`, `modules.js`.

---

## 2. Módulos / archivos no referenciados

| Archivo | Comentario |
|---------|------------|
| `src/components/modules/TemplatesModule.tsx` | **Eliminado.** No estaba importado; la app usa `TemplatesCenterModule` y `TemplateEditorModule`. |
| `app/` (carpeta raíz) | **Documentado como legacy:** `app/README.md` indica que es estructura legacy y que el código activo está en la raíz. |
| `src/components/modules/TowerControl.tsx.bak` / `app/.../TowerControl.tsx.bak` | **Eliminado** (`app/src/components/modules/TowerControl.tsx.bak`). |

No se detectaron imports rotos a archivos o rutas ya eliminados/renombrados (p. ej. `roleModuleMap`, RBAC) en los puntos de entrada revisados.

---

## 3. Imports y referencias obsoletas

- Los tipos y constantes en `src/types/` están alineados con el uso actual en la API y el front (roles, permisos, DTOs).  
- Tras los cambios de roles/módulos (roleModuleMap, RBAC), no quedan referencias a rutas o símbolos eliminados en los archivos revisados.

---

## 4. Comentarios y bloques comentados

- No se hizo una pasada exhaustiva de todo el repo para bloques grandes de código comentado.  
- Se recomienda en futuras limpiezas: buscar bloques de más de 5–10 líneas comentadas y decidir si eliminarlos o mover la lógica a documentación.  
- No eliminar comentarios útiles (p. ej. “PDF: …” en `roleModuleMap.ts`).

---

## 5. Acciones sugeridas (prioridad) – estado

1. **Bajo riesgo:** Eliminar `TowerControl.tsx.bak`. **Hecho** (eliminado en `app/src/components/modules/`).  
2. **Medio:** Eliminar duplicados en `api/_disabled/`. **Hecho** (submit, reject, publish, pending, draft, approve, approve-batch, version).  
3. **Opcional:** Eliminar o documentar `TemplatesModule.tsx`. **Hecho** (archivo eliminado).  
4. **Opcional:** Añadir README en `api/_disabled/`. **Hecho** (`api/_disabled/README.md`).  
5. **Opcional:** Documentar `app/` como legacy. **Hecho** (aviso en `app/README.md`).
