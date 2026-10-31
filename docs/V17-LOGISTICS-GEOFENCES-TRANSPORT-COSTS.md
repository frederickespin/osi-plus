# Motor Logístico: geocercas y costos de transporte

**Alcance funcional aclarado y actualización solicitada por el usuario el 31 de octubre de 2026.** La implementación descrita en la sección «Entrega de zonas y transporte» incorpora este alcance al Preview consolidado. La configuración empresarial real sigue pendiente de los límites, tarifas y políticas que indique la empresa.

## Propósito confirmado

El Motor Logístico debe administrar las geocercas para operaciones y cotizaciones y determinar los costos de transporte asociados a zonas y localidades de República Dominicana. Debe permitir un índice multiplicativo o renglones de costo, incluyendo combustible según rendimiento en km por galón, peajes, dietas y viáticos.

El resultado se utiliza en tres momentos:

| Contexto | Resultado esperado |
|---|---|
| Cotización | Prever el costo de transporte antes de ofrecer el servicio, considerando zona, recorrido, recursos y reglas aplicables. |
| Ejecución del servicio | Calcular o actualizar los costos asociados a las localidades atendidas, especialmente fuera de la zona metropolitana. |
| Visita presencial | Calcular y consultar el costo del desplazamiento asociado a la visita presencial fuera de la zona metropolitana. |

La zona metropolitana debe quedar delimitada expresamente por la empresa. No se presupone un perímetro, una lista de municipios, tarifas, rendimientos ni factores económicos reales.

## Modelo funcional propuesto

### Geocercas, zonas y recorridos

Administración debe permitir identificar las zonas por código y nombre, definir sus límites geográficos, reconocer las localidades cubiertas y distinguir la zona metropolitana de otras zonas. Una ubicación debe poder resolverse contra esos límites con un resultado explicable. Una región guardada por nombre o una etiqueta METRO/INTERIOR no sustituye esa evaluación geográfica.

El recorrido debe identificar el punto real de salida, los destinos y las paradas. La distancia usada para combustible debe corresponder al recorrido vial confirmado; la distancia en línea recta o el radio de una geocerca no se deben tratar automáticamente como kilómetros recorridos. La fuente de rutas/distancias y cualquier entrada manual autorizada deben quedar identificadas.

Las geocercas y reglas deben contemplar ubicaciones en el límite, zonas superpuestas y ubicaciones sin clasificación. Los solapamientos requieren una prioridad explícita o una incidencia pendiente de resolución. Estar fuera de zona metro no equivale por sí solo a estar fuera de cobertura operativa.

### Cálculo por factor

Cada regla zonal podrá asociar un factor a una base de transporte definida:

`Costo zonal = base de transporte × factor de la zona`

La base, la moneda, los conceptos incluidos y la vigencia deben ser visibles. El factor no se aplica de manera implícita al total de la cotización. Si se combinan un factor y renglones adicionales, deben sumarse únicamente conceptos que la base no incluya.

### Cálculo por renglones

| Concepto | Base de cálculo propuesta |
|---|---|
| Combustible | Kilómetros del recorrido ÷ rendimiento en km/galón × precio por galón. |
| Peajes | Tarifa aplicable al vehículo y al peaje × cantidad de pasos previstos. |
| Dietas | Personas elegibles × días o jornadas cubiertas × tarifa aplicable. |
| Viáticos | Conceptos autorizados con cantidad, unidad y tarifa; indicar si ya incluyen dieta, alojamiento u otro gasto. |
| Otros gastos de transporte | Conceptos explícitamente configurados y aplicables al recorrido, sin sustituir datos faltantes por importes supuestos. |

Para varios vehículos o recorridos, el combustible es la suma de cada cálculo: `Σ(km del tramo ÷ rendimiento aplicable × precio del combustible)`. Deben contemplarse los viajes necesarios, el regreso cuando corresponda y las paradas. No se duplica toda distancia por defecto si el dato de entrada ya incluye ida y vuelta.

