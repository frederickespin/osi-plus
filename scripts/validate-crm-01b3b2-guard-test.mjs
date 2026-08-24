import { spawnSync } from "node:child_process";

const result = spawnSync(process.execPath, ["scripts/validate-crm-01b3b2-guard.mjs"], { encoding: "utf8" });
if (result.status !== 0) throw new Error(result.stderr || result.stdout || "guard failed");
if (!result.stdout.includes("PASS")) throw new Error("guard did not report PASS");

const negativeCases = ["direct-env", "storage", "owner-field", "cors", "production-write", "inline-production"];
for (const negativeCase of negativeCases) {
  const rejected = spawnSync(process.execPath, ["scripts/validate-crm-01b3b2-guard.mjs"], {
    encoding: "utf8",
    env: { ...process.env, CRM01B3B2_GUARD_NEGATIVE_CASE: negativeCase },
  });
  if (rejected.status === 0 || !`${rejected.stderr}${rejected.stdout}`.includes("CRM01B3B2_GUARD")) {
    throw new Error(`negative fixture not rejected: ${negativeCase}`);
  }
}
console.log(`CRM-01B3B2 guard self-test: PASS (${negativeCases.length} fixtures negativas)`);
