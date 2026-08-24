# V17-ERP-CRM-FOUNDATION-02C — Piloto productivo preparado

## Estado

La aplicación soporta el modo exacto `PRODUCTION_READ`, pero continúa desactivada por defecto. Este lote no configura variables ni activa Hub, ERP, Inbox, Ficha o CRM en Production.

El navegador sólo puede montar el árbol protegido cuando coinciden los tres modos públicos, el build pertenece inequívocamente a Vercel Production sobre `main` y `/api/auth/me` confirma una sesión LEGACY tenantizada con permiso efectivo `pipeline:view`. `deniedPermissions` prevalece antes de importar `HubWorkspace`, Inbox o Ficha.

Survey y Cotización permanecen visibles exclusivamente como **En integración**. CRM se identifica como **Sólo lectura** y las mutaciones continúan `DISABLED`.

## Variables exactas del piloto

Las siguientes variables forman una unidad de activación. No deben configurarse parcialmente ni con espacios, comillas, BOM, cambios de casing o valores alternativos.

| Variable | Scope futuro | Valor exacto | Función |
|---|---|---|---|
| `VITE_OSI_HUB_MODE` | Production | `PRODUCTION_READ` | Habilita el resolver del Hub en el bundle. |
| `VITE_CRM_PIPELINE_CLIENT_MODE` | Production | `PRODUCTION_READ` | Habilita el cliente relacional de lectura. |
| `VITE_CRM_PIPELINE_READ_MODE` | Production | `PRODUCTION_READ` | Habilita la superficie frontend de lectura. |
| `CRM_PIPELINE_RUNTIME_MODE` | Production | `PRODUCTION_READ` | Habilita únicamente los GET CRM canónicos. |
| `CRM_PIPELINE_MUTATION_MODE` | Production | `DISABLED` | Mantiene bloqueadas todas las mutaciones y owner options. |
| `CRM_PIPELINE_ACTIVATION_BATCH` | Production | `CRM-01B3B1-PRODUCTION-V1` | Coordina la compuerta productiva del backend. |
| `COMMERCIAL_TENANCY_WRITE_MODE` | Production | `TENANT_WRITE` | Activa la autoridad tenant-first requerida por los contratos canónicos; no autoriza mutaciones CRM. |
| `COMMERCIAL_TENANCY_READ_MODE` | Production | `TENANT_READ` | Exige lecturas tenant-first. |
| `COMMERCIAL_TENANCY_ACTIVATION_BATCH` | Production | `MT-01C2B2-IPACKERS-DO-V1` | Coordina la autoridad comercial tenantizada. |
| `MT01B_AUTH_MODE` | Production | `LEGACY` | Conserva Auth LEGACY como única autoridad de sesión del piloto. |
| `MT01B_TENANT_SWITCH_ENABLED` | Production | `false` | Impide cambio de tenant. |
| `VITE_MT01B2_CLIENT_ENABLED` | Production | `false` | Mantiene desactivado el cliente Auth V2. |

Vercel debe aportar, sin variables editables del navegador:

| Metadata de plataforma | Valor exigido |
|---|---|
| `VERCEL_ENV` | `production` |
| `VERCEL_GIT_COMMIT_REF` | `main` |

La activación sólo es válida en un deployment construido desde el resolver de este lote. Configurar las variables sobre un deployment anterior es insuficiente: ese bundle no reconoce `PRODUCTION_READ`, no solicita la confirmación segura de `/api/auth/me` y debe permanecer inactivo o fallar cerrado.

## Secuencia futura de activación

1. Auditar y fusionar el resolver mediante un PR separado.
2. Esperar un deployment Production inactivo del merge y validar sus contratos con las variables todavía ausentes.
3. Registrar deployment estable, aliases y respaldo vigente en la autorización de cutover.
4. Configurar las doce variables como un único lote Production, sin tocar Preview o Development.
5. Generar el deployment Git correspondiente; no reutilizar un bundle anterior.
6. Validar primero la URL inmutable: metadata Production/main, Auth LEGACY, A/V, deny, cero mutaciones y cero IDs internos.
7. Promover aliases sólo después de CI y smoke verdes.

## Rollback

El rollback no requiere SQL ni revertir las 18 migraciones:

1. Reasignar los aliases al deployment estable registrado inmediatamente antes del piloto.
2. Retirar el lote de variables `PRODUCTION_READ` o restaurar los modos Hub/cliente/lectura/runtime a `DISABLED`, manteniendo `CRM_PIPELINE_MUTATION_MODE=DISABLED`.
3. Generar un deployment Git con la configuración desactivada y verificar que no se descarguen chunks protegidos ni existan requests CRM.
4. Conservar Auth LEGACY, tenancy y datos sin cambios; no tocar `PipelineCase.publicRef` ni el respaldo Neon.

La restauración de aliases es la medida inmediata. Un cambio de variables necesita un nuevo build porque las tres variables `VITE_*` se resuelven en compilación.

## Garantías de este lote

- Defaults sin variables: Hub, ERP, Inbox, Ficha y CRM completamente inactivos.
- Configuración parcial o alterada: fallo cerrado.
- Usuario A/V sin `pipeline:view`: denegado.
- `deniedPermissions` con `pipeline:view`: 403 desde el shell, antes del lazy import.
- Mutaciones CRM y owner options: 409.
- Sin migración 19, backfill, fixtures, mocks runtime o storage empresarial.
- Sin cambios en Production, Neon, Vercel, aliases o variables.
