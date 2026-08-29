# V17-PRODUCTION-GATES-04E1B — Resultado

## Contrato

El piloto dispone de tres compuertas server-side independientes y desactivadas por defecto:

1. Crear/editar `PipelineCase` por los contratos canónicos de caso.
2. Consultar y administrar `TenantMembership` por referencia pública tenant-first.
3. Emitir, consultar, revocar y consumir invitaciones administrativas.

El único modo productivo nuevo es `PRODUCTION_PILOT`. Exige Vercel Production, rama `main`, Auth LEGACY, tenancy canónica, User/Membership/Tenant activos, rol y permisos explícitos, ausencia de deny y un manifiesto server-only canónico fijado por SHA-256. El manifiesto autoriza por `Tenant.code` y por compuerta; autorizar una no habilita las otras.

`PRODUCTION_WRITE`, `ENABLED`, `ALL_TENANTS`, booleanos, casing alternativo, espacios, BOM y configuraciones parciales no son modos válidos de las compuertas focales. Las mutaciones históricas, owner options, asignación, Client, Project/K, Survey y Cotización continúan bloqueadas.

## Orden

- `DISABLED`: 409 antes de autenticación, body o Prisma.
- `PRODUCTION_PILOT`: configuración → autenticación/contexto revalidado → tenant/lote → rol/permisos/deny → body → dominio transaccional.
- La activación pública valida primero la configuración, después el body/token y resuelve únicamente una invitación vigente cuyo tenant esté autorizado por el manifiesto.

Los `VITE_*` controlan únicamente visibilidad y lazy loading. No reciben el batch, el manifiesto ni su hash y nunca constituyen autoridad del servidor.

## Variables requeridas por nombre

| Variable | Scope | Finalidad |
|---|---|---|
| `CRM_PIPELINE_MUTATION_MODE` | Production server | Compuerta focal de creación/edición de casos. |
| `ADMIN_TENANT_MEMBERSHIP_MODE` | Production server | Compuerta de administración de Membership. |
| `ADMIN_IDENTITY_INVITATION_MODE` | Production server | Compuerta de invitación y activación. |
| `V17_PRODUCTION_PILOT_ACTIVATION_BATCH` | Production server | Identidad exacta del lote. |
| `V17_PRODUCTION_PILOT_ACTIVATION_MANIFEST` | Production server | Allowlist canónica por tenant y compuerta. |
| `V17_PRODUCTION_PILOT_ACTIVATION_MANIFEST_SHA256` | Production server | Integridad byte a byte del manifiesto. |
| `VITE_CRM_PIPELINE_CASE_MUTATION_MODE` | Production build | Visibilidad de Nuevo Caso/Editar. |
| `VITE_ADMIN_TENANT_MEMBERSHIP_MODE` | Production build | Visibilidad y lazy load de Administración. |
| `VITE_ADMIN_IDENTITY_INVITATION_MODE` | Production build | Visibilidad de invitaciones y activación. |

La activación también requiere las variables canónicas ya existentes para `PRODUCTION_READ`, Auth LEGACY y tenancy tenant-first. No se duplicó su contrato ni se incorporaron valores server-only al bundle.

## Rollback funcional

1. Cambiar las tres compuertas server-side focales a `DISABLED`.
2. Cambiar las tres variables visuales a `DISABLED` y producir un build nuevo: una modificación `VITE_*` no altera un bundle ya construido.
3. Validar 409 antes de auth/body/Prisma y ausencia de acciones, chunks y requests protegidos.
4. Si el deployment no supera el smoke, restaurar los aliases al deployment estable capturado en el preflight de 04E1C.

La recuperación de datos no usa rollback de migraciones. 04E1C debe crear un respaldo nuevo inmediatamente antes de cualquier escritura y conservar manifiestos de PK, fingerprints y estados anteriores. Cualquier dependencia no inventariada obliga a detenerse.

## Secuencia propuesta para 04E1C

1. Verificar y fusionar en orden los PR apilados autorizados.
2. Crear y verificar un respaldo productivo nuevo.
3. Aplicar exclusivamente migraciones 19, 20 y 21 y comprobar segundo deploy/drift.
4. Ejecutar el bootstrap inicial sólo con recibo independiente.
5. Congelar el manifiesto de activación con tenant y compuertas exactos.
6. Configurar variables server-side y de build sin promover aliases.
7. Crear un build desde el merge SHA exacto.
8. Validar URL directa: identidades, permisos, operaciones permitidas, 409 de las superficies excluidas y auditoría 1:1.
9. Promover aliases sólo con CI y smoke completamente verdes.

No se ejecutó bootstrap, no se creó el segundo A, no se emitió una invitación real y no se modificó Production.

## Autoridad de checksums

La reconciliación posterior `V17-MIGRATION-CHECKSUM-AUTHORITY-04E1B1` determinó que los checksums almacenados durante el ensayo 04E1B fueron calculados sobre un checkout Windows con CRLF, mientras los blobs Git publicados de las migraciones 19–21 son LF. La autoridad canónica y la política de checkout se documentan en `V17-MIGRATION-CHECKSUM-AUTHORITY-04E1B1-RESULT.md`; el contenido SQL publicado no fue modificado.
