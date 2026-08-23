# V17-COMMERCIAL-VERTICAL-01A — Especificación

Estado: propuesta implementable, no implementada.

## Objetivo

Entregar el primer vertical canónico del ERP: Hub → Inbox/Pipeline → Ficha del Caso, conectado exclusivamente a PipelineCase y su Client receptor, en lectura. Debe conservar la experiencia visual avanzada sin importar sus stores, mocks ni bridges.

## Alcance

Incluye:

- Hub y descriptor `commercial-crm`.
- Inbox compacto con resumen, búsqueda, filtros, asignado/sin asignar y paginación servidor.
- Rutas equivalentes `/commercial`, `/crm` y `/sales/pipeline`.
- Ficha profunda del caso con encabezado, datos generales, receptor publicado, ruta resumida, servicio, estado, owner y actividad/historia básica.
- Estados `APPROVED` como legacy congelado y `OPS_HANDOFF` como terminal.
- Empty state empresarial cuando el tenant no tiene casos.
- Roles baseline A/V, siempre condicionados por `pipeline:view` y sesión revalidada.

No incluye:

- Crear/editar casos, asignar owner, transicionar, reabrir o handoff.
- Survey, Evaluador, materiales, cajas, tarifas, costos, Quote, PIC o Portal Cliente.
- Partes comerciales, pagador, aprobador, institución, Lead Account o compliance.
- Backfill de `clientId` o inferencia desde `clientName`, owner, ServiceCase o texto.

## Fuentes visuales

Portar selectivamente:

| Superficie | Fuente | Tratamiento |
|---|---|---|
| Encabezado y densidad del workspace | `src/modules/commercial/v7/CommercialWorkspaceV7.tsx` | Reimplementar layout; no importar provider/store |
| Tabla compacta y badges | `src/modules/commercial/v7/components/InboxTableView.tsx` | Adaptar a DTO relacional |
| Estado/pipeline | `src/modules/commercial/v7/components/CasePipelineControl.tsx` | Sólo representación read-only |
| Ficha general | `src/modules/commercial/v7/components/tabs/CaseTabOverview.tsx` | Adaptar campos publicados |
| Ficha tabulada | `src/modules/sales/components/pipeline/CaseDetails.tsx` | Reusar patrón visual, no contrato/store |
| Implementación segura existente | `src/commercial-crm/CommercialInboxModule.tsx` | Base funcional y de accesibilidad |

No se copia `CommercialWorkspaceV7` completo, `useCasesStore`, `caseBridge`, `salesStore`, `NewCaseModal`, mocks, colas ni persistencia browser-side.

## Autoridad y acceso

El acceso requiere simultáneamente:

1. Compuerta Hub autorizada para el entorno.
2. Compuerta del cliente CRM autorizada.
3. Compuerta de lectura CRM autorizada.
4. Contexto autenticado vigente.
5. User activo.
6. TenantMembership ACTIVE para el tenant activo.
7. Tenant ACTIVE.
8. Rol baseline A o V para navegación.
9. Permiso explícito `pipeline:view`.
10. Ausencia de deny efectivo para `pipeline:view`.

El rol baseline no concede el permiso. La misma función decide tarjeta, ruta directa, reload y aliases. Antes de autorizar, no se descarga el chunk ni se hace request CRM. Query, hash, localStorage, sessionStorage y `x-osi-*` no alteran la decisión.

## Modelos canónicos

- `PipelineCase`: raíz de lectura comercial.
- `Client`: receptor del servicio, relacionado tenant-first mediante `PipelineCase.clientId`; puede ser null durante expansión.
- `TenantMembership` + `User`: owner relacional publicado mediante display name/role/status controlados.
- `PipelineEvent` y `PipelineCaseCommand`: fuentes posibles para historia básica; el GET futuro debe proyectar sólo eventos permitidos.
- `Project`: sólo indicador de handoff si el contrato lo publica; no incluir sus IDs.

ServiceCase, Lead, Account, BusinessEntity y stores históricos no son fallback.

## Disponibilidad real de datos

### Disponibles mediante las APIs actuales

Los tres GET vigentes publican lista, resumen y detalle mediante contratos cerrados. Lista y detalle usan `caseRef` como representación pública de `PipelineCase.publicRef`, muestran un único `caseCode` y proyectan `client` exclusivamente desde la relación tenant-first. También están disponibles `mode`, `serviceType`, `customerType`, `status`, `estimatedCbm`, `requiresSurvey`, `surveyMethod`, origen/destino resumidos, `destinationContracted`, `assetsCount`, owner sanitizado, conteos de eventos/cotizaciones y fechas de creación/actualización. El resumen publica total, asignadas, sin asignar y conteo por estado; SLA declara `UNAVAILABLE`.

