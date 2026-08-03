import { createApprovalRequest } from "./approvalRequest.js";

export const APPROVAL_PERSISTENCE_MODES = Object.freeze({
  LEGACY_ONLY: "LEGACY_ONLY",
  DUAL_WRITE: "DUAL_WRITE",
  RELATIONAL_AUTHORITY: "RELATIONAL_AUTHORITY",
});

export function approvalPersistenceMode(env = process.env) {
  if (String(env.DB01E_APPROVAL_RELATIONAL_ENABLED || "false").toLowerCase() !== "true") {
    return APPROVAL_PERSISTENCE_MODES.LEGACY_ONLY;
  }
  return String(env.DB01E_APPROVAL_RELATIONAL_AUTHORITY || "false").toLowerCase() === "true"
    ? APPROVAL_PERSISTENCE_MODES.RELATIONAL_AUTHORITY
    : APPROVAL_PERSISTENCE_MODES.DUAL_WRITE;
}

/**
 * Adaptador experimental; ninguna ruta activa lo importa en DB-01E.
 * `legacyCreate` y `legacyProjectionWriter` deben ser adaptadores internos del
 * servidor. El navegador nunca aporta tenant, solicitante ni autoridad.
 */
export async function createApprovalWithCompatibility({
  prisma,
  context,
  input,
  policy,
  legacyCreate,
  legacyProjectionWriter,
  mode = approvalPersistenceMode(),
}) {
  if (mode === APPROVAL_PERSISTENCE_MODES.LEGACY_ONLY) {
    if (typeof legacyCreate !== "function") throw new TypeError("legacyCreate es obligatorio");
    return { authority: "LEGACY", legacy: await legacyCreate(), relational: null };
  }
  if (typeof legacyProjectionWriter !== "function") {
    throw new TypeError("legacyProjectionWriter es obligatorio para escritura dual");
  }
  let legacyResult;
  const relational = await createApprovalRequest(prisma, context, input, {
    ...policy,
    legacyProjectionWriter: async (tx, approval) => {
      legacyResult = await legacyProjectionWriter(tx, approval);
    },
  });
  return {
    authority: mode === APPROVAL_PERSISTENCE_MODES.RELATIONAL_AUTHORITY ? "RELATIONAL" : "LEGACY",
    legacy: legacyResult,
    relational,
  };
}
