# MT-01B1 — Fundación de autenticación multiempresa

Estado: implementado sólo en rama local. La autoridad activa sigue siendo LEGACY.

## Límites de esta fase

- `MT01B_AUTH_MODE` usa `LEGACY` por defecto.
- `MT01B_TENANT_SWITCH_ENABLED` debe permanecer `false` hasta MT-01C.
- No existen endpoints de selección o cambio de empresa ni componentes frontend asociados.
- `login` y `GET /api/auth/me` conservan su implementación y contrato anteriores.
- En LEGACY no se crea `AuthSession`, no se emite refresh cookie y no se exigen claims V2.
- Los endpoints `/api/auth/refresh`, `/api/auth/logout` y `/api/auth/session/upgrade` responden de forma controlada con `MT01B_AUTH_V2_DISABLED`.
- Ninguna ruta comercial usa todavía `AuthContext` ni las tablas nuevas.

## Persistencia

`AuthSession` representa una familia de sesión. Su FK compuesta prueba simultáneamente:

`tenant_id + membership_id + user_id → tenant_memberships(tenant_id, id, user_id)`

La clave referenciada ya está declarada en Prisma como:

```prisma
@@unique([tenantId, id, userId])
```

`AuthRefreshToken` conserva únicamente HMAC-SHA-256 del token opaco. El secreto original sólo vive en la cookie. Un índice parcial de PostgreSQL permite un único token `ACTIVE` por sesión.

## Contratos JWT

### LEGACY

El JWT histórico contiene exactamente `sub`, `email`, `role`, `iat` y `exp`. Mientras el modo sea LEGACY se sigue firmando y validando como antes. Las pruebas snapshot verifican cuerpo, estado HTTP, claims y ausencia de cookie.

### V2, preparado pero inactivo

- Algoritmo: HS256.
- `iss`: `osi-plus`.
- `aud`: `osi-plus-api`.
- `ver`: `2`.
- `typ`: `access`.
- Claims: `sub`, `membershipId`, `tenantId`, `role`, `authorizationVersion`, `sid`, `jti`, `iat`, `exp`.
- Duración predeterminada del access token: 15 minutos.

El servidor valida usuario global, tenant, membresía, relación compuesta, sesión, rol y `authorizationVersion`. Un token V2 incompleto nunca se interpreta como token legacy.

## Ventana legacy

No existe una fecha predeterminada. Al habilitar HYBRID en MT-01B2 será obligatorio configurar `MT01B_LEGACY_TOKEN_ACCEPT_UNTIL`. La aplicación rechaza una fecha pasada o superior a siete días desde el arranque.

Con una membresía activa, el upgrade es automático. Con más de una, devuelve `MULTIPLE_ACTIVE_MEMBERSHIPS_ADMIN_REQUIRED`; B1 no revela opciones ni permite selección.

## Rotación y concurrencia

La rotación usa una transacción `READ COMMITTED` y este orden:

1. Localizar el token sin cambiarlo.
2. Intentar `pg_try_advisory_xact_lock` con una clave estable derivada de `tenantId + sessionId`. Todos los tokens de una familia, incluido un token ROTATED anterior, comparten exactamente el mismo lock.
3. Sólo el ganador bloquea la sesión y luego el token; todas las lecturas autoritativas ocurren después del advisory lock.
4. Validar token, versión, hash y fingerprint.
5. Marcar el token anterior `ROTATED`.
6. Crear el nuevo token `ACTIVE`.
7. Relacionar `replacedByTokenId`.
8. Incrementar la versión de la sesión y persistir la auditoría crítica.
9. Confirmar la transacción.
10. Firmar access token y emitir cookie sólo después del commit.

Mientras el ganador conserva el lock, las solicitudes concurrentes reciben inmediatamente `409 MT01B_REFRESH_IN_PROGRESS`, `recoverable=true` y `retryAfterMs` con jitter. No reciben `Set-Cookie`, no crean auditorías y no comprometen la familia. Logout y cambios de autorización usan el mismo lock de cada sesión antes de revocar. Después del commit, reutilizar el token anterior con el mismo fingerprint dentro de la tolerancia de cinco segundos devuelve `409 MT01B_REFRESH_ALREADY_ROTATED` con el mismo contrato recuperable. Fuera de la tolerancia o con fingerprint incompatible, se marca la familia `COMPROMISED`, se revocan sus tokens y se exige login.

