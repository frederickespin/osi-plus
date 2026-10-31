import { createHash } from "node:crypto";

const PREFIXES = Object.freeze({
  CATALOG_CREATE: "SER",
  PACKAGE_SAVE: "COM",
  MATERIAL_POLICY_SAVE: "POL",
  DEFAULTS_SAVE: "PRE",
});

// Assign only after authorization and idempotency checks, inside the write
// transaction. An uncertain response retried with the same request keeps the
// same identity; the database's tenant/code unique key remains authoritative.
export function automaticServiceConfigurationCode(tenantId, command) {
  const prefix = PREFIXES[command.operation];
  if (!prefix) throw new TypeError("Unsupported service configuration identity");
  const suffix = createHash("sha256")
    .update(JSON.stringify([tenantId, command.operation, command.requestId]), "utf8")
    .digest("hex").slice(0, 16).toUpperCase();
  return `${prefix}_${suffix}`;
}