El rendimiento puede proceder del vehículo o de un perfil de categoría aprobado, indicando cuál se utilizó. No se infiere a partir de marca, matrícula, capacidad o tipo sin una configuración respaldada. El precio y el rendimiento deben usar la misma definición de galón y el combustible correspondiente. Las cantidades continuas, como galones, requieren precisión decimal propia; no deben heredar el redondeo a unidades enteras usado para recursos discretos.

Las políticas de dietas y viáticos deben indicar qué cubre cada concepto. La clasificación metropolitana puede cambiar las reglas aplicables, pero no convierte automáticamente todo transporte dentro de ella en costo cero.

### Un cálculo compartido en los tres contextos

Los tres recorridos funcionales deben consumir el mismo mecanismo de zonificación y cálculo, con perfiles que permitan diferencias justificadas entre una visita y un servicio. Cada resultado debe identificar el caso, el desplazamiento o visita, el propósito del cálculo y las versiones de sus entradas. Una visita no debe sustituir el plan del servicio ni duplicarse al incorporarse a la cotización.

El perfil de visita debe poder estimarse con sus propios datos de desplazamiento, sin depender de que el levantamiento que esa visita producirá esté terminado.

La cotización conserva la estimación y las tarifas utilizadas en su revisión. Durante la operación, un cambio de ruta, vehículo, viajes o personal puede originar un cálculo actualizado, con su diferencia respecto al anterior; no debe modificar silenciosamente una cotización ya emitida o aceptada.

El costo interno de la visita debe distinguirse del importe que se decide cobrar al cliente. Una visita gratuita o exonerada conserva su costo interno. El tratamiento comercial de ese importe sigue las reglas de Cotización y los acuerdos aplicables.

El alcance confirmado incluye el cálculo durante el servicio. Una rendición completa de gastos reales, comprobantes y liquidaciones requeriría un alcance adicional; no se presupone como consecuencia de esta aclaración.

## Base revisada antes de esta entrega

La configuración y el resultado que ve el usuario deben estar articulados desde Motor Logístico. Internamente pueden seguir colaborando Geografía, Logística, Costos, Cotización y Agenda, conservando sus autoridades y versiones.

| Base actual revisada | Trabajo necesario |
|---|---|
| Regiones y reglas zonales históricas con tarifas por km, factores y mínimos. | Revisar y adaptar su persistencia a una integración canónica activa con geocercas y reglas por localidad. |
| Reglas del Motor 07A que producen cantidades, horas, viajes y necesidades. | Incorporar la resolución geográfica y las entradas específicas del transporte mediante un contrato explícito. |
| Administración con un editor genérico de reglas. | Ofrecer gestión empresarial de zonas, perímetros, factores, tarifas y perfiles de consumo. |
| Costos versionados que valoran cantidades y alimentan Cotización. | Incorporar los conceptos y cantidades del transporte, sus fuentes y el factor cuando corresponda. |
| Agenda con resumen logístico y cobro de visita. | Mostrar el costo interno completo del desplazamiento y mantenerlo diferenciado del cobro. |

El contrato vigente de 07A rechaza claves monetarias en sus reglas y redondea hacia arriba las cantidades calculadas. Agregar precios o fórmulas de combustible a su JSON actual no sería una integración válida. El adaptador geográfico histórico se declara experimental y no está importado por rutas activas. La incorporación debe coordinar un contrato nuevo o una extensión versionada con Costos, sin presentar componentes históricos como funcionalidad ya habilitada.

## Entrega de zonas y transporte

El contrato `V17_TRANSPORT_ZONES_V1` incorpora un editor de zonas con mapa, geocercas poligonales, prioridad, perfil vehicular y propósitos aplicables. La administración mantiene reglas generales como configuración secundaria. No se migran ni se activan automáticamente los registros geográficos experimentales anteriores.

La política operativa se versiona en `LogisticsRule` y referencia tarifas exactas de `CostingRule`. La activación de una zona y sus tarifas ocurre en una sola transacción; un borrador conserva la configuración activa anterior. Los editores genéricos no pueden crear ni modificar este espacio de configuración. No hay cambios de esquema ni nuevas migraciones.

### Uso en la aplicación

