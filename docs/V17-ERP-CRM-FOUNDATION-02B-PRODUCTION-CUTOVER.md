# V17-ERP-CRM-FOUNDATION-02B — Preparación del cutover productivo

Estado: **PLANIFICADO, NO AUTORIZADO Y NO EJECUTADO**  
Fecha de inspección: 2026-08-24  
Autoridad técnica inspeccionada: Production `main`, commit `cba31e66c7dffd187e41ac2f25aaab1d727faccc`  
Deployment vigente: `dpl_61sDgCYGvHUTDw1uwKVYHjHHEKKw`

La inspección PostgreSQL se ejecutó contra `br-fragrant-night-ahwa3s12`, base
`neondb`, conexión directa, `REPEATABLE READ / READ ONLY`,
`search_path=osi,public`, timeouts acotados y cierre forzado mediante rollback.
No se consultaron ni registraron contraseñas, hashes o tokens.

## Estado productivo observado

- Migraciones: 18 completas, 0 fallidas.
- `PipelineCase`: 0; Survey canónico/legacy: 0/0; Quote canónica/legacy: 0/0.
- Client: 7; Project: 2; OSI: 3.
- User: 18; TenantMembership: 18; Tenant: 1.
- AuthSession/AuthRefreshToken: 0/0.
- No existe actividad registrada en `TenantMembership.firstAccessAt` ni
  `TenantMembership.lastAccessAt` para las 18 membresías.
- Última actualización de User observada: 2026-07-13. Los Project y OSI
  conservan referencias temporales históricas de 2024. La antigüedad no autoriza
  su eliminación ni demuestra que sean sintéticos.
- Hub, cliente CRM y lectura CRM carecen de variables productivas de activación.
  La API CRM responde con su compuerta desactivada.

## 1. Cuentas que se conservarán

Las 18 identidades y sus 18 membresías activas se conservan hasta decisión
empresarial. Distribución de membresías: A=1, B=1, C=1, E=5, I=1, K=2 y V=7.

No se infiere validez a partir de nombre, correo, rol o antigüedad. Tampoco se
elimina una cuenta por carecer de acceso registrado. Para la primera activación
se seleccionará expresamente una cuenta A y una V, verificando User,
TenantMembership y Tenant activos y el permiso efectivo `pipeline:view`.

## 2. Cuentas que requieren reset

No se ejecutará un reset masivo. Las cuentas A/V elegidas por Frederick para el
cutover requieren un reset LEGACY administrativo controlado si sus credenciales
actuales no están confirmadas. El reset sólo puede modificar el hash canónico de
una identidad exacta y debe invalidar sesiones por el mecanismo aprobado, sin
cambiar rol, tenant, membresía, grants o denies.

La ausencia de `firstAccessAt/lastAccessAt` en 18/18 impide usar esos campos como
evidencia de que una contraseña fue utilizada recientemente.

## 3. Cuentas sintéticas que requieren decisión de Frederick

La lectura no encontró marcadores inequívocos que permitan clasificar alguna de
las 18 cuentas como sintética. Por tanto:

- sintéticas certificadas: 0;
- eliminables automáticamente: 0;
- pendientes de validación empresarial: 18.

La decisión se realizará sobre un inventario privado enmascarado; no se basará
en similitud de correo, nombre o rol.

## 4. Variables de activación

La activación no puede realizarse cambiando variables sobre el commit actual.
El backend ya soporta lectura productiva, pero los resolvers frontend de Hub y
CRM sólo admiten `DISABLED`, `LOCAL_ONLY` y `PREVIEW_REHEARSAL`. Antes del
cutover debe existir y auditarse un modo frontend exacto `PRODUCTION_READ` que
falle cerrado fuera de `VERCEL_ENV=production`, rama `main` y deployment
autorizado.

Después de incorporar esa compuerta canónica, el conjunto propuesto es:

| Variable | Valor de cutover |
|---|---|
| `VITE_OSI_HUB_MODE` | `PRODUCTION_READ` |
| `VITE_CRM_PIPELINE_CLIENT_MODE` | `PRODUCTION_READ` |
| `VITE_CRM_PIPELINE_READ_MODE` | `PRODUCTION_READ` |
| `CRM_PIPELINE_RUNTIME_MODE` | `PRODUCTION_READ` |
| `CRM_PIPELINE_MUTATION_MODE` | `DISABLED` |
| `CRM_PIPELINE_ACTIVATION_BATCH` | `CRM-01B3B1-PRODUCTION-V1` |
| `COMMERCIAL_TENANCY_READ_MODE` | revalidar y conservar el valor canónico `TENANT_READ` |
| `COMMERCIAL_TENANCY_WRITE_MODE` | revalidar y conservar `TENANT_WRITE`; no habilita mutaciones CRM |
| `COMMERCIAL_TENANCY_ACTIVATION_BATCH` | revalidar y conservar `MT-01C2B2-IPACKERS-DO-V1` |

