# V17 CRM Survey 09A — contrato del Preview

## Propósito

Este lote es exclusivamente visual y presenta la terminal móvil de Survey acordada antes de conectar persistencia o API. Reutiliza el aprendizaje de las estructuras históricas de Survey, evaluador, artículos, acceso, fotografías, firmas y cajas de madera, sin declarar esas estructuras como autoridad vigente.

## Límite funcional

- El evaluador sólo ve el caso, servicio y secciones expresamente asignados.
- El Survey recoge condiciones de origen y destino, áreas, artículos, cantidades, condiciones, medidas, modos de traslado, evidencias, notas y firma.
- Cada artículo puede relacionarse con una receta versionada de materiales de empaque.
- El Survey calcula necesidades técnicas y resúmenes por área, artículo, modo y tipo de empaque.
- El Survey no fija precios, no reserva ni descuenta inventario y no crea cargos.
- Materiales e Inventario valoriza y reserva posteriormente; Cajas y Taller recibe candidatos a nesting y fabricación.
- Costos y Cotización reciben únicamente un resultado publicado e inmutable.

## Medidas y trazabilidad

El volumen nace en Survey o en evidencia suministrada por el cliente; nunca se calcula en ICP. El peso conserva fuente y nivel de confianza: real, medido, catálogo o densidad. Peso volumétrico y peso cobrable se resuelven posteriormente conforme al modo y la tarifa aplicable.

## Aislamiento

- No añade migraciones.
- No consume API.
- No usa almacenamiento del navegador.
- Los datos son sintéticos y están identificados como tales.
- La ruta sólo existe en Preview y en la rama exacta de este lote.
- Production permanece sin cambios y `productionApiEnabled=false`.
- La futura implementación deberá conservar aislamiento tenant-first, autorización por asignación y auditoría.
