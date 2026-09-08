# V17-SERVICE-PACKAGES-RESOURCES-15A — Resultado

## A. Resumen

Se implementó localmente la autoridad tenant-first de modos, compatibilidad de servicios, paquetes versionados, requerimientos de recursos, políticas de materiales y configuración final inmutable por caso. No se sembró catálogo empresarial, no se recuperaron stores históricos y `productionApiEnabled=false` permanece efectivo.

## B. Rama/base/HEAD

- Rama: `feature/v17-consolidated-preview`.
- Base autorizada: `a34bbb38e4fd51727e097d35813b7ba027677d30`.
- El trabajo es descendiente directo de esa base; no hubo rebase, push ni acceso externo.
- El HEAD final se registra en el informe de entrega después del commit documental.

## C. Histórico recuperado

Se inspeccionó el worktree histórico exclusivamente en lectura. Las fuentes relevantes fueron:

- `src/modules/commercial-shared/TemplateRepository.ts`.
- `src/modules/commercial-shared/serviceTypes.ts`.
- `src/lib/templateSchemas.ts`.
- `src/components/modules/OperationsModule.tsx`.
- `src/types/osi.types.ts`.
- `src/modules/sales/QuoteBuilder.tsx`.
- `api/templates/_pst.js`, `api/pst/active.js` y `api/pst/[serviceCode].js`.
- `api/ptf/suggestions/index.js`, `action.js` y `recompute.js`.
- `api/osis/_helpers.js`.
- `api/k/pgd/apply.js` y `api/k/pgd/item.js`.

Se recuperó semántica de plantillas, requisitos, recursos, duración y documentos; no se copiaron repositorios, presets, seeds ni autoridad local histórica.

## D. Modelo Prisma

La migración añade 15 modelos tenant-scoped: `ServiceModeDefinition`, `ServiceCatalogMode`, `ServicePackage`, `ServicePackageVersion`, `ServicePackageVersionMode`, `ServicePackageVersionService`, `ServicePackageRequirement`, `ServiceMaterialPolicy`, `ServiceMaterialPolicyVersion`, `ServiceMaterialPolicyLine`, `CaseServiceConfigurationRevision`, `CaseServiceConfigurationItem`, `ServiceConfigurationCommand`, `ServiceConfigurationAuditEvent` y `ServiceConfigurationConflict`.

Todas las referencias empresariales estables se publican como UUID; las PK internas y `tenantId` no forman parte de los DTO.

## E. Migración

- Migración 34: `20260915010000_v17_service_packages_resources`.
- SHA-256 binario: `23bfcc3ad34e48ef9ff7cb774780d9ab3437d1dbdb2c828e3f522ee958097ace`.
- Tamaño: 32,113 bytes.
- Es aditiva; las migraciones 1–33 no se modificaron.
- Incorpora FK tenant-first, checks de autoridad, índices, un único principal y una única versión publicada por paquete, triggers de inmutabilidad y tablas append-only.

## F. Modos

`ServiceModeDefinition` permite códigos estables, nombre empresarial, estado, orden y versión. LOCAL, EXPORT e IMPORT son datos iniciales posibles, no un enum cerrado ni un seed automático.

## G. Servicios

Se conserva `ServiceCatalogItem` como catálogo único. `ServiceCatalogMode` declara compatibilidad explícita mediante relaciones tenant-first. Durante la transición, la mutación mantiene en la misma transacción el espejo `compatibleModes` consumido por 03A; el resolver avanzado usa la relación, nunca el nombre del servicio.

## H. PRIMARY/COMPLEMENTARY/BOTH

El uso continúa en el catálogo único. El paquete exige un servicio compatible con `PRIMARY` o `BOTH`; cada complementario exige `COMPLEMENTARY` o `BOTH`. Una constraint parcial garantiza un solo principal por versión.

## I. Packages

`ServicePackage` conserva la identidad y el código tenant-first. Su API cerrada acepta nombre, descripción, categoría, tags, modos, principal, complementarios y requerimientos por referencias públicas verificadas.

## J. Package versions

`ServicePackageVersion` conserva versión, vigencia, estado y reemplazo. Una versión publicada no puede editarse; el cambio genera otra versión e inactiva la anterior. Dos publicaciones concurrentes producen un ganador y un 409 estable.

