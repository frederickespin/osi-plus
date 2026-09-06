# V17-COMMERCIAL-RELATIONSHIPS-12A — Resultado

## A. Resumen

Se incorporó una autoridad tenant-first para entidades y relaciones comerciales, contactos, tarifarios y acuerdos versionados, descuentos/cargos, referidos, comisiones, asociaciones, certificaciones, instrucciones y contexto comercial por caso. La implementación recupera la intención funcional histórica sin recuperar sus stores ni usar datos históricos como autoridad. Quote sigue siendo la autoridad de propuesta y ahora toma el snapshot comercial publicado cuando existe. Production continúa desactivada.

## B. Rama/base/HEAD

- Rama local: `feature/v17-commercial-relationships`.
- Base autorizada final: `5c7ebf53f5883dfe9f23a58980909cbd88e5e321`.
- `8baf50fbfa9138f0bae831dd7b4dfd6d56aca60a` se conserva como ancestro.
- La corrección aprobada del Evaluador (método, `ServicesRevision` y `RouteSnapshot`) permanece intacta.
- El HEAD final se registra en la entrega de la tarea; no hubo push, PR ni acceso a servicios externos.

## C. Código histórico recuperado

Se inspeccionó el snapshot read-only `modern-baseline-20260814@61a3e8a4525efedfc99120fb5e4845ba45234ba1`: `CommercialRelationsModule.tsx`, `commercialRelationsStore.ts`, `CommercialRelationshipTab.tsx`, `SalesQuoteWorkspace.tsx`, APIs de `lead-parties`, tarifarios y comisiones, además de `ReferralTab`, `quoteReferralCommission`, `tariffResolver`, reglas de servicio y aplicabilidad de perfiles. Se recuperaron las capacidades y fronteras de negocio, no su persistencia local ni sus identificadores.

## D. Modelo Prisma

Se añadieron 15 modelos: `CommercialEntity`, `CommercialEntityContact`, `CommercialRelationship`, `CommercialTariffVersion`, `CommercialPricingAgreementVersion`, `CommercialPriceAdjustment`, `CommercialReferralAgreementVersion`, `CommercialCommissionAgreementVersion`, `CommercialAssociationMembership`, `CommercialCertification`, `CommercialInstructionVersion`, `PipelineCaseCommercialContextVersion`, `PipelineCaseCommercialParty`, `CommercialRelationshipCommand` y `CommercialRelationshipEvent`. Todas las relaciones empresariales nuevas están acotadas por tenant y usan FKs compuestas tenant-first.

## E. Migración

- Migración 31: `20260912010000_v17_commercial_relationships`.
- Aditiva; no modifica migraciones 1–30 ni hace backfill empresarial.
- 33,646 bytes, LF, sin BOM.
- SHA-256 Git/working tree/Prisma: `2cc93336058dcc3976c03b0a0c2d29bfadb08eb397980f25895b206b46616c23`.
- Incluye índices tenant-first, restricciones de período/tipo/porcentaje, unicidad de series/versiones, referencias públicas UUID inmutables y triggers append-only.

## F. CommercialEntity

Autoridad común para persona, empresa, organización, agente, Lead Account, proveedor, referidor, tercero y asociación. Usa `entityRef` UUID opaco, código único por tenant, vigencia, estado y versión. Puede vincularse opcionalmente a un `Client` del mismo tenant. La creación presenta candidatos a duplicado por nombre/RNC normalizado, pero nunca fusiona automáticamente. La edición conserva código, tipo, Client y referencia pública; exige `expectedVersion` y deja evento/auditoría before/after.

## G. Relaciones

`CommercialRelationship` registra origen, destino, tipo, referencia, condiciones JSON, metadata estructurada, vigencia, estado y versión. Las consultas y escrituras resuelven referencias públicas dentro del tenant. Un índice parcial impide dos relaciones activas idénticas e incompatibles para la misma terna origen/destino/tipo.

