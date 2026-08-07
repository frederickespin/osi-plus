# MT-01C1B2B — dominio transaccional de provisión

Estado: implementación interna inactiva. No tiene endpoints, UI, invitaciones ni consumidores runtime.

## Autoridad y estados

`ApprovalRequest` es la única autoridad de `PENDING`, `APPROVED`, `REJECTED`, `CANCELLED` y `EXPIRED`. `EmployeeProvisioningRequest.lifecycleStatus` permanece `NULL` durante C1B2B. Aprobar fija el rol y los permisos autorizados, pero no crea identidad, membresía ni perfil laboral.

## Reservas e idempotencia

- `normalizedEmail` y `normalizedEmployeeCode` se reservan por tenant mientras `ApprovalRequest` esté `PENDING` o `APPROVED`.
- `REJECTED`, `CANCELLED` y `EXPIRED` liberan ambos identificadores para una solicitud nueva con otro `requestId`.
- Los locks se adquieren antes de releer, bajo `READ COMMITTED`, en orden `requestId → email → employeeCode`.
- La clave del lock sólo coordina espera; las consultas comparan nuevamente tenant e identificadores completos. Una colisión de hash no mezcla solicitudes.
- El hash idempotente que cubre correo usa HMAC-SHA-256 y exige `MT01C1B2B_PAYLOAD_HASH_PEPPER` de al menos 32 bytes. El pepper no se persiste ni se audita.

## Permisos

| Operación | Permiso explícito |
|---|---|
| Crear solicitud | `employee:provisioning:request` |
| Consultar | `employee:provisioning:view` |
| Ver correo | `employee:provisioning:pii:view` |
| Aprobar o rechazar | `employee:provisioning:approve` |
| Cancelar ajena | `employee:provisioning:cancel` |
| Proponer rol A | `employee:role:a:propose` |
| Confirmar rol A | `employee:role:a:assign` |

Estos permisos no se agregan al RBAC heredado. En especial, el rol A no recibe automáticamente `employee:role:a:assign`; con un solo administrador autorizado, la provisión de otro A queda bloqueada operacionalmente.

## Cuatro ojos para rol A

El solicitante, el proponente, el decisor y el empleado objetivo (cuando es identificable) deben satisfacer las separaciones establecidas. El proponente y decisor deben tener rol empresarial A, ser diferentes entre sí y usar permisos explícitos. La decisión identifica una propuesta append-only exacta; sus permisos se fijan por intersección entre la propuesta, la capacidad efectiva del decisor y la política delegable del rol. Las denegaciones prevalecen.

## Concurrencia y auditoría

Las operaciones toman advisory locks transaccionales estables por tenant y comando/recurso, con aislamiento `READ COMMITTED`, `maxWait` de 3 s y transacción máxima de 10 s. La auditoría crítica comparte la transacción empresarial. Los intentos denegados se devuelven como resultado interno para confirmar primero su auditoría y lanzar el error después del commit.

## Reservado para MT-01C1B3

- Crear o enlazar `User`, `TenantMembership` y `EmployeeProfile`.
- Invitación y contraseña.
- Colisiones globales de correo sin revelar existencia.
- Revocación de sesiones y activación laboral coordinadas.
- Detección de ciclos de supervisión.
- Endpoints, UI y activación de modos V2.
- Los actores `SYSTEM` están diferenciados y rechazados; su política explícita pertenece a C1B3.
- Get/list reciben un único AuthContext ya resuelto y hacen dos lecturas: revalidación del actor y consulta tenant-scoped. No existe caché entre solicitudes.
