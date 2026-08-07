# MT-01C1A — EmployeeProfile empresarial

## Autoridad de estado

- `User.status` protege la identidad global.
- `TenantMembership.status` controla acceso a una empresa.
- `EmployeeProfile.employmentStatus` describe la relación laboral en esa empresa.

MT-01C1A no sincroniza estos estados. La futura terminación laboral deberá ser una operación crítica única que, con autorización administrativa, cambie `EmployeeProfile`, suspenda la membresía, revoque sus sesiones y registre `CommercialAuditLog` dentro de la misma transacción. No se implementa en MT-01C1A.

## Mapeo heredado permitido

El backfill enlaza exclusivamente `TenantMembership.userId` con `User.id`. No usa correo, nombre ni teléfono.

| Fuente heredada | Destino | Regla |
|---|---|---|
| `User.code` | `employeeCode` | Se conserva; nunca se genera otro código |
| `User.joinDate` | `hiredAt` | Sólo fecha ISO `YYYY-MM-DD` válida |
| `User.department` o `employeeProfile.departmentCode` | `departmentCode` | Mapeo explícito documentado abajo |
| `employeeProfile.employmentStatus` | `employmentStatus` | Obligatorio; no se deriva de `User.status` |
| `employeeProfile.availabilityStatus` | `availabilityStatus` | Obligatorio |
| `employeeProfile.contractType` | `contractType` | Opcional; si existe debe ser conocido |

Departamentos reconocidos: Administración/Administration → `ADM`, Comercial → `COM`, Operaciones/Operations → `OPS`, Logística/Logistics → `LOG`, RRHH/Recursos Humanos → `HR`, QA → `QA`.

Contratos reconocidos: Planta/Permanent → `PERMANENT`, Personal Móvil/Mobile Staff → `MOBILE_STAFF`, Plazo Fijo/Fixed Term → `FIXED_TERM`, Contratista/Contractor → `CONTRACTOR`.

Disponibilidad reconocida: Disponible/Available, Limitada/Limited y No disponible/Unavailable.

Cualquier valor no reconocido se clasifica `AMBIGUOUS` y bloquea el lote completo. La ausencia de estado laboral o disponibilidad se clasifica `INCOMPLETE` y también bloquea el lote.

El dry-run local sobre los 18 usuarios sintéticos equivalentes de MT-01A observó `Planta` (6) y `Personal Móvil` (12). Los 18 carecen de estado laboral y disponibilidad; además usan departamentos sintéticos por rol que no son equivalencias empresariales válidas. Resultado: 0 convertibles, 18 con revisión obligatoria y 0 escrituras. Este resultado no se presenta como auditoría de datos productivos.

## Backfill y rollback

- Lote estable: `MT-01C1A-IPACKERS-DO-V1`.
- El backfill usa bloqueo advisory transaccional y aislamiento `READ COMMITTED`; después de esperar el bloqueo vuelve a leer dentro de la transacción para observar el commit ganador.
- Una segunda ejecución reconoce perfiles idénticos y crea cero filas.
- `User.employeeProfile`, `User` y `TenantMembership` no se modifican.
- El rollback sólo elimina filas `BACKFILL` del lote cuyo `updatedAt` sigue igual a `createdAt`.
- El trigger de la tabla actualiza `updatedAt` ante cualquier modificación e impide cambiar tenant, membresía o usuario.

## Decisiones futuras registradas

- `PipelineCase` tendrá relación 1:N con `Project`.
- `ServiceCase` permanece congelado hasta auditar sus registros.
- El RNC será único dentro de cada tenant.
- Teléfono y correo serán señales de posible duplicado, no claves únicas.
- Competencias, KPI, límites, autorizaciones y disponibilidad detallada tendrán modelos relacionales posteriores; no se almacenan en `EmployeeProfile` como JSON.

## Riesgos reservados para MT-01C1B

- Detectar y prohibir ciclos de supervisión de más de un nivel; MT-01C1A sólo impide autosupervisión directa.
- Diseñar una provisión transaccional segura de `User`, `TenantMembership` y `EmployeeProfile`.
- Restringir y auditar especialmente la asignación del rol administrativo `A`.
- Resolver de forma explícita una identidad global que ya tenga membresía en otro tenant, sin vincular por correo, nombre o teléfono.
- Completar revisión manual de los 18 perfiles heredados antes de cualquier backfill real.
- Crear un catálogo empresarial versionado de departamentos.
- Normalizar competencias y disponibilidad detallada mediante tablas relacionales, nunca JSON.

La ausencia de `EmployeeProfile` es válida y no puede bloquear login, usuarios ni módulos heredados. Ningún consumidor runtime se activa en MT-01C1A.
