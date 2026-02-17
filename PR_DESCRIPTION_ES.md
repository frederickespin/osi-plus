# feat: Sistema de roles, ambientes y pruebas

## Resumen

Este PR implementa un sistema centralizado de roles y módulos, autorización JWT en la API, indicadores claros de ambiente (Producción / Preview / Desarrollo local), credenciales de prueba para validar roles, y proxy para desarrollo local.

---

## Cambios realizados

### 1. Sistema de roles centralizado

- **Nuevo** `src/lib/roleModuleMap.ts`: Fuente única de verdad para qué módulos puede ver cada rol.
- **Sidebar** y **App** usan `canAccessModule()` y `getDefaultModuleForRole()` de `roleModuleMap`.
- **Corregido**: PB (Mecánico) abre `mechanic`, PD (Mantenimiento) abre `maintenance` (antes ambos abrían `maintenance`).
- Alineado con la especificación de roles del PDF operativo.

### 2. Autorización en la API

- **Nuevo** `api/_lib/requireAuth.js`: Middleware que verifica el token JWT y adjunta `req.user` (id, email, role).
- **Ampliado** `api/_lib/rbac.js`: Permisos para users, clients, projects, osis. Función `requirePerm()`.
- **Protegidos** los endpoints:
  - `GET/POST /api/users` → requiere `USERS_VIEW` / `USERS_CREATE`
  - `GET/POST /api/clients` → requiere `CLIENTS_VIEW` / `CLIENTS_CREATE`
  - `GET/POST /api/projects` → requiere `PROJECTS_VIEW` / `PROJECTS_CREATE`
  - `GET/POST /api/osis` → requiere `OSI_VIEW` / `OSI_CREATE`

### 3. Indicadores de ambiente

- **Nuevo** `src/lib/env.ts`: Detecta `production`, `preview` o `development`.
- **Actualizado** `EnvBanner`: Muestra banner según ambiente (verde Producción, ámbar Preview, azul Desarrollo local).
- **Sidebar**: Badge bajo el nombre del usuario con el ambiente actual.
- **Login**: Badge de ambiente en el encabezado.

### 4. Usuarios de prueba para roles

- **Seed ampliado** (`prisma/seed.mjs`): Nuevos usuarios con contraseña `Demo123*`:
  - Ventas (V): ventas@ipackers.com
  - Operaciones (B): operaciones@ipackers.com
  - Materiales (C): materiales@ipackers.com
  - RRHH (I): rrhh@ipackers.com
- **Login**: Sección colapsable "Credenciales para probar roles" con los 6 usuarios, clic para cargar credenciales (solo en Preview/Desarrollo, no en Producción).

### 5. Desarrollo local

- **Proxy en** `vite.config.ts`: Peticiones a `/api/*` se reenvían a `https://osi-plus.vercel.app` para desarrollo local.
- Variable opcional `VITE_API_PROXY` para apuntar a otro destino.

### 6. Documentación

- **Nuevo** `docs/EXPLICACION_SISTEMA_ROLES_Y_AMBIENTES.md`: Explicación en español de qué se implementó, por qué y cómo configurar Vercel Preview.
- **Actualizado** `.env.example`: Documentadas `VITE_APP_ENV` y variables de Preview.

---

## Archivos modificados

| Área          | Archivos                                                                 |
|---------------|--------------------------------------------------------------------------|
| Roles         | `src/lib/roleModuleMap.ts`, `Sidebar.tsx`, `App.tsx`                    |
| API           | `api/_lib/requireAuth.js`, `api/_lib/rbac.js`, `users/`, `clients/`, `projects/`, `osis/index.js` |
| Ambiente      | `src/lib/env.ts`, `EnvBanner.tsx`, `LoginScreen.tsx`                    |
| Seed          | `prisma/seed.mjs`                                                        |
| Config        | `vite.config.ts`, `.env.example`                                         |
| Docs          | `docs/EXPLICACION_SISTEMA_ROLES_Y_AMBIENTES.md`                          |

---

## Cómo probar

1. **Desarrollo local**: `npm run dev` — el proxy conecta con la API de producción.
2. **Login**: Usar credenciales de prueba (colapsable en login) para cada rol.
3. **Roles**: Iniciar sesión como Ventas, Operaciones, RRHH, etc. y comprobar que solo ven sus módulos.
4. **API**: Verificar 403 al hacer POST como usuario sin permiso (ej. RRHH creando usuarios).

---

## Próximos pasos sugeridos

- Ejecutar `npm run db:seed` en producción para crear los nuevos usuarios (V, B, C, I).
- Configurar `VITE_APP_ENV` en Vercel (Production = `production`, Preview = `preview`).
- Ocultar credenciales de prueba en producción (plan en `GUIA_USO`).
