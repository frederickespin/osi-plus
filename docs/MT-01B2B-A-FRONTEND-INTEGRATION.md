# MT-01B2B-A — Integración frontend inactiva

## Estado de seguridad

Esta fase se prepara únicamente para ejecución local. La configuración predeterminada permanece:

```env
MT01B_AUTH_MODE=LEGACY
MT01B_TENANT_SWITCH_ENABLED=false
VITE_MT01B2_CLIENT_ENABLED=false
```

No se habilita selector de empresa, HYBRID, endpoints V2 desde el navegador ni reemplazo de clientes HTTP comerciales.

## Inventario previo del flujo LEGACY

Inventario tomado sobre `origin/main` en `a8cc6c24f11b0f96d3260bef66752e9d6d39b9c2`, antes de modificar código:

| Área | Comportamiento actual |
| --- | --- |
| Entrada activa | `src/main.tsx` monta `App` directamente. `LoginScreen` existe, pero no está importado por el entrypoint ni por `App`. |
| Login disponible | `LoginScreen` llama `POST /api/auth/login`, recibe `{ token, user }` y guarda la sesión. El handler firma un JWT legacy con `sub`, `email` y `role`. |
| `/auth/me` | Existe `getMe(token)`, pero no tiene consumidores activos. El endpoint valida el Bearer legacy y consulta `User`; la recarga de la aplicación no lo llama. |
| Logout | El endpoint V2 `POST /api/auth/logout` existe. `Sidebar` sólo muestra “Cerrar Sesión” si recibe `onLogout`; `App` no se lo entrega. No hay flujo de logout legacy centralizado activo. |
| JWT legacy | Se guarda en `localStorage` bajo `osi-plus.token`; la sesión resumida se guarda en `osi-plus.session`. Se conserva sin cambios en esta fase. |
| Cliente HTTP | `src/lib/api.ts` centraliza `fetch`, pero la mayoría de llamadas usa todavía `x-osi-role` y `x-osi-userid` derivados de `localStorage`. Sólo agrega Bearer cuando el llamador entrega `options.token`. |
| Usuario, rol y permisos | `App` carga rol/nombre desde `sessionStore`; `Sidebar` recibe esos valores. `CommercialCalendarModule`, `ProjectsModule` y stores de adendas/auditoría consultan también `loadSession`. El RBAC backend heredado acepta encabezados legacy en rutas existentes. |
| Recarga | En host distinto de `localhost`, `App` recupera sesión y JWT de `localStorage`; no revalida con `/auth/me`. En `localhost`, conserva el bypass histórico de rol administrador. |
| 401/403 | `requestJson` transforma respuestas no exitosas en un error con `status` y `body`; no hay refresh, logout ni redirección centralizados. |
| Arranque | `main.tsx` sólo monta React. `App` guarda nuevamente la sesión, registra listeners de navegación/contexto y carga módulos con `lazy`. No existe side effect V2. |

### Riesgos heredados que esta fase no cambia

* El JWT legacy permanece en almacenamiento persistente hasta MT-01B3.
* Los encabezados `x-osi-role` y `x-osi-userid` siguen presentes por compatibilidad.
* `/auth/me` no es la autoridad de rehidratación del frontend actual.
* El cierre de sesión visible no está conectado por `App`.
* El bypass local de administrador continúa intacto.

## Diseño de integración

La integración tiene una sola entrada controlada: `frontendSessionGate.ts`. `main.tsx` y
`LoginScreen.tsx` sólo importan esa compuerta. El coordinador, sus adaptadores y el runtime
V2 se cargan mediante `import()` exclusivamente cuando Vite compila
`VITE_MT01B2_CLIENT_ENABLED=true`.

Con el valor predeterminado `false`, la rama condicional se elimina durante el build:

* no se descarga el chunk del coordinador;
* no se crea `BroadcastChannel`, Web Lock, timer ni listener;
* no se llama `upgrade`, `refresh` o `logout` V2;
* login, `/auth/me`, logout y almacenamiento LEGACY conservan su contrato;
* no se consulta ninguna tabla Auth.

