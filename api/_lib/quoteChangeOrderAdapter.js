import { createQuoteChangeOrder } from "./quoteChangeOrder.js";

export const CHANGE_ORDER_PERSISTENCE_MODES = Object.freeze({
  LEGACY_ONLY: "LEGACY_ONLY",
  DUAL_WRITE: "DUAL_WRITE",
  RELATIONAL_AUTHORITY: "RELATIONAL_AUTHORITY",
});

export function quoteChangeOrderPersistenceMode(env = process.env) {
  if (String(env.DB01G_CHANGE_ORDER_RELATIONAL_ENABLED || "false").toLowerCase() !== "true") {
    return CHANGE_ORDER_PERSISTENCE_MODES.LEGACY_ONLY;
  }
  return String(env.DB01G_CHANGE_ORDER_RELATIONAL_AUTHORITY || "false").toLowerCase() === "true"
    ? CHANGE_ORDER_PERSISTENCE_MODES.RELATIONAL_AUTHORITY
    : CHANGE_ORDER_PERSISTENCE_MODES.DUAL_WRITE;
}

/**
 * Adaptador experimental no importado por rutas activas.
 * El snapshot base y la vinculación empresarial deben construirse en servidor.
 */
export async function createChangeOrderWithCompatibility({
  prisma,
  context,
  relationalInput,
  legacyCreate,
  legacyProjectionWriter,
  mode = quoteChangeOrderPersistenceMode(),
}) {
  if (mode === CHANGE_ORDER_PERSISTENCE_MODES.LEGACY_ONLY) {
    if (typeof legacyCreate !== "function") throw new TypeError("legacyCreate es obligatorio");
    return { authority: "LEGACY", legacy: await legacyCreate(), relational: null };
  }
  if (typeof legacyProjectionWriter !== "function") {
    throw new TypeError("legacyProjectionWriter es obligatorio para escritura dual");
  }
  let legacy;
  const relational = await createQuoteChangeOrder(prisma, context, relationalInput, {
    legacyProjectionWriter: async (tx, order) => {
      legacy = await legacyProjectionWriter(tx, order);
    },
  });
  return {
    authority: mode === CHANGE_ORDER_PERSISTENCE_MODES.RELATIONAL_AUTHORITY ? "RELATIONAL" : "LEGACY",
    legacy,
    relational,
  };
}
