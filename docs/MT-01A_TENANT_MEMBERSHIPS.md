# MT-01A — Tenant y membresías

## Alcance

Este bloque agrega `Tenant` y `TenantMembership` sin cambiar login, JWT, RBAC,
clientes, leads, casos, CRM, propietario, KPI o SLA. `User.role`, `User.status` y
`User.employeeProfile` siguen siendo la autoridad heredada durante MT-01A.

Tenant inicial:

- Código: `IPACKERS-DO`
- Nombre y razón social: `International Packers SRL`
- País: `DO`
- Zona horaria: `America/Santo_Domingo`
- Moneda: `DOP`
- Lote: `MT-01A-IPACKERS-DO-V1`

## Decisión sobre RB

`RB` fue excluido de `TenantMembershipRole`. El repositorio solo contiene
declaraciones de permisos y rutas `/review/*`, pero no implementa esas pantallas y
el rol no se ofrece en la administración de usuarios. Los tipos y RBAC heredados
no se modifican en MT-01A para evitar un cambio de comportamiento no autorizado.

## Seguridad local

Todos los scripts llaman a `loadMt01aEnvironment()`, que carga
`.env.mt01a.local` y rechaza cualquier conexión que no sea:

```text
127.0.0.1:55432/osi_plus_mt01a_dev
```

El archivo local está excluido de Git. No se aceptan hosts remotos ni un entorno
distinto de `development`.

## Idempotencia

El backfill normaliza rol y estado, valida todas las filas antes de escribir,
adquiere un bloqueo asesor transaccional y usa la clave única
`(tenant_id, user_id)`. Una segunda ejecución no actualiza ni duplica membresías.

Equivalencia de estados:

| User.status | TenantMembership.status |
| --- | --- |
| active | ACTIVE |
| inactive | INACTIVE |
| suspended | SUSPENDED |

Cualquier rol o estado no reconocido cancela la transacción.

## Rollback

El rollback elimina únicamente filas con:

```text
provisioning_source = BACKFILL
provisioning_batch_id = MT-01A-IPACKERS-DO-V1
```

El tenant se elimina solo si fue creado por el mismo lote y no quedan membresías.
No se modifica ninguna columna de `osi_users`.

## EmployeeProfile futuro

Debe convertirse en una entidad empresarial uno-a-uno opcional con
`TenantMembership`. El código de empleado será único por tenant; cargo,
departamento, contrato, estado laboral, supervisor, disponibilidad, límites y
autorizaciones podrán variar por empresa. Las competencias se normalizarán en un
bloque posterior. MT-01A mantiene el JSON global exclusivamente por compatibilidad.

## Ejecución local

```powershell
node scripts/mt-01a-synthetic-users.mjs
node scripts/mt-01a-dry-run.mjs
node scripts/mt-01a-backfill.mjs
node scripts/mt-01a-test.mjs
node scripts/mt-01a-rollback.mjs
```

La migración histórica inicial del repositorio contiene bytes nulos y no puede
aplicarse a una base vacía con `prisma migrate deploy`. Para esta prueba aislada,
el esquema previo se reconstruye con `prisma db push` y la migración MT-01A se
aplica directamente con `prisma db execute`. Esta limitación precede a MT-01A.
