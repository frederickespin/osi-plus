import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateV17CrmCaseMutationsGuard } from "./validate-v17-crm-case-mutations-guard.mjs";

const read = (path) => readFileSync(path, "utf8");
let assertions = 0;
const rejected = (name, overrides, pattern) => {
  assert.throws(() => validateV17CrmCaseMutationsGuard({ overrides }), pattern, name);
  assertions += 1;
};

assert.equal(validateV17CrmCaseMutationsGuard().ok, true); assertions += 1;
const schema = read("prisma/schema.prisma");
const migrationPath = "prisma/migrations/20260824010000_v17_client_public_ref_case_mutations/migration.sql";
const migration = read(migrationPath);
const rbac = read("api/_lib/rbac.js");
const http = read("api/_lib/crmCaseMutationHttp.js");
const domain = read("api/_lib/crmCaseMutationDomain.js");
const form = read("src/commercial-crm/CommercialCaseForm.tsx");
const detail = read("src/commercial-crm/CommercialCaseDetail.tsx");
const mutationApi = read("src/crm-relational/mutationApi.ts");
const readDomain = read("api/_lib/crmPipelineRead.js");
const browserSuite = read("tests/v17-commercial-crm/commercial-inbox.spec.ts");

rejected("publicRef nullable", { "prisma/schema.prisma": schema.replace(/(model Client\s*\{[\s\S]*?publicRef\s+)String/, "$1String?") }, /Client\.publicRef/);
rejected("unicidad tenant-first retirada", { "prisma/schema.prisma": schema.replace(/\s*@@unique\(\[tenantId, publicRef\][^\n]*\)\r?\n/, "\n") }, /Client\.publicRef/);
rejected("caseCode global", { "prisma/schema.prisma": schema.replace("caseCode                      String", "caseCode                      String @unique") }, /caseCode/);
rejected("backfill empresarial", { [migrationPath]: `${migration}\nUPDATE "osi"."osi_pipeline_cases" SET "clientName"='x';\n` }, /datos empresariales/);
rejected("inmutabilidad retirada", { [migrationPath]: migration.replace("BEFORE UPDATE OF \"public_ref\"", "BEFORE DELETE") }, /inmutabilidad/);
rejected("permiso automático A", { "api/_lib/rbac.js": rbac.replace("Object.values(PERMS).filter((permission) => !EXPLICIT_PIPELINE_MUTATION_PERMISSIONS.has(permission))", "Object.values(PERMS)") }, /A recibe/);
rejected("permiso automático V", { "api/_lib/rbac.js": rbac.replace("PERMS.PIPELINE_VIEW,", "PERMS.PIPELINE_VIEW,\n    PERMS.PIPELINE_CREATE,") }, /V recibe/);
rejected("auth antes del gate", { "api/_lib/crmCaseMutationHttp.js": http.replace("gate(env, req);", "void resolveCrmPipelineContext(req); gate(env, req);") }, /orden/);
rejected("LOCAL_ONLY sin loopback real", { "api/_lib/crmCaseMutationHttp.js": http.replace("&& !isRealLoopbackRequest(req)", "&& false") }, /loopback/);
rejected("modo Production en handler", { "api/_lib/crmCaseMutationHttp.js": http.replace("mode !== CRM_PIPELINE_MUTATION_MODES.PREVIEW_REHEARSAL", "mode !== CRM_PIPELINE_MUTATION_MODES.PRODUCTION_WRITE") }, /local o Preview/);
rejected("hash confiado al cliente", { "api/_lib/crmCaseMutationDomain.js": domain.replace("input.payloadHash !== hashCrmCaseMutation(payload)", "false") }, /payloadHash/);
rejected("actor sin User", { "api/_lib/crmCaseMutationDomain.js": domain.replace(' AND m."user_id"=${userId}', "") }, /User, Membership/);
rejected("PATCH sin tenant", { "api/_lib/crmCaseMutationDomain.js": domain.replace('WHERE "tenant_id"=${who.tenantId} AND "public_ref"', 'WHERE "public_ref"') }, /tenant\/publicRef/);
rejected("V sobre owner ajeno", { "api/_lib/crmCaseMutationDomain.js": domain.replace("current.owner_membership_id !== who.membershipId || current.owner_user_id !== who.userId", "false") }, /owner completo/);
rejected("storage empresarial", { "src/commercial-crm/CommercialCaseForm.tsx": `${form}\nlocalStorage.setItem('case','x');` }, /persistencia empresarial/);
rejected("campo DTO clientName", { "src/crm-relational/mutationApi.ts": `${mutationApi}\ninterface ForbiddenDto { clientName: string }` }, /campo DTO|clientName legacy/);
rejected("fallback frontend clientName", { "src/commercial-crm/CommercialCaseDetail.tsx": `${detail}\nconst forbidden = item.client?.displayName || item.clientName;` }, /campo DTO|clientName legacy/);
rejected("fallback clientName en interpolación", { "src/commercial-crm/CommercialCaseDetail.tsx": `${detail}\nconst forbidden = ` + "`${item.clientName}`" + `;` }, /campo DTO|clientName legacy/);
rejected("selección Prisma clientName", { "api/_lib/crmPipelineRead.js": readDomain.replace("caseCode: true,", "caseCode: true,\n  clientName: true,") }, /lectura CRM.*clientName/);
rejected("fallback API clientName", { "api/_lib/crmPipelineRead.js": readDomain.replace("displayName: String(client.name),", "displayName: String(client.name || row.clientName),") }, /lectura CRM.*clientName/);
rejected("ID interno frontend", { "src/commercial-crm/CommercialCaseForm.tsx": `${form}\nconst clientId='x';` }, /identidad interna/);
rejected("lectura concede escritura UI", { "src/crm-relational/mutationApi.ts": mutationApi.replace('const mutation = environment.VITE_CRM_PIPELINE_CASE_MUTATION_MODE;', 'const mutation = "LOCAL_ONLY";') }, /compuerta focal/);
rejected("capturas reescriben evidencia en CI", { "tests/v17-commercial-crm/commercial-inbox.spec.ts": browserSuite.replace(/CAPTURE_MUTATION_EVIDENCE && /g, "") }, /evidencia/);

assert.equal(validateV17CrmCaseMutationsGuard({ overrides: {
  "src/commercial-crm/CommercialCaseDetail.tsx": `${detail}\nconst clientDisplayName = item.client?.displayName || \`No se infiere desde clientName\`;`,
} }).ok, true); assertions += 1;

process.stdout.write(`${JSON.stringify({ ok: true, assertions })}\n`);