## K. Complementarios

`ServicePackageVersionService` ordena principal y complementarios sin duplicar el catálogo. Se comprueba compatibilidad explícita para cada modo seleccionado.

## L. Personal requirements

Un requisito `PERSONNEL` referencia exclusivamente `OperationalCapability` y expresa cantidad, horas, días y fase. No admite Employee, Membership ni persona concreta.

## M. Material policies

`ServiceMaterialPolicy` y sus versiones permiten alcance por paquete, servicio y/o modo, preferencia, estándar, vigencia y líneas ordenadas. Las políticas equivalentes no se eligen arbitrariamente: generan `ServiceConfigurationConflict`.

## N. Nuevo/reutilizado

Cada línea expresa clase, disposición y proporción configurable. `CONSUMED`, `RENTED`, `RETURNABLE` y `USAGE_CHARGE` distinguen material consumible de recurso reutilizable. No existe una regla global 70/30.

## O. Cargos uso/alquiler

Los cargos admitidos son `INCLUDED`, `SALE`, `RENTAL`, `USAGE`, `PREPARATION`, `MAINTENANCE`, `DETERIORATION` y `REPLACEMENT`, acompañados por reglas JSON acotadas y versionadas.

## P. Equipos

Los requerimientos reutilizables referencian `AssetModel`. Cajas plásticas, mantas u otros retornables pueden modelarse allí; no se fuerza su creación como material 05A. No se asignan instancias concretas ni stock.

## Q. Transporte

`VEHICLE`/`TRANSPORT` expresan tipo, capacidad y cantidad mediante configuración del requerimiento. No almacenan matrícula ni asignan un vehículo concreto.

## R. Duración

Horas, días, fase y supuestos quedan versionados. Son inputs para Scheduling/Motor; no crean citas ni slots.

## S. Case configuration

`CaseServiceConfigurationRevision` combina la revisión publicada de Servicios, paquete, política, Survey, acuerdo, preferencia y duración. Sus items forman un snapshot append-only que el Motor y Costing pueden consumir sin reinterpretar la configuración maestra.

## T. Overrides

Los overrides cerrados permiten ajustar complementarios, recursos, materiales y duración en una nueva revisión del caso. No alteran paquete o política global.

## U. Commercial agreements

Un acuerdo sólo se acepta cuando existe dentro del `PipelineCaseCommercialContextVersion` publicado del mismo tenant y caso. La precedencia es: case override, commercial agreement, service package, service/mode default y manual resolution.

## V. Survey integration

La referencia de Survey debe ser una `SurveyPublication` CURRENT del mismo tenant y caso. Se registra como fuente; 15A no modifica Survey ni selecciona materiales dentro del evaluador.

## W. Motor integration

La configuración final publica requerimientos de personal, assets, transporte, duración, materiales y crating. No monta ni expone el Motor dentro de Comercial y no crea un plan automáticamente.

## X. Costing integration

Costing recibe items resueltos y versionados con su fuente. No recalcula el paquete ni duplica costos en 15A.

## Y. Quote integration

Cotización permanece consumidora de resultados de Costing. La configuración conserva las referencias/versiones que permiten trazabilidad sin reconstruir el paquete en Quote.

## Z. Crating contract

`CRATING` es un requirement referenciable con fase/configuración. El contrato deja `Service Configuration → Crating Requirement → Engineering future`; no implementa Ingeniería/Carpintería.

## AA. AuthorizationContext

Cada request revalida `User`, `TenantMembership` y `Tenant` activos. El actor y tenant proceden exclusivamente del contexto revalidado; A conserva alcance tenant-wide, V usa ownership completo para casos y `deniedPermissions` prevalece.

## AB. Permisos

Se añadieron permisos explícitos sin concesión baseline: `services:packages:view/manage`, `services:materials:view/manage` y `services:case-config:view/update`. Se reutilizan `services:catalog:view/manage` para catálogo y compatibilidad.

## AC. Auditoría

Las mutaciones usan `requestId`, hash canónico recalculado, advisory lock, transacción serializable, `ServiceConfigurationCommand` y `ServiceConfigurationAuditEvent`. Se auditan creación/versionado/publicación, políticas, configuración/override y resolución de conflicto.

