# V17 Canonical UI ERP 01A — Inventario

Estado: análisis documental; no implementado. Fecha de corte: 2026-08-20.

## Autoridades verificadas

| Autoridad | Identidad verificada | Uso permitido |
|---|---|---|
| Técnica | `origin/main` `e3ed7023e122ac73656e54a149cee040de66b93b`; 17 migraciones | Autenticación, tenant, permisos, modelos, APIs, guardias y contratos públicos |
| Visual | snapshot `osi-plus-erp-v17-modern-baseline-20260814`; commit `61a3e8a4525efedfc99120fb5e4845ba45234ba1`; tree `9b13d9a8be5fcce025c5a3e471b02fbb812934f9` | Composición, jerarquía, lenguaje visual, navegación y flujos avanzados |
| Histórica protegida | `opt/phase-2-limpieza` `58a0db6fe937a25ba0e861b3a8de260cf7ff66d4`, dirty | Sólo referencia si faltara una pantalla; no fue necesaria para completar este inventario |

El snapshot y la fuente histórica permanecieron sin cambios. No se leyeron `.env`, storage histórico, credenciales ni datos empresariales.

## Resultado ejecutivo

La experiencia avanzada no debe copiarse como una aplicación monolítica. Su shell, jerarquía visual y numerosos componentes presentacionales son aprovechables; sus autoridades locales no lo son. El muestreo completo encontró 67 archivos que usan `localStorage`, 48 que referencian mocks, 26 que referencian `caseBridge`, 19 que referencian `salesStore` y 6 que referencian `useCasesStore`. Esas dependencias obligan a adaptar o reimplementar las fronteras de datos.

La base canónica ya ofrece una fundación segura para el primer vertical:

- Hub inactivo y lazy, con rutas `/commercial`, `/crm` y `/sales/pipeline`.
- Autorización basada en User, TenantMembership, Tenant y `pipeline:view`; `deniedPermissions` prevalece.
- Lista, detalle y resumen de PipelineCase mediante contratos públicos estrictos.
- Cliente receptor tenant-first opcional en PipelineCase desde migración 17.
- Estados y owner relacionales, lectura paginada y fencing/abort en frontend.

No existe todavía autoridad canónica completa para Survey 1:N del PipelineCase, partes comerciales tipadas, ubicaciones múltiples, componentes de servicio, cotizaciones alternativas/versiones/FX, inventario y reservas tenant-first, crating integral, PIC/dispatch ni contabilidad. Esas brechas deben resolverse por lotes aditivos, sin fallback a storage.

## Reglas de convergencia

1. El snapshot manda en apariencia y flujo; `main` manda en seguridad y persistencia.
2. PostgreSQL es la única autoridad empresarial. Storage del navegador sólo podrá ser caché descartable y nunca cola o fuente de verdad.
3. User, TenantMembership y Tenant determinan identidad y pertenencia. Un rol del catálogo sólo habilita navegación baseline; no concede acciones internas.
4. `deniedPermissions` siempre prevalece. Query, hash, URL, storage y headers `x-osi-*` no conceden autoridad.
5. Toda respuesta pública usa DTO explícito. No se publican IDs internos, tenantId, membershipId, clientId, permisos ni objetos Prisma completos.
6. Ningún GET escribe, recalcula, sincroniza, crea comandos o avanza estados.
7. No se permiten mocks runtime, dual writes, fallback silencioso, inferencias por texto ni reaprovechamiento de ServiceCase como autoridad nueva.
8. Se porta por superficie visual, no por árbol de imports. Un componente con store inseguro se reimplementa aunque su aspecto se conserve.

## Auditoría de rutas y portabilidad directa

La columna `Ruta histórica` distingue tres casos: URL real (`/sales/pipeline`, `/admin/logistic-engine`, `/admin/evaluator-catalog`), identificador real del `switch` de `src/App.tsx` (`commercial-relations`, `sales-quote-v3`, `evaluator-app`, etc.) y subcomponente sin ruta propia, marcado expresamente con `—`. Las secciones y tabs internos ya no se presentan como rutas independientes. Las tres rutas canónicas del Inbox (`/commercial`, `/crm` y `/sales/pipeline`) se verificaron en `src/hub/appCatalog.ts`.