### Ausentes en los contratos actuales

- `statusChangedAt`, versión y una historia pública ordenada.
- Datos generales adicionales de la Ficha que no estén en el DTO anterior.
- Project/handoff publicado, ubicaciones múltiples, partes comerciales, compliance y componentes de servicio.
- Survey, Quote, materiales, cajas, costos, PIC y documentos.

La proyección pública vigente es `client: { displayName, type, status } | null`, construida desde la FK tenant-first. `clientId=NULL` siempre produce `client:null`; `clientName` heredado no se selecciona, no participa en búsquedas y no se publica.

### Campos que no deben inventarse

No derivar Client, pagador, aprobador, institución, Lead Account, perfil diplomático, owner, estado, SLA, Project, Survey, Quote, direcciones múltiples, modo nacional/aéreo/marítimo, moneda, costo ni actividad desde textos, conteos, nombres, ServiceCase, Lead, storage o presencia de tabs. Un conteo `quoteCount` no concede acceso ni permite reconstruir una cotización. `originLocation` y `destinationLocation` son resúmenes históricos, no una colección de ubicaciones.

## Contratos GET

### Existentes y obligatorios

`GET /api/crm/pipeline-cases`

- Query permitida: `page`, `pageSize`, `status`, `mode`, `serviceType`, `q`, `unassigned`.
- Paginación server-side, máximo vigente del servidor.
- Respuesta: `total`, `page`, `pageSize`, `data`.
- Cada caso publica sólo `caseRef`, `caseCode`, `client`, mode, serviceType, customerType, status, estimatedCbm, requiresSurvey, surveyMethod, ruta resumida, owner sanitizado, quoteCount, eventCount y timestamps.

`GET /api/crm/pipeline-cases/:caseRef`

- Tenant scoping obligatorio.
- Cross-tenant y ausente producen el mismo 404.
- No publica tenantId, clientId, ownerMembershipId, ownerUserId, permisos ni objeto Prisma.
- Resuelve exclusivamente `(tenantId, publicRef)`; CUID, UUID no canónico, ausente y cross-tenant producen el mismo 404.

### DTO públicos exactos

```ts
type PublicClient = {
  displayName: string;
  type: string | null;
  status: string;
};

type PublicListOwner = {
  displayName: string;
  role: string;
  membershipStatus: string;
};

type PublicDetailOwner = {
  displayName: string;
};

type PublicPipelineCaseListItem = {
  caseRef: string;
  caseCode: string;
  client: PublicClient | null;
  mode: PipelineMode;
  serviceType: string;
  customerType: PipelineCustomerType;
  status: PipelineCaseStatus;
  estimatedCbm: number;
  requiresSurvey: boolean;
  surveyMethod: PipelineSurveyMethod;
  originLocation: string;
  destinationLocation: string;
  destinationContracted: boolean;
  assetsCount: number;
  owner: PublicListOwner | null;
  quoteCount: number;
  eventCount: number;
  createdAt: string;
  updatedAt: string;
};

type PublicPipelineCaseDetail = {
  caseRef: string;
  caseCode: string;
  status: PipelineCaseStatus;
  mode: PipelineMode | null;
  serviceType: string | null;
  client: PublicClient | null;
  owner: PublicDetailOwner | null;
  createdAt: string;
  updatedAt: string;
};
```

Los contratos son exactos: cualquier campo adicional, tipo incorrecto, fecha inválida, string excesivo, estado desconocido o respuesta mayor de 1 MB produce `CRM_PIPELINE_RESPONSE_INVALID`, sin conservar datos parciales ni ejecutar retry automático.

`GET /api/crm/pipeline-summary`

- Total, asignadas, sin asignar y conteos por estado.
- SLA permanece explícitamente no disponible hasta existir autoridad.

### Ampliación mínima propuesta

La Ficha puede implementarse inicialmente con el detalle existente. Si la revisión visual exige historia, añadir sólo:

`GET /api/crm/pipeline-cases/:caseRef/history?cursor=&pageSize=`

DTO propuesto por entrada:

```ts
type PublicPipelineHistoryItem = {
  occurredAt: string;
  kind: "STATUS" | "OWNER" | "NOTE" | "SYSTEM";
  label: string;
  actorDisplayName: string | null;
  fromStatus: PipelineCaseStatus | null;
  toStatus: PipelineCaseStatus | null;
};
```

No publicar payload, requestId, hashes, membershipId, userId, tenantId, evidenceId ni campos internos. Si no se implementa el endpoint, mostrar “Historial detallado disponible en una fase posterior”; no inventar eventos desde timestamps.

## Campos visibles

| Grupo | Campos permitidos | Regla |
|---|---|---|
| Identidad del caso | caseCode | Nunca mostrar PK interna |
| Receptor | `client` canónico o “Client receptor no vinculado” | Sólo `PipelineCase.client`; nunca `clientName` heredado |
| Servicio | mode, serviceType, customerType | Enumeraciones estrictas |
| Estado | status, statusChangedAt si se publica | Etiquetas exactas, sin LeadLite mapping |
| Asignación | owner displayName y rol publicado | Nunca membershipId/userId |
| Ruta | origin/destination resumidos | No sustituye PipelineCaseLocation futura |
| Métricas | estimatedCbm, eventCount, quoteCount | Finite y no negativos; no implica acceso a Quote |
| Survey | requiresSurvey, surveyMethod | Indicador, no navegación a Survey |
| Fechas | createdAt, updatedAt | ISO validado y formato local sólo en presentación |

## Estados de interfaz

- Loading: skeleton/estado anunciado; datos previos no se mezclan con otra consulta.
- Empty: “Aún no hay oportunidades reales registradas para este tenant”.
- 401: invalidar sesión local según contrato LEGACY y pedir login.
- 403: acceso denegado, sin descargar datos parciales.
- 404: recurso ausente o de otro tenant, indistinguible.
- 409: CRM desactivado.
- 503: configuración/servicio no disponible.
- Contrato inválido: `CRM_PIPELINE_RESPONSE_INVALID`; no convertirlo en lista vacía.
- Abort: al desmontar/cerrar/cambiar consulta.
- Fencing: una respuesta tardía nunca sustituye la más reciente.

## Interacciones

- Búsqueda con debounce acotado; una solicitud por cambio estabilizado.
- Filtros de status/mode/asignación reinician a página 1.
- Paginación mantiene filtros y usa respuesta del servidor.
- Selección abre ficha/drawer con título y descripción accesibles.
- Escape cierra y devuelve foco al disparador.
- Deep link/reload conserva la ruta, no datos empresariales en storage.
- Botones de transición/asignación/edición no se muestran. Si una referencia visual los necesita, quedan inequívocamente deshabilitados con “Disponible en una fase posterior”.

## Requisitos HTTP y seguridad

- Bearer sólo en `Authorization`; nunca URL, storage adicional o logs.
- `Cache-Control: private, no-store`.
- `Vary` contiene `Authorization, Origin` sin duplicados ni `*`.
- Sin CORS wildcard o credentials.
- HEAD sin body; OPTIONS no ejecuta auth/body/Prisma cuando la compuerta falla.
- Validación estricta de respuestas: campos adicionales, tipos incorrectos, no finitos y arrays excesivos se rechazan.
- Textos hostiles se renderizan como texto.
- Cero GET con escritura, command, auditoría automática o actualización de “último visto”.

## Presupuesto de carga y rendimiento

- Con compuertas inactivas: 0 bytes de chunk Hub/Inbox y 0 requests CRM.
- Con acceso: cargar Hub y luego Inbox bajo demanda; Ficha puede residir en el chunk Inbox.
- Lista siempre paginada; no descargar 2,000/10,000 casos al browser.
- Sin N+1: owner y conteos se resuelven en select/agregados del servidor.
- Objetivo local orientativo: interacción de filtros <100 ms en frontend sin incluir red; respuesta de página p95 a fijar tras ensayo con 10,000 fixtures.

## Matriz de permisos

| Actor | Navega Hub | Ve Inbox/Ficha | Acciones |
|---|---:|---:|---:|
| A + `pipeline:view` | Sí | Sí | Ninguna en 01A |
| V + `pipeline:view` | Sí | Sí | Ninguna en 01A |
| A/V sin permiso | No | No | Ninguna |
| A/V con deny | No | No | Ninguna |
| Otro rol con permiso | No en este lote | No | Ninguna |
| Sesión/membership/tenant inválido | No | No | Ninguna |

