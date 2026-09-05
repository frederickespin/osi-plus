# V17-COSTING-08A — Resultado local

## Resumen

Se incorporó el dominio canónico de Costing sobre `feature/v17-logistics-engine@76cbbbe6871da747c626dc9b1ba029fd08cb52a0`. La solución parte exclusivamente de una revisión logística publicada, conserva fuentes/versiones y produce simulaciones y revisiones económicas inmutables. No implementa Cotización comercial ni activa Production.

## Histórico recuperado

| Histórico | Función observada | Nuevo destino | Acción |
|---|---|---|---|
| `src/lib/quoteOperationalCost.ts` | Agrupación operacional de costo | cálculo puro y líneas Costing | Reexpresar sin stores ni autoridad comercial |
| `src/lib/quoteOperationalRequirements.ts` | Familias/necesidades | input publicado del Motor | Consumir, no recalcular |
| `src/components/motor/ResourcesPanel.tsx` | Densidad y desglose visual | `CostingPanel` | Adaptar presentación |
| `src/lib/operationalResourceRulesStore.ts` | Presets locales | `CostingRule` versionada | Sustituir storage local |
| PR #77 `CostingVisualPreview.tsx` | Tabla, Pr/Ex/De, blockers y totales | UI de caso | Recuperar dirección visual |
| PR #77 `AdminLogisticEnginePreview.tsx` | Administración compacta | `CostingRulesAdmin` | Adaptar a contratos reales |
| PR #77 `QuoteProposalPanel.tsx` | Frontera Costing/Cotización | contrato futuro | No incorporar propuestas |
| PR #77 `CaseManagementPanel.tsx` | Secuencia de workspace | tab Costos tras Motor | Conservar |
| PR #78 Cotización futura | consumidor de Costing publicado | 09A | Sólo verificar compatibilidad |
| `MasterTariff`/`TariffRateSet` legacy | tarifas históricas heterogéneas | sin adopción automática | Legacy; requiere reconciliación |
| `OperationalCompensationConfig` | compensaciones operativas | regla económica versionada | No usar como autoridad directa |

## Implementación

- Nueve modelos Prisma y doce enums nuevos; migración 28 aditiva.
- Trece familias y seis fuentes aprobadas, con cuatro fuentes de autoridad específica.
- Clasificación Pr/Ex/De estructurada y totales separados.
- MaterialCostVersion, AssetCostVersion, ofertas externas, reglas y tasas históricas como autoridades.
- Snapshots con fuente logística, requirement/material/asset/provider y hash económico.
- Margen mínimo/recomendado por regla; externo y desembolso no reciben margen propio implícito.
- Compensación cambiaria visible como familia/línea.
- Blockers económicos y de logística; publicación rechazada mientras estén abiertos.
- Stale protection sobre revisión logística y todas las autoridades económicas.
- Overrides y decisiones de margen append-only, idempotentes y auditados.
- Ocho superficies HTTP privadas y lazy boundaries frontend.

## UI

La Ficha incluye `Costos` inmediatamente después del Motor. La tabla muestra `Familia | Concepto | Tipo | Cant. | Unidad | Costo | Sugerido | Estado`, con filtros por familia y Pr/Ex/De, issues y resumen económico. Los overrides bajo sugerido usan rojo, icono y texto; superiores usan azul, icono y texto. Administración ofrece reglas y tasas versionadas en una superficie compacta.

No se publica `quotedPrice`, no se crean propuestas y no se duplica PII o direcciones.

## Validación ejecutada

La evidencia local del cierre es:

- contrato: Local simple, Local con externo, proveedor pendiente, Export e Import;
- margen: sugerido, bajo mínimo, autorización y deny;
- moneda: identidad, conversión, tasa histórica, ausencia y compensación;
- HTTP: gate antes de auth/body/Prisma, CORS privado y valores alterados;
- PostgreSQL 18: 28/28 desde vacío, 27→28, segundo deploy sin pendientes, drift vacío y rollback/replay 28→27→28;
- migración 28: SHA-256 `d1484bb4380f7f8f8984cfd977503637f4c318357d05978599dc3374071b543a`, LF, sin BOM;
- base: 9 modelos, 13 familias, 29 FK tenant-first y 37 aserciones, incluidos versionado concurrente de reglas 1/2, una única tasa ganadora y paridad comando/auditoría;
- browser: 18/18, Chromium, Firefox y WebKit en desktop/móvil, cubriendo Costing, administración y deny sin chunk/API;
- HTTP: 31 aserciones; guardia focal: 13 negativas;
- CORS: inventario 113/113, 86 rutas protegidas y 28 negativas;
- build, TypeScript focal, ESLint focal, `git diff --check`, preflight canónico de 28 migraciones y escaneo de secretos: verdes;
- guardias negativas contra recálculo logístico, Cotización, PK/tenant de cliente, proveedores inventados, margen hard-coded, tasa histórica mutable y Production.

## Riesgos y brechas

- Vehicle no posee una tabla económica canónica propia; 08A exige `CostingRule` versionada, sin inventar una fórmula.
- Proveedor sin precio/referencia contractual bloquea; no existe búsqueda o negociación de proveedor en este lote.
- Crating consume necesidades publicadas, pero BOM/nesting permanece en su autoridad.
- Fiscalidad completa, precio final, propuestas, aprobación del cliente y conceptos comerciales manuales quedan fuera.
- No hay backfill de tarifas legacy; su adopción requiere reconciliación explícita.

## Estado y siguiente lote

El diff queda limitado a Costing, integración lazy, RBAC explícito, migración 28, CORS, pruebas, guardias y documentación. Migraciones 1–27 no se modifican. Los modos se mantienen `DISABLED`, `LOCAL_ONLY` y `PREVIEW_REHEARSAL`; Production continúa apagado.

Siguiente lote propuesto: `Cotización 09A`, consumiendo una `CostingRevision` publicada sin revalorizar su snapshot. No se implementa automáticamente.
