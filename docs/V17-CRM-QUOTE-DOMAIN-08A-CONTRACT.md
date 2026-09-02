# V17 CRM Quote Domain 08A — contrato aprobado

## Decisión de convergencia

La Ficha del Caso usa `PipelineCaseQuote` como cabecera canónica de la cotización. Los modelos históricos `CaseQuote`, `QuoteVersion` y `QuoteLineItem` se conservan como referencia de capacidades y futura migración, pero no constituyen una segunda autoridad para el nuevo CRM.

Este bloque define el contrato económico antes de persistirlo. No añade migraciones, rutas API, consumidores UI ni activación en Production.

## Reglas funcionales

- Un caso admite entre una y tres propuestas compactas, cada una con posición y referencia únicas.
- Sólo una propuesta puede quedar `APPROVED`.
- Los conceptos conservan referencia, catálogo opcional, cantidad, unidad, fuente versionada, costo, precio sugerido y precio cotizado.
- La clase económica es `OWN`, `EXTERNAL` o `DISBURSEMENT`, equivalente a `Pr`, `Ex` y `De` en la interfaz.
- El margen mínimo se calcula únicamente sobre ingresos y costos propios. Externos y desembolsos quedan fuera.
- Un concepto pendiente, un margen propio inferior al mínimo o un destino pendiente bloquean la aprobación.
- Bajar o aumentar el precio sugerido se deriva como `BELOW_SUGGESTED` o `ABOVE_SUGGESTED`; la UI puede representarlo en rojo o azul sin depender sólo del color.
- Las fuentes incluyen Servicios, Survey, Motor Logístico, Cajas, Permisos, Terceros, Fletes, Aduanas, Tarifarios, Referidos, Relaciones Comerciales, conceptos manuales y compensación cambiaria.
- La pérdida cambiaria sugerida se calcula desde tasa fijada, tasa vigente y exposición extranjera, y queda en el snapshot.
- Los impuestos permanecen expresamente diferidos y no se calculan en esta fase.

## Volumen y hechos operativos

El ICP no captura ni calcula volumen. Cotización acepta volumen sólo cuando la fuente es `SURVEY_PUBLISHED` o `CLIENT_PROVIDED`, con referencia y versión. También admite `NONE` para servicios que aún no requieren volumen.

## Seguridad y activación

- La planificación exige coincidencia de tenant, caso, membresía activa y permiso explícito.
- La ruta y el destino se revalidan contra la autoridad vigente para evitar guardar sobre datos obsoletos.
- El comando lleva `requestId` y hash canónico para la futura idempotencia.
- El plan agrupa cabecera, tres propuestas, hechos operativos, tipo de cambio y auditoría como una única transacción futura.
- `productionApiEnabled=false`, `persistenceEnabled=false` y `runtimeConsumers=0`.

## Siguientes bloques separados

1. Diseñar la migración de convergencia sobre `PipelineCaseQuote`, sin duplicar las cotizaciones históricas.
2. Implementar persistencia tenant-first, versiones inmutables, comandos y auditoría atómica.
3. Exponer API protegida y mantenerla desactivada en Production.
4. Conectar la UI aprobada y después integrar Survey, Servicios, Motor Logístico, Cajas y Gestiones por contratos versionados.
