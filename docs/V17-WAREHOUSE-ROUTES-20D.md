# Almacenes 20D: recorridos por identificadores

## Solicitud y referencia funcional

Este incremento ajusta la hoja de organización a la aclaración del usuario: cada almacén puede tener usos, tamaños y divisiones diferentes, y cada recorrido puede omitir distintos niveles. Un cero indica que ese nivel no se utiliza en ese recorrido. No indica inactividad operativa, falta de existencias ni eliminación de una ubicación.

La referencia es el HTML aportado, `IP_Almacen_v0121_organizacion_simple(1).html`, SHA256 `6732b122a8053cf1bcf5d44f13fa8900927a3e79d68e81067b2e36a2e8246389`, junto con la captura de «Crear recorrido de ubicación». Se revisaron `routeWizard`, `routePlan111`, `token09` y `areaFields12`. La captura muestra el almacén existente `ALM-01`, la zona nueva `TRD` y el anaquel nuevo `AA`, sin pasillo, nivel ni posición: `ALM-01-TRD-00-AA-0-0`.

20C ofrecía un generador por cantidades y zonas numéricas. 20D incorpora el recorrido por identificadores y las zonas alfanuméricas de la referencia. La etiqueta completa se sigue componiendo automáticamente; los identificadores de sus partes representan la distribución física. Las cantidades para crear varias ubicaciones siguen siendo una función distinta y secundaria.

## Formatos fijos y niveles omitidos

| Parte | Identificador habilitado | Nivel omitido | Ejemplo |
| --- | --- | --- | --- |
| Almacén | Dos dígitos, `01–99`, asignados automáticamente | No corresponde | `01` |
| Zona | Tres letras o números ASCII | `000` | `TRD`, `MOB`, `A01`, `001`, `00A` |
| Pasillo | Dos dígitos, `01–99` | `00` | `03` |
| Anaquel / rack | Dos letras, `AA–ZZ` | `00` | `AA`, `AZ` |
| Piso del anaquel / nivel | Un dígito, `1–9` | `0` | `2` |
| Localización / posición | Un dígito, `1–4` | `0` | `4` |

Los campos muestran formato y ejemplo junto al dato. Las letras se normalizan a mayúsculas; la zona numérica `1` se convierte en `001` y el pasillo `1` en `01`. Un anaquel `A`, `01` o `R02`, un nivel `01` o una posición `04` no cumplen el formato. La zona `00A` está habilitada: solo el marcador formado enteramente por ceros omite un nivel.

La organización se decide por recorrido. Por ejemplo, dentro de un mismo almacén pueden coexistir una zona con pasillos y otra con anaqueles directos. No hay una máscara global que fuerce la misma distribución en todas las ramas. Un nivel de anaquel requiere un anaquel superior; una posición es terminal. Los campos numéricos mantienen ancho compacto, entrada sin flechas y selección de su contenido al enfocarlos.

## Hoja de organización

El recorrido se prepara dentro de la hoja de trabajo, sin ventana emergente. La persona selecciona los niveles utilizados, escribe sus identificadores y, opcionalmente, nombres. El sistema muestra la etiqueta de destino y diferencia ubicaciones existentes, preparadas en la hoja y nuevas. Las partes omitidas se representan con su cero y no crean filas físicas.

La comparación usa ubicación superior, tipo e identificador confirmado. No interpreta nombres o códigos históricos para adivinar segmentos. Los tramos existentes se reutilizan y solo se añaden los que faltan. Si ya existe el recorrido completo, se abre la ubicación existente y no se emite un comando de creación.

Un almacén todavía sin guardar muestra un prefijo provisional `ALM-??`; no promete un número que aún no ha asignado el servidor. Los nombres y usos existentes no se modifican como efecto secundario de reutilizar un tramo. Si hay una coincidencia ambigua, una ubicación inactiva o datos incompatibles, se pide corregir la hoja y se conserva el trabajo.

