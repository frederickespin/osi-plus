import { spawnSync } from "node:child_process";

const result = spawnSync(process.execPath, ["scripts/validate-crm-01b3b2-guard.mjs"], { encoding: "utf8" });
if (result.status !== 0) throw new Error(result.stderr || result.stdout || "guard failed");
if (!result.stdout.includes("PASS")) throw new Error("guard did not report PASS");
console.log("CRM-01B3B2 guard self-test: PASS");
