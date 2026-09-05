# V17-CONSOLIDATED-PREVIEW-10A — Contrato de integración

## Alcance

10A integra, sin crear autoridades empresariales, los contratos aprobados de Auth LEGACY, ICP v2, Servicios, Survey, Materiales/Inventario, Herramientas/Equipos, Motor Logístico, Costing y Cotización. Operaciones/OSI, Auth V2 y cualquier modo Production quedan fuera.

## Autoridad y navegación

El shell sigue siendo `App → HubWorkspace → AdvancedErpShell`. La ruta de caso es `/commercial/cases/:caseRef` y su orden único es:

1. Resumen.
2. Servicios.
3. Survey.
4. Motor Logístico.
5. Costing.
6. Cotización.

ICP conserva sus dos pasos y crea/define el caso. Al confirmarse la transacción, la UI abre la Ficha por `caseRef`; ICP no se convierte en tab ni publica la referencia opaca. Materiales/Inventario y Herramientas/Equipos permanecen como aplicaciones de Recursos, fuera de la Ficha.

## Resumen y progreso

El resumen consume sólo GET publicados y representa estados reales:

- ICP: detalle v2 y ruta snapshot vigente.
- Servicios: selección primaria y complementarios vigentes.
- Survey: agenda del actor y estado del caso.
- Motor: última revisión publicada.
- Costing: última revisión publicada.
- Cotización: propuestas vigentes y aceptación.

Empresa, Lead Account y Booker se muestran como `No publicado` mientras el DTO no los exponga. No se infieren. La etiqueta `Listo para Operaciones` es informativa y sólo aparece con una propuesta `ACCEPTED`; no persiste estado ni ejecuta handoff.

## Seguridad y tenancy

- Cada superficie exige su modo exacto, permiso efectivo y ausencia de deny.
- Los módulos siguen detrás de `React.lazy`; las rutas no autorizadas se detienen en el shell.
- Survey, Materiales y Activos comprueban que la aplicación esté en el catálogo visible del actor antes de renderizar su lazy boundary.
- El selector de Membership revalida la nueva sesión, limpia estado tenant-scoped, reemplaza la ruta por `/hub` y remonta `AuthenticatedApp` con la nueva `membershipRef`.
- `caseRef`, `clientRef` y otras referencias opacas sólo viajan como contratos de API/ruta; la UI principal muestra códigos y nombres publicados.

## Modos de Preview

La única rama integrada autorizada es `feature/v17-consolidated-preview`. Cada dominio mantiene su batch original y acepta `PREVIEW_REHEARSAL` sólo con `VERCEL_ENV=preview`, rama exacta, Auth LEGACY, tenancy canónica y sus gates previos. No se agregó ningún valor Production.

| Dominio | UI consumer | API consumer | Preview | Production |
|---|---|---|---|---|
| Auth | `App` / selector Membership | `/api/auth/*` | LEGACY | 0 cambios |
| ICP | `IcpIntakeForm`, `CaseWorkflowOverview` | `/api/crm/icp-v2/*` | `PREVIEW_REHEARSAL` | 0 consumidores nuevos |
| Servicios | `ServiceCasePanel`, resumen | `/api/crm/services/*` | `PREVIEW_REHEARSAL` | 0 consumidores nuevos |
| Survey | `SurveyCasePanel`, `SurveyApp` | `/api/crm/survey/*` | `PREVIEW_REHEARSAL` | 0 consumidores nuevos |
| Materiales | `MaterialsInventoryApp` | `/api/materials/*` | `PREVIEW_REHEARSAL` | 0 consumidores nuevos |
| Herramientas/Equipos | `ToolsEquipmentApp` | `/api/assets/*` | `PREVIEW_REHEARSAL` | 0 consumidores nuevos |
| Motor Logístico | `LogisticsPlanPanel`, resumen | `/api/logistics/*` | `PREVIEW_REHEARSAL` | 0 consumidores nuevos |
| Costing | `CostingPanel`, resumen | `/api/costing/*` | `PREVIEW_REHEARSAL` | 0 consumidores nuevos |
| Cotización | `QuotePanel`, resumen | `/api/quote/*` | `PREVIEW_REHEARSAL` | 0 consumidores nuevos |

En todos los dominios: `productionApiEnabled=false`.

## Límites de dominio

- Survey no selecciona materiales; sólo muestra y edita su autoridad propia.
- Materiales derivados proceden de receta/publicación autorizada.
- Costing consume una revisión publicada del Motor y no lo recalcula.
- Quote consume un Costing publicado y no lo recalcula.
- Una propuesta aceptada congela las acciones de decisión de las otras propuestas en la UI integrada.
- No se creó migración 30 ni se modificaron modelos, estados, permisos o cálculos.

## Publicación segura

Un Preview remoto sólo puede publicarse cuando exista una base aislada comprobada en 29/29 y variables limitadas al scope Preview y a la rama exacta. La secuencia autorizable es:

1. Crear o seleccionar una rama Neon no productiva con 29/29 y fixtures exclusivamente sintéticos.
2. Configurar en Vercel Preview los modos `PREVIEW_REHEARSAL`, batches históricos exactos, Auth LEGACY y tenancy canónica; no crear variables equivalentes en Production.
3. Asociar las variables sólo a `feature/v17-consolidated-preview`.
4. Hacer push normal de la rama y esperar exclusivamente el Preview Git automático.
5. Validar URL inmutable, `/api/info`, 29/29, cross-tenant, denies, chunks, CORS y cuatro escenarios sintéticos antes de compartir la URL.

No se reutiliza la base antigua 19/19 ni se conecta un deployment 10A a Production.
