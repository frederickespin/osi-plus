# MT-01C1B3A — ejecutor transaccional de provisión

Estado: servicio interno inactivo. No tiene endpoint, UI, invitación, contraseña, consumidor runtime ni cambio de modo de autenticación. La cadena canónica conserva 14 migraciones.

## Autoridad y estados

`ApprovalRequest` continúa siendo la única autoridad para `PENDING`, `APPROVED`, `REJECTED`, `CANCELLED` y `EXPIRED`. El ejecutor sólo acepta una solicitud `APPROVED`, con evidencia crítica `EMPLOYEE_PROVISIONING_APPROVED` que coincida exactamente con el rol y los permisos persistidos.

La materialización atómica deja:

| Entidad | Estado inicial | Efecto |
|---|---|---|
| `User` nuevo | `status=inactive` | login LEGACY rechazado; no se crea una contraseña utilizable |
| `TenantMembership` | `status=INACTIVE`, `isDefault=false` | no concede acceso empresarial |
| `EmployeeProfile` | estados laborales explícitos aprobados | conserva empleo, disponibilidad, contrato, fechas y supervisor |
| `EmployeeProvisioningRequest` | `PROVISIONED_INACTIVE`, versión 1 | registra la identidad completa sin activarla |

Para `EXISTING_GLOBAL_USER`, el estado global preexistente no se modifica: bloquearlo dañaría otras empresas. La membresía nueva permanece `INACTIVE`, por lo que esa identidad no obtiene acceso al tenant nuevo. Si ya es miembro, se devuelve conflicto y corresponde el flujo separado de reparación de perfil.

## Transacción e idempotencia

La operación usa `READ COMMITTED`, `maxWait=3s` y `timeout=10s`. Adquiere advisory locks en orden fijo:

1. `tenant + requestId`.
2. `normalizedEmail` global.
3. `tenant + normalizedEmployeeCode`.

Después de esperar cada coordinación, vuelve a leer las filas y compara sus identificadores completos. Por eso una colisión de la clave hash sólo aumenta la espera y nunca mezcla tenants, solicitudes, correos o códigos.

La auditoría crítica `EMPLOYEE_PROVISIONING_MATERIALIZED` comparte la transacción con `User`, `TenantMembership`, `EmployeeProfile` y el cambio de lifecycle. Su metadata conserva el hash del comando no sensible. Un reintento idéntico devuelve la misma identidad; el mismo `requestId` con otra solicitud o versión devuelve `EMPLOYEE_PROVISIONING_IDEMPOTENCY_CONFLICT`. Si la auditoría falla, toda la materialización se revierte.

## Rol A y separación

Para rol A, el ejecutor exige la propuesta append-only exacta registrada en la auditoría de aprobación. Solicitante, proponente y decisor deben ser tres membresías diferentes; el empleado objetivo identificable tampoco puede ser ninguno de ellos. Rol, grants y denies deben coincidir con la evidencia aprobada. `employee:provisioning:materialize` es explícito, no forma parte del RBAC heredado y nunca es delegable.

## Correo heredado

La colisión global consulta simultáneamente `User.normalizedEmail` y `lower(trim(User.email))`. Esto protege a los 18 usuarios heredados aunque su columna normalizada siga nula. El servicio no corrige ni expone el correo inválido existente.

No existe aún un índice único parcial sobre `osi_users.normalized_email`. Antes de habilitar invitaciones o cualquier consumidor runtime se requiere una fase separada con:

1. dry-run de los 18 usuarios;
2. resolución explícita del correo inválido;
3. backfill sin colisiones;
4. ensayo de una migración posterior con `UNIQUE (normalized_email) WHERE normalized_email IS NOT NULL`;
5. compatibilidad con escritores heredados que todavía no llenan la columna.

Los locks protegen este ejecutor, pero no sustituyen la restricción física frente a otros escritores. Por ello la ausencia del índice es bloqueo de activación, no motivo para crear una migración 15 en C1B3A.

## Matriz de errores

| Código | Condición |
|---|---|
| `EMPLOYEE_PROVISIONING_NOT_FOUND` | solicitud o tenant ajeno; evita enumeración cruzada |
| `EMPLOYEE_PROVISIONING_NOT_APPROVED` | ApprovalRequest no aprobado o relación inconsistente |
| `EMPLOYEE_PROVISIONING_APPROVAL_EVIDENCE_INVALID` | rol/permisos no coinciden con la decisión auditada |
| `EMPLOYEE_PROVISIONING_FOUR_EYES_REQUIRED` | propuesta A ausente, cruzada o actores no independientes |
| `EMPLOYEE_PROVISIONING_IDEMPOTENCY_CONFLICT` | requestId reutilizado con otro comando |
| `EMPLOYEE_PROVISIONING_ALREADY_MATERIALIZED` | otro comando ya materializó la solicitud |
| `EMPLOYEE_PROVISIONING_EMAIL_CONFLICT` | correo global existente o ambiguo |
| `EMPLOYEE_PROVISIONING_RESERVATION_CONFLICT` | correo/código reservado o código laboral existente |
| `EMPLOYEE_PROVISIONING_MEMBERSHIP_CONFLICT` | el usuario ya pertenece al tenant |
| `EMPLOYEE_PROVISIONING_SELF_ASSIGNMENT_FORBIDDEN` | el ejecutor intenta materializarse a sí mismo |
| `EMPLOYEE_PROVISIONING_SUPERVISOR_INVALID` | supervisor no activo o ajeno al tenant |
| `EMPLOYEE_PROVISIONING_CONCURRENCY_CONFLICT` | compare-and-set del lifecycle no ganó |

## Riesgos reservados para MT-01C1B3B

- Índice único parcial y backfill de correo, ensayados como migración separada.
- Completar nombre, teléfono y credencial mediante invitación segura; el marcador actual no es una contraseña ni un hash bcrypt válido.
- Activar la membresía y fijar `isDefault` bajo la restricción parcial existente.
- Revocar sesiones y coordinar `User`, membresía, empleo y auditoría al suspender/terminar.
- Detección de ciclos de supervisión más allá de autosupervisión.
- Política de actores de sistema, endpoint, rate limiting y UX.
- Consumidores tenant-scoped y eventual activación HYBRID; permanecen bloqueados en esta fase.
