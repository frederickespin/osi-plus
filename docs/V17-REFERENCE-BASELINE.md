# V17 — referencia funcional obligatoria

## Fuente principal

La versión visual integrada anterior está publicada en:

`https://osi-plus-v17-experience-preview-02a-cxp80thtn.vercel.app/`

Su acceso directo a una ruta puede quedar limitado por el despliegue, por lo que la revisión debe comenzar en el Hub y navegar desde allí. También se debe contrastar el código histórico disponible en el repositorio local.

## Regla de trabajo

Antes de presentar un esquema o escribir código para un módulo de OSI Plus V17:

1. Revisar la función equivalente en la versión integrada anterior.
2. Revisar el código histórico local relacionado.
3. Comparar esas capacidades con las decisiones aprobadas en los PR vigentes.
4. Enumerar qué se conserva, qué se mejora y qué se reemplaza.
5. Presentar el esquema al usuario antes de implementar.

El peor resultado aceptable es una versión mejorada de la función anterior. No se deben sustituir capacidades funcionales avanzadas por una reconstrucción simplificada sin aprobación expresa.

## Capacidades confirmadas

La referencia anterior contiene, entre otras, estas bases que deben evaluarse antes de trabajar sus reemplazos:

- App Evaluador y catálogo del evaluador.
- Agenda y visitas asignadas.
- Inventario por ambientes, medidas, peso, volumen, modo de traslado, fotos y manejo especial.
- Accesos, acarreo largo, parqueo, grúas, restricciones y evidencia.
- Revisión y detalle técnico de Survey.
- Pipeline, ficha del caso, programación de Survey y Cotización.
- Cotizador con datos de Survey, personal, vehículos, materiales, cajas de madera, terceros, Motor Logístico, cargos de visita, márgenes, moneda, aprobaciones y addendums.

Esta referencia orienta el diseño, pero no autoriza copiar datos sintéticos ni omitir los contratos tenant-first, controles de acceso, auditoría y versionado aprobados para V17.
