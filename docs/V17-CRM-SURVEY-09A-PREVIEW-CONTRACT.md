# V17 CRM Survey 09A — contrato del Preview

## Propósito

Este lote es exclusivamente visual y presenta la terminal móvil de Survey acordada antes de conectar persistencia o API. Reutiliza el aprendizaje de las estructuras históricas de Survey, evaluador, artículos, acceso, fotografías, firmas y cajas de madera, sin declarar esas estructuras como autoridad vigente.

## Límite funcional

- La entrada es una agenda cronológica de 15 visitas asignadas, con la cita más próxima destacada y alertas para desplazamientos largos.
- El evaluador sólo ve el caso, servicio y secciones expresamente asignados.
- Al seleccionar una visita, la franja azul muestra cliente, empresa del cliente, lead account y Booker, direcciones completas de origen y destino —ciudad, sector, calle, número y casa o apartamento— y las preferencias o instrucciones registradas durante la programación.
- La llegada se registra exclusivamente dentro de Agenda desde la franja azul, inmediatamente bajo la próxima visita; conserva hora y ubicación y queda separada de la confirmación del cliente. La puntualidad utiliza una tolerancia configurable.
- El Survey recoge condiciones de origen y destino, áreas, artículos, cantidades, condiciones, medidas, modos de traslado, notas, fotografías vinculadas a su origen y firma.
- Las áreas nacen de un catálogo configurable de áreas del tenant; pueden editarse, ordenarse y desactivarse, y el evaluador trabaja con sus áreas frecuentes.
- El inventario utiliza búsqueda progresiva: prioriza artículos relacionados con el área actual y conserva área y modo después de agregar cada artículo.
- El talonario inferior filtra por el área activa; desde Revisión también puede aplicar temporalmente un modo. Cada renglón se puede abrir para corregir o eliminar con confirmación, y dispone de navegación anterior/siguiente.
- La cantidad inicia en uno, admite un máximo visual de tres cifras y combina botones circulares de menos/más con un campo compacto seleccionable.
- La condición, el icono de cámara y las condiciones especiales se concentran en una sola zona compacta. Las condiciones especiales usan abreviaturas visibles con su nombre completo accesible y cada artículo admite una nota opcional.
- Las condiciones `Averiado` y `Daño preexistente` requieren fotografía obligatoria vinculada al artículo; otras condiciones especiales habilitan evidencia opcional mediante un único icono.
- Las medidas permanecen ocultas salvo para caja de madera, sobredimensionado o medición excepcional y se presentan en sistema métrico e imperial.
- El evaluador no selecciona materiales de empaque. Cada artículo puede relacionarse administrativamente con una receta versionada y el resultado aparece sólo como detalle técnico automático.
- La pestaña de Evidencias desaparece: cada fotografía queda asociada directamente al artículo, daño, acceso o condición que la originó.
- La pestaña Firma presenta al cliente un reporte para aceptación con artículos, cantidades, condiciones y totales; excluye precios, costos, márgenes y notas internas.
- Revisión presenta información agrupada por área y por modo. Seleccionar una agrupación regresa al Inventario conservando ese contexto para corregir el levantamiento.
- El detalle técnico presenta el listado completo con peso y volumen, materiales derivados y artículos con fotografías, notas y medidas agrupados por condición especial.
- El Survey calcula necesidades técnicas y resúmenes por área, artículo, modo y tipo de empaque sin permitir editar la receta.
- El Survey no fija precios, no reserva ni descuenta inventario y no crea cargos.
- Materiales e Inventario valoriza y reserva posteriormente; Cajas y Taller recibe candidatos a nesting y fabricación.
- Costos y Cotización reciben únicamente un resultado publicado e inmutable.

## Medidas y trazabilidad

El volumen nace en Survey o en evidencia suministrada por el cliente; nunca se calcula en ICP. El peso conserva fuente y nivel de confianza: real, medido, catálogo o densidad. Peso volumétrico y peso cobrable se resuelven posteriormente conforme al modo y la tarifa aplicable.

La interfaz muestra centímetros/pulgadas, metros cúbicos/pies cúbicos y kilogramos/libras sin duplicar autoridades de cálculo. La implementación futura deberá guardar el valor original introducido y una representación normalizada auditada.

## Accesos y aprendizaje operativo

- Origen y destino comparten una matriz compacta de condiciones con selecciones independientes.
- Escaleras por encima del segundo piso y elevadores por encima del quinto generan advertencias y tiempo adicional mediante reglas administrativas configurables.
- Cada edificio o instalación tendrá un perfil histórico versionado de facilidades, inconvenientes, fotografías, fecha y evaluador; una visita nueva no sobrescribe evidencia anterior.
- Los futuros análisis agregados por zona no expondrán datos personales ni fotografías residenciales.
- El Motor Logístico transforma las condiciones en minutos, recursos, alertas y conceptos; Survey no fija el precio.

## Aislamiento

- No añade migraciones.
- No consume API.
- No usa almacenamiento del navegador.
- Los datos son sintéticos y están identificados como tales.
- La ruta sólo existe en Preview y en la rama exacta de este lote.
- Production permanece sin cambios y `productionApiEnabled=false`.
- La futura implementación deberá conservar aislamiento tenant-first, autorización por asignación y auditoría.

## Base funcional obligatoria

Antes de diseñar o implementar otro módulo se debe consultar `V17-REFERENCE-BASELINE.md`, comparar el flujo propuesto contra la versión integrada anterior y documentar qué se conserva, qué se mejora y qué se reemplaza. Un preview nuevo no puede reducir silenciosamente capacidades ya construidas.
