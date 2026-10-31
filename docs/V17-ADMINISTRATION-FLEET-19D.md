# Administración · Flota vehicular 19D

## Propósito y alcance

La pantalla histórica de flota conserva vehículos en el navegador, mientras el motor logístico consulta la tabla compartida `osi.osi_vehicles`. Este incremento incorpora esa tabla a **OSI Plus Hub → Administración → Flota vehicular**, con alta, consulta, edición y retiro por empresa.

La ruta es `/administration/fleet`. Usuarios y roles conserva la primera posición en Administración. La ficha incluye código, matrícula, VIN/chasis, tipo, marca, modelo, año, base operativa, capacidades y unidades, dimensiones útiles, estado y vigencia. La lista permite búsqueda, filtros y paginación. Los iconos tienen nombres accesibles y la ayuda se mantiene bajo demanda.

La integración no importa automáticamente los vehículos guardados en el navegador. No añade migraciones ni modifica SQL histórico. Usa el esquema de vehículos ya existente.

## Autoridad y persistencia

- Lectura: membresía activa de Administrador A y permiso efectivo `fleet:view`.
- Escritura: los requisitos de lectura más `fleet:edit`.
- Las denegaciones prevalecen y el servidor vuelve a validar empresa, cuenta, membresía y permisos dentro de la transacción.
- Los permisos históricos `vehicle:*` no se convierten automáticamente en `fleet:*`.
- El contrato admite únicamente campos editables. Empresa, autor, fuente, importación, locks y huellas de creación proceden del servidor.
- Código, matrícula y VIN se comprueban normalizados dentro de cada empresa.
- La edición exige `expectedVersion`; una versión anterior no sobrescribe cambios concurrentes.
- Crear con el mismo `requestId` y contenido devuelve el registro actual. No sustituye ediciones posteriores.
- Una edición sin cambios no incrementa versión ni fecha y no genera auditoría.
- Una escritura y su auditoría crítica se confirman juntas; un fallo de auditoría revierte la escritura.
- La aplicación no reintenta escrituras cuyo resultado de conexión sea incierto. Los reintentos internos se limitan a conflictos de transacción cuyo rollback está confirmado. Sólo la creación también reintenta una violación única revertida para resolver dos altas simultáneas con el mismo identificador de solicitud.

La auditoría conserva actor, acción, referencia, versiones, estados y nombres de campos afectados. No copia la ficha completa, matrícula, VIN ni datos de identidad en sus payloads JSON.

## Estados e historial

| Estado | Uso en 19D |
|---|---|
| Disponible | Puede ofrecerse como disponible en Logística si está vigente y habilitado para cálculos. |
| En uso | Conserva su registro y estado operativo; no incrementa el conteo de vehículos disponibles. |
| No disponible | Se excluye de disponibilidad. |
| Retirado | Conserva la ficha y fecha de retiro; queda disponible para consulta. |

El retiro es terminal en este incremento: la interfaz pide confirmarlo y no ofrece reactivación. No se elimina el registro. Los campos técnicos de vehículos protegidos por un cálculo anterior permanecen bloqueados, mientras los cambios operativos admitidos siguen disponibles.

## Unidades en Logística

El motor selecciona las unidades originales y convierte cada vehículo antes de agrupar capacidades:

| Dato original | Unidad del hecho logístico | Conversión |
|---|---|---|
| KG | kg | Sin cambio numérico |
| LB | kg | Multiplicar por 0.45359237 |
| CBM | m³ | Sin cambio numérico |
| CFT | m³ | Multiplicar por 0.028316846592 |

Las capacidades desconocidas permanecen `null`. La corrección conserva conteos, filtros y versiones, y no modifica los valores almacenados ni los snapshots publicados. Los cálculos pendientes que dependían de la interpretación anterior deben recalcularse si el servidor devuelve `LOGISTICS_INPUT_STALE`.

La disponibilidad actual continúa basada en cantidad de vehículos; esta entrega no introduce asignación automática por capacidad.

## Activación acotada al Preview

Por defecto, las compuertas están desactivadas. La activación requiere las cuatro variables siguientes, limitadas a **Preview / feature/v17-consolidated-preview**:

| Variable | Valor |
|---|---|
| `ADMIN_FLEET_MODE` | `PREVIEW_REHEARSAL` |
| `VITE_ADMIN_FLEET_MODE` | `PREVIEW_REHEARSAL` |
| `ADMIN_FLEET_BATCH` | `V17-ADMINISTRATION-FLEET-19D` |
| `VITE_ADMIN_FLEET_BATCH` | `V17-ADMINISTRATION-FLEET-19D` |

Se preservan los prerrequisitos existentes de membresías 19B e identidad 19C, Auth legado y el cliente de sesión V2 desactivado. El servidor verifica:

- Base: `v17_consolidated_preview_10b`.
- Rama Neon: `br-mute-credit-ahxnvfx0`.
- Esquema: `osi`.
- Empresa: `V17-CONSOLIDATED-PREVIEW-10B`.
- Catálogo de vehículos y auditoría disponibles.

Flota también reconoce su propia rama de desarrollo, pero otras autoridades del Hub, Usuarios y roles e Identidad no reconocen esa rama. Por ello, el recorrido integrado se valida en el consolidado, sin ampliar las autoridades de esos módulos. Producción permanece fuera de esta activación.

## Comprobaciones

Comandos focales:

- `npm run typecheck:v17-admin-fleet`
- `npm run test:v17-admin-fleet`
- `npm run test:v17-admin-fleet:http`
- `npm run test:v17-admin-fleet:browser`
- `npm run test:v17-administration`

La suite `npm run test:v17-admin-fleet:db` requiere el destino canónico desechable de CI: PostgreSQL local en 127.0.0.1:55432, base `osi_db01n_ci`, esquema `osi`, y `CANONICAL_DB_VALIDATION=true`. No admite una conexión de Preview ni fallback a `DATABASE_URL`.

Las pruebas de contrato, HTTP y transacciones simuladas no sustituyen la suite PostgreSQL. La adopción requiere CI completo y comprobación del Preview exacto. La validación visual o de lectura no equivale a haber registrado vehículos reales.

## Continuidad de Administración

El orden acordado es Usuarios y roles → Flota vehicular → zonas y costos por distancia fuera de zona metro en Logística. Después se continúa con Almacenes. Configuración de empresa y preferencias sigue pendiente según su plan propio.

Conductores, sustituciones, combustible, mantenimiento y reservas de vehículos quedan fuera de 19D. Crating se tratará más adelante con la calculadora de madera en OSI Plus Mobile.
