# Explicación Completa: Sistema de Roles y Ambientes (Testing vs Producción)

Este documento detalla **qué estamos implementando**, **por qué lo hacemos así** y **cómo beneficia al proyecto OSi-plus ERP**.

---

## 1. Contexto: ¿Qué teníamos antes?

### 1.1 Sistema de roles disperso
- Los roles y módulos estaban definidos en varios lugares: `Sidebar.tsx` (menú), `App.tsx` (módulo por defecto), `rbac.ts` (permisos frontend).
- El backend (`api/_lib/rbac.js`) solo manejaba permisos de plantillas; los endpoints de usuarios, clientes, proyectos y OSIs **no verificaban** quién hacía la solicitud.
- Cualquier usuario autenticado podía acceder a cualquier dato si conocía la URL de la API.

### 1.2 Un solo ambiente
- Todo apuntaba a producción. No había forma segura de probar cambios sin afectar datos reales.
- Las pruebas se hacían contra la base de datos de producción.

---

## 2. ¿Qué estamos implementando?

### 2.1 Mapa centralizado de roles y módulos (`roleModuleMap.ts`)

**Qué es:** Un único archivo que define qué módulos ve cada rol y cuál es el módulo por defecto al iniciar sesión.

**Por qué hacemos esto:**
- **Una sola fuente de verdad**: Si agregamos un rol o cambiamos permisos, solo tocamos un archivo.
- **Consistencia**: El menú (Sidebar) y la ruta por defecto (App) usan los mismos datos. Evitamos que un rol vea un módulo en el menú pero al iniciar caiga en otro distinto.
- **Mantenibilidad**: Nuevos desarrolladores entienden el sistema en un solo lugar.
- **Alineación con el PDF operativo**: El documento "roles y módulos" es la especificación; este archivo la traduce a código de forma explícita.

**Cómo funciona:**
- Definimos `MODULES_BY_ROLE`: para cada rol (A, V, K, B, C, etc.) lista los IDs de módulos a los que puede acceder.
- Definimos `getDefaultModuleForRole(role)`: devuelve el primer módulo que debería ver el usuario al entrar.
- Sidebar y App importan estas funciones en lugar de duplicar la lógica.

---

### 2.2 Autorización en la API con JWT

**Qué es:** Middleware que verifica el token JWT en cada request y extrae el rol y el ID del usuario. Los endpoints CRUD usan esta información para permitir o denegar el acceso.

**Por qué hacemos esto:**
- **Seguridad real**: No basta con ocultar botones en el frontend. Si la API no valida, un atacante puede enviar requests directos y obtener datos.
- **Autorización basada en rol**: Ventas (V) puede ver clientes y proyectos, pero no usuarios. RRHH (I) puede ver usuarios pero no aprobar plantillas. Cada rol tiene permisos distintos en el backend.
- **Auditoría**: Sabemos quién (userId) hizo qué acción en cada registro.

**Cómo funciona:**
- El cliente envía `Authorization: Bearer <token>` en cada request.
- El middleware `requireAuth` verifica el token con JWT_SECRET y extrae `{ sub: userId, role, email }`.
- Los endpoints usan `requirePerm(req, res, PERMS.CLIENTS_VIEW)` etc. para verificar que el rol tenga el permiso necesario.
- Si no tiene permiso → respuesta 403 Forbidden.

---

### 2.3 Sincronización RBAC frontend ↔ backend

**Qué es:** El archivo `api/_lib/rbac.js` ahora define los mismos permisos que `src/lib/rbac.ts` para usuarios, clientes, proyectos y OSIs.

**Por qué hacemos esto:**
- El frontend oculta/muestra UI según el rol. El backend debe aplicar las mismas reglas en la API.
- Si solo sincronizamos el frontend, un usuario podría modificar requests y acceder a datos prohibidos.
- Una única matriz de permisos (que podemos exportar o generar) reduce errores al agregar nuevos roles o recursos.

---

### 2.4 Dos ambientes: Testing y Producción

**Qué es:** Separar claramente un ambiente de pruebas (Preview) de producción. Cada uno tiene su propia base de datos y variables de entorno.

**Por qué hacemos esto:**
- **Integridad de datos**: En testing podemos borrar, modificar y romper datos sin afectar clientes reales.
- **Pruebas de integración**: Probar flujos completos (login, crear cliente, crear proyecto, etc.) con datos de prueba.
- **Deploy seguro**: Los PRs se despliegan automáticamente a Preview. Revisamos allí antes de hacer merge a main (producción).
- **JWT_SECRET distinto**: Si el secret de testing se filtra, no comprometemos tokens de producción.

**Cómo funciona en Vercel:**
- **Producción**: Se despliega al hacer push a `main` o `vercel --prod`. Usa `DATABASE_URL` y `JWT_SECRET` de Production.
- **Preview**: Se despliega en cada PR o push a ramas que no son main. Usa `DATABASE_URL` y `JWT_SECRET` de Preview (configurados en Vercel).
- **Base de datos de testing**: Creamos un segundo proyecto en Supabase (o una base de datos separada) para Preview. Ejecutamos las mismas migraciones y seed con datos de prueba.

