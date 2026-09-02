# V17 CRM Servicios 06A — contrato de Preview

## Objetivo

Presentar para aprobación la definición de Servicios posterior al ICP dentro de la Ficha del Caso. Este lote es exclusivamente visual y no realiza solicitudes al API, no persiste datos empresariales y no modifica Production.

## Navegación

La Ficha presenta el orden aprobado: `Resumen → Servicios → Survey → Actividad → Tareas → Cotización → Notas → Archivos → Comunicación`.

## Definición del caso

Servicios contiene una selección estructurada de:

1. un servicio principal administrable;
2. un alcance confirmado;
3. cero o más servicios complementarios administrables, elegidos desde un selector compacto agrupado;
4. `Otro servicio no catalogado` sólo como excepción y con descripción obligatoria.

Los registros `Otro` quedan visibles como pendientes de clasificación. No se convierten silenciosamente en catálogo ni se agrupan con un servicio existente.

## Administración

El Preview presenta el futuro catálogo tenant-first con código estable, nombre, categoría para reportes, uso principal/complementario y estado activo. Administración puede editar el nombre y la clasificación, y activar o desactivar cada elemento. Los tipos utilizados históricamente se desactivarán; no se eliminarán ni cambiarán el significado de casos anteriores.

## Combos de complementarios

Administración puede guardar grupos frecuentes de complementarios vinculados a un servicio principal y establecer un único combo predeterminado. Al seleccionar el servicio principal, el combo predeterminado precarga automáticamente sus complementarios. El usuario puede agregar o quitar elementos para el caso sin alterar el combo original. Los combos también son editables y activables/desactivables; nunca sustituyen el registro individual de cada servicio complementario.

Los complementarios elegidos se presentan como una lista tabular compacta, con líneas alternadas y una acción de quitar por fila. El total aparece junto al encabezado y no ocupa un control de ancho completo.

## Analítica

Servicio principal, alcance y cada complementario se representan por códigos independientes. Esto prepara conteos, combinaciones, conversión, ingreso, margen, actividad y rendimiento cuando los verticales correspondientes publiquen autoridad real. La selección por sí sola no inventa rendimiento operativo.

## Límites

- No añade migraciones ni modelos Prisma.
- No cambia `PipelineCase.serviceType` ni reutiliza `TipoServicioConfig` como autoridad.
- No implementa permisos, API, auditoría o revisiones empresariales todavía.
- No incluye volumen, precio, Survey, cotización o ejecución operativa.
- La ruta `/experience-preview/services` sólo existe en Vercel Preview para la rama exacta `feature/v17-crm-services-preview-06a`.
- Production permanece sin cambios.
