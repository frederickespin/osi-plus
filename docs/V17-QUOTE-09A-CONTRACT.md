# V17-QUOTE-09A — Contrato canónico de Cotización

## Autoridad y límites

Cotización consume exclusivamente una `CostingRevision` publicada e inmutable. No invoca el Motor Logístico, no recalcula costos ni precios sugeridos y no consulta una revisión económica distinta al reabrir historia. `QuoteProposalRevision.costingRevisionId` y `costingLogicalSha256` congelan la fuente exacta.

El runtime queda cerrado: `QUOTE_ENGINE_API_MODE` y `VITE_QUOTE_UI_MODE` aceptan únicamente `DISABLED`, `LOCAL_ONLY` y `PREVIEW_REHEARSAL`; ausente, alterado o ejecutado en Production resuelve desactivado. `productionApiEnabled=false`.

## Modelo

- `PipelineCaseQuote`: ciclo comercial tenant-first del caso.
- `QuoteProposal`: identidad, posición estable 1–3, referencia comercial y estado actual.
- `QuoteProposalRevision`: snapshot append-only de fuente económica, contexto, pagador, condiciones, moneda, descuento, totales y proyecciones INTERNAL/CLIENT.
- `QuoteLine`: línea append-only `COSTING` o `MANUAL`, con fuente/versión, Pr/Ex/De y `quotedPrice` propio de Quote.
- `QuoteIssue`: blocker o advertencia congelada por revisión.
- `QuoteDispatch`: evidencia append-only del envío de una revisión concreta.
- `QuoteClientDecision`: aceptación o rechazo explícito con método, actor registrador y evidencia.
- `QuoteMutationCommand`: idempotencia por tenant y `requestId`, con hash canónico y resultado reproducible.
- `QuoteReferenceCounter`: contador DB por tenant/año, sin `MAX+1`.

Todas las referencias públicas son UUID opacos; ninguna API acepta o publica PK Prisma. Todas las FK funcionales incluyen `tenantId`.

## Propuestas, revisiones y estados

Un ciclo admite posiciones únicas 1, 2 y 3. La base rechaza una cuarta posición. Cada identidad recibe una referencia server-side `Q-AAAA-NNNNNN-A|B|C` y `proposalRef` independiente.

Estados: `DRAFT`, `READY`, `SENT`, `ACCEPTED`, `REJECTED`, `EXPIRED`, `SUPERSEDED`, `CANCELLED`. Editar una propuesta crea una revisión nueva; publicar y enviar también congelan nuevas revisiones. Revisiones, líneas, issues, envíos, decisiones y comandos son append-only mediante triggers. Una revisión nueva conserva `supersedesRevisionId`.

Existe un índice único parcial transaccional para una sola propuesta `ACCEPTED` por tenant y caso. La aceptación serializa por caso con advisory lock y revalida vigencia, estado, destino, Costing publicado, blockers, margen/autorización y ausencia de otra aceptación.

## Economía

- `capturedCost` y `suggestedPrice` se copian de Costing y no son editables en Quote.
- `quotedPrice` es autoridad de Quote.
- Las clases económicas usan `PR`, `EX`, `DE`.
- Una línea manual exige descripción, clase, moneda, motivo y una autoridad explícita. Una autoridad `PENDING` no admite importes y genera blocker.
- Precio inferior al sugerido genera issue; publicar/enviar/aceptar exige una autorización de margen vigente y vinculada.
- Descuento conserva tipo, base, valor, razón y autorización.
- Moneda comercial es explícita. Toda conversión conserva referencia, versión, monedas, tasa, fecha efectiva y fuente.
- No se calcula fiscalidad ni se liquidan comisiones o referidos. Sus contextos quedan preparados como snapshots, separados del costo.

## Contexto comercial

La revisión congela relaciones versionadas para empresa, Lead Account, booker, tarifario/acuerdo, asociaciones y referido. El responsable del pago es obligatorio y explícito (`CLIENT`, `COMPANY`, `LEAD_ACCOUNT`, `THIRD_PARTY` o `AUTHORIZED_ENTITY`); nunca se infiere desde otra relación.

Las condiciones congelan forma de pago, alcance, exclusiones, notas al cliente, condiciones especiales y referencia/version de plantilla. `issueDate` y `validUntil` son inmutables por revisión enviada.

## DTO y documento