Las tres filas clasificadas `Directa` fueron revisadas con sus dependencias transitivas relevantes:

| Superficie | Grafo revisado | Resultado |
|---|---|---|
| Hub de aplicaciones | `HubWorkspace` → `appCatalog`, `hubAccess`, `hubMode`, resolver Preview y etiqueta ambiental | Reutilizable como fundación canónica; no importa mocks, stores empresariales ni storage. `src/App.tsx` contiene usos locales de otros módulos y no forma parte de esta clasificación directa. |
| Resumen y filtros | `CommercialInboxModule` → `CrmPipelineReadApi`, tipos estrictos y primitivas UI | Reutilizable; la fuente es GET relacional, con abort/fencing y sin fallback. |
| Drawer de detalle | Mismo grafo del Inbox + `Sheet` accesible | Reutilizable; no carga stores, bridges, mutaciones ni IDs Prisma adicionales. |

`Directa` significa “reutilizar la implementación canónica existente”, no copiar el archivo aislado a otra arquitectura. Cualquier cambio futuro en ese grafo obliga a reauditar la clasificación.

## Inventario de navegación y shell

La aplicación avanzada usa `src/App.tsx` como coordinador de módulos, `src/components/layout/Sidebar.tsx` para navegación y `src/lib/roleModuleMap.ts` como mapa visual. También usa `pushState`, eventos y persistencia local para conservar módulos. Estos tres archivos son referencia visual, no autoridad reusable completa.

El shell canónico de `main` ya dispone de `src/hub/HubWorkspace.tsx`, `src/hub/appCatalog.ts` y `src/hub/hubAccess.ts`. Éste debe ser el destino: lazy loading, rutas profundas, sesión canónica y decisión uniforme entre tarjeta y acceso directo. El catálogo no concede permisos.

## Inventario funcional por dominio

### Comercial y CRM

- `src/modules/commercial/v7/CommercialWorkspaceV7.tsx`: workspace avanzado y ficha; depende de `CasesStoreProvider/useCasesStore`. Reimplementar la frontera de datos.
- `src/modules/commercial/v7/components/InboxTableView.tsx`: tabla avanzada, filtros, badges y acceso a ficha. Adaptable sobre el Inbox canónico.
- `src/modules/commercial/v7/components/CasePipelineControl.tsx`: representación de estados y acciones; sólo la lectura es portable ahora.
- Tabs `CaseTabOverview`, `CaseTabSurvey`, `CaseTabQuoteEditor`, `CaseTabCrating`, `CaseTabHandoff`: conservar disposición; activar por fases.
- `src/modules/sales/components/pipeline/PipelineBoard.tsx` y `CaseDetails.tsx`: visualmente útiles, pero ligados a contratos y stores históricos.
- `src/modules/commercial/CommercialRelationsModule.tsx`, `CommercialCalendarModule.tsx` y `CommercialClosedCasesPage.tsx`: vinculaciones, agenda y cierres; requieren autoridad relacional y APIs posteriores.
- Destino actual: `src/commercial-crm/CommercialInboxModule.tsx` y `src/crm-relational/readApi.ts`.

### Evaluador y Survey

- `src/modules/evaluator-app/EvaluatorVisitApp.tsx` y sus secciones CheckIn, Inventory, Access, Risk, Summary y TechnicalSummary ofrecen la experiencia móvil deseada.
- La aplicación usa stores del evaluador, settings locales, mocks y sincronización local. No debe portarse como autoridad.
- El esquema actual contiene `Survey` ligado a Lead y un único `SurveySiteAccess`, además de `CaseSurvey` ligado al ServiceCase histórico. Ninguno satisface todavía PipelineCase → Survey 1:N, ubicaciones 1:N, revisiones inmutables y evaluador tenant-first.
- Se requiere el lote futuro de Survey antes de conectar estas pantallas.

