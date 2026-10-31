# Flota: chofer habitual y uso temporal — 19F

## Decisión funcional

El usuario confirmó que el **responsable de Flota/Logística** autoriza el uso temporal de un vehículo por otro chofer. La ficha técnica conserva la presentación compacta de 19E: sede habitual opcional, campos numéricos acotados y disponibilidad gestionada desde el listado.

En **Administración → Flota vehicular → menú del vehículo → Choferes** se consulta o cambia el chofer habitual, se solicita uso temporal y se revisa el historial. El panel usa tablas, acciones con iconos y ayuda contextual; no añade una sección a la creación técnica del vehículo.

El chofer se selecciona entre membresías activas con rol Chofer de la empresa actual y cuenta activa. Su nombre procede de la identidad empresarial o, si aún no existe, de la cuenta real. Un perfil laboral existente debe estar vigente. No se importan usuarios demostrativos ni se aceptan nombres libres como identidad.

## Responsabilidad y permisos

Los tres permisos siguientes requieren concesión explícita. Ningún rol, incluido Administrador, los hereda automáticamente; una denegación prevalece.

| Acción | Permiso |
| --- | --- |
| Asignar, cambiar o retirar el chofer habitual | `fleet:drivers:assign` |
| Crear una solicitud de uso temporal | `fleet:drivers:request` |
| Aprobar, rechazar o revocar como responsable de Flota/Logística | `fleet:drivers:authorize` |

La lectura requiere `fleet:view`. Administrador conserva la consulta de Flota; Encargado de Operaciones puede entrar a Flota cuando tiene al menos uno de estos permisos específicos. Ese acceso no concede edición técnica de vehículos ni administración de usuarios. Los permisos se gestionan en Usuarios y roles por empresa. Este incremento no concede permisos a ninguna cuenta real.

Cada escritura revalida empresa, cuenta, membresía y permisos actuales dentro de la transacción. La misma comprobación precede a cualquier respuesta idempotente, de modo que una cuenta desactivada o un permiso retirado impiden reutilizar una orden anterior.

## Comportamiento

### Chofer habitual

Asignar o retirar requiere motivo y revisión vigente de la asignación. Cada cambio añade un evento inmutable; retirar guarda un evento sin chofer y conserva los anteriores. La versión de la asignación es independiente de la versión técnica del vehículo.

### Uso temporal

La solicitud contiene chofer, inicio, fin y motivo. Se guarda como pendiente y exige una decisión explícita del responsable. Este puede autorizar una solicitud que él mismo registró para otro chofer; no puede ser el beneficiario de su propia autorización. Aprobar admite una observación opcional; rechazar o revocar requiere motivo.

Las horas se introducen y muestran en **America/Santo_Domingo (UTC−04:00)** y se persisten como instantes UTC. La vigencia incluye el inicio y excluye el fin. Una aprobación no concede uso anterior al instante real de su sello de autorización. El vencimiento se calcula al consultar; no requiere un proceso que reescriba cada fila.

La autorización temporal conserva el chofer habitual. Revocar conserva la aprobación histórica y termina su vigencia; repetir una aprobación anterior no la reactiva. Un vehículo retirado no admite nuevas asignaciones ni solicitudes/decisiones pendientes, pero permite revocar una autorización previamente aprobada.

El cliente no reintenta automáticamente escrituras cuyo resultado sea incierto. Conserva el borrador y exige recargar antes de volver a guardar. Al cambiar de empresa se cancelan solicitudes pendientes y se descartan respuestas del contexto anterior.

## Persistencia y alcance operativo

La migración aditiva `20261031010000_v17_fleet_driver_authority` crea:

- `fleet_driver_primary_events`: historial habitual inmutable, revisión y deduplicación de órdenes.
- `fleet_driver_authorizations`: vehículo, beneficiario e intervalo inmutables, vinculación a ApprovalRequest, sello de autorización y revocación.

Las claves foráneas compuestas mantienen la pertenencia empresarial. Las transiciones y auditorías críticas comparten transacción. Una aprobación genérica del motor ApprovalRequest no habilita por sí sola el vehículo: se exige el sello específico de Flota, con actor, ámbito y tiempo concordantes.

