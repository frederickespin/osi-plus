import assert from "node:assert/strict";
import fs from "node:fs";
import { validateCommunicationsGuard } from "./validate-v17-communications-guard.mjs";

const read = (path) => fs.readFileSync(path, "utf8");
const base = {
  "prisma/schema.prisma": read("prisma/schema.prisma"),
  "prisma/migrations/20260913010000_v17_communications_templates/migration.sql": read("prisma/migrations/20260913010000_v17_communications_templates/migration.sql"),
  "api/_lib/communicationsContract.js": read("api/_lib/communicationsContract.js"),
  "api/_lib/communicationsDomain.js": read("api/_lib/communicationsDomain.js"),
  "api/_lib/communicationsHttp.js": read("api/_lib/communicationsHttp.js"),
  "api/_lib/communicationsTransport.js": read("api/_lib/communicationsTransport.js"),
  "src/communications/access.ts": read("src/communications/access.ts"),
  "src/communications/mode.ts": read("src/communications/mode.ts"),
  "src/hub/HubWorkspace.tsx": read("src/hub/HubWorkspace.tsx"),
  "scripts/protected-cors-route-inventory.json": read("scripts/protected-cors-route-inventory.json"),
};
let checks = 0;
const rejects = (path, mutate, pattern) => { const value = mutate(base[path]); assert.throws(() => validateCommunicationsGuard({ ...base, [path]: value }), pattern); checks += 1; };
validateCommunicationsGuard(base); checks += 1;
rejects("api/_lib/communicationsHttp.js", (v) => v.replace("productionApiEnabled = false", "productionApiEnabled = true"), /Production\/transporte/);
rejects("api/_lib/communicationsHttp.js", (v) => v.replace("COMMUNICATION_TRANSPORT_DISABLED", "COMMUNICATION_TRANSPORT_ACTIVE"), /Production\/transporte/);
rejects("api/_lib/communicationsContract.js", (v) => v.replace("COMMUNICATION_VARIABLE_NOT_ALLOWED", "VARIABLE_ALLOWED"), /whitelist/);
rejects("api/_lib/communicationsContract.js", (v) => v.replace("assertCommunicationVariablesForContext", "allowEveryCommunicationVariable"), /whitelist/);
rejects("api/_lib/communicationsDomain.js", (v) => v.replaceAll("tenantId: context.tenantId", "tenantId: undefined"), /tenant-first/);
rejects("api/_lib/communicationsDomain.js", (v) => v.replace("assertCommunicationVariablesForContext(input.variables, input.context);", ""), /preview debe validar/);
rejects("api/_lib/communicationsDomain.js", (v) => v.replace("row.caseContactEmailNormalized", "row.client?.email"), /contacto explícito/);
rejects("api/_lib/communicationsDomain.js", (v) => v.replaceAll("TransactionIsolationLevel.Serializable", "TransactionIsolationLevel.ReadCommitted"), /idempotencia/);
rejects("src/communications/access.ts", (v) => v.replace("&& !blocked.has(permission)", ""), /deny/);
rejects("src/communications/mode.ts", (v) => v.replace("&& !Object.keys(environment).some((key) => key.toUpperCase().startsWith(\"VERCEL\"))", ""), /modo local/);
rejects("prisma/migrations/20260913010000_v17_communications_templates/migration.sql", (v) => v.replaceAll("communication_append_only", "communication_mutable"), /trigger/);
rejects("scripts/protected-cors-route-inventory.json", (v) => v.replace(/\s*"\/api\/communications\/send",?/, ""), /CORS/);
rejects("api/_lib/communicationsDomain.js", (v) => `${v}\n// sendgrid transport`, /transporte externo/);
rejects("api/_lib/communicationsTransport.js", (v) => v.replace("EMAIL: false", "EMAIL: true"), /adaptador de transporte/);
console.log(`V17-COMMUNICATIONS-GUARD-NEGATIVE ${checks}/${checks}`);