Una ampliación a otros roles requiere decisión empresarial separada; no basta añadirlos al catálogo.

## Pruebas de aceptación

### Configuración y lazy loading

- Defaults completamente inactivos.
- Todas las combinaciones parciales de Hub/cliente/lectura quedan inactivas.
- Entorno/branch/batch alterados fallan cerrado.
- Compuertas inactivas: cero chunk, prefetch, listeners, timers y requests.

### Autoridad

- A y V autorizados con permiso explícito.
- Sin permiso y deny: tarjeta, rutas y chunk bloqueados.
- Query/hash/storage/headers no elevan acceso.
- Dos tenants; cross-tenant 404 indistinguible.
- Cada request revalida User/Membership/Tenant.

### Contratos

- Lista, detalle y resumen válidos.
- 204, content-type incorrecto, JSON truncado/array, campos extra, IDs internos, tipos incorrectos, status desconocido, no finitos y paginación inconsistente fallan con código estable.
- 401/403/404/409/503 diferenciados y sanitizados.
- Respuestas tardías y abort verificadas.

### Presentación

- Cero casos, filtros, búsqueda, paginación y asignación.
- APPROVED congelado y OPS_HANDOFF terminal.
- Desktop/móvil en Chromium, Firefox y WebKit.
- Teclado, foco, labels, descripción del drawer y contraste.
- Texto hostil no ejecutable.
- Paridad visual documentada contra snapshot aprobado.

### Sólo lectura

- Guardias bloquean POST/PATCH/PUT/DELETE, imports de comandos, owner options, Idempotency-Key, stores, mocks, bridges y fallback.
- PostgreSQL de prueba demuestra cero writes y cero PipelineCaseCommand.

### Regresión

- PostgreSQL 18 con 18 migraciones; segundo deploy, status, drift y baseline.
- Suite canónica, Auth adversarial, Hub, CRM estricto, Inbox y navegadores existentes.
- Build, TypeScript, ESLint diferencial, secretos, bundle y `git diff --check`.

## Riesgos de implementación

1. `clientName` heredado y `Client` vinculado pueden divergir. El backend publica únicamente `client` relacional y representa la ausencia como `null`.
2. La apariencia de CasePipelineControl invita a acciones. En 01A debe ser estrictamente informativa.
3. `caseRef` se usa sólo para routing y transporte; no se muestra y nunca sustituye `caseCode` como identidad visible.
4. La historia puede mezclar PipelineEvent y Command. Sólo se agrega si existe un DTO y orden canónico; no se concatena en el cliente.
5. El snapshot tiene rutas internas y estado persistido. El vertical nuevo debe usar el router/guardia canónicos sin importar ese comportamiento.
6. El empty state de Production será legítimo tras la limpieza sintética; nunca debe activar fixtures o fallback.

## Bloqueadores exactos antes de implementación

1. La proyección pública mínima del Client receptor quedó congelada como `client: { displayName, type, status } | null`.
2. Decidir si la historia básica entra en 01A. Si entra, crear su GET paginado y DTO sanitizado; si no, mantener el placeholder explícito.
3. La navegación usa `caseRef` UUID v4 derivado de `publicRef`; la PK CUID no pertenece al contrato público.
4. Congelar la lista exacta de campos generales de la Ficha a los disponibles arriba; cualquier campo adicional requiere contrato backend, no adaptación frontend.
5. Confirmar mediante guardia de imports que ningún componente portado arrastra `useCasesStore`, `salesStore`, `caseBridge`, mocks, `NewCaseModal` o storage.
6. Aprobar la comparación visual desktop/móvil del Inbox y Ficha contra el snapshot, aceptando que tabs Survey/Quote/Materiales no aparecen todavía.
7. Mantener las compuertas inactivas por defecto y contar con PostgreSQL aislado y fixtures sintéticos para pruebas; Production vacía no es fuente de ensayo.

## Criterio de aceptación final

El lote está aceptado cuando A/V autorizados pueden entrar desde el Hub, consultar únicamente casos del tenant, navegar Inbox y Ficha con la apariencia aprobada y comprender estado, owner, receptor publicado y actividad básica; usuarios no autorizados no descargan el módulo; no existen mutaciones, storage empresarial, mocks, IDs internos expuestos, solicitudes externas inesperadas ni cambios de esquema.

La activación remota, publicación de PR, Preview funcional y cualquier mutación requieren autorizaciones posteriores separadas.
