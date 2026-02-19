import { prisma } from "../../_lib/db.js";
import { methodNotAllowed, withCommonHeaders } from "../../_lib/http.js";
import { requireRoleFromHeaders } from "../../_lib/rbac.js";

const ALLOWED_ROLES = ["A", "B", "C", "C1", "I", "K"];

export default withCommonHeaders(async (req, res) => {
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);

  const actor = requireRoleFromHeaders(req, res, ALLOWED_ROLES);
  if (!actor) return;

  const pstCode = String(req.query?.pstCode || "").trim();
  const status = String(req.query?.status || "").trim().toUpperCase();

  const rows = await prisma.ptfAdjustmentSuggestion.findMany({
    where: {
      ...(pstCode ? { pstCode } : {}),
      ...(status ? { status } : {}),
    },
    include: {
      escalations: {
        orderBy: { createdAt: "desc" },
        take: 3,
      },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return res.status(200).json({
    ok: true,
    total: rows.length,
    data: rows,
  });
});