1. En **Administración → Motor Logístico → Zonas**, crear el perímetro, identificarlo como Metro o Interior y definir su prioridad y perfil vehicular. Un perímetro admite un anillo exterior de hasta 200 vértices, sin cruces.
2. Elegir **Renglones** o **Factor**. Registrar la moneda y las tarifas; en combustible, rendimiento, tipo de galón y combustible. Registrar los conceptos incluidos en la base o en otros paquetes para impedir duplicados.
3. Guardar como borrador o activar la configuración. Las tarifas vacías permanecen pendientes, incluso si la zona está activa.
4. En **Transporte**, elegir un caso real y el propósito Cotización, Servicio o Visita presencial. Las visitas se vinculan a una decisión presencial vigente. Introducir salida, destino, kilómetros de carretera y su fuente, viajes, regreso y cantidades complementarias.
5. Calcular, revisar el desglose y publicar cuando no haya pendientes. Para cotizar, continuar con Costos y Cotización. La pestaña Costos incluye el cálculo de transporte de la cotización; Agenda incluye el de su visita.

El mapa permite trazar zonas y localizar puntos. **No hay proveedor de rutas, geocodificación automática ni seguimiento GPS en esta entrega.** Los kilómetros deben confirmarse manualmente con su fuente. Los tramos o desplazamientos adicionales se registran como recorridos separados; el motor no infiere paradas, peajes ni cantidades de personas.

### Reglas de cálculo y trazabilidad

| Concepto | Regla implementada |
|---|---|
| Zona | Destino dentro del polígono, incluyendo su límite; perfil vehicular exacto antes del genérico y luego prioridad. Un empate bloquea el cálculo. |
| Distancia total | Kilómetros introducidos × 2 si regresa al origen × viajes. El número introducido representa el recorrido de salida. |
| Combustible | Distancia total ÷ km/galón, conservando cuatro decimales de cantidad; precio del mismo tipo de galón. |
| Factor | Tarifa base × factor, redondeada a seis decimales; cantidad = viajes. Sólo afecta el renglón base. |
| Dietas | Personas × jornadas, sin multiplicación adicional por viajes. |
| Peajes y cantidades fijas | Cantidad total explícita por renglón; ya debe incluir regreso y viajes. El motor no vuelve a multiplicarla. |
| Importes | Cantidad con cuatro decimales × tarifa con seis decimales; subtotal con seis decimales. |
| Datos faltantes | Cantidad, tarifa o total pendiente; se bloquea la publicación, sin sustituirlos por cero. Un cero explícito de cantidad sigue siendo válido. |

Las monedas se totalizan por separado. Los márgenes y la conversión monetaria siguen siendo autoridad de Costos; el cálculo interno no inventa márgenes ni implica cobro al cliente. El resultado muestra la tarifa base, el factor aplicado y el rendimiento/unidad de combustible capturados.

Cada cálculo conserva el caso, la versión de ruta, la revisión real de Servicios y su propósito. Una visita puede calcularse antes del levantamiento; requiere un caso con revisión de Servicios, sin inventar referencias. Cotización, Servicio y cada decisión de visita mantienen publicaciones independientes aunque compartan la secuencia histórica del plan. Los registros previos sin contexto explícito siguen siendo de Cotización.

La publicación revalida las entradas, el actor, los vehículos seleccionados y las zonas/tarifas vigentes. Si cambiaron, exige recalcular. Costos vuelve a verificarlo antes de publicar su revisión. Las cotizaciones ya publicadas conservan sus snapshots. Las reglas generales antiguas de transporte que también apliquen producen una incidencia que debe resolverse antes de sumar los nuevos renglones.

### Permisos y verificación

La configuración económica requiere conjuntamente los permisos de reglas de Logística y Costos. Leer, calcular y publicar transporte exige los permisos correspondientes de ambos módulos. Ambos gates deben estar habilitados en el entorno permitido; el alcance por empresa y propietario de caso se verifica en servidor y los permisos del actor se releen en la misma transacción.

La entrega incorpora pruebas de geometría, aritmética decimal, coberturas, contratos cerrados, autorización, concurrencia, rollback y separación de contextos. El circuito local con PostgreSQL17 comprueba guardar → calcular → publicar → valorar en Costos, con 37 migraciones existentes y sin Survey obligatorio. CI añade la misma integración a PostgreSQL18. Las pruebas de navegador cubren escritorio y móvil con datos sintéticos aislados; ningún ejemplo se carga como configuración empresarial en Preview.

