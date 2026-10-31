export const TRANSPORT_CONTEXT_CONTRACT = "V17_TRANSPORT_ZONES_V1";
export const QUOTE_TRANSPORT_CONTEXT = Object.freeze({ contract: TRANSPORT_CONTEXT_CONTRACT, purpose: "QUOTE", contextRef: null });
export const SERVICE_TRANSPORT_CONTEXT = Object.freeze({ contract: TRANSPORT_CONTEXT_CONTRACT, purpose: "SERVICE", contextRef: null });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const PAGE_SIZE = 100;

function object(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function normalizeTransportContext(value) {
  if (!object(value) || Object.keys(value).some((key) => !["contract", "purpose", "contextRef"].includes(key))) return null;
  if (value.contract !== TRANSPORT_CONTEXT_CONTRACT || !["QUOTE", "SERVICE", "VISIT"].includes(value.purpose)) return null;
  if (value.purpose === "VISIT" ? typeof value.contextRef !== "string" || !UUID.test(value.contextRef) : value.contextRef !== null) return null;
  return { contract: TRANSPORT_CONTEXT_CONTRACT, purpose: value.purpose, contextRef: value.contextRef };
}

// Absence is the legacy quotation contract. An explicitly malformed context must
// never make an operational or visit calculation eligible for a quotation.
export function isLegacyTransportContext(inputSnapshot) {
  return object(inputSnapshot) && !Object.hasOwn(inputSnapshot, "transportContext");
}

export function transportContextOf(inputSnapshot) {
  if (isLegacyTransportContext(inputSnapshot)) return QUOTE_TRANSPORT_CONTEXT;
  return object(inputSnapshot) ? normalizeTransportContext(inputSnapshot.transportContext) : null;
}

export function sameTransportContext(left, right) {
  const a = normalizeTransportContext(left);
  const b = normalizeTransportContext(right);
  return !!a && !!b && a.purpose === b.purpose && a.contextRef === b.contextRef;
}

async function latestContextRevision(model, { where, context = QUOTE_TRANSPORT_CONTEXT, fallbackContext = null, fallbackLegacyOnly = false, include, select }) {
  const primary = normalizeTransportContext(context);
  const fallback = fallbackContext == null ? null : normalizeTransportContext(fallbackContext);
  if (!where?.tenantId || !primary || fallbackContext != null && !fallback || include && select) throw new TypeError("TRANSPORT_CONTEXT_SELECTOR_INVALID");
  const scope = { ...where, status: "PUBLISHED" };
  let cursor = null;
  let fallbackId = null;
  let candidateId = null;
  // The revision sequence is shared by all purposes. Keep walking metadata until
  // the primary context is found; a recent fallback cannot hide an older visit.
  while (true) {
    const rows = await model.findMany({
      where: cursor == null ? scope : { AND: [scope, { revision: { lt: cursor } }] },
      orderBy: { revision: "desc" },
      take: PAGE_SIZE,
      select: { id: true, revision: true, inputSnapshot: true },
    });
    for (const row of rows) {
      const rowContext = transportContextOf(row.inputSnapshot);
      if (sameTransportContext(rowContext, primary)) { candidateId = row.id; break; }
      if (fallbackId == null && fallback && sameTransportContext(rowContext, fallback) && (!fallbackLegacyOnly || isLegacyTransportContext(row.inputSnapshot))) fallbackId = row.id;
    }
    if (candidateId != null || rows.length < PAGE_SIZE) break;
    const nextCursor = rows.at(-1)?.revision;
    if (!Number.isSafeInteger(nextCursor) || nextCursor < 1 || cursor != null && nextCursor >= cursor) throw new TypeError("TRANSPORT_CONTEXT_CURSOR_INVALID");
    cursor = nextCursor;
  }
  const id = candidateId ?? fallbackId;
  if (id == null) return null;
  return model.findFirst({ where: { AND: [scope, { id }] }, ...(include ? { include } : {}), ...(select ? { select } : {}) });
}

export function latestLogisticsRevision(tx, options) {
  return latestContextRevision(tx.logisticsPlanRevision, options);
}

export function latestCostingRevision(tx, options) {
  return latestContextRevision(tx.costingRevision, options);
}

// Inbox pages need the same context isolation without one query per case. The
// shared revision numbers can tie across plans, so this cursor also includes id.
export async function latestLogisticsRevisionsByPlan(tx, { tenantId, planIds, context = QUOTE_TRANSPORT_CONTEXT, select }) {
  const target = normalizeTransportContext(context);
  if (!tenantId || !target || !Array.isArray(planIds) || planIds.some((id) => typeof id !== "string" || !id)) throw new TypeError("TRANSPORT_CONTEXT_SELECTOR_INVALID");
  const ids = [...new Set(planIds)];
  if (!ids.length) return new Map();
  const scope = { tenantId, planId: { in: ids }, status: "PUBLISHED" };
  const selected = new Map();
  let cursor = null;
  while (true) {
    const rows = await tx.logisticsPlanRevision.findMany({
      where: cursor ? { ...scope, OR: [{ revision: { lt: cursor.revision } }, { revision: cursor.revision, id: { lt: cursor.id } }] } : scope,
      orderBy: [{ revision: "desc" }, { id: "desc" }],
      take: PAGE_SIZE,
      select: { id: true, planId: true, revision: true, inputSnapshot: true },
    });
    for (const row of rows) if (!selected.has(row.planId) && sameTransportContext(transportContextOf(row.inputSnapshot), target)) selected.set(row.planId, row.id);
    if (selected.size === ids.length || rows.length < PAGE_SIZE) break;
    const last = rows.at(-1);
    if (!Number.isSafeInteger(last?.revision) || typeof last?.id !== "string" || cursor && (last.revision > cursor.revision || last.revision === cursor.revision && last.id >= cursor.id)) throw new TypeError("TRANSPORT_CONTEXT_CURSOR_INVALID");
    cursor = { revision: last.revision, id: last.id };
  }
  if (!selected.size) return new Map();
  const rows = await tx.logisticsPlanRevision.findMany({ where: { ...scope, id: { in: [...selected.values()] } }, ...(select ? { select: { ...select, planId: true } } : {}) });
  return new Map(rows.map((row) => [row.planId, row]));
}

// Public case readers carry only plan references. Resolve private grouping keys
// inside this tenant-scoped repository boundary before using the batch selector.
export async function latestLogisticsRevisionsByPlanRefs(tx, { tenantId, planRefs, context = QUOTE_TRANSPORT_CONTEXT, select }) {
  if (!tenantId || !normalizeTransportContext(context) || !Array.isArray(planRefs) || planRefs.some((ref) => typeof ref !== "string" || !UUID.test(ref))) throw new TypeError("TRANSPORT_CONTEXT_SELECTOR_INVALID");
  const refs = [...new Set(planRefs)];
  if (!refs.length) return new Map();
  const plans = await tx.logisticsPlan.findMany({ where: { tenantId, planRef: { in: refs } }, select: { id: true, planRef: true } });
  const revisions = await latestLogisticsRevisionsByPlan(tx, { tenantId, planIds: plans.map((plan) => plan.id), context, select });
  return new Map(plans.filter((plan) => revisions.has(plan.id)).map((plan) => [plan.planRef, revisions.get(plan.id)]));
}
