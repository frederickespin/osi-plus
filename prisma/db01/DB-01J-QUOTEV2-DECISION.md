# DB-01J — Decisión sobre QuoteV2

## Evidencia

La búsqueda completa del repositorio encontró `QuoteV2` únicamente en:

- `prisma/schema.prisma`, incluido el lado declarativo `Lead.quotes`.
- Una migración histórica condicional que sólo altera la tabla si ya existe.
- Documentación y planes históricos.

No se encontró:

- Acceso `prisma.quoteV2`.
- Endpoint de API.
- Interfaz activa.
- Importación del tipo/modelo por código ejecutable.
- Tabla en la estructura canónica de producción reconstruida.
- Datos o dependencia funcional demostrada.

La cotización vigente utiliza `PipelineCaseQuote`, `quotes`, `quote_versions`, líneas y snapshots del flujo comercial actual.

## Decisión

Recomendar el retiro de `QuoteV2` del datamodel canónico final. DB-01J no crea su tabla, no borra el modelo del esquema principal y no modifica documentación heredada. Esta decisión debe materializarse en una fase de limpieza del datamodel deseado, después de revisar y corregir la documentación que todavía lo describe como fuente oficial.

Como la tabla no forma parte del baseline canónico, su retiro futuro del datamodel no debe generar un `DROP TABLE` en producción. La revisión previa deberá comprobar otra vez que continúa ausente y sin consumidores.

## Reintroducción futura

Si producto necesita una nueva generación de cotizaciones, deberá diseñarse como una migración funcional independiente, con:

1. `tenantId` y FK compuestas.
2. Relación explícita con `PipelineCase` y la versión aceptada.
3. Moneda, snapshots de tarifa, líneas y auditoría contractual.
4. Estrategia de compatibilidad con `quotes` y `quote_versions`.
5. Backfill dry-run, idempotencia y pruebas de aislamiento.

No debe reactivarse automáticamente el prototipo `QuoteV2` anterior.
