# Almacenes 20B: usos, características y controles

## Continuidad y alcance

Este incremento continúa 20A en `feature/v17-consolidated-preview`. Toma como referencia funcional el HTML aportado por el usuario, `IP_Almacen_v0121_organizacion_simple(1).html` (SHA256 `6732b122a8053cf1bcf5d44f13fa8900927a3e79d68e81067b2e36a2e8246389`). El HTML se revisó como prototipo; sus selectores de usuario, roles y almacenamiento local no constituyen autorización ni datos compartidos del ERP.

La navegación presenta Organización y catálogo (Espacios y ubicaciones, Configuración) y Control de inventario (Materiales, Herramientas y equipos), según los permisos existentes. No aparecen páginas operativas vacías.

Configuración permite crear, editar e inactivar usos de área con códigos automáticos e inmutables. La finalidad —interna, depósito de clientes o mixta— describe el uso, sin inferir propiedad, ocupación ni movimientos. Los usos se asignan explícitamente a ubicaciones. Inactivar un uso conserva las asignaciones actuales y evita asignaciones nuevas. El catálogo comienza vacío.

Las ubicaciones admiten características informativas y notas, además de controles separados para estado operativo y disponibilidad de despacho. Los códigos, referencias públicas y jerarquías existentes se conservan. Las características no calculan capacidad ni ocupación.

Se mantienen formularios compactos, acciones por icono y ayuda contextual. Los campos numéricos reutilizan el componente compacto sin flechas y con selección del valor al entrar. La recuperación de una operación pendiente usa una única intención por membresía entre Espacios y Configuración: no se emite una segunda escritura mientras el resultado anterior sea incierto. Un rechazo de negocio confirmado permite editar y generar una intención nueva.

## Significado de los controles

| Condición efectiva | Recibir / devolver | Despachar / reservar / asignar |
| --- | --- | --- |
| Activo, según condición operativa | Permitido por este control | Permitido por este control |
| Activo, despachos bloqueados | Permitido por este control | Bloqueado |
| Restringido o fuera de servicio | Bloqueado | Bloqueado |
| Restricción en almacén o ubicación superior | Se hereda | Se hereda |

El estado del registro de almacén/ubicación también se conserva como restricción. Un descendiente no puede anular una restricción superior. Los formularios muestran la condición propia, la efectiva, el origen y el motivo.

Cambiar cualquiera de los dos controles, en cualquier dirección, exige motivo nuevo y confirmación de impacto. El servidor rechaza el cambio cuando existen reservas de materiales RESERVED/ASSIGNED, reservas de equipos ACTIVE o asignaciones PLANNED/ACTIVE en el ámbito afectado, incluidos destinos y descendientes. Las reservas de equipo que siguen ACTIVE cuentan aunque su intervalo haya terminado.

Liberar/cancelar compromisos sigue permitido. La devolución de un equipo puede dirigirse a otra ubicación activa aunque su origen esté cerrado. Los registros no físicos, como inspecciones, incidencias, costos y mantenimiento, mantienen su comportamiento. Los controles no borran ni alteran existencias, reservas o custodia.

## Inventario y cálculo logístico

Materiales conserva sus saldos físicos, reservados, asignados y disponibles. Añade cantidades despachables y bloqueadas; la disponibilidad operativa de la interfaz utiliza la cantidad despachable cuando 20B está activo. Los equipos disponibles deben cumplir también los controles de su ubicación.

Los nuevos cálculos logísticos usan existencias y equipos de ubicaciones habilitadas, manteniendo evidencia de cantidades físicas y bloqueadas. Los cálculos y publicaciones ya guardados mantienen sus instantáneas.

Las mutaciones comparten un bloqueo por empresa antes de los bloqueos de recursos. Una revisión de política persistida evita que una transacción Serializable, cuyo snapshot se creó mientras esperaba, use controles antiguos. Los reintentos son acotados; una respuesta ya registrada se reproduce antes de incrementar esa revisión. Las pruebas de concurrencia cubren ambos órdenes de cambio de control frente a recepción, reserva, devolución y asignación.

## API y permisos

| Método | Ruta | Permisos |
| --- | --- | --- |
| GET | `/api/materials/warehouse-configuration` | `inventory:stock:view` |
| POST | `/api/materials/warehouse-uses` | Stock view + catalog manage |
| PATCH | `/api/materials/warehouse-uses/[useRef]` | Stock view + catalog manage |
| PATCH | `/api/materials/warehouses/locations/[locationRef]/configuration` | Stock view + catalog manage |

