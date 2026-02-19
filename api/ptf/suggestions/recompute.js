import { prisma } from "../../_lib/db.js";
import { methodNotAllowed, readJsonBody, withCommonHeaders } from "../../_lib/http.js";
import { requireRoleFromHeaders } from "../../_lib/rbac.js";

const ALLOWED_ROLES = ["A", "C", "I", "B"];

function aggregateRecommendation(rows) {
  if (!Array.isArray(rows) || rows.length < 3) return null;
  const aggregate = new Map();
  rows.forEach((row) => {
    const deviation = row?.deviationJson || {};
    Object.entries(deviation).forEach(([code, value]) => {
      const prev = Number(aggregate.get(code) || 0);
      aggregate.set(code, prev + Number(value || 0));
    });
  });
  const out = {};
  aggregate.forEach((sum, code) => {
    const avg = sum / rows.length;
    if (Math.abs(avg) >= 1) out[code] = Math.round(avg);
  });
  return Object.keys(out).length > 0 ? out : null;
}

export default withCommonHeaders(async (req, res) => {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);

  const actor = requireRoleFromHeaders(req, res, ALLOWED_ROLES);
  if (!actor) return;

  const body = await readJsonBody(req);
  const pstCodeFilter = String(body?.pstCode || req.query?.pstCode || "").trim();

  const returns = await prisma.osiMaterialReturn.findMany({
    where: {
      ...(pstCodeFilter ? { pstCode: pstCodeFilter } : {}),
    },
    orderBy: { recordedAt: "desc" },
    take: 300,
  });

  const byPst = new Map();
  returns.forEach((row) => {
    const pstCode = String(row.pstCode || "").trim();
    if (!pstCode) return;
    const bucket = byPst.get(pstCode) || [];
    if (bucket.length < 3) bucket.push(row);
    byPst.set(pstCode, bucket);
  });

  const created = [];
  for (const [pstCode, rows] of byPst.entries()) {
    if (rows.length < 3) continue;
    const rec = aggregateRecommendation(rows);
    if (!rec) continue;
    const basedOnOsiIds = Array.from(new Set(rows.map((r) => r.osiId)));
    const suggestion = await prisma.ptfAdjustmentSuggestion.create({
      data: {
        pstCode,
        ptfCode: String(rows[0]?.ptfCode || "") || null,
        status: "PENDING",
        basedOnOsiIds,
        occurrences: rows.length,
        recommendedDelta: rec,
        reason: "Recompute manual/automático por patrón de retornos.",
        lastActionById: actor.userId,
      },
    });
    created.push(suggestion);
  }

  return res.status(200).json({
    ok: true,
    total: created.length,
    data: created,
  });
});

