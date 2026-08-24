# V17-ERP-CRM-FOUNDATION-02A — Resultado local

## Resultado

Se implementó localmente el primer núcleo consolidado:

`OSi Plus Hub → ERP avanzado → Inbox Comercial → Ficha del Caso`

El bloque permanece desactivado por defecto y sólo puede montarse cuando coinciden las compuertas ya canónicas de Hub y CRM de lectura, la sesión revalidada y el permiso efectivo `pipeline:view`. No se añadieron mutaciones, mocks runtime, stores históricos ni persistencia empresarial en el navegador.

## Componentes recuperados

- Shell ERP azul con identidad del usuario, navegación colapsable y comportamiento responsive.
- Secciones General, Administración, Comercial, Coordinación, Operaciones, Campo y Taller, Logística y Recursos Humanos.
- Inbox compacto con Caso, Cliente receptor, Ruta, Tipo/modo, Estado, SLA y acción de Ficha.
- Encabezado avanzado de Caso Comercial.
- Tabs Ficha del Caso, Survey y Cotización.
- Composición de tarjetas y secciones de cliente, servicio, canal/responsable, fechas, direcciones y alcance.

La recuperación es presentacional. No se copiaron `App.tsx`, Prisma, configuración, `CommercialWorkspaceV7`, `InboxTableView`, `SalesQuoteWorkspace` ni sus stores.

## Componentes adaptados

- La tarjeta Comercial del Hub abre el ERP avanzado únicamente después de la autorización previa al lazy import.
- `AdvancedErpShell` reproduce el shell azul y marca las áreas no conectadas como **En integración**.
- `CommercialInboxModule` conserva búsqueda, filtros y paginación server-side y presenta el Client receptor relacional.
- `CommercialCaseDetail` conserva la Ficha avanzada y ofrece Survey/Cotización como superficies visibles pero no funcionales.
- El GET de detalle fue extendido con un DTO cerrado formado sólo por columnas canónicas existentes y conteos relacionales.
- El regreso a Pipeline conserva búsqueda, filtros y página mientras el módulo permanece montado en la sesión activa.

## Contratos utilizados

- `GET /api/crm/pipeline-cases`
- `GET /api/crm/pipeline-cases/:caseRef`
- `GET /api/crm/pipeline-summary`
- `GET /api/auth/me` para revalidación de sesión antes de navegación protegida.

`PipelineCase.publicRef` se publica únicamente como `caseRef`. Las consultas de detalle usan `tenantId + publicRef`; el Client procede exclusivamente de `PipelineCase.clientId → Client`. No se publica CUID, `publicRef`, `clientId`, `tenantId`, Membership ID ni User ID.

## Campos disponibles

### Lista

- `caseRef`, `caseCode`.
- Client receptor: nombre de presentación, tipo y estado.
- modo, tipo de servicio, perfil de cliente y estado del caso.
- volumen estimado, requisito/método de Survey.
- origen y destino textuales; indicador de destino contratado.
- activos, conteos de cotizaciones/eventos.
- owner de presentación.
- fechas de creación y actualización.

### Detalle

- Los mismos campos de identificación pública, Client, servicio, ruta, alcance y fechas necesarios para la Ficha.
- Conteos de eventos y cotizaciones, sin cargar sus contenidos.

## Campos pendientes o no disponibles

- Prioridad, canal de procedencia, SLA por caso y fechas sugeridas/programadas.
- Teléfonos, correos y documentos del receptor.
- Institución, Lead Account, pagador, aprobador, sponsor y contactos tipados.
- Múltiples orígenes, destinos y paradas; instrucciones, ventanas y acceso por ubicación.
- Componentes de servicio múltiples.
- Perfil de cumplimiento, incluido el diplomático ortogonal.
- Moneda, términos, Survey, Quote, Project, OSI e historial empresarial completo.

Estos campos se ocultan o se muestran como **No disponible**. No se infieren desde `clientName`, owner, Lead, Project, ServiceCase, storage ni texto histórico.

## Decisión sobre migración 19

No se creó migración 19.

El análisis de compatibilidad no permite definir todavía las relaciones con integridad tenant-first:

- `BusinessEntity` no tiene `tenantId`, usa `code` global y hoy sirve a Lead/Commission.
- `EntityContact` depende de `BusinessEntity` y tampoco es tenant-first.
- `Contact` es otra autoridad global usada por Account, ServiceCase, CommercialEvent y CaseSurvey.
- `Location` no es tenant-first y representa una sola clasificación por fila.
- `ServiceCase` conserva roles fijos de contacto/pagador/aprobador y un único origen/destino; está congelado como autoridad futura.

Crear ahora `PipelineCaseParty` sobre cualquiera de esas autoridades exigiría decidir ownership, deduplicación y migración de contratos existentes. Crear una tabla paralela sin esa decisión duplicaría autoridad. La UI continúa con `Client` y los escalares actuales de `PipelineCase`.

## Diferencias visuales deliberadas

- Se eliminó **Nuevo Caso** y cualquier control operativo porque este lote es de lectura.
- SLA se muestra como **No disponible**; no se reproduce el marcador vencido del snapshot sin autoridad.
- Survey y Cotización conservan sus tabs, pero muestran **En integración** y no descargan módulos ni consultan APIs adicionales.
- Las áreas ERP no conectadas se muestran en el menú, pero no abren páginas vacías.
- La Ficha no muestra teléfono, correo, moneda, programación ni accesos inexistentes en el DTO.
- Se reemplazaron IDs y nombres históricos por presentación canónica y fixtures sintéticos sólo en pruebas/capturas.

## Evidencia visual local

- [Hub](evidence/V17-ERP-CRM-FOUNDATION-02A/01-hub.png)
- [Inbox Comercial desktop](evidence/V17-ERP-CRM-FOUNDATION-02A/02-inbox-desktop.png)
- [Inbox Comercial móvil](evidence/V17-ERP-CRM-FOUNDATION-02A/03-inbox-mobile.png)
- [Ficha del Caso desktop](evidence/V17-ERP-CRM-FOUNDATION-02A/04-ficha-desktop.png)
- [Ficha del Caso móvil](evidence/V17-ERP-CRM-FOUNDATION-02A/05-ficha-mobile.png)
- [Survey — En integración](evidence/V17-ERP-CRM-FOUNDATION-02A/06-survey-en-integracion.png)
- [Cotización — En integración](evidence/V17-ERP-CRM-FOUNDATION-02A/07-cotizacion-en-integracion.png)

Las capturas se generan mediante un servidor loopback y contratos sintéticos. No contienen datos reales ni requieren servicios externos.

## Validación local

- Núcleo/DTO/esquema: 21/21 aserciones.
- Evidencia visual: 2/2 (desktop y móvil).
- Hub/lazy boundary: 102/102 en Chromium, Firefox y WebKit, desktop y móvil.
- Guardia previa al lazy: 23/23.
- Guardia de carrera del arnés: 12/12.
- Inbox/Ficha: 90/90 en los seis perfiles de navegador.
- Build y TypeScript focalizado.
- 18 migraciones existentes; migración 19 ausente.

## Próximo lote exacto

`V17-ERP-CRM-FOUNDATION-02B — Preview funcional aislado`

Debe publicar una única revisión funcional de este bloque con fixtures exclusivamente sintéticos y base Preview aislada, mantener mutaciones desactivadas y validar visualmente Hub, Inbox y Ficha antes de diseñar Survey, Cotización o migración 19.
