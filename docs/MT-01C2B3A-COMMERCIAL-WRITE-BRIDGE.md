# MT-01C2B3A — Puente empresarial de nuevas escrituras

## Estado

El puente está preparado pero inactivo. `COMMERCIAL_TENANCY_WRITE_MODE` sólo
admite `LEGACY_ONLY` y `TENANT_WRITE`; el valor predeterminado versionado es
`LEGACY_ONLY`. CI rechaza cualquier activación. No existe migración 16, backfill,
cutover de lecturas ni configuración Vercel en este cambio.
El servicio también rechaza `TENANT_WRITE` dentro de Preview o Production de
Vercel; una activación futura requerirá un cambio de código revisado, no sólo una
variable de entorno.

La variable se interpreta de forma estricta: sólo la ausencia, `LEGACY_ONLY` o
`TENANT_WRITE` exactos son reconocibles. Espacios, comillas incorporadas, BOM,
saltos, casing diferente, valores vacíos o desconocidos devuelven 503
`COMMERCIAL_TENANCY_CONFIGURATION_INVALID` sin revelar el valor recibido.

## Matriz de modos

| Comportamiento | LEGACY_ONLY | TENANT_WRITE preparado |
|---|---|---|
| GET Client/Project | Sin cambios | Sin cambios; todavía no aislado |
| JWT LEGACY | Flujo existente | Firma + User vigente + una default ACTIVE + tenant ACTIVE |
| JWT V2 | Según el piloto existente | `resolveAuthContext`, sin degradación a LEGACY |
| POST Client | Escritura heredada, `tenantId` omitido | `tenantId` derivado de sesión |
| POST Project | Escritura heredada | Tenant derivado y Client del mismo tenant |
| Campos empresariales del body | Ignorados como antes | Rechazados con 400 |
| Owner empresarial | Sin cambios | No se infiere ni asigna |

## Rutas preparadas

- `POST /api/clients`: conserva `clients:create`; en `TENANT_WRITE` crea el
  Client con el tenant resuelto por servidor y omite `tenantId` de la respuesta.
- `POST /api/projects`: conserva `projects:create`; además exige que el Client
  tenga el mismo tenant. Un Client legacy con `tenantId=NULL` produce conflicto
  controlado y uno ajeno se presenta como 404.

En el escritor tenantizado de Project, el Client se relee con `FOR KEY SHARE`
dentro de la misma transacción `READ COMMITTED` que crea el Project. Así, un
borrado concurrente no deja un Project parcial y una FK concurrente se traduce a
404 sin exponer el error de PostgreSQL o Prisma.

Los GET no cambian. No existe creación Prisma activa de Lead o PipelineCase.
Una creación futura de cualquiera de las cuatro raíces queda bloqueada por la
guardia si no pasa por un contexto servidor preparado.

## Inventario de actualizaciones

| Ruta | Modelo | Campos escritos | Riesgo empresarial |
|---|---|---|---|
| `POST /api/k/project-validate` | Project | `kState`, `kValidatedAt` | No acepta tenant/owner en `data` |
| `POST /api/k/project-release` | Project | `kState`, `kReleasedAt` | No acepta tenant/owner en `data` |

No hay PATCH/PUT activos sobre Client, Project, Lead o PipelineCase. La guardia
rechaza nuevas actualizaciones que escriban `tenantId`, `membershipId`,
`ownerMembershipId` u `ownerUserId`. Los headers `x-osi-*`, query y body no son
autoridad del puente.

## Contratos de error preparados

| Código | HTTP | Significado externo |
|---|---:|---|
| `COMMERCIAL_AUTH_REQUIRED` | 401 | Falta autenticación válida |
| `COMMERCIAL_AUTH_INVALID` | 401 | Identidad global incompatible |
| `COMMERCIAL_MEMBERSHIP_INACTIVE` | 403 | Membresía no habilitada |
| `COMMERCIAL_TENANT_INACTIVE` | 403 | Empresa no habilitada |
| `COMMERCIAL_PERMISSION_FORBIDDEN` | 403 | Permiso efectivo insuficiente |
| `COMMERCIAL_DEFAULT_MEMBERSHIP_REQUIRED` | 409 | No existe default utilizable |
| `COMMERCIAL_DEFAULT_MEMBERSHIP_AMBIGUOUS` | 409 | Estado administrativo ambiguo |
| `COMMERCIAL_CLIENT_TENANCY_PENDING` | 409 | Client legacy pendiente de backfill |
| `COMMERCIAL_RESOURCE_NOT_FOUND` | 404 | Ausente o perteneciente a otro tenant |
| `COMMERCIAL_AUTHORITY_FIELDS_FORBIDDEN` | 400 | El navegador envió autoridad empresarial |
| `COMMERCIAL_CONTEXT_DATABASE_UNAVAILABLE` | 503 | Contexto no verificable temporalmente |
| `COMMERCIAL_TENANCY_CONFIGURATION_INVALID` | 503 | Modo no reconocido o activación no autorizada en Vercel |

Las respuestas no incluyen IDs internos, existencia en otro tenant, SQL ni
detalles de conexión.

## Diferencial LEGACY_ONLY

Frente a la base `afb3f0a1a56f23af9071e4f99af758c918f621bb`, el modo
predeterminado conserva status, JSON, headers CORS/Content-Type, errores,
campos aceptados y escrituras de Client/Project. La resolución del modo es pura:
no consulta TenantMembership, no llama V2 y no agrega SQL. Los campos de
autoridad adicionales continúan ignorados en LEGACY_ONLY, tal como en la base.

## Rendimiento local

Sobre PostgreSQL 18 local, 100 resoluciones empresariales ejecutaron exactamente
100 consultas: p50 0.59 ms, p95 1.19 ms, máximo caliente 2.14 ms y primera
resolución fría 48.10 ms. El modo LEGACY_ONLY añadió cero consultas de tenant.

## Bloqueos para C2B3B y cutover

`TENANT_WRITE` no puede activarse hasta que C2B2 haya terminado con cero filas
legacy pendientes, se ensayen juntos migración 15 + backfill + puente sobre una
rama Neon aislada y exista autorización independiente. Las lecturas siguen en
compatibilidad global; no hay aislamiento runtime completo. Tenant switch,
HYBRID y cliente V2 continúan desactivados.

El 404 cruzado sólo protege la referencia Client usada al crear Project. Los GET
continúan sin filtro por tenant y no deben describirse como aislamiento completo.