Las denegaciones explícitas prevalecen. Se conservan aislamiento por empresa, contexto autenticado, origen privado, límites de cuerpo, versión esperada, requestId/hash, recibo y auditoría atómicos. No se conceden permisos como parte de 20B.

## Activación

Las variables nuevas parten de DISABLED y no consultan tablas nuevas cuando están apagadas:

| Variable | Preview consolidada |
| --- | --- |
| `WAREHOUSE_CONFIGURATION_API_MODE` | `PREVIEW_REHEARSAL` |
| `WAREHOUSE_CONFIGURATION_API_BATCH` | `V17-WAREHOUSE-CONFIGURATION-20B-PREVIEW` |
| `VITE_WAREHOUSE_CONFIGURATION_UI_MODE` | `PREVIEW_REHEARSAL` |
| `VITE_WAREHOUSE_CONFIGURATION_UI_BATCH` | `V17-WAREHOUSE-CONFIGURATION-20B-PREVIEW` |

El servidor y la interfaz exigen la rama consolidada y los controles base de Materiales. LOCAL_ONLY queda limitado al entorno local. Production no se activa.

## Migración y medición

La migración 38, `20261101010000_v17_warehouse_configuration`, añade únicamente `warehouse_area_uses`, `warehouse_location_configurations` y `warehouse_location_policy_epochs`, sus enums, índices, claves y guards. No cambia columnas de tablas existentes ni incorpora semillas. SHA256 SQL: `4fd765d2090163512be0f58d6eda3be59ad9b35fbfaf1e7b11a679f194d080d5`.

| Medición local independiente | PostgreSQL 18.6 | PostgreSQL 17.11 |
| --- | --- | --- |
| Objetos de catálogo antes | 10679 | 7919 |
| Objetos después | 10766 | 7984 |
| Objetos nuevos | 87 | 65 |
| SHA256 catálogo después | `10a5e45e358155d6e948f44b72b0e0840061703ec6a11085719b41767f89c642` | `605bf48da7cc19e8c2806587815ef08e37aeadf9912fa19a8c2402726a789b80` |
| SHA256 delta | `c98f78bb81cf4cbeddd858e55ec7acffacf8ebffe11b85c411a4e94220c71fce` | `aee44a0d5c03a6ee000b4e4767906100b42ac9e90ee0b4a50febeae628f9f95e` |

La diferencia de conteo procede de la representación de NOT NULL en el catálogo de PG18. Cada versión tiene un fixture medido separado. Se verificaron deploy, replay, preservación del catálogo y ledger previos, y diff Prisma vacío en PG18. El perfil canónico 38 añade cinco CHECK, dos funciones y tres triggers al inventario SQL-only. Los perfiles históricos permanecen congelados. La prueba histórica de flota continúa aplicando exactamente 36→37 mediante directorios aislados aunque el código fuente contenga 38 migraciones.

El build hook de Preview permanece inerte sin una operación explícita vinculada al SHA desplegado. CHECK valida destino, rama Neon, tenant, ledger completo, checksum SQL, tablas, catálogo y delta por versión. APPLY exige el catálogo anterior observado por CHECK y permite únicamente 20B pendiente; Prisma ejecuta la migración y administra el ledger. Se comprueba que el historial y catálogo anteriores no cambian. La extensión histórica `20260917010000_v17_engineering_crating` se conserva con su checksum documentado, sin reconstruir su SQL ni afirmar que se ha revisado su fuente. Las credenciales permanecen en el entorno de construcción y no se imprimen.

Secuencia de entrega: CI del commit exacto → merge a Preview consolidada → CHECK con 20B apagado → APPLY del mismo commit y catálogo verificado → desactivar operación de migración → activar los cuatro gates solo en Preview → redeploy y comprobar assets servidos y alias. Las pruebas de escritura usan únicamente bases locales desechables y datos sintéticos.

## Siguientes incrementos

Los flujos del HTML de escaneo, etiquetas/alias de códigos, lockers y llaves, entregas/recepciones, custodia, conteos con revisión independiente, bienes de clientes y expedientes se desarrollarán por alcance operativo. Leer un QR no autorizará por sí mismo una operación. La eventual importación de datos del prototipo requerirá su respaldo exportado; el HTML no contiene el localStorage del navegador del usuario.
