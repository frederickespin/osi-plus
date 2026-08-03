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
2. Bloquear la sesión.
3. Bloquear y validar el token actual, su versión, hash y fingerprint.
4. Marcar el token anterior `ROTATED`.
5. Crear el nuevo token `ACTIVE`.
6. Relacionar `replacedByTokenId`.
7. Incrementar la versión de la sesión.
8. Confirmar la transacción.
9. Firmar access token y emitir cookie sólo después del commit.

Solicitudes legítimas simultáneas con el mismo token y fingerprint tienen tolerancia predeterminada de cinco segundos. Sólo una rota; las demás reciben `409 MT01B_REFRESH_ALREADY_ROTATED` con `recoverable=true`. No reciben el nuevo refresh ni crean otra cadena. Fuera de la tolerancia o con fingerprint incompatible, se marca la familia `COMPROMISED`, se revocan sus tokens y se exige login.

## Cookie, CORS y origen

Cookie: `__Host-osi_refresh; Path=/; HttpOnly; Secure; SameSite=Lax`, sin `Domain`. El borrado repite los mismos atributos. Las mutaciones exigen `Origin` o `Referer` incluido en una lista explícita. Nunca se combina credenciales con `Access-Control-Allow-Origin: *`.

El token de acceso no se persiste en esta fase. MT-01B2 deberá conservarlo sólo en memoria y coordinar refresh entre pestañas antes de activar HYBRID.

## Cambios de autorización

`membershipAuthorization.js` es el único servicio preparado para modificar rol, estado, permisos concedidos o denegados. Bloquea la membresía, incrementa `authorizationVersion`, revoca sus sesiones activas y agrega `CommercialAuditLog` crítico dentro de la misma transacción. Una falla de auditoría revierte el cambio.

## Activación futura

MT-01B2 requiere autorización independiente, Preview aislado, `HYBRID`, cutoff absoluto máximo de siete días, pepper independiente, orígenes explícitos y coordinación frontend de cookie/refresh. MT-01C será la primera fase que podrá considerar selección o cambio de tenant.

## Rollback operativo

Mantener o restaurar:

```env
MT01B_AUTH_MODE=LEGACY
MT01B_TENANT_SWITCH_ENABLED=false
```

Las tablas son aditivas y pueden permanecer sin uso. No se recomienda un rollback destructivo. El código legacy no depende de ellas.
