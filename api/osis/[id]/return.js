import { prisma } from "../../_lib/db.js";
import { badRequest, methodNotAllowed, readJsonBody, withCommonHeaders } from "../../_lib/http.js";
import { requireRoleFromHeaders } from "../../_lib/rbac.js";
import {
  appendOsiChangeLogs,
  computeMaterialDeviation,
  summarizeDeviation,
} from "../_helpers.js";

const OPS_ALLOWED_ROLES = ["A", "B", "C1", "C", "D"];

function asString(v, fallback = "") {
  const value = typeof v === "string" ? v : v == null ? "" : String(v);
  return value.trim() || fallback;
}

function toMaterialList(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => ({
      code: String(item?.code || item?.materialId || "").trim().toUpperCase(),
      qty: Number(item?.qty || item?.quantity || 0),
      unit: String(item?.unit || "UND").trim().toUpperCase(),
    }))
    .filter((item) => item.code && Number.isFinite(item.qty));
}

function extractNonZeroDeviations(deviationJson) {
  return Object.entries(deviationJson || {}).filter(([, value]) => Number(value || 0) !== 0);
}

function buildRecommendationFromReturns(rows) {
  if (!Array.isArray(rows) || rows.length < 3) return null;
  const aggregate = new Map();
  rows.forEach((row) => {
    const deviation = row?.deviationJson || {};
    Object.entries(deviation).forEach(([key, val]) => {
      const prev = Number(aggregate.get(key) || 0);
      aggregate.set(key, prev + Number(val || 0));
    });
  });

  const recommendedDelta = {};
  aggregate.forEach((sum, key) => {
    const avg = sum / rows.length;
    if (Math.abs(avg) >= 1) {
      recommendedDelta[key] = Math.round(avg);
    }
  });

  const entries = Object.keys(recommendedDelta);
  if (entries.length === 0) return null;
  return recommendedDelta;
}

async function maybeCreateSuggestionForPst(prismaClient, params) {
  const { pstCode, ptfCode } = params;
  if (!pstCode) return null;

  const latest = await prismaClient.osiMaterialReturn.findMany({
    where: { pstCode },
    orderBy: { recordedAt: "desc" },
    take: 3,
  });
  if (latest.length < 3) return null;

  const recommendation = buildRecommendationFromReturns(latest);
  if (!recommendation) return null;

  const basedOnOsiIds = Array.from(new Set(latest.map((row) => row.osiId)));
  const reason =
    "Patrón repetido de desvíos en últimos retornos C1. Se sugiere ajustar PTF para reducir faltantes/excesos.";

  return prismaClient.ptfAdjustmentSuggestion.create({
    data: {
      pstCode,
      ptfCode: ptfCode || null,
      status: "PENDING",
      basedOnOsiIds,
      occurrences: latest.length,
      recommendedDelta: recommendation,
      reason,
    },
  });
}

export default withCommonHeaders(async (req, res) => {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);

  const actor = requireRoleFromHeaders(req, res, OPS_ALLOWED_ROLES);
  if (!actor) return;

  const osiId = asString(req.query?.id || "");
  if (!osiId) return badRequest(res, "id es obligatorio");

  const osi = await prisma.osi.findUnique({ where: { id: osiId } });
  if (!osi) return res.status(404).json({ ok: false, error: "OSI no encontrada" });

  const body = await readJsonBody(req);
  const dispatched = toMaterialList(body.dispatched);
  const returned = toMaterialList(body.returned);
  if (dispatched.length === 0 && returned.length === 0) {
    return badRequest(res, "Debes enviar listas de materiales despachados y/o retornados.");
  }

  const deviation = computeMaterialDeviation(dispatched, returned);
  const deviationList = extractNonZeroDeviations(deviation);

  const createdReturn = await prisma.osiMaterialReturn.create({
    data: {
      osiId,
      pstCode: asString(body.pstCode || osi.pstCode || "") || null,
      ptfCode: asString(body.ptfCode || osi.ptfCode || "") || null,
      dispatchedJson: dispatched,
      returnedJson: returned,
      deviationJson: deviation,
      recordedById: actor.userId,
      recordedByRole: actor.role,
      recordedAt: body.recordedAt ? new Date(body.recordedAt) : new Date(),
    },
  });

  const updatedOsi = await prisma.osi.update({
    where: { id: osiId },
    data: {
      lastMaterialDeviation: deviation,
    },
  });

  await appendOsiChangeLogs(prisma, {
    osiId,
    actorUserId: actor.userId,
    actorRole: actor.role,
    action: "RETURN_RECONCILIATION",
    reason: "C1 registró retorno de materiales",
    changes: [
      {
        fieldPath: "lastMaterialDeviation",
        beforeJson: osi.lastMaterialDeviation,
        afterJson: updatedOsi.lastMaterialDeviation,
      },
    ],
  });

  const suggestion = await maybeCreateSuggestionForPst(prisma, {
    pstCode: createdReturn.pstCode,
    ptfCode: createdReturn.ptfCode,
  });

  return res.status(200).json({
    ok: true,
    data: {
      materialReturn: createdReturn,
      deviation,
      deviationSummary: summarizeDeviation(deviation),
      osi: updatedOsi,
      suggestion: suggestion || null,
    },
    meta: {
      hasDeviation: deviationList.length > 0,
      deviationCount: deviationList.length,
    },
  });
});