El borrador auxiliar del recorrido se conserva por membresía y almacén en la sesión del navegador. Es independiente de la intención de guardado, no tiene requestId y no envía solicitudes. Modificar únicamente ese borrador no habilita un guardado vacío. Al guardar o descartar la hoja se limpia el borrador correspondiente. La intención pendiente mantiene el mecanismo 20C de reintento del mismo comando ante una respuesta incierta.

## Usos, encargado y características

El uso principal y el encargado siguen en la cabecera del almacén; cada ubicación puede tener su propio uso. La asignación de encargado no concede permisos.

Las características o capacidad informativa y las notas siguen en el panel de detalles de la ubicación, con los controles operativos existentes. El HTML de referencia contiene un campo de texto de características/capacidad, no un cálculo depurado de dimensiones. Este incremento no inventa dimensiones ni transforma una nota como «área cubierta de 6 m³» en una capacidad calculada. Tampoco añade un campo distinto llamado «base operativa».

## Contrato, compatibilidad y concurrencia

Se conserva `WAREHOUSE_SHEET_SAVE` y sus rutas. Una fila `CREATE` puede incluir `identifier` cuando 20D está habilitado. Si el campo no está presente, se conserva la asignación automática de 20C. No se añade `identifier: null` ni se normalizan retrospectivamente las intenciones 20C guardadas. Las filas `UPDATE` no admiten cambiar identificador, tipo, identidad o superior.

El servidor vuelve a validar la ruta bajo los bloqueos y versiones de la hoja. Una coincidencia explícita puede reutilizarse solo con nombre y uso compatibles; no implica renombrar ni cambiar el uso. Los identificadores explícitos de un lote se reservan antes de asignar los automáticos para evitar que una fila automática consuma un segmento solicitado. Las respuestas mantienen un mapping único por fila y los controles estrictos del cliente sobre filas faltantes o duplicadas.

La operación sigue siendo atómica y conserva aislamiento por empresa, permisos canónicos, denegaciones explícitas, recibo idempotente y auditoría. Los reintentos de una misma intención reproducen su recibo autorizado; no vuelven a crear ubicaciones. Las validaciones de escritura usan exclusivamente datos sintéticos locales.

## Persistencia y transición de catálogo

Migración40: `20261102010000_v17_warehouse_routes`.

SHA256: `12e651c831b5e761a59ce5381258b2b538d853367c2fee834587f0fa3d7175a1`.

La migración añade `zone_code VARCHAR(3)` nullable y un CHECK a `warehouse_location_addresses`. Un valor alfanumérico debe contener al menos una letra y conservar `zone_number = 0`. Las zonas numéricas siguen usando la columna anterior. La función `v17_warehouse_location_address_guard()` se sustituye explícitamente para componer e heredar la pareja numérica/alfanumérica, mantener la raíz sin zona y preservar la inmutabilidad de las direcciones.

No se modifica la migración39 aplicada. No hay backfill, renumeración ni cambios de identidades, etiquetas antiguas, movimientos o permisos. Antes de activar20D, las consultas usan una selección explícita de columnas20C; así la compilación nueva puede funcionar mientras la columna nueva sigue pendiente. Al apagar20D, las ramas alfanuméricas conservan su identidad y código anterior; las operaciones que necesiten derivar una dirección20D se rechazan de forma explícita.

La evidencia de transición se mide independientemente en PostgreSQL18 y17. Se permiten exactamente dos adiciones de catálogo y el reemplazo de una función. Todos los demás objetos, incluidos los demás objetos de la tabla afectada, se comparan sin excluir la tabla completa. Los perfiles históricos permanecen congelados; el perfil40 registra la nueva definición. Las pruebas verifican también datos anteriores, historial y extensiones.

| Medición local independiente | PostgreSQL 18.6 | PostgreSQL 17.11 |
| --- | --- | --- |
| Objetos antes / después | 10827 / 10829 | 8028 / 8030 |
| Objetos añadidos / funciones sustituidas | 2 / 1 | 2 / 1 |
| Catálogo después, SHA256 | `4e9dab05da616c18b0cddcf9d8a0e0bedb4c5532d9f3cb44006cf7c3a8c89a60` | `4dfeb13c6fb21a57481b59d7988ec25fb4c9f2febbd5d5cd9b6f1ce5ba1db394` |
| Tablas con huella de datos preservada | 259 | 259 |
| Filas anteriores verificadas | 2732 | 705 |
| Direcciones anteriores verificadas | 20 | 10 |