## H. Empresa

`COMPANY` y la relación `EMPLOYED_BY` representan empresa/empleador. No conceden pagador, Booker, Lead Account ni otra autoridad implícita.

## I. Lead Account

Se representa como entidad `LEAD_ACCOUNT`, relación explícita `LEAD_ACCOUNT` y parte de caso `LEAD_ACCOUNT`. Acuerdos, tarifarios e instrucciones se publican por versiones con vigencia; no se derivan de Client ni de empresa.

## J. Booker

`BOOKER` es una relación y un rol de caso independiente. Puede apuntar a persona, empresa, agente u otra entidad autorizada; nunca se iguala automáticamente a Lead Account.

## K. Pagador

`PAYER` sólo existe por selección explícita en el contexto publicado del caso. Un contexto puede prepararse sin pagador, pero Quote falla con `QUOTE_PAYER_REQUIRED` cuando intenta crear o revisar una propuesta sobre dicho contexto. No se infiere desde Client, empresa, Booker o Lead Account.

## L. Aprobador

`APPROVER` es una selección separada de `PAYER`; el contrato y las pruebas demuestran que ambas referencias pueden ser distintas.

## M. Contactos

`CommercialEntityContact` soporta nombre, cargo, email y teléfono normalizados, canal preferido, estado, vigencia y referencia pública. Los listados públicos minimizan PII: publican nombre/cargo/canal/estado, no email ni teléfono. Scheduling podrá resolver los detalles server-side cuando exista su contrato específico.

## N. Tarifarios

`CommercialTariffVersion` distingue tarifa maestra/de referencia. Cada publicación crea una fila append-only con `seriesRef`, versión, moneda, scope, definición, vigencia y hash lógico. No se edita una tarifa publicada.

## O. Pricing profiles

`CommercialPricingAgreementVersion` representa el acuerdo específico y apunta a exactamente una entidad o relación, además de una versión de tarifario. Su scope por servicio/modo, condiciones, términos administrativos, vigencia y ajustes forman un snapshot hashado.

## P. Descuentos/cargos

`CommercialPriceAdjustment` separa `DISCOUNT` de `ADMINISTRATIVE_CHARGE`; registra cálculo porcentual, monto fijo o política, valor, base, motivo, aprobación y vigencia. Es append-only y no se mezcla con `CostingRule`.

## Q. Referidos

`CommercialReferralAgreementVersion` guarda referidor explícito, cálculo, valor/moneda, base, servicio, autorización, referencia y vigencia. Sus revisiones usan serie/versionado e idempotencia.

## R. Comisiones

`CommercialCommissionAgreementVersion` separa `INTERNAL` de `EXTERNAL_REFERRAL`. La comisión externa exige un acuerdo de referido; la interna no puede usarlo. La base puede ser beneficio, monto, porcentaje o política configurada por servicio. No se implementó liquidación de nómina.

## S. Asociaciones

`CommercialAssociationMembership` enlaza explícitamente miembro y entidad de tipo asociación, con número, vigencia y estado. FIDI, LACMA, OMNI o cualquier otra organización son datos configurables, nunca constantes de comportamiento.

## T. Certificaciones

`CommercialCertification` es independiente de una membresía de asociación y registra tipo, autoridad emisora, fechas, documento por referencia opaca, estado y vigencia. No se redujo FIDI/FAIM a un checkbox ni se inventaron reglas para LACMA/OMNI.

## U. Instrucciones especiales

`CommercialInstructionVersion` publica instrucciones por entidad o relación —exactamente una—, categoría, servicio, contenido estructurado, vigencia y hash. Es append-only y deja referencias para el futuro gestor de plantillas/comunicaciones; no envía email ni WhatsApp.

## V. Contexto por caso