### Cotización

- `src/modules/sales-quote-v3/SalesQuoteWorkspace.tsx` concentra ficha, Survey, tarifas, costos, cotización, versiones y seguimiento. Su composición es la referencia, pero importa múltiples stores, mocks y bridges.
- Son adaptables selectivamente `CaseInfoSummarySection`, `CaseAddressPanel`, `MiniSurveyPanel`, `SurveyResultPanel`, `SurveyPicCommunicationPanel`, `QuotePreflightPanel` y diálogos.
- `CaseQuote`, `QuoteVersion`, `QuoteLineItem`, `ApprovalRequest` y `CommercialAuditLog` existen, pero pertenecen al modelo ServiceCase histórico y no expresan aún alternativas 1:N de PipelineCase, service components, snapshots FX completos ni autoridad tenant-first suficiente.

### Tarifas y costos

- La UI vive parcialmente en `SalesQuoteWorkspace`, `CommercialRelationsModule` y `LogisticEngineAdminModule`.
- Existen MasterTariff, rate sets/bands, perfiles, overrides, recargos, geo, zonas y vehículos. Varias tablas no están todavía tenant-first y no existe API pública integral de edición/aplicación de tarifas para el vertical.
- PST describe servicio e inputs requeridos; no sustituye una tarifa.

### Materiales, almacenes y equipos

- `InventoryModule`, `WMSModule`, `WarehouseAdminModule`, `PurchasesModule` y `FleetAdminModule` contienen superficies útiles.
- Inventory/WMS consumen mocks y stores locales; no son portables como autoridad.
- `CatalogMaterial` existe, pero carece de tenantId; faltan autoridades consistentes para stock, costo, almacén, lote, reserva, movimiento y relación con Survey/Quote/Project.

### Cajas y taller

- `CrateWoodModule`, `CrateSettingsModule`, `NestingModule`, `NestingV2Module`, `DisenaCotizaModule` y `CarpentryModule` cubren solicitud, cálculo, diseño y fabricación.
- Existen `PipelineCratingRequest`, `CratingRequest`, snapshots y settings, pero están divididos entre PipelineCase y ServiceCase, sin vertical tenant-first completo.

### Administración y personal

- `UsersModule`, `SettingsModule`, `ClientsModule`, `TemplatesCenterModule` y `FleetAdminModule` son referencias visuales.
- `UsersModule` y pantallas relacionadas todavía mezclan mocks/local stores con APIs. La autoridad canónica es User + TenantMembership + Tenant; EmployeeProfile y provisioning son complementarios.
- Client actual conserva campos de facturación/contacto heredados; para el nuevo vertical Client significa receptor del servicio. Pagador, aprobador, institución y Lead Account se modelarán como partes separadas.

### Coordinación y operaciones

- `ProjectsModule`, `KDashboardModule`, `KProjectModule`, `OSIModule`, `OperationsModule`, `DispatchModule`, `TrackingModule`, `SupervisorModule`, `DriverModule`, `SecurityModule`, `FieldWorkerModule` y `WallModule` cubren Project → OSI y ejecución.
- Main ya contiene APIs Project/K/PGD/OSI, pero el snapshot mezcla stores y fallbacks. La convergencia debe ocurrir después del handoff comercial explícito.

### Recursos Humanos

- `HRModule`, `KPIModule`, `NOTAModule`, `SupervisorNotaModule`, `BadgesModule`, `BillingModule`, `MaintenanceModule` y `MechanicModule` son superficies visuales.
- Faltan contratos canónicos integrales para nómina, asistencia, desempeño, badges y órdenes de mantenimiento. No deben reconstruirse sobre mockUsers o almacenamiento local.

## Cadena canónica objetivo