## AD. Tests

- Contratos/HTTP: 15 comprobaciones; gate DISABLED devuelve 409 antes de auth, body y Prisma.
- PostgreSQL/domain: 25 comprobaciones, incluyendo idempotencia, tenant isolation, A/V, published immutability y cuatro carreras.
- Guards 15A: 17 negativas.
- Guards de Auth, ICP, Survey, Scheduling, Relaciones, Comunicaciones, Personal, Materiales, Assets, Motor, Costing y Quote: verdes.
- Build, TypeScript, ESLint focalizado y CORS inventory: verdes.

## AE. PostgreSQL

PostgreSQL 18 local aislado validó vacío 34/34, adopción 33→34, segundo deploy sin pendientes, drift vacío, rollback a 33 y replay a 34. Las pruebas confirmaron constraints, inmutabilidad, único ganador concurrente y paridad comando/auditoría.

## AF. Browsers

Playwright completó 18/18: Chromium, Firefox y WebKit, cada uno en desktop y móvil. Cubre selección, configuración final, override y deny previo al lazy load, sin retries ni solicitudes pendientes al cerrar el contexto.

## AG. Guards

Las negativas bloquean ausencia de tenant-first, principal único, append-only, revalidación/deny, auditoría, resolución no auditada, payload hash no canónico, permisos implícitos, Production, porcentajes globales, persona/vehículo/stock concreto, stores legacy e UI incompleta. El inventario CORS queda 151/151, 124 rutas protegidas y cero duplicadas/sin clasificar.

## AH. Histórico mapping

| Histórico | Nuevo destino | Acción |
|---|---|---|
| PST / serviceTypes | ServicePackage + Version + servicios | Recuperar semántica; no importar datos |
| PTF suggestions | ServicePackageRequirement con referencias Material/Asset | Sustituir autoridad legacy |
| PET / recursos | OperationalCapability + cantidades/duración | Conservar requisito, no persona |
| PGD | Requirement/configuración documental futura | Mantener fuera de 15A |
| TemplateRepository / presets | Editor versionado y contratos cerrados | Sólo referencia visual/semántica |
| Packing modes | ServiceModeDefinition + ServiceCatalogMode | Convertir a compatibilidad explícita |
| QuoteBuilder histórico | Costing/Quote canónicos | No reutilizar cálculo local |

## AI. Feature flags

Las APIs reutilizan `CRM_SERVICES_API_MODE`: `DISABLED`, `LOCAL_ONLY` y `PREVIEW_REHEARSAL` fail-closed. No se añadió modo productivo y `productionApiEnabled=false` sigue siendo una guardia obligatoria.

## AJ. Riesgos

- El espejo `compatibleModes` se conserva temporalmente para consumidores 03A; toda mutación avanzada lo sincroniza atómicamente con `ServiceCatalogMode`.
- 15B deberá poblar únicamente fixtures sintéticos aprobados y comprobar selectores de Material/Asset/Capability; 15A no siembra catálogo empresarial.
- La resolución de conflicto está disponible por API auditada; una superficie administrativa dedicada puede ampliarse sin cambiar el contrato.
- Engineering, asignación concreta, disponibilidad/stock, scheduling real, costos y quote permanecen en sus autoridades respectivas.

## AK. Diff

El alcance se limita a Prisma/migración 34, contratos/dominio/rutas de Servicios, permisos, parsers DTO estrictos, UI de configuración, panel final del caso, inventario CORS, guards, pruebas y este documento. No se modificaron Survey, Scheduling, Motor, Costing o Quote funcionales.

## AL. Worktree

El cierre exige todos los cambios comprometidos y `git status` limpio. No hubo push, PR, Preview, Production, Neon, Vercel ni servicios externos.

## AM. Preview siguiente

El siguiente lote obligatorio es `V17-SERVICE-PACKAGES-PREVIEW-15B`: migrar exclusivamente la base Preview aislada, añadir fixtures sintéticos aprobados, habilitar gate fail-closed, validar navegador remoto y detenerse. Portal Cliente no debe iniciarse automáticamente.
