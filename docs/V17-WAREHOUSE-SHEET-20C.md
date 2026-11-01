# Almacenes 20C: hoja de creación y organización

## Solicitud y referencia

Este incremento responde a la solicitud de crear y editar un almacén en una hoja dentro de la página, con usos, encargado, pasillos, estanterías y niveles. Continúa la configuración 20B y conserva las preferencias de campos compactos, códigos automáticos y números sin flechas, con selección del valor al entrar.

La referencia funcional es el HTML aportado por el usuario, `IP_Almacen_v0121_organizacion_simple(1).html`, SHA256 `6732b122a8053cf1bcf5d44f13fa8900927a3e79d68e81067b2e36a2e8246389`, y su captura de Reglas de codificación. El prototipo admite segmentos escritos manualmente; la hoja asigna esos segmentos automáticamente, siguiendo la preferencia posterior del usuario. Sus roles simulados y su almacenamiento local no se trasladan como autorización o datos reales.

## Hoja de trabajo

Espacios y ubicaciones permite abrir una hoja en la misma página. La cabecera contiene nombre, uso principal y encargado. Las filas identifican tipo, nombre, ubicación superior, uso y etiqueta automática. Las ubicaciones nuevas se agregan explícitamente y se revisan antes de guardar. Un generador por cantidades permite revisar el total antes de añadir las filas: 2 pasillos × 3 estanterías × 4 niveles produce 2 pasillos, 6 estanterías y 24 niveles, 32 filas en total. Sus parámetros todavía no aplicados no bloquean el guardado de las filas ya preparadas. Una sola operación guarda cabecera y filas; si una fila falla, se revierte toda la operación.

Los registros existentes admiten cambios de nombre y uso. Su identidad, tipo y ubicación superior se conservan. Las filas omitidas de un comando no se borran. El traslado o la eliminación de ubicaciones existentes no forma parte de esta hoja.

La hoja conserva el trabajo editable al ir a Configuración para crear un uso. Ese borrador es independiente de la intención enviada y no inicia solicitudes. También permite descartarlo explícitamente cuando no hay un resultado pendiente. La búsqueda del listado acepta nombres, códigos anteriores y etiquetas nuevas.

La creación y edición de usos, los detalles de una ubicación y sus controles operativos se presentan en paneles dentro de la página. Los controles conservan las reglas 20B de motivo, confirmación de alcance, compromisos activos e influencia de ubicaciones superiores.

Cada ubicación admite un uso del catálogo; sus áreas interiores pueden tener usos diferentes. Esta asignación no declara propiedad, ocupación ni capacidad, y tampoco cambia por sí misma los permisos de despacho.

## Encargado

El encargado se selecciona entre membresías canónicas de la misma empresa, con usuario y membresía activos y condición laboral elegible cuando existe un perfil de empleado. Las fechas se comparan con el día de la zona horaria configurada de la empresa, no con la zona del servidor. Todos los roles internos del catálogo pueden ser elegibles; los oficios PA/PB/PC/PD/PF/PE también son personal interno. La búsqueda expone solo referencia pública y nombre, y requiere los permisos de consulta de existencias y gestión del catálogo.

La asignación del encargado es una responsabilidad registrada. No concede ni cambia permisos. Una asignación existente deja constancia de la persona aunque deje de ser elegible; una asignación nueva exige elegibilidad actual. «Sin asignar» permite crear el almacén cuando todavía no se ha designado a esa persona.

## Jerarquía y etiquetas

| Elemento | Segmento automático | Ausencia del elemento |
| --- | --- | --- |
| Almacén | `01–99` por empresa | No aplica |
| Zona | `001–999` | `000` |
| Pasillo | `01–99` | `00` |
| Estantería / anaquel | `AA–ZZ` | `00` |
| Nivel del anaquel | `1–9` | `0` |
| Posición / localización | `1–4` | `0` |

Ejemplo de la referencia: `ALM-03-000-01-AZ-9-4`. Identifica el almacén 03, sin zona intermedia, pasillo 01, estantería AZ, nivel 9 y posición 4.

El orden es almacén → zona → pasillo → estantería → nivel → posición. Se pueden omitir elementos intermedios; un cero no crea una ubicación física. Un nivel requiere una estantería superior, y una posición no admite ubicaciones interiores. Los segmentos se asignan bajo transacción; la vista previa es orientativa hasta recibir la confirmación del servidor. Las asignaciones inactivas no liberan números ni etiquetas para reutilización.

Las etiquetas son una presentación adicional de las ubicaciones. Los códigos y referencias públicas anteriores permanecen intactos, junto con sus movimientos, reservas, equipos y demás vínculos. Una ubicación histórica cuya jerarquía no encaja en este formato conserva su código y puede seguir editándose en sus datos compatibles. No se deducen segmentos a partir de nombres antiguos ni se crean equivalencias de QR.

## Contrato y concurrencia

| Método | Ruta | Uso |
| --- | --- | --- |
| GET | `/api/materials/warehouse-sheets` | Consultar hojas y etiquetas guardadas |
| POST | `/api/materials/warehouse-sheets` | Guardar una hoja completa mediante `WAREHOUSE_SHEET_SAVE` |
| GET | `/api/materials/warehouse-sheets/manager-options` | Buscar personas elegibles de la misma empresa |

La lectura exige `inventory:stock:view`. El guardado y la búsqueda de encargados exigen también `inventory:catalog:manage`; las denegaciones explícitas prevalecen. Los endpoints conservan origen privado, autenticación y aislamiento por empresa.

