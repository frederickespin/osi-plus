import { prisma } from "../../_lib/db.js";
import { badRequest, methodNotAllowed, readJsonBody, withCommonHeaders } from "../../_lib/http.js";
import { requireRoleFromHeaders } from "../../_lib/rbac.js";
import { appendOsiChangeLogs } from "../_helpers.js";

const OPS_ALLOWED_ROLES = ["A", "B", "D", "E", "G", "C1", "K"];

function asString(v, fallback = "") {
  const value = typeof v === "string" ? v : v == null ? "" : String(v);
  return value.trim() || fallback;
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
  const driverId = asString(body.driverId || osi.driverId || "");
  const supervisorId = asString(body.supervisorId || osi.supervisorId || "");
  const notes = asString(body.notes || "");
  const timestampRaw = asString(body.timestamp || "");
  const timestamp = timestampRaw ? new Date(timestampRaw) : new Date();
  if (Number.isNaN(timestamp.getTime())) return badRequest(res, "timestamp inválido");
  if (!driverId || !supervisorId) {
    return res.status(400).json({
      ok: false,
      error: "driverId y supervisorId son obligatorios para el handshake táctico.",
    });
  }

  const handshake = await prisma.osiHandshake.create({
    data: {
      osiId,
      status: "COMPLETED",
      fromRole: "E",
      fromUserId: driverId,
      toRole: "D",
      toUserId: supervisorId,
      type: "TACTICAL_TRANSFER",
      timestamp,
      completedAt: timestamp,
      notes: notes || null,
      payloadJson: body || {},
    },
  });

  const updated = await prisma.osi.update({
    where: { id: osiId },
    data: {
      supervisorId,
      driverId,
      custodyStatus: "SUPERVISOR",
      custodyTransferredAt: timestamp,
      driverAvailable: true,
      vehicleAvailable: true,
      status: osi.status === "in_transit" ? "at_destination" : osi.status,
    },
  });

  await appendOsiChangeLogs(prisma, {
    osiId,
    actorUserId: actor.userId,
    actorRole: actor.role,
    action: "HANDSHAKE",
    reason: "Transferencia táctica E↔D completada",
    changes: [
      {
        fieldPath: "custodyStatus",
        beforeJson: osi.custodyStatus,
        afterJson: updated.custodyStatus,
      },
      {
        fieldPath: "driverAvailable",
        beforeJson: osi.driverAvailable,
        afterJson: updated.driverAvailable,
      },
      {
        fieldPath: "vehicleAvailable",
        beforeJson: osi.vehicleAvailable,
        afterJson: updated.vehicleAvailable,
      },
    ],
  });

  return res.status(200).json({
    ok: true,
    data: {
      handshake,
      osi: updated,
    },
  });
});

