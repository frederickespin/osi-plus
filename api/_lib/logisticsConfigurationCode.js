import { createHash } from "node:crypto";

const IDENTITIES = Object.freeze({
  ZONE: { operation: "TRANSPORT_ZONE_VERSION", prefix: "ZON" },
  COMPONENT: { operation: "TRANSPORT_ZONE_VERSION", prefix: "REN" },
  RULE: { operation: "LOGISTICS_RULE_VERSION", prefix: "RGL" },
});

// Assign inside the authorized write transaction, after its replay check. The
// request and row position keep a retry's identities stable without a counter.
export function automaticLogisticsConfigurationCode(tenantId, command, kind, position = null) {
  const identity = IDENTITIES[kind];
  if (!identity || command.operation !== identity.operation
    || kind === "COMPONENT" && (!Number.isSafeInteger(position) || position < 0)
    || kind !== "COMPONENT" && position !== null) throw new TypeError("Unsupported logistics configuration identity");
  const suffix = createHash("sha256")
    .update(JSON.stringify([tenantId, command.operation, command.requestId, kind, position]), "utf8")
    .digest("hex").slice(0, 24).toUpperCase();
  return `${identity.prefix}_${suffix}`;
}
