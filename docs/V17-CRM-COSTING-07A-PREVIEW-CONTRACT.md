# V17 CRM Costing 07A — contrato del preview

## Alcance aprobado

Este cambio es exclusivamente visual. Presenta la pestaña **Costos** entre Survey y Cotización para validar el flujo comercial antes de diseñar persistencia o contratos de API.

Flujo representado:

`ICP → Servicios → Survey publicado → plan de recursos → Evaluación de costos → Cotización`

El ICP no captura ni calcula volumen. En este preview el volumen existe únicamente porque el caso muestra un **Survey publicado**.

## Separación económica obligatoria

- El Survey entrega hechos y cantidades; no fija costos ni precios.
- Los servicios aportan plantillas de recursos.
- Administración mantiene catálogos y reglas versionadas.
- La evaluación separa costo interno, tratamiento comercial y precio sugerido.
- Cotización recibe un snapshot; impuestos, vigencia y condiciones de pago pertenecen a Cotización.
- Operaciones comparará posteriormente recursos estimados contra consumos reales.

## Familias representadas

Personal, Transporte, Materiales, Cajas de madera, Equipos, Compensaciones, Terceros y Riesgo.

Cada concepto identifica cantidad, unidad, fuente, servicio relacionado, costo interno, modo `INCLUIDO`/`EXTRA`/`NO COBRABLE` y precio sugerido. Los costos internos pueden ocultarse para representar permisos diferentes del rol administrador.

## Límites de seguridad

- No añade migraciones.
- No consume API ni escribe datos.
- No utiliza `localStorage` ni `sessionStorage`.
- No activa un motor de cálculo.
- No cambia Production ni la ruta de Servicios del PR anterior.
- Los importes son datos sintéticos de demostración y no constituyen tarifas oficiales.
- La ruta sólo se publica en Preview y únicamente desde `feature/v17-crm-costing-preview-07a`.

Production permanece sin cambios. La implementación funcional requerirá contratos tenant-first, versionado, auditoría, permisos, aprobaciones y pruebas independientes.
