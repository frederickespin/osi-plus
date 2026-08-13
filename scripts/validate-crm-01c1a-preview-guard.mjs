import { readFileSync, readdirSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const invariant = (condition, message) => { if (!condition) throw new Error(`CRM01C1A_GUARD: ${message}`); };
const migrations = readdirSync("prisma/migrations", { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
invariant(migrations.length === 16 && !migrations.some((name) => /^20260801016000_/.test(name)), "migración 17 prohibida");
const preview = read("api/_lib/crmPreviewRehearsal.js");
const access = read("api/_lib/crmPipelineAccess.js");
const commercial = read("api/_lib/commercialTenancyWrite.js");
const client = read("src/crm-relational/clientMode.ts");
const cors = read("api/_lib/pipelineCaseMutationHttp.js");
for (const signature of [
  'feature/crm01c1a-integrated-preview-rehearsal', 'crm01c1a_rehearsal',
  'br-mute-credit-ahxnvfx0', 'CRM-01C1A-PREVIEW-20260813-V1',
  'VERCEL_GIT_COMMIT_SHA', 'CRM01C1A_EXPECTED_GIT_SHA', 'VERCEL_URL',
]) invariant(preview.includes(signature), `falta autoridad ${signature}`);
invariant(/PREVIEW_READ/.test(access) && /PREVIEW_WRITE/.test(access), "modos backend ausentes");
invariant(/PREVIEW_REHEARSAL/.test(client), "modo frontend ausente");
invariant(/current_database\(\)[\s\S]*current_schema\(\)[\s\S]*neon\.branch_id/.test(commercial), "identidad SQL incompleta");
invariant(/isCrm01c1aPreviewDatabaseUrl\(env\.DATABASE_URL/.test(commercial), "DATABASE_URL no se valida antes de SQL");
invariant(!/DIRECT_URL/.test(preview + commercial + access + client), "fallback DIRECT_URL prohibido");
invariant(/new Set\(\[previewOrigin\]\)/.test(cors), "CORS no limita origen directo");
invariant(!/Access-Control-Allow-Credentials/.test(cors), "credenciales CORS prohibidas");
invariant(!/VITE_(?:CRM_PIPELINE_ACTIVATION_BATCH|CRM01C1A_NEON_BRANCH_ID|CRM01C1A_DATABASE_NAME)/.test(`${preview}\n${client}`), "autoridad backend filtrada al frontend");
invariant(!/CRM01C1A|PREVIEW_REHEARSAL|PREVIEW_READ|PREVIEW_WRITE/.test(read("vercel.json")), "rehearsal no puede configurarse en vercel.json");
invariant(!/CRM01C1A|PREVIEW_REHEARSAL|PREVIEW_READ|PREVIEW_WRITE/.test(read(".env.example")), "rehearsal no puede quedar activo por ejemplo");
invariant(!/api\/crm/.test(read("src/lib/salesStore.ts")), "LeadLite no puede llamar CRM");
invariant(!/osi-plus\.leads/.test(read("src/crm-relational/api.ts") + read("src/crm-relational/RelationalPipelineModule.tsx")), "CRM no puede leer LeadLite");
console.log(JSON.stringify({ ok: true, migrations: migrations.length, mode: "DISABLED", previewAuthority: true }));
