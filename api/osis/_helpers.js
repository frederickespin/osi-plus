const DEFAULT_TEMPLATE_MAP = [
  {
    match: /INT|INTERNACIONAL|EXPORT|IMPORT/i,
    ptfCode: "PTF-INT-BASE",
    petCode: "PET-INT-6",
    petSlots: 6,
    requiredRoles: ["D", "E", "N", "N", "N", "N"],
    materials: [
      { code: "BOX_EXPORT", qty: 20, unit: "UND" },
      { code: "TAPE_HEAVY", qty: 12, unit: "UND" },
      { code: "BUBBLE_WRAP", qty: 8, unit: "ROL" },
      { code: "SEAL_LABEL", qty: 30, unit: "UND" },
    ],
  },
  {
    match: /LOCAL|MUDANZA\s*LOCAL/i,
    ptfCode: "PTF-LOCAL-BASE",
    petCode: "PET-LOCAL-4",
    petSlots: 4,
    requiredRoles: ["D", "E", "N", "N"],
    materials: [
      { code: "BOX_STD", qty: 15, unit: "UND" },
      { code: "TAPE_STD", qty: 8, unit: "UND" },
      { code: "WRAP_FILM", qty: 4, unit: "ROL" },
    ],
  },
  {
    match: /NACIONAL|TRANSPORTE/i,
    ptfCode: "PTF-NAC-BASE",
    petCode: "PET-NAC-5",
    petSlots: 5,
    requiredRoles: ["D", "E", "N", "N", "N"],
    materials: [
      { code: "BOX_STD", qty: 18, unit: "UND" },
      { code: "TAPE_STD", qty: 10, unit: "UND" },
      { code: "WRAP_FILM", qty: 6, unit: "ROL" },
      { code: "STRAP", qty: 10, unit: "UND" },
    ],
  },
];

function toJsonObject(value) {
  return value && typeof value === "object" ? value : {};
}

function normalizeMaterialList(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => ({
      code: String(item?.code || item?.materialId || "").trim().toUpperCase(),
      qty: Number(item?.qty || item?.quantity || 0),
      unit: String(item?.unit || "UND").trim().toUpperCase(),
    }))
    .filter((item) => item.code && Number.isFinite(item.qty));
}

export function buildMaterialMap(list) {
  const out = new Map();
  normalizeMaterialList(list).forEach((item) => {
    out.set(item.code, Number(item.qty || 0));
  });
  return out;
}

export function computeMaterialDeviation(dispatched, returned) {
  const dMap = buildMaterialMap(dispatched);
  const rMap = buildMaterialMap(returned);
  const allCodes = new Set([...dMap.keys(), ...rMap.keys()]);
  const deviation = {};
  for (const code of allCodes) {
    const dQty = Number(dMap.get(code) || 0);
    const rQty = Number(rMap.get(code) || 0);
    const delta = rQty - dQty;
    if (delta !== 0) deviation[code] = delta;
  }
  return deviation;
}

export function suggestPtfPetByPstCode(pstCode) {
  const code = String(pstCode || "").trim().toUpperCase();
  const found = DEFAULT_TEMPLATE_MAP.find((item) => item.match.test(code));
  if (found) {
    return {
      ptfCode: found.ptfCode,
      petCode: found.petCode,
      ptfMaterialPlan: {
        source: "DEFAULT_MAP",
        pstCode: code,
        items: found.materials,
      },
      petPlan: {
        source: "DEFAULT_MAP",
        pstCode: code,
        slots: found.petSlots,
        requiredRoles: found.requiredRoles,
      },
    };
  }
  return {
    ptfCode: null,
    petCode: null,
    ptfMaterialPlan: { source: "EMPTY", pstCode: code, items: [] },
    petPlan: { source: "EMPTY", pstCode: code, slots: 0, requiredRoles: [] },
  };
}

export function diffPlainObjects(prev, next) {
  const left = toJsonObject(prev);
  const right = toJsonObject(next);
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  const changes = [];
  keys.forEach((key) => {
    const a = left[key];
    const b = right[key];
    const ja = JSON.stringify(a ?? null);
    const jb = JSON.stringify(b ?? null);
    if (ja !== jb) {
      changes.push({ fieldPath: key, beforeJson: a ?? null, afterJson: b ?? null });
    }
  });
  return changes;
}

export async function appendOsiChangeLogs(prisma, params) {
  const {
    osiId,
    actorUserId = null,
    actorRole = "SYSTEM",
    action = "UPDATE",
    reason = null,
    changes = [],
  } = params || {};
  if (!osiId || !Array.isArray(changes) || changes.length === 0) return;

  await prisma.osiChangeLog.createMany({
    data: changes.map((c) => ({
      osiId,
      actorUserId,
      actorRole,
      action,
      fieldPath: c.fieldPath || null,
      beforeJson: c.beforeJson ?? null,
      afterJson: c.afterJson ?? null,
      reason: reason || null,
    })),
  });
}

export async function findPstFromProjectFallback(prisma, project) {
  void prisma;
  if (!project) return { pstCode: null, pstServiceName: null, source: "NONE" };
  if (project.pstCode) {
    return { pstCode: project.pstCode, pstServiceName: project.pstServiceName || null, source: "PROJECT" };
  }
  return { pstCode: null, pstServiceName: null, source: "NONE" };
}

export function summarizeDeviation(deviationJson) {
  const value = toJsonObject(deviationJson);
  const entries = Object.entries(value);
  if (entries.length === 0) return "Sin desviaciones.";
  const lines = entries.map(([k, v]) => `${k}:${Number(v) > 0 ? "+" : ""}${Number(v)}`);
  return lines.join(" · ");
}
