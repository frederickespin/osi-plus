import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

function invariant(condition, message) { if (!condition) throw new Error(`CRM01B3B3_GUARD:${message}`); }
const read = (path) => readFileSync(resolve(path), "utf8");

export function validateCrm01b3b3Guard({ root = process.cwd(), overrides = {}, migrationNames } = {}) {
  const source = (path) => overrides[path] ?? readFileSync(resolve(root, path), "utf8");
  const migrations = migrationNames ?? readdirSync(resolve(root, "prisma/migrations"), { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  invariant(migrations.length === 16 && !migrations.some((name) => /^20260801016000/.test(name)), "migración 17 prohibida");
  const crypto = source("api/_lib/crmOwnerRef.js");
  for (const signature of ["aes-256-gcm", "hkdfSync", "randomBytes", "CRM_OWNER_REF_TTL_SECONDS = 300", "CRM_OWNER_REF_CLOCK_SKEW_SECONDS = 30", "osi-plus/crm/pipeline-owner-ref/v1", "setAAD", "setAuthTag"]) {
    invariant(crypto.includes(signature), `ownerRef incompleto: ${signature}`);
  }
  invariant(!/createHmac|sign\(|JWT_SECRET[^\n]*createCipheriv/.test(crypto), "ownerRef no puede ser firmado sin cifrar ni usar JWT_SECRET directamente");
  const catalog = source("api/_lib/crmOwnerCatalog.js");
  invariant(/context\?\.role !== "A"/.test(catalog) && /PIPELINE_ASSIGN/.test(catalog), "catálogo no exige rol A y pipeline:assign");
  invariant(/m\."tenant_id" = \$\{tenantId\}/.test(catalog) && /m\."role"::text = 'V'/.test(catalog), "catálogo no congela tenant/rol V");
  invariant(/m\."status"::text = 'ACTIVE'/.test(catalog) && /lower\(u\."status"\) = 'active'/.test(catalog), "catálogo no exige identidades activas");
  invariant(/CRM_PIPELINE_OWNER_CATALOG_AMBIGUOUS/.test(catalog), "nombres duplicados no bloquean catálogo");
  invariant(!/email|phone|employeeCode|employee_code/i.test(catalog), "catálogo incluye fallback PII o employeeCode");
  const mutation = source("api/_lib/pipelineCaseMutationHttp.js");
  invariant(/allowedBodyKeys: new Set\(\["expectedVersion", "ownerRef"\]\)/.test(mutation), "assign no usa contrato ownerRef");
  invariant(/"ownerMembershipId"/.test(mutation) && /BROWSER_AUTHORITY_FIELDS/.test(mutation), "ownerMembershipId no está prohibido al navegador");
  invariant(/owner: receipt\.resultingOwnerMembershipId \? Object\.freeze\(\{ assigned: true \}\)/.test(mutation), "receipt expone identidad interna");
  const frontend = `${source("src/crm-relational/api.ts")}\n${source("src/crm-relational/RelationalPipelineModule.tsx")}`;
  invariant(!/localStorage|sessionStorage|indexedDB/.test(frontend), "ownerRef no puede persistirse");
  invariant(/presentationKey/.test(frontend) && /value=\{option\.presentationKey\}/.test(frontend), "option DOM debe usar clave efímera");
  invariant(!/value=\{option\.ownerRef\}/.test(frontend), "ownerRef no puede aparecer en option.value");
  invariant(/ownerRefRenewalUsed/.test(frontend) && /CRM_PIPELINE_OWNER_REF_EXPIRED/.test(frontend), "renovación única ausente");
  invariant(!/dangerouslySetInnerHTML/.test(source("src/crm-relational/RelationalPipelineModule.tsx")), "texto hostil no puede renderizar HTML");
  for (const path of ["package.json", ".env.example", "vercel.json", ".github/workflows/ci.yml"]) {
    invariant(!/CRM_PIPELINE_(?:RUNTIME_MODE|MUTATION_MODE)\s*[:=]\s*["']?(?:READ_ONLY|LOCAL_ONLY)/.test(source(path)), `${path} activa CRM`);
  }
  return Object.freeze({ ok: true, migrations: 16, routes: 8, ttlSeconds: 300 });
}

if (resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  process.stdout.write(`${JSON.stringify(validateCrm01b3b3Guard(), null, 2)}\n`);
}