El resolvedor interno `resolveVehicleDriverAuthority` comprueba la asignación habitual o autorización temporal vigente, junto a empresa, vehículo y chofer. El consumidor debe proporcionar un instante del servidor. **Los endpoints históricos de OSI/viajes y el antiguo DriverModule aún no consumen este resolvedor.** Este incremento administra y resuelve autorizaciones persistentes; no afirma bloquear salidas o viajes históricos ni cambia automáticamente disponibilidad o estado En uso.

## Activación del Preview

La función permanece cerrada por defecto. Requiere las compuertas anteriores de Flota y membresías y, sólo en `feature/v17-consolidated-preview`, estas cuatro variables:

| Variable | Valor |
| --- | --- |
| `ADMIN_FLEET_DRIVERS_MODE` | `PREVIEW_REHEARSAL` |
| `VITE_ADMIN_FLEET_DRIVERS_MODE` | `PREVIEW_REHEARSAL` |
| `ADMIN_FLEET_DRIVERS_BATCH` | `V17-FLEET-DRIVER-AUTHORITY-19F` |
| `VITE_ADMIN_FLEET_DRIVERS_BATCH` | `V17-FLEET-DRIVER-AUTHORITY-19F` |

La API también exige las tablas y el registro aplicado de la migración con SHA-256 `3a6db22d52441aa1614e13c0bd619ef4bba84230f9af91a3c794f31496d2bd14`.

### Aplicación controlada de la migración

El hook de build `scripts/v17-fleet-drivers-preview-migrate.mjs` no abre conexión ni ejecuta una operación si `V17_FLEET_DRIVERS_PREVIEW_MIGRATION` está ausente o vale `DISABLED`. Para una adopción explícita se configura temporalmente, sólo en la rama Preview indicada, como `CHECK:<SHA del commit>` y después `APPLY:<mismo SHA>:<SHA del catálogo previo>:<filas del catálogo previo>`, usando los dos valores del resultado CHECK revisado. El hook exige coincidencia exacta con el commit del build y, en APPLY inicial o repetido, con esa huella previa. Ambos modos requieren las compuertas 19F apagadas.

El destino se comprueba en la conexión y en PostgreSQL: base `v17_consolidated_preview_10b`, rama Neon `br-mute-credit-ahxnvfx0`, esquema `osi`, servidor PostgreSQL18 y empresa activa `V17-CONSOLIDATED-PREVIEW-10B`. Se usa DIRECT_URL ya disponible en el entorno del build; no se extrae ni imprime la credencial.

El plan admite sólo 19F pendiente. Contrasta todas las migraciones con los archivos revisados y conserva separadamente la extensión histórica `20260917010000_v17_engineering_crating`, con el checksum previamente documentado. El SQL de esa extensión no está disponible en esta rama y no se reconstruye ni se declara revisado. Su registro y el catálogo preexistente medido deben conservarse exactamente durante esta aplicación aditiva. La huella cubre las ocho categorías fijadas: columnas, enums, restricciones, checks, claves foráneas, funciones, índices y triggers; no es una auditoría de todos los atributos posibles de PostgreSQL.

`CHECK` sólo consulta y publica un resumen sin datos personales. `APPLY` usa Prisma 6.19.2 `migrate deploy`, comprueba el catálogo nuevo contra la evidencia medida y compara el catálogo y registro anteriores antes/después. No usa `db push`, `migrate resolve`, escrituras manuales en el historial, semillas ni concesiones de permisos. Tras verificar la aplicación, se retira la variable de operación y se activan las cuatro compuertas19F. La publicación en Production no forma parte de este incremento.

## Verificación

La evidencia reproducible incluye contratos y transporte HTTP, privilegios explícitos, transacciones/idempotencia, PostgreSQL18.6 real y navegador móvil/escritorio. Los escenarios cubren aislamiento de empresas, concurrencia, permisos retirados, auditoría atómica, vigencia local/UTC, aprobación sin retroactividad, revocación, respuestas inciertas y cambio de contexto.

El catálogo canónico37 se mide por separado del Preview con su extensión histórica. La captura19F debe reproducir íntegramente el catálogo36 al retirar únicamente las dos tablas y dos funciones nuevas. Los perfiles históricos22/35/36 y sus checksums permanecen fijados.

El PR registra los resultados de CI y del despliegue; este documento describe el contrato y no sustituye la evidencia de ejecución. Los ensayos de datos son sintéticos y locales/CI; no crean vehículos, choferes, solicitudes ni permisos reales en Preview.
