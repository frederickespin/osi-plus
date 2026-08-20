# V17 Canonical UI ERP 01A — Roadmap

## Principio de entrega

Cada lote debe ser vertical, tenant-first y desactivado por defecto. Incluye modelo, contrato público, autorización, UI, pruebas adversariales y ensayo aislado. No se considera terminado si sólo existe la pantalla o sólo existe la tabla.

## Dependencias

```text
0 Fundación de shell y autoridad
  └─ 1 Caso comercial read-only
      ├─ 2 Survey/Evaluador
      │   └─ 3 Materiales/Cajas
      │       └─ 4 Tarifas/Logística/Costos
      │           └─ 5 Cotización/FX/Margen/Aprobación
      │               └─ 6 PIC/Historial
      │                   └─ 8 Handoff Project/OSI
      └─ 7 Partes/Vinculaciones/Analítica
          └─ 5 Cotización (aprobador/pagador)
9 Adaptación visual completa depende de 1–8
10 Ensayo integrado depende de 9
11 Cutover autorizado depende de 10
```

## Fases propuestas

### 0. Fundación canónica

Conservar Hub, auth LEGACY vigente, tenancy, permisos/denies, routing y lazy loading de `main`. Formalizar la regla de que el catálogo permite descubrir una aplicación, pero no concede acciones internas. Mantener Hub y CRM inactivos por defecto.

Criterio de salida: rutas profundas y acceso por tarjeta comparten una decisión; cualquier compuerta parcial bloquea chunk y request; no hay autoridad browser-side.

### 1. V17-COMMERCIAL-VERTICAL-01A

Hub + Inbox/Pipeline + Ficha del Caso read-only + Client receptor vinculado + datos generales + estado/owner + historia básica. Roles A/V con `pipeline:view`; denies prevalecen. Sin Survey, Quote o mutaciones.

Criterio de salida: especificación adjunta, DTO explícito, empty state real, dos tenants, cross-tenant indistinguible, ningún ID interno, cero writes y paridad visual aprobada.

### 2. Evaluador y Survey

Modelo aditivo PipelineCase → Survey 1:N, tipos MINI/REMOTE/ONSITE/VOXME_IMPORT/REVISIT, SurveyLocation 1:N, evaluador por Membership/User, drafts y submissions versionados con requestId/payloadHash. Fotografías y firmas en object storage; PostgreSQL conserva metadata/hash/relación.

Permisos propuestos: `survey:assigned:view`, `survey:schedule`, `survey:draft:write`, `survey:submit`, `survey:review`. OSi Survey sólo lista asignaciones del evaluador autenticado.

### 3. Materiales y cajas

Hacer tenant-first catálogo clonado, almacenes, stock, costo, reservas, movimientos y ubicaciones. Conectar Survey item → material need → reservation. Unificar solicitud, diseño, snapshot y fabricación de cajas sin borrar fuentes históricas.

Permisos propuestos: `materials:view/manage/reserve`, `crating:view/design/approve/workshop`.

### 4. PST, tarifas, logística y costos

PST define el servicio y sus entradas. MasterTariff, rate sets/bands, perfiles, overrides y recargos se convierten en autoridades tenant-first. Geo, zonas, flota y reglas producen snapshots reproducibles. Ningún GET recalcula o persiste.

Permisos propuestos: `tariff:view/manage/apply`, `logistics:view/manage`, `cost:view`.

### 5. Cotización, moneda, margen y aprobación

PipelineCase → Quote 1:N, alternativas AIR/SEA_LCL/SEA_FCL/LOCAL/NATIONAL/CUSTOM y varios ServiceComponent por alternativa. QuoteVersion inmutable. Estados DRAFT, INTERNAL_REVIEW, SENT, ACCEPTED, REJECTED y SUPERSEDED; aceptar una alternativa no borra las demás.

Cada Quote conserva `quoteCurrency`, `tariffCurrency`, política FX y snapshot cuando aplique. Moneda base inicial DOP. Proveedor, fecha, vigencia y redondeo son obligatorios. Umbrales de margen son configurables. Pagos futuros pertenecen a Invoice/AR/Payment/Allocation y nunca mutan la QuoteVersion.

Permisos propuestos: `quote:view/create/edit/version/send/accept`, `quote:margin:view`, `quote:approve`.

### 6. PIC, documentos e historial

Separar Template/TemplateVersion de PIC y dispatch. Implementar comunicación, documentos, eventos append-only y trazabilidad sin incluir contenido sensible en DTOs generales. Portal Cliente podrá recibir sólo scopes vigentes por etapa.

Permisos propuestos: `pic:view/prepare/send`, `documents:view/manage`, `commercial:audit:view`.

### 7. Partes comerciales, vinculaciones y analítica