---

### 2.5 Banner de ambiente ("Entorno de Pruebas")

**Qué es:** Un indicador visual en la parte superior de la app cuando se está en el ambiente Preview, para que ningún usuario confunda los datos con producción.

**Por qué hacemos esto:**
- Evitar errores humanos: alguien podría pensar que está en producción y tomar decisiones con datos de prueba.
- Claridad para QA y desarrolladores: "Estoy probando en Preview" queda explícito.
- No mostramos el banner en producción, para no saturar la UI en el ambiente real.

**Cómo funciona:**
- En Vercel, definimos `VITE_APP_ENV=production` para Production y `VITE_APP_ENV=preview` para Preview.
- El componente `EnvBanner` verifica `import.meta.env.VITE_APP_ENV === 'preview'` y muestra una barra naranja/amarilla con el texto "Entorno de Pruebas".

---

## 3. Correcciones específicas realizadas

### 3.1 Módulo por defecto para PB y PD
- **Antes**: Tanto PB (Mecánico) como PD (Mantenimiento) abrían `maintenance`.
- **Ahora**: PB abre `mechanic`, PD abre `maintenance`, según el PDF operativo.

### 3.2 Editor OSI para Ventas
- Ventas (V) trabaja con cotizador y pipeline; el Editor OSI es una herramienta de soporte. Lo mantenemos accesible desde el grupo Comercial/HR según la estructura actual del menú.

### 3.3 Endpoints CRUD protegidos
- `GET/POST /api/users` → requiere permisos USERS_VIEW, USERS_CREATE, etc. (A, I según permiso).
- `GET/POST /api/clients` → requiere CLIENTS_* (A, V, K).
- `GET/POST /api/projects` → requiere PROJECTS_* (A, V, K, B).
- `GET/POST /api/osis` → requiere OSI_* según rol.

---

## 4. Resumen de archivos creados o modificados

| Archivo | Cambio |
|---------|--------|
| `src/lib/roleModuleMap.ts` | Nuevo: mapeo rol → módulos, módulo por defecto |
| `src/components/layout/Sidebar.tsx` | Usa roleModuleMap como fuente de menú |
| `src/App.tsx` | Usa getDefaultModuleForRole de roleModuleMap |
| `api/_lib/requireAuth.js` | Nuevo: middleware de verificación JWT |
| `api/_lib/rbac.js` | Ampliado: permisos para users, clients, projects, osis |
| `api/users/index.js` | Añadido requireAuth + requirePerm |
| `api/clients/index.js` | Añadido requireAuth + requirePerm |
| `api/projects/index.js` | Añadido requireAuth + requirePerm |
| `api/osis/index.js` | Añadido requireAuth + requirePerm |
| `src/components/EnvBanner.tsx` | Nuevo: banner "Entorno de Pruebas" |
| `.env.example` | Documentado VITE_APP_ENV y variables Preview |

---

## 5. Ventajas de este enfoque

1. **Seguridad**: La API valida identidad y permisos en cada request.
2. **Claridad**: Un solo lugar define qué ve cada rol.
3. **Escalabilidad**: Agregar un rol o permiso nuevo es un cambio controlado en roleModuleMap y rbac.
4. **Pruebas seguras**: Ambiente de testing aislado, sin riesgo para producción.
5. **Trazabilidad**: Sabemos en qué ambiente está cada deployment y qué datos usa.
6. **Alineación con especificación**: El PDF de roles y módulos se refleja directamente en el código.

---

## 6. Configuración de Vercel para Preview (Testing)

Para que el ambiente Preview funcione correctamente:

1. **Vercel → Project → Settings → Environment Variables**
2. **Production**:
   - `VITE_APP_ENV` = `production` (para que no se muestre el banner)
   - `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`, `JWT_EXPIRES_IN` como ya están
3. **Preview**:
   - `VITE_APP_ENV` = `preview` (muestra el banner "Entorno de Pruebas")
   - `DATABASE_URL` = URL de un proyecto Supabase de testing (diferente al de producción)
   - `DIRECT_URL` = URL directa del proyecto de testing
   - `JWT_SECRET` = Un secret diferente al de producción (nunca reutilizar)
   - `JWT_EXPIRES_IN` = `7d`

4. Crear un segundo proyecto en Supabase para testing, ejecutar `prisma db push` y `prisma db seed` contra esa base.

---

## 7. Próximos pasos opcionales

- **SHAB (Sub-habilidades)**: El rol N (Personal de Campo) puede tener sub-roles (PA, PB, PC, etc.). Se puede modelar en BD y filtrar módulos dinámicamente.
- **Logs de auditoría**: Registrar en base de datos quién creó/editó cada cliente, proyecto, OSI.
- **Rate limiting**: Limitar requests por usuario para prevenir abuso.
- **Tests E2E**: Automatizar pruebas de login y CRUD por rol en el ambiente Preview.
