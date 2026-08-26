# V17-CRM-CONTROL-COMERCIAL-05A — Contrato futuro SLA y KPI

## Estado

Especificación documental. No habilita cálculos, escrituras, migraciones ni variables. Hasta que exista el contrato descrito aquí, cada caso se presenta con severidad `GRAY` y el texto `SLA no disponible`.

## Autoridad y aislamiento

- Toda regla pertenece a un tenant y se resuelve en servidor.
- Lista, resumen, búsqueda, filtros, conteos y paginación aplican primero el alcance efectivo del actor.
- Administrador (`A`) con `pipeline:view` puede consultar el tenant completo.
- Ventas (`V`) con `pipeline:view` consulta exclusivamente casos cuyo `ownerUserId`, `ownerMembershipId` y `tenantId` coinciden con su contexto revalidado.
- `deniedPermissions` prevalece.
- El navegador no calcula autoridad, severidad, vencimientos ni métricas a partir de nombres, correos, `updatedAt`, query, headers o storage.

## Reglas configurables

Una política SLA futura debe permitir configuración tenant-first por:

- etapa exacta de `PipelineCase`;
- tipo y modo de servicio;
- vendedor o grupo, cuando exista autoridad empresarial para ello;
- calendario, zona horaria y días laborables;
- ventana de advertencia previa al vencimiento;
- requisitos y bloqueos aplicables;
- próxima acción esperada y responsable.

La evaluación resultante debe publicar un DTO cerrado, sin PK internas, con:

- `severity`: `GREEN | YELLOW | RED | GRAY`;
- `reasonCode` y una razón explicable para personas;
- `nextAction`;
- `responsibleParty` público;
- `dueAt`;
- tiempo restante o tiempo vencido;
- versión de la política utilizada.

`GRAY` es obligatorio ante regla ausente, dato insuficiente o política no aplicable. La ausencia de datos nunca equivale a `GREEN`.

## Semántica de severidad

- `GREEN`: dentro de un SLA aplicable y sin bloqueos comprobables.
- `YELLOW`: dentro de la ventana de advertencia o con requisito incompleto comprobable.
- `RED`: vencido, bloqueado o sin atención fuera de una regla aplicable.
- `GRAY`: sin autoridad suficiente para evaluar.

Todo color debe incluir una razón reproducible. Los cambios de severidad requieren historial append-only con política, instante, motivo y actor técnico; no se reconstruyen desde `updatedAt`.

## KPI requeridos

Los agregados se calculan en servidor después de aplicar el alcance del actor y deben definir numerador, denominador, ventana y exclusiones:

- primera respuesta;
- seguimiento comercial;
- Survey pendiente;
- Cotización pendiente;
- aprobación pendiente;
- cliente pendiente de respuesta;
- casos sin asignar;
- carga y pendientes por vendedor para Administrador.

Ventas recibe exclusivamente sus propios agregados. Totales, páginas vacías, buckets y filtros no pueden revelar casos ajenos.

## Próxima acción y pendientes

La próxima acción no se infiere desde texto libre. Debe proceder de una autoridad tenant-first que publique tipo, responsable, `dueAt`, estado y referencia pública segura. Survey, Cotización, aprobación y respuesta del cliente mantienen autoridades separadas; un conteo no se presenta como historial.

## Contratos GET pendientes

Antes de activar SLA/KPI hacen falta contratos cerrados para:

1. política efectiva y evaluación por caso;
2. resumen SLA/KPI ya filtrado por autoridad;
3. métricas por vendedor sólo para Administrador;
4. historial tenant-first de eventos y severidad;
5. próxima acción y pendientes;
6. otros casos del mismo Client, con referencia pública y autorización explícita.

Cada GET debe revalidar User, TenantMembership y Tenant, usar `private, no-store`, conservar `Vary: Authorization, Origin` y devolver 404 indistinguible para recursos ausentes, ajenos o cross-tenant.

## Estado implementado en 04C

- Resumen, lista y Ficha usan únicamente datos CRM publicados.
- Alertas factuales: Client ausente, owner ausente, Survey requerido, destino ausente y volumen ausente/no positivo.
- `eventCount` y `quoteCount` se muestran sólo como conteos.
- Actividad, Tareas, Survey, Cotización, Notas, Archivos y Comunicación permanecen `En integración` cuando no existe contrato funcional.
- No se publican porcentajes, vencimientos, comparaciones de equipo ni prioridades inventadas.

## Evidencia visual 04C

Las capturas usan exclusivamente fixtures sintéticos y están versionadas en
`docs/evidence/V17-CRM-COMPACT-CONTROL-CENTER-04C/`:

- `01-admin-global.png`: supervisión tenant-wide y cola compacta;
- `02-admin-selected.png`: master-detail con caso seleccionado;
- `03-alert-list-gray-sla.png`: alertas factuales y SLA `GRAY`;
- `04-sales-scope.png`: vista personal de Ventas;
- `05-mobile-list.png`: resumen y cola móvil;
- `06-mobile-detail.png`: Ficha móvil a pantalla completa;
- `07-gray-sla.png`: caso sin autoridad SLA, sin inferencia de color.

La evidencia desktop exige al menos diez acciones `Abrir ficha` dentro del
viewport 1920×1080. No constituye datos empresariales ni habilita el contrato
SLA/KPI pendiente.

## Criterio de adopción

La adopción futura requiere pruebas A/V/deny, aislamiento cross-tenant, estabilidad bajo paginación y filtros, razones reproducibles, accesibilidad de color con texto, historial append-only y ensayo con fixtures sintéticos. No autoriza por sí misma `PRODUCTION_WRITE`.