Definir CommercialParty sólo como PERSON u ORGANIZATION, preferiblemente ampliando una autoridad existente si puede garantizar tenant-first. Las organizaciones usan clasificaciones CORPORATE, INSTITUTION, GOVERNMENT, LEAD_ACCOUNT, EMBASSY, RELOCATION_PARTNER u OTHER. PipelineCaseParty asigna roles SERVICE_RECIPIENT, SPONSORING_INSTITUTION, LEAD_ACCOUNT, PRIMARY_CONTACT, APPROVER, BILL_TO, PAYER y DOCUMENT_RESPONSIBLE, con primario, orden y vigencia.

Client sigue siendo exclusivamente el receptor del servicio. Lead es prospecto; Lead Account es organización intermediaria. CaseComplianceProfile es ortogonal (STANDARD, DIPLOMATIC, CUSTOMS_SPECIAL, OTHER). El resumen anual será consulta agregada, no tabla inicial.

### 8. Handoff a Project y OSI

Crear el comando explícito y auditable PipelineCase → Project cuando el contrato empresarial lo permita. Mantener FK tenant-first Client–PipelineCase–Project. Project → coordinación → OSI continúa como autoridad operativa. `OPS_HANDOFF` es terminal; `APPROVED` legacy permanece congelado.

### 9. Adaptación visual completa

Portar selectivamente shell, fichas, tablas, tabs, drawers, calendarios y superficies móviles. Sustituir todos los stores por hooks de API tipados. Eliminar bridges, mocks runtime, fallback, selector de personas local y navegación basada en rol.

### 10. Ensayo integrado aislado

PostgreSQL desechable/Neon aislado autorizado, fixtures sintéticos, tres motores, desktop/móvil, perfiles A/V/Evaluador y denies, carga/rendimiento, fallos HTTP, contratos estrictos, restauración y fingerprints. Ningún fixture se deriva de Production.

### 11. Cutover autorizado

Requiere respaldo fresco, manifiesto empresarial, adopción de migraciones separada del código, compuertas exactas, deployment Git verificable, smoke anónimo/autenticado y rollback. No se activa por “estar la UI lista”.

## Migraciones conceptuales

| Número | Alcance | Estado |
|---|---|---|
| 17 | `PipelineCase.clientId` nullable y coherencia tenant-first con Project | Implementada y adoptada |
| 18 | Partes, roles, ubicaciones y componentes de servicio | Diseño; no crear aún |
| 19 | Survey/Evaluador 1:N, ubicaciones y revisiones | Diseño; no crear aún |
| 20+ | Materiales/reservas; crating; tarifas/logística/costos; Quote/FX/margen; PIC; contabilidad | Diseño por migraciones separadas |

La numeración definitiva se asigna al iniciar cada lote sobre `main`. No se agrupan dominios para “ahorrar” migraciones.

## Decisiones empresariales pendientes

- Autoridad existente que se ampliará como CommercialParty: Client, BusinessEntity, Account u otra; no duplicar organizaciones.
- Reglas de unicidad e identidad para persona/organización por tenant.
- Catálogo de ServiceComponent y combinaciones válidas por CaseMode.
- Políticas de Survey requerido, revisitas y aprobación técnica.
- Unidad canónica, precisión y redondeo para volumen/peso/distancia.
- Ownership de materiales globales clonables y vigencia de costos.
- Alcance de alternativas de Quote y regla de alternativa aceptada.
- Proveedores FX, vigencia, redondeo y excepciones manuales auditadas.
- Umbrales de margen por tenant/servicio y matriz de aprobación.
- Contrato PIC, canales, retención documental y confirmación de entrega.
- Condiciones exactas de handoff a Project/OSI.
- Autoridad contable futura para Invoice, AccountReceivable, Payment y PaymentAllocation.

## Riesgos y controles

| Riesgo | Prioridad | Control |
|---|---|---|
| Portar store local como autoridad | P0 | Guardia recursiva de imports y pruebas sin storage |
| Ampliar permisos al entrar al Hub | P0 | Sesión revalidada, permiso explícito, deny primero |
| Exponer IDs/tenant/PII desde Prisma | P0 | Select explícito + schema estricto frontend/backend |
| GET con side effects | P0 | Guardias SQL/Prisma y pruebas negativas |
| Duplicar Client/Account/BusinessEntity | P1 | ADR empresarial antes de migración 18 |
| Reutilizar Survey/Quote históricos como nuevos | P1 | Modelos aditivos y adaptadores de sólo lectura |
| Catálogos y costos no tenant-first | P1 | Plantillas clonables; ownership tenant-first |
| Drift visual durante reimplementación | P2 | Capturas de referencia y pruebas visuales desktop/móvil |
| Bundle monolítico | P2 | Lazy por aplicación y fase; presupuestos de chunk |

## Métricas de avance

- Porcentaje de filas de la matriz en `Directa`, `Adaptable` y `Reimplementar`.
- Pantallas conectadas sólo a API canónica / total de pantallas portadas.
- Cero imports de stores/mocks/bridges en verticales canónicos.
- Cero claves business en localStorage/IndexedDB.
- Cobertura de autorización por ruta y acción.
- Contratos públicos con validación estricta y tests de campos adicionales.
- Flujos empresariales completados de extremo a extremo sobre fixtures sintéticos.