`PipelineCaseCommercialContextVersion` publica versiones inmutables por caso. Sus partes explícitas admiten empresa, Lead Account, Booker, pagador, aprobador, referido, agente y proveedor, junto a acuerdos seleccionados y snapshots de asociaciones/instrucciones. La ruta valida `caseRef` UUID y resuelve `(tenantId, publicRef)` antes de consultar el contexto. No acepta tenant, actor, rol ni PK en body.

## W. Snapshot Quote

`quoteDomain` consulta server-side el último contexto comercial publicado del caso. Si existe, reemplaza cualquier contexto/pagador recibido por el snapshot autoritativo: `payerRef`, relación comercial, acuerdo de pricing, acuerdo de referido, asociaciones e instrucciones. Si no existe, preserva el contrato 09A vigente. No se alteraron máximo de tres propuestas, aceptación única ni revisiones append-only.

## X. Scheduling integration

Scheduling conserva su autoridad. El contexto deja Booker, Lead Account, contactos e instrucciones referenciables; no copia contactos a Survey. La base `5c7ebf5` conserva la App reciente del Evaluador conectada a método de evaluación, `ServicesRevision` y `RouteSnapshot`.

## Y. Costing integration

Costing sigue respondiendo cuánto cuesta. Recibe sólo referencias/clasificación cuando corresponda; descuentos, cargos y precios comerciales no se aplican dentro de Costing. Quote sigue decidiendo qué precio presentar.

## Z. AuthorizationContext

Las 12 rutas usan `resolveCrmPipelineContext`, que revalida User, Membership y Tenant y entrega `AuthorizationContext`. Las compuertas se evalúan antes de auth/body/Prisma; el tenant y actor se toman exclusivamente del contexto.

## AA. Permisos

Se añadieron diez permisos explícitos: `commercial:relationships:view/manage`, `commercial:tariffs:view/manage`, `commercial:referrals:view/manage`, `commercial:commissions:view/manage` y `commercial:associations:view/manage`. No se conceden por rol baseline; `deniedPermissions` prevalece tanto en shell como en API.

## AB. Auditoría

Cada mutación crítica usa transacción `SERIALIZABLE`, `CommercialRelationshipCommand` idempotente por tenant/requestId, `CommercialRelationshipEvent` append-only y `CommercialAuditLog` con actor User+Membership, rol, request/correlation, entidad y snapshots before/after. Se auditan creación/edición de entidad, relación, contexto/pagador/Lead Account/Booker, tarifa, acuerdo/ajuste, referido, comisión, asociación, certificación e instrucción.

## AC. UI admin

Se recuperó una experiencia compacta `Relaciones Comerciales` con seis tabs: Entidades, Relaciones, Tarifarios, Referidos, Comisiones y Asociaciones. Permite búsqueda tenant-first, alta explícita de entidad y relación, y consulta de catálogos publicados. No importa `commercialRelationsStore` ni guarda datos empresariales en browser storage.

## AD. UI caso

La Ficha incluye un tab/resumen compacto de relaciones y un editor explícito de Company, Lead Account, Booker, Payer, Approver, Referral, Agent y Supplier. Publica una nueva versión y conserva la referencia/versión actual; no usa cards grandes ni infiere por nombre.

## AE. Mapping histórico

| Histórico | Autoridad 12A | Decisión |
|---|---|---|
| `BusinessEntity` | `CommercialEntity` | Se conserva legacy sin backfill; nueva autoridad tenant-first. |
| `EntityContact` | `CommercialEntityContact` | PII minimizada y FK tenant-first. |
| `LeadParty` | `CommercialRelationship` + `PipelineCaseCommercialParty` | Relación reusable y selección por caso separadas. |
| `MasterTariff` | `CommercialTariffVersion` | Referencia versionada append-only. |
| `AccountPricingProfile` | `CommercialPricingAgreementVersion` | Acuerdo específico versionado. |
| `TariffOverride` | `CommercialPriceAdjustment` | Descuento/cargo explícito y trazable. |
| `CommissionAgreement` | `CommercialCommissionAgreementVersion(INTERNAL)` | Política interna separada. |
| `LeadCommission` | `CommercialReferralAgreementVersion` o comisión externa explícita | Nunca se clasifica por inferencia. |

