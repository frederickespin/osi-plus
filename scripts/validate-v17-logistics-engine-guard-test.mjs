import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateLogisticsEngineGuard } from "./validate-v17-logistics-engine-guard.mjs";
const read = (path) => readFileSync(path, "utf8"); let passed = 0;
function rejects(path, mutate) { assert.throws(() => validateLogisticsEngineGuard({ [path]: mutate(read(path)) })); passed += 1; }
rejects("api/_lib/logisticsEngineHttp.js", (v) => v.replace('DISABLED: "DISABLED",', 'DISABLED: "DISABLED", PRODUCTION_WRITE: "PRODUCTION_WRITE",'));
rejects("api/_lib/logisticsEngineHttp.js", (v) => v.replace("if (!prepareLogisticsRequest(req, res, env)) return;", "if (false) return;"));
rejects("api/_lib/logisticsEngineDomain.js", (v) => v.replace("tenantId: context.tenantId, publicRef: caseRef", "publicRef: caseRef"));
rejects("api/_lib/logisticsEngineDomain.js", (v) => v.replace("ownerMembershipId: context.membershipId", "ownerMembershipId: undefined"));
rejects("api/_lib/logisticsEngineDomain.js", (v) => v.replace("ownerUserId: context.userId", "ownerUserId: undefined"));
rejects("api/_lib/logisticsEngineDomain.js", (v) => v.replace("LOGISTICS_INPUT_STALE", "STALE_REMOVED"));
rejects("prisma/migrations/20260908010000_v17_logistics_engine/migration.sql", (v) => v.replace("logistics_revisions_append_only", "revision_history_mutable"));
rejects("prisma/migrations/20260908010000_v17_logistics_engine/migration.sql", (v) => v.replace("logistics_rules_no_equal_conflict", "rule_conflict_removed"));
rejects("api/_lib/logisticsEngineContract.js", (v) => v.replace("LOGISTICS_COMMERCIAL_VALUE_FORBIDDEN", "COMMERCIAL_ALLOWED"));
rejects("api/_lib/rbac.js", (v) => v.replace("EXPLICIT_LOGISTICS_PERMISSIONS", "ROLE_LOGISTICS_PERMISSIONS"));
rejects("src/commercial-crm/CommercialCaseDetail.tsx", (v) => v.replace("const LogisticsPlanPanel = lazy", "const LogisticsPlanPanel = eager"));
rejects("scripts/protected-cors-route-inventory.json", (v) => v.replace('      "/api/logistics/rules",\r\n', "").replace('      "/api/logistics/rules",\n', ""));
process.stdout.write(JSON.stringify({ ok: true, negatives: passed }) + "\n");
