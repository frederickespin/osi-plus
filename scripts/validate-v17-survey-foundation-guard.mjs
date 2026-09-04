import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

export function validateSurveyFoundationSources(source) {
  const errors = [];
  const demand = (condition, message) => {
    if (!condition) errors.push(message);
  };
  demand(
    [
      "SurveyAssignment",
      "SurveyDraft",
      "SurveyPublication",
      "SurveyBlobObject",
      "SurveyPhoto",
      "SurveyPublicationSignature",
      "SurveyMutationCommand",
    ].every((name) => source.schema.includes(`model ${name} {`)),
    "SURVEY_MODELS_REQUIRED",
  );
  demand(
    source.schema.includes("serviceRevisionId") &&
      source.schema.includes("routeVersion") &&
      source.schema.includes("catalogVersionId"),
    "ICP_SERVICES_VERSION_LINK_REQUIRED",
  );
  demand(
    !/model SurveyBlobObject[\s\S]*?\b(?:bytes|base64|data)\s+(?:String|Bytes)/.test(
      source.schema,
    ),
    "INLINE_BLOB_FORBIDDEN",
  );
  demand(
    source.migration.includes("survey_publication_items_immutable") &&
      source.migration.includes("survey_publications_update_guard"),
    "PUBLICATION_IMMUTABILITY_REQUIRED",
  );
  demand(
    source.migration.includes("survey_photos_context_check") &&
      source.migration.includes("survey_draft_items_values_check"),
    "PHOTO_AND_QUANTITY_CONSTRAINTS_REQUIRED",
  );
  demand(
    source.domain.includes("tenantId: who.tenantId") &&
      source.domain.includes("evaluatorMembershipId: who.membershipId") &&
      source.domain.includes("evaluatorUserId: who.userId"),
    "TENANT_AND_EVALUATOR_SCOPE_REQUIRED",
  );
  demand(
    source.domain.includes("SURVEY_DAMAGE_PHOTO_REQUIRED") &&
      source.domain.includes("PRE_EXISTING_DAMAGE"),
    "DAMAGE_PHOTO_RULE_REQUIRED",
  );
  demand(
    source.domain.includes("surveyMutationCommand") &&
      source.domain.includes("appendCommercialAudit"),
    "IDEMPOTENCY_AUDIT_REQUIRED",
  );
  demand(!source.domain.includes("clientName"), "LEGACY_CLIENT_NAME_FORBIDDEN");
  demand(
    source.http.includes("CRM_SURVEY_API_MODES") &&
      !source.http.includes("PRODUCTION_WRITE") &&
      source.http.includes("CRM_SURVEY_DISABLED"),
    "PRODUCTION_SURVEY_MUST_FAIL_CLOSED",
  );
  demand(
    source.env.includes('CRM_SURVEY_API_MODE="DISABLED"') &&
      source.env.includes('VITE_CRM_SURVEY_UI_MODE="DISABLED"'),
    "SURVEY_DEFAULTS_MUST_BE_DISABLED",
  );
  demand(
    source.ui.includes("Próximo") &&
      source.ui.includes("Llegué a la hora acordada") &&
      source.ui.includes("SignaturePad"),
    "APPROVED_MOBILE_FLOW_REQUIRED",
  );
  demand(
    !source.ui.includes("localStorage") &&
      !source.ui.includes("sessionStorage"),
    "BUSINESS_STORAGE_FORBIDDEN",
  );
  demand(
    !/<select[^>]*(?:material|packing|caja|bubble)/i.test(source.ui),
    "MANUAL_PACKING_SELECTION_FORBIDDEN",
  );
  demand(
    source.pdf.includes("FORBIDDEN_PDF_KEYS") &&
      source.pdf.includes("price|cost|margin|internal"),
    "PRIVATE_PDF_FIELDS_GUARD_REQUIRED",
  );
  demand(
    source.hub.includes("const SurveyApp = lazy(") &&
      source.hub.includes('selected?.appId === "osi-survey" && surveyEnabled'),
    "SURVEY_LAZY_GATE_REQUIRED",
  );
  demand(
    source.catalog.includes(
      'requiredPermissions: ["survey:assignment:view"]',
    ) &&
      source.rbac.includes('SURVEY_ASSIGNMENT_VIEW: "survey:assignment:view"'),
    "EXPLICIT_SURVEY_PERMISSION_REQUIRED",
  );
  return errors;
}

async function load(root) {
  const read = (path) => readFile(join(root, path), "utf8");
  return {
    schema: await read("prisma/schema.prisma"),
    migration: await read(
      "prisma/migrations/20260905010000_v17_survey_foundation/migration.sql",
    ),
    domain: await read("api/_lib/crmSurveyDomain.js"),
    http: await read("api/_lib/crmSurveyHttp.js"),
    ui: await read("src/survey/SurveyApp.tsx"),
    pdf: await read("api/_lib/crmSurveyPdf.js"),
    hub: await read("src/hub/HubWorkspace.tsx"),
    catalog: await read("src/hub/appCatalog.ts"),
    rbac: await read("api/_lib/rbac.js"),
    env: await read(".env.example"),
  };
}
const isMain =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const source = await load(root);
  const errors = validateSurveyFoundationSources(source);
  if (errors.length) {
    process.stderr.write(`${JSON.stringify({ ok: false, errors }, null, 2)}\n`);
    process.exitCode = 1;
  } else
    process.stdout.write(
      `${JSON.stringify({ ok: true, checks: 17, productionApiEnabled: false, runtimeConsumers: 1 }, null, 2)}\n`,
    );
}
