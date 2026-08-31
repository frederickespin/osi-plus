import { readFileSync, readdirSync } from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

function invariant(condition, message) { if (!condition) throw new Error(`CRM01B3B3_GUARD:${message}`); }
const read = (path) => readFileSync(resolve(path), "utf8");
function filesBelow(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = resolve(directory, entry.name);
    return entry.isDirectory() ? filesBelow(target) : [target];
  });
}

export function validateCrm01b3b3Guard({ root = process.cwd(), overrides = {}, extraSources = {}, migrationNames } = {}) {
  const source = (path) => overrides[path] ?? extraSources[path] ?? readFileSync(resolve(root, path), "utf8");
  const migrations = migrationNames ?? readdirSync(resolve(root, "prisma/migrations"), { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  invariant(migrations.length === 22 && migrations.includes("20260801020000_v17_pipeline_case_client_authority") && migrations.includes("20260821010000_v17_pipeline_case_public_ref") && migrations.includes("20260831010000_v17_crm_icp_foundation"), "se exigen 22 migraciones canónicas exactas");
  const crypto = source("api/_lib/crmOwnerRef.js");
  for (const signature of ["aes-256-gcm", "hkdfSync", "randomBytes", "CRM_OWNER_REF_TTL_SECONDS = 300", "CRM_OWNER_REF_CLOCK_SKEW_SECONDS = 30", "osi-plus/crm/pipeline-owner-ref/v1", "setAAD", "setAuthTag"]) {
    invariant(crypto.includes(signature), `ownerRef incompleto: ${signature}`);
  }
  invariant(!/createHmac|sign\(|JWT_SECRET|legacyJwtSecretMaterial|from ["']\.\/auth\.js["']/.test(crypto), "ownerRef no puede depender de la autoridad JWT");
  invariant(/const secret = env\.CRM_PIPELINE_OWNER_REF_SECRET/.test(crypto)
    && /Buffer\.byteLength\(secret, ["']utf8["']\) !== 64/.test(crypto)
    && /\^\[A-Za-z0-9_\-\]\{64\}\$/.test(crypto), "ownerRef no valida exactamente 64 caracteres ASCII base64url");
  invariant(!/const secret\s*=\s*[^;\n]*(?:\?\?|\|\||\?)/.test(crypto), "ownerRef no puede usar fallback de secreto");
  invariant(/hkdfSync\([\s\S]*Buffer\.from\(secret, ["']utf8["']\)[\s\S]*32/.test(crypto), "ownerRef debe derivar AES-256 mediante HKDF");
  const access = source("api/_lib/crmPipelineAccess.js");
  invariant(/if \(localWrite \|\| productionWrite\) assertCrmOwnerRefSecretConfigured\(env\)/.test(access), "secreto ownerRef sólo debe exigirse con mutaciones activas");
  invariant(!/CRM_PIPELINE_OWNER_REF_SECRET/.test(access), "el resolver no debe leer ni reinterpretar directamente el secreto");
  const catalog = source("api/_lib/crmOwnerCatalog.js");
  invariant(/context\?\.role !== "A"/.test(catalog) && /PIPELINE_ASSIGN/.test(catalog), "catálogo no exige rol A y pipeline:assign");
  invariant(/m\."tenant_id" = \$\{tenantId\}/.test(catalog) && /m\."role"::text = 'V'/.test(catalog), "catálogo no congela tenant/rol V");
  invariant(/m\."status"::text = 'ACTIVE'/.test(catalog) && /lower\(u\."status"\) = 'active'/.test(catalog), "catálogo no exige identidades activas");
  invariant(/CRM_PIPELINE_OWNER_CATALOG_AMBIGUOUS/.test(catalog), "nombres duplicados no bloquean catálogo");
  invariant(/regexp_replace\(btrim\(u\."name"\), '\[\[:space:\]\]\+', ' ', 'g'\)/.test(catalog), "ambigüedad no normaliza espacios internos");
  invariant(/WITH eligible AS MATERIALIZED[\s\S]*ambiguity AS[\s\S]*LEFT JOIN page ON true/.test(catalog), "ambigüedad debe ser global aunque la página esté vacía");
  invariant(!/email|phone|employeeCode|employee_code/i.test(catalog), "catálogo incluye fallback PII o employeeCode");
  const mutation = source("api/_lib/pipelineCaseMutationHttp.js");
  invariant(/allowedBodyKeys: new Set\(\["expectedVersion", "ownerRef"\]\)/.test(mutation), "assign no usa contrato ownerRef");
  invariant(/"ownerMembershipId"/.test(mutation) && /BROWSER_AUTHORITY_FIELDS/.test(mutation), "ownerMembershipId no está prohibido al navegador");
  invariant(/owner: receipt\.resultingOwnerMembershipId \? Object\.freeze\(\{ assigned: true \}\)/.test(mutation), "receipt expone identidad interna");
  const domain = source("api/_lib/pipelineCaseDomain.js");
  invariant(/NOT \(m\."denied_permissions" &&/.test(domain) && /FOR UPDATE OF m, u/.test(domain), "owner no se revalida y bloquea dentro de la transacción");
  const frontend = `${source("src/crm-relational/api.ts")}\n${source("src/crm-relational/RelationalPipelineModule.tsx")}`;
  invariant(!/localStorage|sessionStorage|indexedDB/.test(frontend), "ownerRef no puede persistirse");
  invariant(/presentationKey/.test(frontend) && /value=\{option\.presentationKey\}/.test(frontend), "option DOM debe usar clave efímera");
  invariant(!/value=\{option\.ownerRef\}/.test(frontend), "ownerRef no puede aparecer en option.value");
  invariant(!/renewOwnerRef|normalizedPresentationName/.test(frontend) && /CRM_PIPELINE_OWNER_REF_EXPIRED/.test(frontend), "ownerRef expirado debe exigir nueva selección explícita");
  invariant(!/dangerouslySetInnerHTML/.test(source("src/crm-relational/RelationalPipelineModule.tsx")), "texto hostil no puede renderizar HTML");
  for (const path of ["package.json", ".env.example", "vercel.json", ".github/workflows/ci.yml"]) {
    invariant(!/CRM_PIPELINE_(?:RUNTIME_MODE|MUTATION_MODE)\s*[:=]\s*["']?(?:READ_ONLY|LOCAL_ONLY)/.test(source(path)), `${path} activa CRM`);
    invariant(!source(path).includes("CRM_PIPELINE_OWNER_REF_SECRET"), `${path} no puede configurar la autoridad ownerRef`);
  }
  const frontendSources = [
    ...filesBelow(resolve(root, "src")).filter((path) => /\.(?:js|jsx|ts|tsx)$/.test(path)).map((path) => [relative(root, path).replaceAll("\\", "/"), readFileSync(path, "utf8")]),
    ...Object.entries(extraSources).filter(([path]) => path.startsWith("src/") && /\.(?:js|jsx|ts|tsx)$/.test(path)),
  ];
  for (const [path, text] of frontendSources) {
    invariant(!text.includes("CRM_PIPELINE_OWNER_REF_SECRET"), `${path} expone la autoridad ownerRef al frontend`);
  }
  const serverSources = filesBelow(resolve(root, "api")).filter((path) => path.endsWith(".js"));
  for (const path of serverSources) {
    const text = readFileSync(path, "utf8");
    if (relative(root, path).replaceAll("\\", "/") !== "api/_lib/crmOwnerRef.js") {
      invariant(!text.includes("CRM_PIPELINE_OWNER_REF_SECRET"), `${relative(root, path)} lee la autoridad fuera del módulo criptográfico`);
    }
    invariant(!/console\.(?:log|info|warn|error)[\s\S]{0,160}CRM_PIPELINE_OWNER_REF_SECRET/.test(text), `${relative(root, path)} registra la autoridad ownerRef`);
  }
  const discovered = filesBelow(resolve(root, "api/crm"))
    .filter((path) => path.endsWith(".js"))
    .map((path) => relative(root, path).replaceAll("\\", "/"));
  const routes = [...new Set([...discovered, ...Object.keys(extraSources).filter((path) => path.startsWith("api/crm/") && path.endsWith(".js"))])].sort();
  invariant(routes.length === 9, `inventario recursivo de rutas CRM cambió: ${routes.length}`);
  for (const path of routes) {
    invariant(/crmPipeline(?:Access|Read)|pipelineCaseMutationHttp|crmOwnerCatalogHttp|crmClientOptions/.test(source(path)), `${path} omite la compuerta CRM central`);
  }
  return Object.freeze({ ok: true, migrations: 22, routes: routes.length, ttlSeconds: 300 });
}

if (resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  process.stdout.write(`${JSON.stringify(validateCrm01b3b3Guard(), null, 2)}\n`);
}