```text
Tenant
 ├─ User ─ TenantMembership ─ permisos/denies
 ├─ Client (receptor del servicio)
 ├─ CommercialParty/roles futuros
 │   ├─ contacto principal y responsables documentales
 │   ├─ aprobador
 │   ├─ pagador/BILL_TO
 │   ├─ institución patrocinadora
 │   └─ Lead Account/agente
 └─ PipelineCase
     ├─ Client principal (migración 17; nullable durante expansión)
     ├─ ComplianceProfile (STANDARD/DIPLOMATIC/CUSTOMS_SPECIAL/OTHER)
     ├─ Locations 1:N y ServiceComponents 1:N
     ├─ Surveys 1:N ─ revisiones, inventario, accesos, riesgos y evidencia
     ├─ Crating/materiales/logística
     ├─ Quotes 1:N ─ QuoteVersions inmutables ─ FX/margen/aprobaciones
     ├─ PIC/comunicaciones/auditoría
     └─ Project ─ coordinación ─ OSI ─ ejecución/handoff
```

Un caso puede tener varias direcciones y ubicaciones de tipo origen, destino, parada adicional, almacenamiento, puerto, aeropuerto o aduana. `CaseMode` deberá distinguir EXPORT, IMPORT, LOCAL, NATIONAL y COMMERCIAL; los componentes combinables incluyen AIR, SEA_LCL, SEA_FCL, transporte nacional, packing, unpacking, storage, crating, manejo tecnológico, manejo especializado, mano de obra y otros. Terceros y proveedores logísticos son partes/recursos explícitos, nunca texto que se convierta en autoridad. Puede haber varias alternativas de cotización.

El perfil diplomático es ortogonal a la relación comercial y al pagador. Un cliente comercial puede ser una organización receptora, pero una institución, Lead Account, aprobador o pagador no se convierte automáticamente en Client. Cada Quote conserva moneda cotizada, moneda tarifaria, política y snapshot de conversión; la política de comisión cambiaria se congela en la versión. Registrar factura, comisión efectiva o pago nunca modifica una QuoteVersion aceptada.

## Estado de autoridades actuales

| Capacidad | Estado canónico hoy | Decisión |
|---|---|---|
| Identidad y tenant | Soportado | Reutilizar sin adaptación de autoridad |
| Hub y acceso lazy | Soportado e inactivo por defecto | Reutilizar |
| Pipeline lista/detalle/resumen | Soportado por API pública | Reutilizar y ampliar DTO sólo cuando sea necesario |
| PipelineCase → Client | Soportado, nullable | Usar en lectura; no inferir ni backfill automático |
| Estado, owner y journal | Soportado | Sólo lectura en primer vertical |
| Partes/roles y ubicaciones múltiples | Falta modelo canónico | Migración futura separada |
| Survey PipelineCase 1:N | Falta modelo canónico | Migración futura separada |
| Materiales/reservas tenant-first | Parcial/insuficiente | Diseño y migración posterior |
| Crating integral tenant-first | Parcial y dividido | Unificar por adaptador/migración posterior |
| Quote alternativa/versionada/FX | Parcial sobre ServiceCase | Modelo aditivo posterior |
| PIC y dispatch | Parcial | Lote posterior |
| Project → OSI | Soportado parcialmente | Integrar tras handoff |
| Portal Cliente y OSi Survey | Diseño aprobado, no implementado | Fases dedicadas |

## Bloqueadores por prioridad

- P0: ninguna pantalla puede escribir mediante mock, storage o bridge; ninguna ruta puede ampliar autoridad.
- P1: partes comerciales y ubicaciones; Survey 1:N tenant-first; alternativas de Quote/versiones/FX; inventario/reservas tenant-first; separación del modelo ServiceCase histórico.
- P2: catálogos globales deben convertirse en plantillas clonables tenant-first; contratos de analítica, HR, mantenimiento y portal; migración gradual de navegación histórica.

La matriz CSV adjunta contiene el inventario pantalla por pantalla, sus archivos reales, dependencias, portabilidad y fase propuesta.
