# V17 CRM Costing 07A — contrato del preview

## Alcance aprobado

Este cambio es exclusivamente visual. Presenta la pestaña **Costos**, el acceso separado al **Motor Logístico** administrativo y la pestaña **Cotización** con tres propuestas para validar el flujo comercial antes de diseñar persistencia o contratos de API.

Flujo representado:

`ICP → Servicios → Survey publicado → Motor Logístico → Evaluación de costos → hasta 3 propuestas → 1 aprobada`

El ICP no captura ni calcula volumen. En este preview el volumen existe únicamente porque el caso muestra un **Survey publicado**.

## Separación económica obligatoria

- El Survey entrega hechos y cantidades; no fija costos ni precios.
- Los servicios aportan plantillas de recursos.
- Administración mantiene catálogos y reglas versionadas.
- El Motor Logístico se configura fuera de Cotización y entrega costos automáticos, advertencias y requerimientos pendientes.
- La evaluación separa costo interno, tratamiento comercial y precio sugerido.
- Cotización recibe un snapshot; impuestos, vigencia y condiciones de pago pertenecen a Cotización.
- Cada caso admite un máximo de tres propuestas y sólo una puede quedar aprobada por el cliente.
- Las propuestas no aprobadas conservan su historia, pero no habilitan continuidad operativa.
- Operaciones comparará posteriormente recursos estimados contra consumos reales.

## Familias representadas

Personal, Transporte, Materiales, Cajas de madera, Equipos, Compensaciones, Terceros, Fletes, Aduanas, Cargos adicionales y Riesgo.

Cada concepto identifica cantidad, unidad, fuente, servicio relacionado, costo interno, modo `INCLUIDO`/`EXTRA`/`TRASLADADO`/`NO COBRABLE` y precio sugerido. Los costos internos pueden ocultarse para representar permisos diferentes del rol administrador.

## Separación económica y protección de margen

- Los servicios propios, incluyendo la gestión de terceros, participan en el margen.
- Fletes, costos de proveedores, impuestos y desembolsos trasladados quedan excluidos del margen propio.
- El precio cotizado queda neutral si coincide con el sugerido, rojo si se reduce y azul si se aumenta.
- El color se acompaña de icono y texto accesible.
- Una propuesta bajo el margen mínimo no puede marcarse como aprobada sin la futura autorización administrativa.

## Motor Logístico separado

La pantalla administrativa representa configuración versionada de base operativa, ruta por carretera, viaje de ida y vuelta, transporte, dietas, viáticos, hospedaje, peajes y estacionamiento. El volumen no se obtiene del ICP; sólo participa después de un Survey o de información proporcionada por el cliente.

El motor puede producir una advertencia o requerimiento con precio pendiente, pero no inventa importes de proveedores.

## Límites de seguridad

- No añade migraciones.
- No consume API ni escribe datos.
- No utiliza `localStorage` ni `sessionStorage`.
- No activa un motor de cálculo.
- No guarda la selección de propuesta ni simula una aceptación contractual real.
- No cambia Production ni la ruta de Servicios del PR anterior.
- Los importes son datos sintéticos de demostración y no constituyen tarifas oficiales.
- La ruta sólo se publica en Preview y únicamente desde `feature/v17-crm-costing-preview-07a`.

Production permanece sin cambios. La implementación funcional requerirá contratos tenant-first, versionado, auditoría, permisos, aprobaciones y pruebas independientes.
