# MT-01B3B1 — Piloto de contexto empresarial

## Alcance explícito

| Ruta | Autenticación previa | Adaptación B3B1 | Aislamiento de recurso |
| --- | --- | --- | --- |
| `GET /api/auth/me` | JWT LEGACY; V2 preparado | LEGACY conserva el DTO; V2 devuelve `auth` canónico | La identidad se valida por sesión + tenant + membership + user |
| `GET, POST /api/users` | `requireAuth` + RBAC por rol JWT | Adaptador dual por ruta | `User` es identidad global; el endpoint no tiene alcance tenant todavía |
| `GET, POST /api/clients` | `requireAuth` + RBAC por rol JWT | Adaptador dual por ruta | `Client` no tiene `tenantId`; queda bloqueado para MT-01C |
| `GET, POST /api/projects` | `requireAuth` + RBAC por rol JWT | Adaptador dual por ruta | `Project` no tiene `tenantId`; queda bloqueado para MT-01C |

No existen efectos indirectos sobre otras rutas: `requireAuth` y `requirePerm` no se modifican. Las 25 rutas que confían en `x-osi-role` o `x-osi-userid` permanecen congeladas y fuera del piloto.

## Contratos

En `LEGACY`, las rutas conservan códigos, cuerpos y permisos actuales. No se crean sesiones o refresh tokens.

En V2, `/api/auth/me` responde:

```json
{
  "ok": true,
  "auth": {
    "authVersion": "V2",
    "userId": "...",
    "email": "...",
    "tenantId": "...",
    "tenantCode": "...",
    "membershipId": "...",
    "role": "...",
    "authorizationVersion": 1,
    "permissions": [],
    "sessionId": "..."
  }
}
```

La consulta que resuelve el contexto trae email y código del tenant junto con sesión, membresía, usuario y tenant. El DTO no expone tokens, cookies, hashes ni listas internas de grants/denies.

## Bloqueos posteriores

- MT-01B3B2: reducir gradualmente la allowlist de 25 rutas con headers manipulables.
- MT-01C: agregar pertenencia empresarial a `Client`, `Project` y demás entidades antes de aplicar filtros o `requireTenantResource`.
- La creación de usuarios continúa siendo global; asociar la nueva identidad a una membresía corresponde al flujo empresarial posterior.
- HYBRID, tenant switch, broker y eliminación del JWT de `localStorage` permanecen fuera de este lote.
