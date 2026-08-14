import { spawnSync } from "node:child_process";

const run = (negativeCase) => spawnSync(process.execPath, ["scripts/validate-crm-01c1b-visual-guard.mjs"], {
  encoding: "utf8",
  env: { ...process.env, ...(negativeCase ? { CRM01C1B_VISUAL_GUARD_NEGATIVE_CASE: negativeCase } : {}) },
});
const valid = run();
if (valid.status !== 0 || !valid.stdout.includes("PASS")) throw new Error(valid.stderr || valid.stdout || "visual guard failed");
for (const negativeCase of ["legacy-store", "relative-base", "production-fallback", "missing-browser-suite"]) {
  const rejected = run(negativeCase);
  if (rejected.status === 0 || !`${rejected.stderr}${rejected.stdout}`.includes("CRM01C1B_VISUAL_GUARD")) {
    throw new Error(`negative fixture not rejected:${negativeCase}`);
  }
}
console.log("CRM-01C1B visual guard self-test: PASS (4 fixtures negativas)");