## AF. Tests

- Contratos cerrados: 13/13.
- HTTP/gates/headers: 12/12.
- Base de datos y dominio: 36/36 tras incluir edición de entidad y cuatro carreras representativas.
- Quote 09A: contrato 9/9, HTTP 13/13 y guardia negativa 13/13.
- Build, TypeScript focalizado, ESLint focalizado y `git diff --check`: verdes.
- Guards heredados Auth, ICP, Servicios, Survey, Scheduling, Motor, Costing y Quote: verdes.

## AG. PostgreSQL

PostgreSQL 18 local aislado: vacío 0→31 correcto; actualización 30→31 correcta; rollback 31→30 con residuo 0; replay 30→31 correcto; segundo `migrate deploy` sin pendientes; `migrate status` 31/31; drift vacío. Prisma registró el checksum exacto y `applied_steps_count=1`. Se probaron vigencias, FKs tenant-first, referencias inmutables, append-only, idempotencia, aislamiento cross-tenant y concurrencia.

## AH. Browsers

Playwright: 18/18, un worker, cero retries, desktop y móvil en Chromium, Firefox y WebKit. Cubrió administración, entidad/relación, selección explícita de Company/Lead Account/Booker/Payer/Approver y deny antes de lazy/API. Los catálogos de tarifa, referido y asociación se validan además por contratos/DB; sus tabs se renderizan en la administración.

## AI. Guards

Guardia positiva: 15 modelos, 12 rutas, consumo de snapshot en Quote y `productionApiEnabled=false`. Negativas: 11/11 para pagador o Lead Account inferido, store local, tarifa mutable, snapshot Quote omitido, asociación hard-coded, PK pública, consulta cross-tenant y activación productiva. Inventario CORS actualizado a 134/134 rutas, de ellas 107 protegidas, sin duplicadas ni no clasificadas.

## AJ. Feature flags

API: `DISABLED`, `LOCAL_ONLY` y `PREVIEW_REHEARSAL`; ausente/desconocido falla cerrado. `LOCAL_ONLY` exige loopback real y ninguna variable `VERCEL*`. Preview exige ambiente, rama, batch, Auth LEGACY y tenancy exactos. Frontend sigue la misma frontera. No existe modo Production y `productionApiEnabled=false`.

## AK. Riesgos

- No hay backfill: los modelos históricos permanecen legacy hasta una adopción explícita.
- La UI administrativa inicial concentra altas y lectura; las publicaciones avanzadas están cubiertas por dominio/API y requieren ampliar formularios antes de uso humano completo.
- No existen reglas automáticas aprobadas para FIDI/FAIM/LACMA/OMNI.
- No hay transporte de comunicaciones, liquidación real de comisiones ni fiscalidad completa.
- Un contexto comercial sin pagador puede guardarse, pero bloquea Quote; esto requiere mensaje operativo claro en la futura integración Preview.

## AL. Diff summary

El cambio agrega esquema/migración, contratos/dominio/HTTP, 12 rutas protegidas, permisos, integración Quote, UI administrativa y de Ficha, gates/lazy boundary, inventario CORS, CI, pruebas y rollback local. No cambia migraciones 1–30, Survey App, Motor, Costing, límites de Quote ni APIs productivas existentes.

## AM. Worktree

Worktree: `C:\Users\espin\osi-plus-v17\osi-plus-erp-v17-v17-commercial-relationships-12a`. Los recursos PostgreSQL temporales se eliminan al cierre. El snapshot moderno y el worktree histórico permanecieron read-only. No hubo push, PR, deployment, variables, Neon ni cambios en Production.

## AN. Próximo lote

Recomendado, sin ejecutar: `Plantillas y Comunicaciones tenant-first`.
