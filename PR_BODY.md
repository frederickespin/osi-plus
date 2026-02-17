## Resumen

Este PR implementa la integración completa de OSi-Plus con Supabase (PostgreSQL), el despliegue en Vercel, el sistema de autenticación con login, y corrige el error 500 que impedía iniciar sesión en producción.

---

## Cambios realizados

### Base de datos (Supabase PostgreSQL)
- **Conexión**: Configurado Prisma con `DATABASE_URL` (pooler) y `DIRECT_URL` para migraciones
- **Esquema**: Sincronizado con `prisma db push`
- **Seed**: Cuentas de prueba creadas:
  - **Admin**: `admin@ipackers.com` / `Admin123*` (rol A)
  - **Coordinadora**: `maria@ipackers.com` / `Ventas123*` (rol K)
  - Clientes, proyectos, OSIs y plantillas de ejemplo

### Variables de entorno
- **Local**: `.env` con `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`, `JWT_EXPIRES_IN`
- **Producción (Vercel)**: mismas variables configuradas en el proyecto
- **`.env.example`**: Actualizado con instrucciones para Supabase y Vercel

### Despliegue en Vercel
- **URL**: https://osi-plus.vercel.app
- **`vercel.json`**: Rewrites para SPA y API, headers CORS
- **Límite Hobby**: Se movieron endpoints adicionales a `api/_disabled/` para no exceder las 12 funciones serverless:
  - `modules.js`, `templates/*`, `k/pgd/*`, `k/project-*.js`, `k/signal.js`

### Autenticación y login
- **`LoginScreen`** (`src/components/auth/LoginScreen.tsx`): Pantalla de login con email/password
- **Gate en App**: Usuarios no autenticados ven el login antes de acceder al ERP
- **API client** (`src/lib/api.ts`): Envía Bearer token y maneja 401 redirigiendo al login
- **Endpoint**: `POST /api/auth/login` — valida credenciales y devuelve JWT

### Corrección del error 500 en login
- **Problema**: `JWT_EXPIRES_IN` en Vercel tenía un valor inválido, causando:  
  `"expiresIn" should be a number of seconds or string representing a timespan eg: "1d", "20h", 60`
- **Solución**: Validación en `api/_lib/auth.js` — si `JWT_EXPIRES_IN` no cumple el formato esperado, se usa `"7d"` por defecto
- **Formatos válidos**: `7d`, `24h`, `60m`, `3600` (segundos)

### Sistema QR
- **QRScanner**: Componente para escanear códigos QR (usa `html5-qrcode`)
- **QRGenerator**: Componente para generar códigos QR (usa `qrcode.react`)

### Integración con API real
- **ClientsModule**, **UsersModule**, **ProjectsModule**, **OSIsModule**: Conectados a `api/clients`, `api/users`, `api/projects`, `api/osis`
- **Hook `useApiData`**: Abstracción para carga y sincronización con la API
- **responsive-table**: Tabla adaptable para móvil
- **sync-status**: Indicador visual de estado de sincronización

### RBAC y responsividad
- **`src/lib/rbac.ts`**: Actualización de roles y permisos
- **Sidebar**: Drawer en móvil para mejor UX
- **Tablas y diálogos**: Ajustes para pantallas pequeñas

---

## Cómo probar

1. **Login local**:
   ```bash
   npm run dev
   ```
   Ir a la app e iniciar sesión con `admin@ipackers.com` / `Admin123*`

2. **Login producción**:
   - Ir a https://osi-plus.vercel.app
   - Iniciar sesión con las mismas credenciales

3. **Variables en Vercel** (verificar):
   - `DATABASE_URL` (pooler, puerto 6543, `?pgbouncer=true`)
   - `DIRECT_URL` (directa, puerto 5432)
   - `JWT_SECRET`
   - `JWT_EXPIRES_IN` (opcional; si está vacío o inválido, se usa `"7d"`)

---

## Archivos modificados principales

| Área | Archivos |
|------|----------|
| Auth | `api/_lib/auth.js`, `api/auth/login.js`, `src/components/auth/LoginScreen.tsx` |
| API | `src/lib/api.ts`, `api/_lib/http.js`, `api/_lib/db.js` |
| App | `src/App.tsx`, `src/lib/sessionStore.ts` |
| Módulos | `ClientsModule.tsx`, `FieldWorkerModule.tsx`, `SecurityModule.tsx`, `WMSModule.tsx` |
| UI | `Sidebar.tsx`, `responsive-table.tsx`, `sync-status.tsx` |
| Config | `vercel.json`, `.env.example`, `package.json` |

---

## Notas

- Los endpoints en `api/_disabled/` pueden reactivarse si se migra a un plan de Vercel con más funciones
- Credenciales de prueba: solo usar en entornos de desarrollo/staging