El comando incluye versiones esperadas del almacén, perfil, configuración de raíz y filas existentes, un requestId, hash del contenido y hasta 200 cambios de fila. Las filas nuevas se vinculan mediante identificadores temporales; el servidor valida referencias, orden y ciclos antes de persistir. No se aceptan códigos, segmentos, identidades o permisos como campos editables.

El guardado comparte el bloqueo de política por empresa con 20B y los consumidores de inventario, seguido de los bloqueos del comando y almacén. La reproducción del recibo ocurre antes de avanzar la revisión de política. Los reintentos Serializable son acotados. Recibo y auditoría se guardan en la misma transacción que el almacén, sus ubicaciones, usos, encargado y etiquetas.

La interfaz conserva una sola intención pendiente por membresía entre Espacios y Configuración. Ante una respuesta incierta mantiene los datos y reintenta el mismo requestId; no dispara otro guardado silencioso. Los rechazos confirmados permiten corregir la hoja y enviar una intención nueva.

## Persistencia y medición

La migración 39, `20261101020000_v17_warehouse_sheet`, añade únicamente dos tablas, sus restricciones e índices y dos funciones con triggers:

- `warehouse_sheet_profiles`: número de almacén, referencia al encargado y versión.
- `warehouse_location_addresses`: etiqueta y segmentos inmutables vinculados a una ubicación.

SHA256 del SQL: `8acd3ee3669de51ad9064e3a97927257606035ea4fef1d64e481f96884244de3`. No altera columnas ni restricciones de tablas anteriores, no incorpora semillas y no asigna etiquetas en segundo plano. El trigger de dirección comprueba empresa, almacén, ubicación, perfil, etiqueta calculada, orden físico y segmentos heredados. La identidad de los perfiles y todas las direcciones son inmutables; no se permite borrar asignaciones para reutilizar sus números.

| Medición local independiente | PostgreSQL 18.6 | PostgreSQL 17.11 |
| --- | --- | --- |
| Objetos antes | 10766 | 7984 |
| Objetos después | 10827 | 8028 |
| Objetos nuevos | 61 | 44 |
| SHA256 catálogo después | `c9ec38f5e35c159bc23dfaa3a6a43aecdac90aeb1bc53183bdceaf73ba72c56c` | `53d6a653c23bc21b26d48be6ff270a3633244188ff17b94ccd0ae784e1e4043b` |
| SHA256 delta | `cbeaa31c321328a90a0e82da6200089d76a343adde2fed4c8976321535b5cfa0` | `202ec4437d84406f64a20f348a0bfdfb810ac54136218f6153fc9b2810e65b09` |

Ambas mediciones conservan el catálogo anterior y sus extensiones. PostgreSQL 17 verifica además el historial completo anterior sin cambios. La diferencia entre los conteos de ambas versiones corresponde a la representación de NOT NULL en PostgreSQL 18. El inventario SQL-only añade cuatro CHECK, dos funciones y dos triggers. El diff Prisma de PostgreSQL 18 está vacío.

Los perfiles históricos permanecen congelados. CI mantiene las fases históricas de flota 36→37 y configuración 37→38 en directorios aislados, y añade la transición 38→39. Los antiguos runners de Preview continúan rechazando fuentes con migraciones posteriores a su incremento autorizado.

## Activación de Preview

Los gates nuevos parten de DISABLED. La hoja exige los gates base de Materiales y Configuración 20B y, para Preview, la rama consolidada y el lote `V17-WAREHOUSE-SHEET-20C-PREVIEW`.

Variables: `WAREHOUSE_SHEET_API_MODE`, `WAREHOUSE_SHEET_API_BATCH`, `VITE_WAREHOUSE_SHEET_UI_MODE`, `VITE_WAREHOUSE_SHEET_UI_BATCH`.

El hook `V17_WAREHOUSE_SHEET_PREVIEW_MIGRATION` queda inerte sin operación explícita vinculada al SHA exacto desplegado. CHECK valida destino, rama Neon, empresa, checksums, historial y catálogo. APPLY queda vinculado a la medición anterior de CHECK y solo acepta 20C pendiente. Prisma ejecuta y registra la migración. Se conserva la extensión histórica `20260917010000_v17_engineering_crating` con su checksum documentado, sin reconstruir ni afirmar revisión de su SQL.

Secuencia de entrega: pruebas del commit exacto → merge a Preview consolidada → CHECK con 20C apagado → APPLY del mismo commit y catálogo comprobado → desactivar la operación de migración → activar los cuatro gates solo en Preview → verificar despliegue y alias. La verificación de escritura utiliza exclusivamente datos sintéticos en bases locales desechables.

## Verificación local

- Contratos, HTTP, cliente/borradores, direcciones y runner de migración: 52 casos.
- Dominio de la hoja: 14 casos en PostgreSQL 18 y los mismos 14 en PostgreSQL 17.
- Catálogo canónico: 177 aserciones, transición y replay de migración, diff Prisma vacío y perfiles históricos conservados.
- Usos y consumidores de inventario 20B: 33 casos de regresión en PostgreSQL 18.
- Autorización: 118 aserciones, incluidas 113 negativas; CORS: 106 aserciones.
- Interfaces anteriores: 36 casos 20A y 20 casos 20B en escritorio/móvil, adaptados a paneles en la página.
- Hoja 20C: 22 escenarios verificados entre escritorio y móvil, con capturas revisadas y sin desbordamiento horizontal de la página.

Las pruebas de la hoja revisan la creación completa, generación por cantidades, omisión de niveles, edición dispersa, recuperación de trabajo al crear usos, recuperación de una respuesta perdida sin duplicar registros, respuestas incompletas, permisos y ausencia de consultas cuando los gates están apagados. Las capturas usan exclusivamente datos sintéticos.