Cuando una fase posterior habilite el cliente, el runtime primero llama `session/upgrade`
con el token LEGACY. Sólo crea el coordinador si el backend confirma una sesión V2. Una
respuesta `MT01B_AUTH_V2_DISABLED` vuelve a LEGACY sin abrir canales. El access token V2
permanece en memoria y el refresh token queda exclusivamente en la cookie HttpOnly. El
estado publicado a React contiene identificadores de sesión, rol, versión de autorización
y expiración, pero nunca el token.

El adaptador prepara `upgrade`, `refresh` y `logout` con `credentials: "include"`, errores
sanitizados y cancelación mediante `AbortSignal`. El runtime centraliza renovación,
reconexión, visibilidad, logout y limpieza. Los clientes HTTP comerciales no fueron
reemplazados; esa integración pertenece a MT-01B3.

### Ciclo futuro HYBRID

1. El login LEGACY termina sin cambios.
2. La compuerta intenta `upgrade` una sola vez.
3. El servidor valida usuario, membresía, tenant y versión de autorización.
4. Si confirma V2, se inicia el coordinador entre pestañas.
5. Si V2 está deshabilitado o temporalmente indisponible, se conserva el flujo LEGACY.
6. Logout o revocación elimina el token en memoria, cancela timers y libera todos los
   recursos del navegador.

Los datos recibidos por `BroadcastChannel` sirven únicamente como fencing para rechazar
mensajes incompatibles; el navegador no decide tenant, membresía, rol ni autorización.

## CSP propuesta para Preview

La auditoría encontró llamadas `fetch` al mismo origen, ningún `WebSocket`, `EventSource`,
`sendBeacon`, `eval` o `new Function`, y ningún iframe. Hay estilos inline de React y tres
usos heredados de `dangerouslySetInnerHTML`, por lo que se propone comenzar sólo en Preview
con `Content-Security-Policy-Report-Only`:

```text
default-src 'self';
script-src 'self';
connect-src 'self';
img-src 'self' data: blob:;
font-src 'self' data:;
style-src 'self' 'unsafe-inline';
worker-src 'self' blob:;
object-src 'none';
base-uri 'self';
form-action 'self';
frame-ancestors 'none'
```

Antes de imponerla se debe configurar un colector de reportes, observar Preview y revisar
los estilos inline y HTML heredado. No se modificó CSP en esta fase.

## Evidencia de validación

Validación local, sin Neon ni producción:

| Verificación | Resultado |
| --- | --- |
| PostgreSQL 18 desde base vacía | 12/12 migraciones |
| Segundo `migrate deploy` | Sin pendientes |
| `prisma validate` / `generate` | Correctos |
| `prisma migrate diff` | Vacío |
| DB-01/MT-01A | 299/299 |
| MT-01B1 | 124/124 |
| MT-01B2A | 24/24 |
| Guardias de activación | 23/23 |
| Playwright Node 24 | 36/36 |
| Chromium / Firefox / WebKit | 12/12 por motor |
| Build LEGACY | Correcto |
| ESLint focalizado | Correcto |
| `git diff --check` | Correcto |

Las pruebas reales cubren 20 pestañas, caída de líder, fallback sin Web Locks, logout,
relogin con otro usuario, respuesta tardía, mensajes fuera de orden, offline/reconexión,
visibilidad, cierre/reapertura, revocación y limpieza de recursos. Ninguna prueba encontró
tokens V2 en `localStorage`, `sessionStorage` o IndexedDB.

El bundle LEGACY pasó de 2,160,293 a 2,160,584 bytes (+291 bytes). No contiene chunk ni
marcadores del coordinador (`coordinatorChunks=0`). Durante el desarrollo una primera
condición no estática sí generó un chunk V2; la guardia lo detectó y la compuerta fue
corregida para que Vite elimine la rama desactivada.

### Riesgos reservados para MT-01B2B-B

* Activar HYBRID y la bandera frontend sólo en Preview controlado.
* Validar cookies `__Host-` sobre HTTPS real y política CORS del dominio Preview.
* Implementar y observar CSP Report-Only.
* Medir latencia Vercel–Neon y single-flight entre pestañas bajo carga real.
* Definir telemetría sin tokens ni datos sensibles.
* Mantener fuera de alcance el selector/cambio de tenant y la migración de clientes HTTP.
