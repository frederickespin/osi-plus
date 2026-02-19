# Resumen del PR: Matriz de accesos, auditoría de seguridad y limpieza de código muerto

## 1. Matriz de acceso por rol (PDF)

Alineación del sistema de roles con la especificación “Matriz de Acceso y Visibilidad”:

- **`src/lib/roleModuleMap.ts`**: Actualización de `MODULES_BY_ROLE`:
  - **V (Ventas):** Añadidos `crate-wood` y `disenacotiza` (Cotizador con Nesting).
  - **K (Coordinador):** Añadidos `k-project` (Gestor Proyectos Sombrilla) y `nesting` / `nestingv2` (Visor Nesting).
  - **B (Operaciones):** Añadido `osi-editor` (Gestor de OSIs).
  - **I (RRHH):** Añadido `users` (Gestión de Personal; backend restringe a reactivación con `USERS_REACTIVATE`).

- **`src/components/layout/Sidebar.tsx`**: Nuevos ítems de menú según el PDF: Cotizador con Nesting, Diseña y Cotiza (Comercial); Gestor Proyectos Sombrilla, Visor Nesting (Coordinación); Gestor de OSIs (Operaciones); Usuarios visible también para I.

- **`src/lib/rbac.ts`**: Nuevo permiso `USERS_REACTIVATE`; rol I con permiso de reactivación; rol B con `OSI_CREATE` y `OSI_EDIT`.

- **`api/_lib/rbac.js`**: Sincronizado con el frontend; permisos OPS, WMS, HR, FLEET, SECURITY; rol I con `USERS_REACTIVATE`.

- **Documentación:** Actualización de `docs/EXPLICACION_SISTEMA_ROLES_Y_AMBIENTES.md` (matriz del PDF, visibilidad cruzada) y de `src/docs/roles-y-modulos.md` (mapeo módulo ↔ PDF).

---

## 2. Auditoría de seguridad

Mejoras aplicadas a partir de la revisión documentada en `docs/AUDITORIA_SEGURIDAD.md`:

### Crítico
- **JWT_SECRET en producción:** En `api/_lib/auth.js` se comprueba que en entorno de producción (`VERCEL_ENV` o `NODE_ENV` = production) esté definido `JWT_SECRET` y que no sea el valor por defecto. Si no se cumple, se lanza un error al cargar el módulo.

### Alto
- **Sanitización de HTML (XSS):** Integración de DOMPurify en `TemplatesCenterModule` y `TemplateEditorModule`. Todo el HTML que se renderiza con `dangerouslySetInnerHTML` (vista previa PIC) se sanitiza antes de mostrarlo.
- **Exposición de passwordHash:** La respuesta de `POST /api/users` ya no incluye el objeto completo de Prisma; se devuelve solo el subconjunto de campos seguros (id, code, name, email, phone, role, status, department, joinDate, points, rating).

### Medio
- **Credenciales de demo:** El bloque “Credenciales para probar roles” en la pantalla de login solo se muestra cuando el ambiente no es producción (`getAppEnv() !== "production"`).
- **Token en localStorage:** Añadida en la documentación la sección “Riesgo de token en localStorage y plan httpOnly cookie”, con el riesgo, mitigaciones actuales y plan a medio plazo (cookie httpOnly).

### Otros
- **Seed de Prisma:** Comentario al inicio de `prisma/seed.mjs` indicando que es solo para desarrollo/preview y que en producción deben cambiarse las contraseñas por defecto.
- **Dependencias:** Las vulnerabilidades de `npm audit` (devDependencies) quedan documentadas en el informe; la resolución requiere actualizaciones major (p. ej. eslint@10) y se deja como opcional.

Se añaden los documentos `docs/AUDITORIA_SEGURIDAD.md` (informe completo) y referencias cruzadas en la documentación existente.

---

## 3. Limpieza de código muerto

Cambios derivados de `docs/CODIGO_MUERTO.md`:

- **Eliminación de duplicados en `api/_disabled/`:** Eliminados los archivos que duplicaban endpoints ya existentes en `api/templates/`: `submit.js`, `reject.js`, `publish.js`, `pending.js`, `draft.js`, `approve.js`, `approve-batch.js`, `version.js`.

- **Eliminación de archivos no usados:**
  - `src/components/modules/TemplatesModule.tsx` (no referenciado; la app usa `TemplatesCenterModule` y `TemplateEditorModule`).
  - `app/src/components/modules/TowerControl.tsx.bak` (respaldo innecesario).

- **Documentación de reserva:**
  - **`api/_disabled/README.md`:** Explica que la carpeta contiene endpoints deshabilitados o en reserva, lista los que permanecen (project-validate, project-release, pgd/item, pgd/apply, signal, modules) y cómo reactivarlos si se necesitan.
  - **`app/README.md`:** Aviso al inicio indicando que la carpeta `app/` es legacy y que el código activo del frontend está en la raíz del repositorio; se referencia `docs/CODIGO_MUERTO.md`.

- **Actualización de `docs/CODIGO_MUERTO.md`:** Estado de las acciones realizadas y descripción actualizada de los archivos eliminados o documentados.

---

## 4. Archivos modificados (resumen)

| Área | Archivos principales |
|------|----------------------|
| Roles y accesos | `src/lib/roleModuleMap.ts`, `src/components/layout/Sidebar.tsx`, `src/lib/rbac.ts`, `api/_lib/rbac.js` |
| Seguridad | `api/_lib/auth.js`, `api/users/index.js`, `src/components/auth/LoginScreen.tsx`, `src/components/modules/TemplatesCenterModule.tsx`, `src/components/modules/TemplateEditorModule.tsx`, `prisma/seed.mjs` |
| Dependencias | `package.json`, `package-lock.json` (DOMPurify) |
| Documentación | `docs/AUDITORIA_SEGURIDAD.md`, `docs/CODIGO_MUERTO.md`, `docs/EXPLICACION_SISTEMA_ROLES_Y_AMBIENTES.md`, `src/docs/roles-y-modulos.md`, `api/_disabled/README.md`, `app/README.md` |
| Eliminados | 8 archivos en `api/_disabled/`, `TemplatesModule.tsx`, `TowerControl.tsx.bak` |

---

## 5. Cómo probar

1. **Accesos por rol:** Iniciar sesión con usuarios de distintos roles (V, K, B, I) en ambiente preview o desarrollo y comprobar que el menú muestre solo los módulos permitidos según el PDF (Cotizador con Nesting para V, Visor Nesting y Gestor Proyectos para K, Gestor de OSIs para B, Gestión de Personal para I).
2. **Seguridad:** En producción, verificar que no aparezca el bloque de credenciales de prueba en el login y que la API exija `JWT_SECRET` (sin valor por defecto). Crear un usuario por API y confirmar que la respuesta no incluya `passwordHash`.
3. **Sanitización:** En el editor de plantillas PIC, introducir HTML/script en el cuerpo y comprobar que la vista previa no ejecute código (DOMPurify debe sanitizar).