En todas las direcciones anteriores la nueva columna quedó en NULL. La comparación de datos usa las columnas anteriores de esa tabla y comprueba la columna nueva por separado. Los dos replays de Prisma quedaron sin migraciones pendientes. El verificador del hook reconstruyó los dos catálogos39 completos con sus hashes originales, usando las capturas independientes anteriores y posteriores.

## Activación en Preview

Los nuevos modos parten de `DISABLED` y requieren20C y los gates base. Variables: `WAREHOUSE_ROUTES_API_MODE`, `WAREHOUSE_ROUTES_API_BATCH`, `VITE_WAREHOUSE_ROUTES_UI_MODE`, `VITE_WAREHOUSE_ROUTES_UI_BATCH`. El lote es `V17-WAREHOUSE-ROUTES-20D-PREVIEW`.

El hook `V17_WAREHOUSE_ROUTES_PREVIEW_MIGRATION` solo acepta `CHECK:<commit>` o `APPLY:<commit>:<sha256-catalogo-anterior>:<cantidad-objetos>`, vinculados al commit exacto de la rama consolidada en Preview. Verifica la base, rama Neon, empresa, versión del servidor, historial y checksums. Solo40 puede estar pendiente; la extensión histórica documentada se conserva sin afirmar revisión de su SQL ausente.

CHECK mantiene20D apagado y mide el catálogo anterior completo. APPLY exige ese mismo hash y solo permite la transición medida. Para verificar un replay ya aplicado, se reconstruye la medición anterior sustituyendo exclusivamente la función revisada por su definición39 y retirando las dos adiciones40. Una alteración de cualquier otro objeto invalida la comprobación. Prisma ejecuta y registra la migración; el hook no escribe manualmente el historial.

La entrega requiere pruebas del commit exacto, merge a Preview consolidada, CHECK, APPLY, desactivación del hook, activación de los cuatro gates20D y verificación del despliegue y alias. Los cambios de esta entrega no se promueven a main ni a Production.

## Verificación local

- Formatos compartidos, contrato y HTTP: 9, 12 y 11 casos, respectivamente.
- Cliente20D: 24 casos; regresión del cliente20C: 18 casos.
- Navegador20D: 18 ejecuciones en escritorio y móvil. Comprueban la captura TRD/00/AA/0/0, apertura sin POST, ramas diferentes, formatos, borradores, reintento exacto, controles compactos y ausencia de desbordamiento, incluido el ancho intermedio de1024px. Las capturas de ambos tamaños se revisaron visualmente.
- Regresión de navegador20C con20D apagado: 22 ejecuciones; las etiquetas anteriores de20B se conservan cuando20D está apagado.
- Hook de Preview: 11 casos, incluidos cambios fuera del reemplazo permitido y pin de CHECK para replay.
- Captura de catálogo: 39 casos positivos y negativos; baseline canónico: 191 aserciones; inventario: 37 comprobaciones.
- Dominio20D: 11 casos en PostgreSQL18 y los mismos11 en PostgreSQL17. Incluyen reutilización, conflictos atómicos, reserva de identificadores explícitos, pérdida de respuesta, concurrencia e aislamiento.
- Regresión del dominio20C: 14 casos en cada motor.
- Guard adversarial de referencias públicas: 121 casos; guard de mutacionesCRM: 25; guard de membresías: 30.
- Compilación de la aplicación, lint de los archivos afectados, typecheck enfocado en Almacenes y validación sintáctica de los cuatro workflows.

La suite `v17-warehouse-routes-legacy-db-test.mjs` se ejecuta en la fase39 de CI, con el cliente generado desde40 y antes de que exista `zone_code`. Comprueba lectura, creación, edición y replay20C, y el rechazo de identificadores20D cuando su modo está apagado. Esta comprobación se mantiene separada de las suites completas ejecutadas después de40.
