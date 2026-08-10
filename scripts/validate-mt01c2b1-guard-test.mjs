import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { validateMigrationFiles } from "./validate-canonical-ci.mjs";
import { validateMt01c2b1Guard } from "./validate-mt01c2b1-guard.mjs";

const root = mkdtempSync(join(tmpdir(), "mt01c2b1-guard-"));
const results = [];

function check(name, condition) {
  if (!condition) throw new Error(`MT01C2B1_GUARD_TEST_FAILED: ${name}`);
  results.push({ name, passed: true });
}

function write(relative, value) {
  const target = join(root, relative);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, value, "utf8");
}

function reject(name, mutate, pattern) {
  mutate();
  let error;
  try { validateMt01c2b1Guard(root); } catch (caught) { error = caught; }
  check(name, error instanceof Error && pattern.test(error.message));
  cpSync(resolve("prisma/schema.prisma"), join(root, "prisma/schema.prisma"), { force: true });
  cpSync(resolve(`prisma/migrations/20260801014000_mt01c2b1_commercial_tenant_foundation/migration.sql`), join(root, `prisma/migrations/20260801014000_mt01c2b1_commercial_tenant_foundation/migration.sql`), { force: true });
  for (const route of ["api/clients/index.js", "api/projects/index.js", "api/k/dashboard.js", "api/k/project.js", "api/k/project-validate.js", "api/k/project-release.js", "api/_disabled/project-validate.js", "api/_disabled/project-release.js"]) {
    cpSync(resolve(route), join(root, route), { force: true });
  }
}

try {
  cpSync(resolve("prisma"), join(root, "prisma"), { recursive: true });
  for (const route of ["api/clients/index.js", "api/projects/index.js", "api/k/dashboard.js", "api/k/project.js", "api/k/project-validate.js", "api/k/project-release.js", "api/_disabled/project-validate.js", "api/_disabled/project-release.js"]) {
    const target = join(root, route);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(resolve(route), target);
  }
  cpSync(resolve(".env.example"), join(root, ".env.example"));

  const baseline = validateMt01c2b1Guard(root);
  check("estado actual aprobado", baseline.nullableRoots === 4 && baseline.runtimeTenantAuthorityConsumers === 0);

  reject("tenantId required rechazado", () => {
    const path = join(root, "prisma/schema.prisma");
    writeFileSync(path, readFileSync(path, "utf8").replace("tenantId                  String?       @map(\"tenant_id\")", "tenantId                  String        @map(\"tenant_id\")"), "utf8");
  }, /Client\.tenantId debe permanecer nullable/);

  reject("backfill dentro de migración rechazado", () => {
    const path = join(root, `prisma/migrations/20260801014000_mt01c2b1_commercial_tenant_foundation/migration.sql`);
    writeFileSync(path, `${readFileSync(path, "utf8")}\nUPDATE \"osi\".\"osi_clients\" SET tenant_id='IPACKERS-DO';\n`, "utf8");
  }, /no es estrictamente aditiva/);

  reject("autoridad runtime por tenantId rechazada", () => {
    const path = join(root, "api/clients/index.js");
    writeFileSync(path, readFileSync(path, "utf8").replace("orderBy: { createdAt: \"desc\" },", "where: { tenantId: req.body.tenantId },\n      orderBy: { createdAt: \"desc\" },"), "utf8");
  }, /usa tenantId como autoridad runtime/);

  reject("contrato sin omit explícito rechazado", () => {
    const path = join(root, "api/projects/index.js");
    writeFileSync(path, readFileSync(path, "utf8").replace(/      omit: \{ tenantId: true \},\r?\n/, ""), "utf8");
  }, /puede exponer tenantId/);

  reject("CHECK de owner permisivo rechazado", () => {
    const path = join(root, `prisma/migrations/20260801014000_mt01c2b1_commercial_tenant_foundation/migration.sql`);
    writeFileSync(path, readFileSync(path, "utf8").replace('("tenant_id" IS NOT NULL AND "owner_membership_id" IS NOT NULL AND "owner_user_id" IS NOT NULL)', '("owner_membership_id" IS NOT NULL AND "owner_user_id" IS NOT NULL)'), "utf8");
  }, /semántica NULL exacta/);

  reject("índice exactamente redundante rechazado", () => {
    const path = join(root, `prisma/migrations/20260801014000_mt01c2b1_commercial_tenant_foundation/migration.sql`);
    writeFileSync(path, `${readFileSync(path, "utf8")}\nCREATE INDEX "osi_clients_tenant_id_id_redundant_idx" ON "osi"."osi_clients"("tenant_id", "id");\n`, "utf8");
  }, /se esperaban 12 índices/);

  reject("guarda DELETE tenantizada ausente rechazada", () => {
    const path = join(root, `prisma/migrations/20260801014000_mt01c2b1_commercial_tenant_foundation/migration.sql`);
    writeFileSync(path, readFileSync(path, "utf8").replace('CREATE TRIGGER "osi_clients_tenant_project_restrict_trigger"', 'CREATE TRIGGER "removed_tenant_project_restrict_trigger"'), "utf8");
  }, /guarda RESTRICT tenantizada/);

  reject("migración histórica alterada rechazada", () => {
    const path = join(root, "prisma/migrations/20260801013000_mt01c1b1_provisioning_persistence/migration.sql");
    writeFileSync(path, `${readFileSync(path, "utf8")}\n-- altered\n`, "utf8");
  }, /migración histórica/);
  cpSync(resolve("prisma/migrations/20260801013000_mt01c1b1_provisioning_persistence/migration.sql"), join(root, "prisma/migrations/20260801013000_mt01c1b1_provisioning_persistence/migration.sql"), { force: true });

  reject("activación TENANT_WRITE rechazada", () => {
    const path = join(root, ".env.example");
    writeFileSync(path, readFileSync(path, "utf8").replace('COMMERCIAL_TENANCY_WRITE_MODE="LEGACY_ONLY"', 'COMMERCIAL_TENANCY_WRITE_MODE="TENANT_WRITE"'), "utf8");
  }, /puente comercial no está en LEGACY_ONLY/);

  const unexpected = join(root, "prisma/migrations/20260801015000_unexpected");
  mkdirSync(unexpected);
  write(join("prisma/migrations/20260801015000_unexpected", "migration.sql"), "SELECT 1;\n");
  let unexpectedError;
  try { validateMigrationFiles(root); } catch (caught) { unexpectedError = caught; }
  check("migración 16 inesperada rechazada", unexpectedError?.message.includes("15 migraciones canónicas"));

  process.stdout.write(`${JSON.stringify({ ok: true, assertions: results.length, results }, null, 2)}\n`);
} finally {
  rmSync(root, { recursive: true, force: true });
}
