# V17-QUOTE-09A — Resultado local

## Identidad

- Base: `99f12a1be16b3aa4a0d2a7d9f27249b7d9ce9062`
- Rama: `feature/v17-quote`
- Runtime externo: sin cambios; Production, Neon y Vercel no fueron consultados ni modificados.

## Implementación

Se añadió la autoridad tenant-first de Cotización, con hasta tres propuestas estables por caso, referencia comercial concurrente, revisiones append-only, líneas Costing/manuales, snapshots de contexto/pagador/condiciones/FX/descuento, envío, decisión explícita, aceptación única e idempotencia auditada.

La pestaña `Cotización` aparece después de `Costing`, se importa lazy sólo cuando modo y autorización lo permiten y usa un selector compacto 1–3. La tabla diferencia costo, sugerido y cotizado; el costo sólo se incluye con autorización interna. Las diferencias muestran icono, texto y color (`↓ Debajo del sugerido`, `↑ Sobre el sugerido`).

## Fuente económica

Cada revisión conserva la `CostingRevision` publicada, su hash lógico, fecha y referencias aguas arriba. Las líneas Costing capturan valores publicados; no existe importación de calculadores Costing o Logísticos en el dominio Quote. Una publicación económica posterior no altera historia.

## Bloqueos

Publicación, envío y aceptación fallan cerrado ante destino pendiente, Costing no publicado o distinto, blocker económico, línea manual pendiente, vencimiento y margen inferior sin autorización. La aceptación además serializa el caso y la base impide dos propuestas aceptadas.

## Migración 29

- Ruta: `prisma/migrations/20260910010000_v17_quote/migration.sql`
- SHA-256 LF: `75930bca82e4852c28bcc6a07b9509a10213e1f0573d5f54a56c0809fc17fbdd`
- Tamaño: `20043` bytes
- BOM: ausente
- Política: aditiva, tenant-first, sin backfill comercial inferido.

Validaciones PostgreSQL 18 realizadas localmente:

- vacío: `29/29`;
- adopción: `28 → 29`;
- segundo `migrate deploy`: cero pendientes;
- drift: vacío;
- rollback controlado `29 → 28` y replay `28 → 29`;
- máximo tres propuestas;
- numeración server-side por contador;
- aceptación concurrente: un ganador;
- revisión/línea append-only.

## Pruebas

| Suite | Resultado |
|---|---:|
| Contrato Quote | 9/9 |
| HTTP/gates | 13/13 |
| Dominio PostgreSQL | 18/18 |
| Guardia Quote y negativas | 13/13 |
| Inventario CORS | 121/121; 94 protegidas |
| Negativas CORS | 29/29 |
| Browser Quote | 24/24 |
| TypeScript focal | verde |

Browser cubre Chromium, Firefox y WebKit, escritorio y móvil: creación, comparación, publicación, envío, aceptación, tres referencias/posiciones y usuario deny sin chunk ni request Quote.

## Runtime y seguridad

- `productionApiEnabled=false`.
- Production y valores desconocidos resuelven `DISABLED`.
- `LOCAL_ONLY` exige loopback real y ausencia de cualquier `VERCEL*`.
- `PREVIEW_REHEARSAL` exige Preview, rama y batch exactos.
- Gate antes de auth/body/Prisma.
- DTO cerrados, SHA server-side, referencias UUID públicas, sin PK Prisma.
- Proyección cliente separada server-side y sin costo/margen.
- Permisos Quote explícitos; no hay concesión baseline por rol.

## Diferencias deliberadas y pendientes

- El documento cliente está preparado como snapshot/DTO inmutable; render PDF no se incorporó porque no hay infraestructura corporativa autoritativa aprobada.
- `VIEWED`, Portal Cliente, envío automático, fiscalidad, liquidación de comisiones/referidos y catálogo administrativo de términos siguen pendientes.
- La UI 09A cubre la creación desde Costing y lifecycle principal; revisión avanzada y edición de conceptos manuales están soportadas por contrato/API y podrán recibir un editor especializado sin cambiar la autoridad.
- No se implementó OSI ni handoff operacional; sólo se publica su descriptor trazable tras aceptación.

## Próximo lote

`Integración Operaciones / OSI`, únicamente mediante autorización separada y consumiendo la `Accepted QuoteProposalRevision`. No debe recalcular Survey, Logística, Costing o Quote.
