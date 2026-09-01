# V17 CRM Servicios 06A — contrato de Preview

## Objetivo

Presentar para aprobación la definición de Servicios posterior al ICP dentro de la Ficha del Caso. Este lote es exclusivamente visual y no realiza solicitudes al API, no persiste datos empresariales y no modifica Production.

## Navegación

La Ficha presenta el orden aprobado: `Resumen → Servicios → Survey → Actividad → Tareas → Cotización → Notas → Archivos → Comunicación`.

## Definición del caso

Servicios contiene una selección estructurada de:

1. un servicio principal administrable;
2. un alcance confirmado;
3. cero o más servicios complementarios administrables;
4. `Otro servicio no catalogado` sólo como excepción y con descripción obligatoria.

Los registros `Otro` quedan visibles como pendientes de clasificación. No se convierten silenciosamente en catálogo ni se agrupan con un servicio existente.

## Administración

El Preview presenta el futuro catálogo tenant-first con código estable, nombre, categoría para reportes, uso principal/complementario y estado activo. Los tipos utilizados históricamente se desactivarán; no se eliminarán ni cambiarán el significado de casos anteriores.

## Analítica

Servicio principal, alcance y cada complementario se representan por códigos independientes. Esto prepara conteos, combinaciones, conversión, ingreso, margen, actividad y rendimiento cuando los verticales correspondientes publiquen autoridad real. La selección por sí sola no inventa rendimiento operativo.

## Límites

- No añade migraciones ni modelos Prisma.
- No cambia `PipelineCase.serviceType` ni reutiliza `TipoServicioConfig` como autoridad.
- No implementa permisos, API, auditoría o revisiones empresariales todavía.
- No incluye volumen, precio, Survey, cotización o ejecución operativa.
- La ruta `/experience-preview/services` sólo existe en Vercel Preview para la rama exacta `feature/v17-crm-services-preview-06a`.
- Production permanece sin cambios.