`MT01B_AUTH_MODE`, tenant switch y cliente V2 permanecen en sus defaults seguros:
LEGACY, desactivado y desactivado. No se introduce una variable frontend con el
batch servidor. Las mutaciones siguen bloqueadas.

La metadata de Vercel confirma que las tres variables de tenancy existen como
sensibles, pero no revela sus valores. Por eso el recibo del cutover debe
revalidar los bytes exactos sin imprimirlos antes de añadir las seis variables
Hub/CRM.

## 5. Deployment objetivo

El objetivo será un nuevo deployment Git de Production construido desde el merge
autorizado que contenga:

1. el núcleo ERP/CRM aprobado visualmente;
2. la compuerta frontend `PRODUCTION_READ` auditada;
3. los contratos CRM de lectura y seguridad vigentes;
4. exactamente 18 migraciones, sin migración 19.

Nunca se promoverá directamente un deployment Preview ni se reutilizará su base
Neon aislada en Production.

## 6. Aliases

Primero se valida la URL inmutable del deployment objetivo. Sólo después se
promueve `osi-plus-erp-v17.vercel.app` y los aliases secundarios `main` que
pertenezcan al mismo proyecto y SHA. `osi-plus.vercel.app` queda fuera de alcance.

El deployment productivo vigente `dpl_61sDgCYGvHUTDw1uwKVYHjHHEKKw` se conserva
como destino de rollback de aliases.

## 7. Smoke tests

- `/`, `/api/health` y `/api/info`: 200 y SHA exacto.
- Auth inválido/anónimo: 401; Auth V2 continúa 409.
- A/V autorizados: login, Hub, shell azul, Inbox vacío empresarial o datos reales
  futuros, Ficha por `caseRef`, deep link, reload, regreso y logout.
- Usuario con deny: 403 desde el shell, 0 chunks protegidos y 0 requests CRM.
- Lista, detalle y resumen: contratos cerrados, tenant-first y `private, no-store`.
- Mutaciones y owner options: 409 antes de auth, body o Prisma.
- Cero CUID, `publicRef`, `clientId`, `tenantId`, cookies V2, CORS permisivo,
  warnings, `pageerror`, 500 o 503.
- Confirmar que los 7 Client, 2 Project y 3 OSI permanecen intactos.

## 8. Respaldo previo

Inmediatamente antes del cutover se debe crear un respaldo Neon nuevo, hijo
directo de Production `main`, posterior a migración 18 y a esta inspección. Debe
compararse en `READ ONLY`, quedar sin compute y conservar fingerprints de
estructura, historial, identidad y datos protegidos.

Los respaldos anteriores no sustituyen este punto de recuperación específico.

## 9. Rollback

El rollback inicial es de aplicación, no de base:

1. retirar las variables nuevas de Hub/CRM o restablecerlas a `DISABLED`;
2. restaurar los aliases al deployment `dpl_61sDgCYGvHUTDw1uwKVYHjHHEKKw`;
3. comprobar CRM 409 y ausencia de chunks;
4. no revertir migración 18 ni tocar Client, Project, OSI, User o Membership;
5. conservar el respaldo nuevo hasta cierre empresarial.

## 10. Funcionalidades que seguirán `En integración`

- Survey y Evaluador.
- Cotización, versiones, FX, margen y aprobaciones.
- Materiales, almacenes, reservas, cajas y crating.
- Tarifarios, logística, terceros y costos.
- PIC, propuesta, contrato, Project/OSI desde el flujo comercial.
- Administración, Coordinación, Operaciones, Campo y Taller, Logística y Recursos
  Humanos dentro del nuevo shell.
- Toda mutación CRM, transición, asignación y owner management.

Production mostrará un Inbox vacío al activarse porque actualmente existen cero
`PipelineCase`. No se crearán datos de demostración ni se copiarán fixtures del
Preview durante el cutover.