La proyección `INTERNAL` puede incluir costo capturado, sugerido, margen e issues conforme al permiso `quote:internal-cost:view`. La proyección `CLIENT` se construye server-side y excluye costos internos, sugeridos, margen, autorización, notas privadas y auditoría. Esta proyección es el contrato preparado para documento/PDF y Portal Cliente; el render PDF y el tracking `VIEWED` quedan fuera de 09A.

## Envío y decisión

El envío registra canal, destinatario sanitizado, evidencia, revisión y fecha. No envía email o WhatsApp automáticamente. La decisión del cliente es un evento explícito `ACCEPTED` o `REJECTED`; requiere método, evidencia y snapshot del decisor, y no se deriva de pagos o mensajes.

Una propuesta vencida, superseded, con destino `PENDING`, Costing inválido, blocker abierto o margen no autorizado no puede aceptarse. Una nueva Costing no cambia propuestas históricas.

## Salida futura

Sólo una aceptación devuelve el descriptor de handoff con:

- `proposalRevisionRef`
- `costingRevisionRef`
- `logisticsPlanRevisionRef`
- `surveyPublicationRef`
- `servicesRevisionRef`
- `caseRef`

09A no crea OSI ni ejecuta Operaciones.

## Autorización

Cada request usa `AuthorizationContext` revalidado. El alcance es por ownership/grants, nunca por rol hard-coded. `deniedPermissions` prevalece. Permisos explícitos:

- `quote:view`
- `quote:create`
- `quote:update`
- `quote:publish`
- `quote:send`
- `quote:record-client-decision`
- `quote:override-price`
- `quote:internal-cost:view`
- `quote:tenant`

Ninguno se incorpora a grants baseline del rol A. El gate se evalúa antes de auth, body y Prisma. Las respuestas usan `private, no-store` y `Vary: Authorization, Origin`, sin CORS permisivo.

## API

| Método | Ruta | Responsabilidad |
|---|---|---|
| GET | `/api/quote/cases/:caseRef` | ciclo y propuestas del caso según scope |
| GET | `/api/quote/:proposalRef/client` | revisión cliente sin costos internos |
| POST | `/api/quote/proposals/create` | propuesta y revisión inicial idempotentes |
| POST | `/api/quote/proposals/revise` | nueva revisión sin mutar historia |
| POST | `/api/quote/proposals/publish` | revalidar y congelar READY |
| POST | `/api/quote/proposals/send` | congelar SENT y registrar envío |
| POST | `/api/quote/proposals/decision` | aceptar o rechazar explícitamente |
| POST | `/api/quote/proposals/cancel` | cancelar conservando motivo, actor y fecha |

Los payloads son cerrados, el servidor recalcula el SHA-256 canónico y un `requestId` reutilizado con contenido distinto responde conflicto.

## Invariantes PostgreSQL

Migración 29 aditiva, sin modificar 1–28 ni inferir contenido comercial legacy. Adopta técnicamente `tenant_id` y ciclo para cabeceras existentes, crea restricciones tenant-first, máximo tres posiciones, aceptación única, contador concurrente e inmutabilidad append-only.

## Histórico recuperado

| Histórico | Función útil | Nuevo destino | Acción |
|---|---|---|---|
| PR #78 `V17-CRM-QUOTE-DOMAIN-08A-CONTRACT.md` | límites de dominio y cabecera existente | contrato 09A | autoridad funcional preservada |
| PR #78 `QuoteProposalPanel` | selector compacto y separación propuesta/detalle | `src/quote/QuotePanel.tsx` | patrón visual adaptado |
| `src/modules/sales/QuoteBuilder.tsx` | captura de términos, vigencia y precio | snapshots/versiones Quote | concepto recuperado; store legacy descartado |
| `src/components/modules/SalesQuoteModule.tsx` | flujo de selección/cotización | pestaña del caso | navegación recuperada; datos locales descartados |
| `src/components/modules/DisenaCotizaModule.tsx` | conceptos de cajas y totales | futura línea publicada desde autoridad | no integrado ni recalculado |
| `src/lib/disenacotiza.ts` | cálculo histórico de cajas | Costing/recursos publicados | permanece legacy; no se ejecuta en Quote |
| `src/types/disenacotiza.types.ts` | nomenclatura empresarial | documentación futura | sólo referencia semántica |
| matrices/roadmap V17 | FX, tarifarios, márgenes y versión | snapshots explícitos | contrato incorporado sin hard-code legal |

No existe backfill automático desde stores, browser storage, mocks o módulos históricos.