Los `lock_timeout`, `statement_timeout` y fallos de conexión se convierten en códigos MT-01B sanitizados y recuperables. Nunca se devuelve SQL, URL, hashes o secretos. Una respuesta perdida después del commit no puede reconstruir el secreto nuevo: el reintento con el token anterior devuelve `MT01B_REFRESH_ALREADY_ROTATED`, conserva una sola cadena y el cliente deberá usar la cookie ya compartida o iniciar sesión otra vez.

El fingerprint es sólo una señal de correlación para distinguir una carrera legítima de una reutilización sospechosa; nunca sustituye la firma, el secreto del refresh ni las validaciones de usuario, tenant y membresía.

### Política de tiempo

| Variable | Predeterminado | Límite seguro | Alcance |
|---|---:|---:|---|
| `MT01B_AUTH_TRANSACTION_MAX_WAIT_MS` | 2000 ms | 250–5000 ms | Espera de Prisma para obtener/iniciar la transacción. |
| `MT01B_AUTH_TRANSACTION_TIMEOUT_MS` | 5000 ms | 1000–10000 ms | Duración total máxima de la transacción interactiva. |
| `MT01B_AUTH_LOCK_TIMEOUT_MS` | 250 ms | 25–1000 ms | Espera máxima de PostgreSQL por un lock bloqueante residual. |
| `MT01B_AUTH_STATEMENT_TIMEOUT_MS` | 3000 ms | 250–4000 ms | Duración máxima de cada sentencia SQL. |
| `MT01B_REFRESH_RETRY_BASE_MS` | 150 ms | 50–1000 ms | Base indicada al cliente antes de reintentar. |
| `MT01B_REFRESH_RETRY_JITTER_MS` | 100 ms | 0–500 ms | Jitter adicional para evitar otro pico simultáneo. |

La configuración exige `lock_timeout <= statement_timeout < timeout` y rechaza valores fuera de rango al resolverse la política. Ningún valor usa 60 segundos.

MT-01B2 deberá implementar *single-flight* entre pestañas (por ejemplo, coordinación segura con `BroadcastChannel` y un líder temporal). MT-01B1 sólo define los códigos `MT01B_REFRESH_IN_PROGRESS`, `MT01B_REFRESH_ALREADY_ROTATED`, `MT01B_SESSION_OPERATION_IN_PROGRESS` y los fallos temporales sanitizados, junto con `recoverable` y `retryAfterMs`; no coordina todavía el frontend.

La activación de MT-01B2 exige una prueba desde una región equivalente al trayecto Vercel–Neon, p95 con margen suficiente respecto a `statement_timeout`, cero timeouts bajo la carga prevista y métricas separadas de red, lock, SQL, auditoría y commit. En Q3 se observó en Neon aislado un máximo aproximado de 2,260 ms para consultas/auditoría y 2,878 ms total del ganador. La revisión Q4, ya con lock por familia, observó 2,460.37 ms y 2,959.63 ms respectivamente, sin timeouts en 50 × 20 solicitudes. Aunque `statement_timeout` limita cada sentencia y no el total, ese margen sigue siendo insuficiente para activar HYBRID sin la validación regional.

## Cookie, CORS y origen

Cookie: `__Host-osi_refresh; Path=/; HttpOnly; Secure; SameSite=Lax`, sin `Domain`. El borrado repite los mismos atributos. Las mutaciones exigen `Origin` o `Referer` incluido en una lista explícita. Nunca se combina credenciales con `Access-Control-Allow-Origin: *`.

El token de acceso no se persiste en esta fase. MT-01B2 deberá conservarlo sólo en memoria y coordinar refresh entre pestañas antes de activar HYBRID.

## Cambios de autorización

`membershipAuthorization.js` es el único servicio preparado para modificar rol, estado, permisos concedidos o denegados. Adquiere de forma determinista los locks de todas las sesiones activas, bloquea la membresía, incrementa `authorizationVersion`, revoca sus sesiones y agrega `CommercialAuditLog` crítico dentro de la misma transacción. Una sesión ocupada produce conflicto recuperable; una falla de auditoría revierte el cambio.

## Activación futura

MT-01B2 requiere autorización independiente, Preview aislado, `HYBRID`, cutoff absoluto máximo de siete días, pepper independiente, orígenes explícitos y coordinación frontend de cookie/refresh. MT-01C será la primera fase que podrá considerar selección o cambio de tenant.

## Rollback operativo

Mantener o restaurar:

```env
MT01B_AUTH_MODE=LEGACY
MT01B_TENANT_SWITCH_ENABLED=false
```

Las tablas son aditivas y pueden permanecer sin uso. No se recomienda un rollback destructivo. El código legacy no depende de ellas.
