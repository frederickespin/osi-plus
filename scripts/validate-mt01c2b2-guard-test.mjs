import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { validateMt01c2b2Guard } from "./validate-mt01c2b2-guard.mjs";

const results = [];
const check = (name, condition) => { if (!condition) throw new Error(name); results.push({ name, passed: true }); };
const reject = (name, mutate, expected) => {
  const root = mkdtempSync(join(tmpdir(), "mt01c2b2-guard-"));
  try {
    for (const path of ["api", "src", "scripts", "prisma", ".github", "package.json", "vercel.json"]) cpSync(path, join(root, path), { recursive: true });
    mutate(root);
    try { validateMt01c2b2Guard(root); check(name, false); }
    catch (error) { check(name, String(error.message).includes(expected)); }
  } finally { rmSync(root, { recursive: true, force: true }); }
};

check("estado actual aprobado", validateMt01c2b2Guard().ok === true);
reject("import runtime rechazado", (root) => writeFileSync(join(root, "api", "c2b2.js"), "import '../scripts/mt-01c2b2-lib.mjs';\n"), "consumidores runtime");
reject("migración 23 rechazada", (root) => cpSync(join(root, "prisma", "migrations", "20260801015000_crm01b_pipeline_mutation_authority"), join(root, "prisma", "migrations", "20260901010000_forbidden"), { recursive: true }), "exactamente 22 migraciones");
reject("hook build rechazado", (root) => { const path = join(root, "package.json"); const pkg = JSON.parse(readFileSync(path, "utf8")); pkg.scripts.build = "node scripts/mt-01c2b2-backfill.mjs"; writeFileSync(path, JSON.stringify(pkg)); }, "hook automático C2B2");
reject("activación tenant en POST rechazada", (root) => { const path = join(root, "api", "clients", "index.js"); writeFileSync(path, readFileSync(path, "utf8").replace("data: {", "data: { tenantId: auth.context.tenantId,")); }, "bloqueo C2B3");

process.stdout.write(`${JSON.stringify({ ok: true, assertions: results.length, results }, null, 2)}\n`);