## Configuración empresarial por definir

- Perímetro de zona metropolitana, demás zonas/localidades, cobertura y prioridad ante solapamientos.
- Orígenes de despacho y fuente de recorridos/distancias, incluyendo la política de regreso y paradas.
- Base y factor de cada zona, o renglones aplicables, con sus conceptos incluidos.
- Rendimientos de vehículos o categorías, definición de galón, combustible, moneda y precios vigentes.
- Peajes por ruta y categoría vehicular, políticas de dietas y viáticos y personas/jornadas elegibles.
- Responsables y permisos para administrar o autorizar cambios. Flota/Logística es el responsable funcional propuesto, sin asignar cuentas ni ampliar permisos automáticamente.

Los datos faltantes deben producir un resultado pendiente claramente identificado. No deben convertirse en cero ni en una tarifa ficticia que haga parecer completo un presupuesto.

## Presentación y secuencia de entrega propuestas

La interfaz debe conservar el criterio minimalista del proyecto: listas compactas, búsqueda, filtros, acciones por fila, campos numéricos de ancho apropiado y ayudas bajo demanda. Los perímetros requieren una vista de mapa; los costos, una tabla con concepto, base, cantidad, unidad, tarifa y subtotal. Los detalles técnicos del contrato no son campos que deba completar el usuario de negocio.

1. Definir y administrar geocercas, zonas y fuentes de recorrido, junto con el catálogo de conceptos, factores y perfiles de consumo.
2. Construir el cálculo de transporte con precisión, monedas, fuentes, vigencias y desglose reproducible.
3. Integrarlo en cotización, ejecución del servicio y visita presencial, conservando la identidad y el historial de cada contexto.
4. Verificar el recorrido completo en Preview con datos sintéticos antes de activar reglas y tarifas reales.

## Criterios de aceptación

1. Una ubicación se clasifica de forma explicable como metropolitana, de otra zona o pendiente; los límites y solapamientos tienen tratamiento definido.
2. Un recorrido fuera de zona metro obtiene la regla correspondiente y muestra la base del factor o los renglones utilizados.
3. El combustible respeta km, km/galón, precio por galón, viajes y regreso, sin redondear arbitrariamente los galones a enteros.
4. Peajes, dietas y viáticos se aplican según recorrido y recursos, sin sumar dos veces un concepto incluido en otra base.
5. La misma entrada y las mismas versiones producen el mismo resultado dentro de un mismo contexto.
6. La ausencia de ubicación, recorrido, rendimiento o tarifa necesaria queda visible como pendiente y no se trata como costo cero.
7. Cotización recibe el costo estimado y conserva la revisión utilizada. Una actualización operativa no altera esa revisión.
8. La visita presencial recibe su costo de transporte completo, incluso si el cobro al cliente es gratuito o exonerado.
9. Visitas y servicios conservan identidades propias; una nueva visita real no se confunde con un duplicado ni reemplaza el cálculo del servicio.
10. Los cambios quedan versionados y sujetos a los permisos de la empresa, con pruebas de escritorio y móvil de los tres recorridos.

## Referencias de la revisión

- [Motor Logístico 07A](V17-LOGISTICS-ENGINE-07A-CONTRACT.md) y [continuidad de Administración](V17-ADMINISTRATION-FLEET-19D.md).
- [Administración logística actual](../src/logistics-engine/LogisticsRulesAdmin.tsx), [contrato del motor](../api/_lib/logisticsEngineContract.js) y [carga de hechos](../api/_lib/logisticsEngineDomain.js).
- [Reglas zonales históricas](../api/_lib/logisticsZoneRules.js), [administración geográfica](../api/_lib/logisticsGeoAdmin.js) y [adaptador geográfico experimental](../api/_lib/logisticsGeoAdapter.js).
- [Contrato de Costos](../api/_lib/costingContract.js), [dominio de Cotización](../api/_lib/quoteDomain.js), [Agenda](../api/_lib/surveySchedulingDomain.js) y [resumen logístico de visita](../src/logistics-engine/LogisticsVisitSummary.tsx).
