import { randomUUID } from "node:crypto";
import { createCrm01b2LocalPrisma } from "./crm-01b2-local-target.mjs";
import { mockResponse } from "./mt-01b1-test-helpers.mjs";

const results = [];
function check(name, condition) {
  results.push({ name, passed: Boolean(condition) });
  if (!condition) throw new Error(name);
}

const { prisma, target } = await createCrm01b2LocalPrisma();
process.env.DATABASE_URL = process.env.CRM01B2_TEST_DATABASE_URL;
process.env.DIRECT_URL = process.env.CRM01B2_TEST_DATABASE_URL;
process.env.JWT_SECRET = "crm01b3a-local-jwt-secret-not-for-runtime";
process.env.MT01B_AUTH_MODE = "LEGACY";
process.env.MT01B_TENANT_SWITCH_ENABLED = "false";
process.env.VITE_MT01B2_CLIENT_ENABLED = "false";
process.env.CRM_PIPELINE_MUTATION_MODE = "LOCAL_ONLY";
process.env.CRM_PIPELINE_RUNTIME_MODE = "READ_ONLY";
for (const key of Object.keys(process.env)) {
  if (key === "VERCEL" || key.startsWith("VERCEL_")) delete process.env[key];
}

const [
  { signAccessToken, signMembershipAccessToken },
  { default: transition },
  { default: assign },
  { default: unassign },
  { default: allowed },
  { issueCrmOwnerRef },
] = await Promise.all([
  import("../api/_lib/auth.js"),
  import("../api/crm/pipeline-cases/[id]/transition.js"),
  import("../api/crm/pipeline-cases/[id]/assign-owner.js"),
  import("../api/crm/pipeline-cases/[id]/unassign-owner.js"),
  import("../api/crm/pipeline-cases/[id]/allowed-transitions.js"),
  import("../api/_lib/crmOwnerRef.js"),
]);
const appPrisma = (await import("../api/_lib/db.js")).prisma;
const run = `crm01b3a-${randomUUID()}`;
const prefix = run.toUpperCase();

function userData(id, role = "V", status = "active") {
  return { id, code: id.toUpperCase(), name: `Synthetic ${role}`, email: `${id}@example.test`, phone: "0", role, status, joinDate: "2026-08-12", passwordHash: "not-a-login-hash" };
}
function caseData(id, tenantId, status = "NEW_INBOX", owner = null, ownerId = null) {
  return { id, tenantId, caseCode: id.toUpperCase(), clientName: "Synthetic", mode: "LOCAL", serviceType: "MOVING", customerType: "L4_PERSONAL", status, lossReasonCode: status === "LOST" ? "OTHER" : null, ownerName: owner ? "Synthetic V" : "Unassigned", ownerMembershipId: owner?.id || null, ownerUserId: owner?.userId || null, ownerId, originLocation: "Origin", destinationLocation: "Destination" };
}
function token(user) { return signAccessToken({ sub: user.id, email: user.email, role: user.role }); }
function key(label) { return `${run}.${label}`; }
function ownerRef(tenantId, membershipId, userId) { return issueCrmOwnerRef({ tenantId, membershipId, userId }); }
function request(user, id, body, requestId = key("request"), method = "POST", extraHeaders = {}) {
  const headers = { authorization: `Bearer ${token(user)}`, "content-type": "application/json", ...extraHeaders };
  if (requestId !== null) headers["idempotency-key"] = requestId;
  return { method, query: { id }, body, headers, rawHeaders: Object.entries(headers).flat() };
}
async function invoke(handler, req) { const res = mockResponse(); await handler(req, res); return res; }
async function expect(name, responsePromise, status, code) {
  const res = await responsePromise;
  check(name, res.statusCode === status && (res.body?.code || res.body?.error) === code);
  check(`${name}: seguro`, !res.getHeader("set-cookie") && res.getHeader("cache-control") === "private, no-store" && /authorization/i.test(res.getHeader("vary")) && !JSON.stringify(res.body).match(/tenantId|ownerUserId|payloadHash|postgresql|prisma|stack/i));
  return res;
}

try {
  const tenantOne = await prisma.tenant.create({ data: { id: `${run}-tenant-1`, code: `${prefix}-T1`, name: "Tenant one" } });
  const tenantTwo = await prisma.tenant.create({ data: { id: `${run}-tenant-2`, code: `${prefix}-T2`, name: "Tenant two" } });
  const adminUser = await prisma.user.create({ data: userData(`${run}-admin`, "A") });
  const sellerUser = await prisma.user.create({ data: userData(`${run}-seller-1`) });
  const sellerTwoUser = await prisma.user.create({ data: userData(`${run}-seller-2`) });
  const inactiveUser = await prisma.user.create({ data: userData(`${run}-inactive`, "V", "inactive") });
  const foreignAdminUser = await prisma.user.create({ data: userData(`${run}-foreign-admin`, "A") });
  const foreignSellerUser = await prisma.user.create({ data: userData(`${run}-foreign-seller`, "V") });
  const admin = await prisma.tenantMembership.create({ data: { id: `${run}-m-admin`, tenantId: tenantOne.id, userId: adminUser.id, role: "A" } });
  const seller = await prisma.tenantMembership.create({ data: { id: `${run}-m-seller-1`, tenantId: tenantOne.id, userId: sellerUser.id, role: "V", isDefault: true } });
  const sellerTwo = await prisma.tenantMembership.create({ data: { id: `${run}-m-seller-2`, tenantId: tenantOne.id, userId: sellerTwoUser.id, role: "V", isDefault: true } });
  await prisma.tenantMembership.create({ data: { id: `${run}-m-inactive`, tenantId: tenantOne.id, userId: inactiveUser.id, role: "V", isDefault: true } });
  await prisma.tenantMembership.create({ data: { id: `${run}-m-foreign-admin`, tenantId: tenantTwo.id, userId: foreignAdminUser.id, role: "A", isDefault: true } });
  const foreignSeller = await prisma.tenantMembership.create({ data: { id: `${run}-m-foreign-seller`, tenantId: tenantTwo.id, userId: foreignSellerUser.id, role: "V", isDefault: true } });
  await prisma.tenantMembership.update({ where: { id: admin.id }, data: { isDefault: true } });
  const v2Session = await prisma.authSession.create({ data: { id: `${run}-session`, tenantId: tenantOne.id, membershipId: seller.id, userId: sellerUser.id, status: "ACTIVE", authorizationVersionSnapshot: 1, fingerprintHash: "a".repeat(64), expiresAt: new Date(Date.now() + 60 * 60 * 1_000) } });

  const own = await prisma.pipelineCase.create({ data: caseData(`${run}-own`, tenantOne.id, "NEW_INBOX", seller, sellerUser.id) });
  const ownRequest = request(sellerUser, own.id, { expectedVersion: 1, toStatus: "AWAITING_ICP", reasonCode: null, evidence: null }, key("own"), "POST", { "x-osi-role": "A", "x-osi-userid": foreignAdminUser.id });
  const ownResult = await invoke(transition, ownRequest);
  check("V transiciona su caso con contexto legacy revalidado", ownResult.statusCode === 200 && ownResult.body.command.resultingVersion === 2);
  check("headers x-osi falsificados no influyen", ownResult.body.command.owner?.assigned === true
    && (await prisma.pipelineCase.findUnique({ where: { id: own.id }, select: { ownerMembershipId: true } }))?.ownerMembershipId === seller.id);
  const replay = await invoke(transition, request(sellerUser, own.id, { expectedVersion: 1, toStatus: "AWAITING_ICP", reasonCode: null, evidence: null }, key("own")));
  check("replay HTTP exacto", replay.statusCode === 200 && replay.body.command.replayed === true && replay.body.command.resultingVersion === 2);
  await expect("reutilización distinta", invoke(transition, request(sellerUser, own.id, { expectedVersion: 1, toStatus: "GOVERNANCE_CONFIRMED", reasonCode: null, evidence: null }, key("own"))), 409, "CRM_PIPELINE_IDEMPOTENCY_CONFLICT");

  const other = await prisma.pipelineCase.create({ data: caseData(`${run}-other-v`, tenantOne.id, "NEW_INBOX", sellerTwo) });
  await expect("V no muta caso ajeno", invoke(transition, request(sellerUser, other.id, { expectedVersion: 1, toStatus: "AWAITING_ICP", reasonCode: null, evidence: null }, key("other-v"))), 403, "CRM_PIPELINE_PERMISSION_FORBIDDEN");
  const noOwner = await prisma.pipelineCase.create({ data: caseData(`${run}-no-owner`, tenantOne.id) });
  await expect("V no muta caso sin owner", invoke(transition, request(sellerUser, noOwner.id, { expectedVersion: 1, toStatus: "AWAITING_ICP", reasonCode: null, evidence: null }, key("no-owner"))), 403, "CRM_PIPELINE_PERMISSION_FORBIDDEN");
  check("A transiciona caso del tenant", (await invoke(transition, request(adminUser, noOwner.id, { expectedVersion: 1, toStatus: "AWAITING_ICP", reasonCode: null, evidence: null }, key("admin")))).statusCode === 200);

  const ownerCase = await prisma.pipelineCase.create({ data: caseData(`${run}-owner`, tenantOne.id, "NEW_INBOX", null, sellerUser.id) });
  const assigned = await invoke(assign, request(adminUser, ownerCase.id, { expectedVersion: 1, ownerRef: ownerRef(tenantOne.id, seller.id, sellerUser.id) }, key("assign")));
  check("A asigna owner sin exponer identidad interna", assigned.statusCode === 200 && assigned.body.command.owner.assigned === true && !JSON.stringify(assigned.body).match(/ownerId|membershipId/));
  check("A reasigna owner", (await invoke(assign, request(adminUser, ownerCase.id, { expectedVersion: 2, ownerRef: ownerRef(tenantOne.id, sellerTwo.id, sellerTwoUser.id) }, key("reassign")))).statusCode === 200);
  check("A desasigna owner", (await invoke(unassign, request(adminUser, ownerCase.id, { expectedVersion: 3 }, key("unassign")))).statusCode === 200);
  const deniedOwnerCase = await prisma.pipelineCase.create({ data: caseData(`${run}-owner-denied-in-domain`, tenantOne.id) });
  await prisma.tenantMembership.update({ where: { id: seller.id }, data: { deniedPermissions: ["pipeline:view"] } });
  await expect("dominio revalida deny aunque el adaptador ya descifró la referencia", invoke(assign, request(adminUser, deniedOwnerCase.id, { expectedVersion: 1, ownerRef: ownerRef(tenantOne.id, seller.id, sellerUser.id) }, key("owner-denied-in-domain"))), 409, "CRM_PIPELINE_OWNER_INELIGIBLE");
  check("deny del owner no deja caso, journal ni auditoría parcial", (await prisma.pipelineCase.findUnique({ where: { id: deniedOwnerCase.id } })).version === 1
    && await prisma.pipelineCaseCommand.count({ where: { pipelineCaseId: deniedOwnerCase.id } }) === 0
    && await prisma.commercialAuditLog.count({ where: { source: "CRM_PIPELINE_DOMAIN", entityId: deniedOwnerCase.id } }) === 0);
  await prisma.tenantMembership.update({ where: { id: seller.id }, data: { deniedPermissions: [] } });
  await expect("V no asigna", invoke(assign, request(sellerUser, ownerCase.id, { expectedVersion: 4, ownerRef: ownerRef(tenantOne.id, seller.id, sellerUser.id) }, key("v-assign"))), 403, "CRM_PIPELINE_PERMISSION_FORBIDDEN");
  await expect("owner cross-tenant oculto", invoke(assign, request(adminUser, ownerCase.id, { expectedVersion: 4, ownerRef: ownerRef(tenantTwo.id, foreignSeller.id, foreignSellerUser.id) }, key("cross-owner"))), 404, "CRM_PIPELINE_RESOURCE_NOT_FOUND");

  const raceCase = await prisma.pipelineCase.create({ data: caseData(`${run}-owner-ref-race`, tenantOne.id) });
  const raceKey = key("owner-ref-race");
  const [raceOne, raceTwo] = await Promise.all([
    invoke(assign, request(adminUser, raceCase.id, { expectedVersion: 1, ownerRef: ownerRef(tenantOne.id, seller.id, sellerUser.id) }, raceKey)),
    invoke(assign, request(adminUser, raceCase.id, { expectedVersion: 1, ownerRef: ownerRef(tenantOne.id, seller.id, sellerUser.id) }, raceKey)),
  ]);
  check("dos refs del mismo owner tienen un único ganador material", [raceOne, raceTwo].filter((response) => response.statusCode === 200).length >= 1);
  const raceReplay = await invoke(assign, request(adminUser, raceCase.id, { expectedVersion: 1, ownerRef: ownerRef(tenantOne.id, seller.id, sellerUser.id) }, raceKey));
  check("ref renovada conserva intención e idempotency key", raceReplay.statusCode === 200 && raceReplay.body.command.replayed === true);
  await expect("misma key con otro owner interno conflictúa", invoke(assign, request(adminUser, raceCase.id, { expectedVersion: 1, ownerRef: ownerRef(tenantOne.id, sellerTwo.id, sellerTwoUser.id) }, raceKey)), 409, "CRM_PIPELINE_IDEMPOTENCY_CONFLICT");
  check("carrera de refs crea un journal y una auditoría", await prisma.pipelineCaseCommand.count({ where: { tenantId: tenantOne.id, requestId: raceKey } }) === 1
    && await prisma.commercialAuditLog.count({ where: { source: "CRM_PIPELINE_DOMAIN", entityId: raceCase.id, action: "CRM_PIPELINE_OWNER_ASSIGNED" } }) === 1);

  const approved = await prisma.pipelineCase.create({ data: caseData(`${run}-approved`, tenantOne.id, "APPROVED", seller) });
  await expect("APPROVED congelado", invoke(transition, request(adminUser, approved.id, { expectedVersion: 1, toStatus: "OPS_HANDOFF", reasonCode: null, evidence: { type: "PROJECT", id: "missing" } }, key("approved"))), 409, "CRM_PIPELINE_STATE_INVALID");
  const approvedAllowed = await invoke(allowed, request(adminUser, approved.id, undefined, null, "GET"));
  check("APPROVED publica cero transiciones", approvedAllowed.statusCode === 200 && approvedAllowed.body.case.transitions.length === 0);

  const blocked = await prisma.pipelineCase.create({ data: caseData(`${run}-blocked`, tenantOne.id, "SURVEY_PLANNING", seller) });
  const blockedAllowed = await invoke(allowed, request(sellerUser, blocked.id, undefined, null, "GET"));
  check("allowed omite evidencia no demostrable", blockedAllowed.statusCode === 200 && !blockedAllowed.body.case.transitions.some((item) => item.toStatus === "SURVEY_SCHEDULED"));
  const quoteSent = await prisma.pipelineCase.create({ data: caseData(`${run}-quote-sent`, tenantOne.id, "QUOTE_SENT", seller) });
  const quoteSentAllowed = await invoke(allowed, request(sellerUser, quoteSent.id, undefined, null, "GET"));
  check("allowed omite WON sin evidencia soportada", quoteSentAllowed.statusCode === 200 && !quoteSentAllowed.body.case.transitions.some((item) => item.toStatus === "WON"));
  const lost = await prisma.pipelineCase.create({ data: caseData(`${run}-lost`, tenantOne.id, "LOST", seller) });
  check("V no recibe reapertura administrativa", (await invoke(allowed, request(sellerUser, lost.id, undefined, null, "GET"))).body.case.transitions.length === 0);
  check("A recibe reapertura administrativa", (await invoke(allowed, request(adminUser, lost.id, undefined, null, "GET"))).body.case.transitions.some((item) => item.toStatus === "NEW_INBOX"));

  const client = await prisma.client.create({ data: { id: `${run}-client`, tenantId: tenantOne.id, name: "Synthetic", code: `${prefix}-CLIENT`, email: `${run}-client@example.test`, phone: "0", address: "Synthetic", type: "PERSON", status: "active", createdAt: "2026-08-12" } });
  const quoteCase = await prisma.pipelineCase.create({ data: caseData(`${run}-quote`, tenantOne.id, "PRICING_IN_PROGRESS", seller) });
  const quote = await prisma.pipelineCaseQuote.create({ data: { id: `${run}-quote-evidence`, caseId: quoteCase.id, level: "BASIC", status: "DRAFT" } });
  await expect("evidencia ausente", invoke(transition, request(sellerUser, quoteCase.id, { expectedVersion: 1, toStatus: "QUOTE_DRAFT", reasonCode: null, evidence: null }, key("evidence-missing"))), 409, "CRM_PIPELINE_EVIDENCE_REQUIRED");
  check("evidencia válida", (await invoke(transition, request(sellerUser, quoteCase.id, { expectedVersion: 1, toStatus: "QUOTE_DRAFT", reasonCode: null, evidence: { type: "QUOTE", id: quote.id } }, key("evidence-valid")))).statusCode === 200);
  void client;

  for (const [index, value] of [0, -1, Number.MAX_SAFE_INTEGER + 1, Number.NaN, Number.POSITIVE_INFINITY, 1.5, "1", true].entries()) {
    await expect(`expectedVersion inválida ${index}`, invoke(transition, request(adminUser, noOwner.id, { expectedVersion: value, toStatus: "GOVERNANCE_CONFIRMED", reasonCode: null, evidence: null }, key(`invalid-version-${index}`))), 400, "CRM_PIPELINE_COMMAND_INVALID");
  }
  await expect("evidence parcial", invoke(transition, request(sellerUser, quoteCase.id, { expectedVersion: 2, toStatus: "INTERNAL_REVIEW", reasonCode: null, evidence: { type: "QUOTE" } }, key("evidence-partial"))), 400, "CRM_PIPELINE_COMMAND_INVALID");
  await expect("evidence con clave desconocida", invoke(transition, request(sellerUser, quoteCase.id, { expectedVersion: 2, toStatus: "INTERNAL_REVIEW", reasonCode: null, evidence: { type: "QUOTE", id: quote.id, tenantId: tenantOne.id } }, key("evidence-unknown"))), 400, "CRM_PIPELINE_COMMAND_INVALID");

  await prisma.tenantMembership.update({ where: { id: seller.id }, data: { deniedPermissions: ["pipeline:transition"] } });
  await expect("deniedPermissions prevalece", invoke(transition, request(sellerUser, own.id, { expectedVersion: 2, toStatus: "GOVERNANCE_CONFIRMED", reasonCode: null, evidence: null }, key("denied"))), 403, "CRM_PIPELINE_PERMISSION_FORBIDDEN");
  await prisma.tenantMembership.update({ where: { id: seller.id }, data: { deniedPermissions: [], status: "SUSPENDED" } });
  await expect("membresía suspendida", invoke(transition, request(sellerUser, own.id, { expectedVersion: 2, toStatus: "GOVERNANCE_CONFIRMED", reasonCode: null, evidence: null }, key("membership-suspended"))), 403, "COMMERCIAL_MEMBERSHIP_INACTIVE");
  await prisma.tenantMembership.update({ where: { id: seller.id }, data: { status: "ACTIVE" } });
  await prisma.tenant.update({ where: { id: tenantOne.id }, data: { status: "SUSPENDED" } });
  await expect("tenant suspendido", invoke(transition, request(sellerUser, own.id, { expectedVersion: 2, toStatus: "GOVERNANCE_CONFIRMED", reasonCode: null, evidence: null }, key("tenant-suspended"))), 403, "COMMERCIAL_TENANT_INACTIVE");
  await prisma.tenant.update({ where: { id: tenantOne.id }, data: { status: "ACTIVE" } });

  await expect("cross-tenant indistinguible", invoke(transition, request(foreignAdminUser, own.id, { expectedVersion: 2, toStatus: "GOVERNANCE_CONFIRMED", reasonCode: null, evidence: null }, key("cross-tenant"))), 404, "CRM_PIPELINE_RESOURCE_NOT_FOUND");
  await expect("usuario global inactivo", invoke(transition, request(inactiveUser, own.id, { expectedVersion: 2, toStatus: "GOVERNANCE_CONFIRMED", reasonCode: null, evidence: null }, key("inactive"))), 401, "COMMERCIAL_AUTH_INVALID");
  await expect("versión obsoleta", invoke(transition, request(sellerUser, own.id, { expectedVersion: 1, toStatus: "GOVERNANCE_CONFIRMED", reasonCode: null, evidence: null }, key("version"))), 409, "CRM_PIPELINE_VERSION_CONFLICT");
  const invalidBearer = await invoke(transition, { ...request(sellerUser, own.id, {}, key("bad-token")), headers: { authorization: "Bearer invalid", "content-type": "application/json", "idempotency-key": key("bad-token") }, rawHeaders: ["authorization", "Bearer invalid", "content-type", "application/json", "idempotency-key", key("bad-token")] });
  check("Bearer inválido", invalidBearer.statusCode === 401 && typeof invalidBearer.body?.code === "string" && !invalidBearer.getHeader("set-cookie"));
  const anonymousRequest = request(sellerUser, own.id, { expectedVersion: 2, toStatus: "GOVERNANCE_CONFIRMED", reasonCode: null, evidence: null }, key("anonymous"));
  delete anonymousRequest.headers.authorization;
  anonymousRequest.rawHeaders = Object.entries(anonymousRequest.headers).flat();
  await expect("Authorization ausente", invoke(transition, anonymousRequest), 401, "COMMERCIAL_AUTH_REQUIRED");
  await expect("objeto explícito vacío se rechaza por contrato", invoke(transition, request(sellerUser, own.id, {}, key("empty-object"), "POST", { "content-length": "2" })), 400, "CRM_PIPELINE_COMMAND_INVALID");
  await prisma.user.update({ where: { id: inactiveUser.id }, data: { status: "suspended" } });
  await expect("usuario global suspended", invoke(transition, request(inactiveUser, own.id, { expectedVersion: 2, toStatus: "GOVERNANCE_CONFIRMED", reasonCode: null, evidence: null }, key("user-suspended"))), 401, "COMMERCIAL_AUTH_INVALID");
  await prisma.user.update({ where: { id: inactiveUser.id }, data: { status: "inactive" } });

  const v2Token = signMembershipAccessToken({ userId: sellerUser.id, membershipId: seller.id, tenantId: tenantOne.id, role: "V", authorizationVersion: 1, sessionId: v2Session.id });
  const v2RequestFor = (bearer) => {
    const value = request(sellerUser, own.id, undefined, null, "GET");
    value.headers.authorization = `Bearer ${bearer}`;
    value.rawHeaders = Object.entries(value.headers).flat();
    return value;
  };
  const v2Disabled = await invoke(allowed, v2RequestFor(v2Token));
  check("JWT V2 rechazado mientras V2 está desactivado", v2Disabled.statusCode === 401 && (v2Disabled.body?.code || v2Disabled.body?.error) === "COMMERCIAL_AUTH_INVALID");
  process.env.MT01B_AUTH_MODE = "MEMBERSHIP_ONLY";
  const v2Request = v2RequestFor(v2Token);
  check("JWT V2 válido usa contexto empresarial", (await invoke(allowed, v2Request)).statusCode === 200);
  const invalidV2Parts = v2Token.split(".");
  invalidV2Parts[2] = `${invalidV2Parts[2][0] === "a" ? "b" : "a"}${invalidV2Parts[2].slice(1)}`;
  const invalidV2 = invalidV2Parts.join(".");
  const invalidV2Request = v2RequestFor(invalidV2);
  const invalidV2Response = await invoke(allowed, invalidV2Request);
  check(`JWT V2 inválido sin fallback (${invalidV2Response.statusCode}/${invalidV2Response.body?.code || invalidV2Response.body?.error})`, invalidV2Response.statusCode === 401 && (invalidV2Response.body?.code || invalidV2Response.body?.error) === "COMMERCIAL_AUTH_INVALID");
  await prisma.tenantMembership.update({ where: { id: seller.id }, data: { authorizationVersion: { increment: 1 } } });
  await expect("authorizationVersion obsoleta", invoke(allowed, v2RequestFor(v2Token)), 401, "MT01B_AUTHORIZATION_INVALID");
  await prisma.tenantMembership.update({ where: { id: seller.id }, data: { authorizationVersion: 1 } });
  process.env.MT01B_AUTH_MODE = "LEGACY";

  check("journals y auditorías tienen cardinalidad exacta", await prisma.pipelineCaseCommand.count({ where: { pipelineCaseId: { startsWith: run } } }) === await prisma.commercialAuditLog.count({ where: { source: "CRM_PIPELINE_DOMAIN", entityId: { startsWith: run } } }));
  check("destino local exacto", target.address === "127.0.0.1" && target.port === 55432);
} catch (error) {
  process.stdout.write(`${JSON.stringify({ ok: false, assertions: results.filter((item) => item.passed).length, error: { name: error.name, code: error.code || null, message: error.message } }, null, 2)}\n`);
  process.exitCode = 1;
} finally {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`LOCK TABLE "osi"."commercial_audit_logs", "osi"."pipeline_case_commands" IN ACCESS EXCLUSIVE MODE`);
      await tx.$executeRawUnsafe(`ALTER TABLE "osi"."commercial_audit_logs" DISABLE TRIGGER "commercial_audit_logs_append_only"`);
      await tx.$executeRawUnsafe(`ALTER TABLE "osi"."pipeline_case_commands" DISABLE TRIGGER "pipeline_case_commands_append_only"`);
      await tx.commercialAuditLog.deleteMany({ where: { source: "CRM_PIPELINE_DOMAIN", entityId: { startsWith: run } } });
      await tx.pipelineCaseCommand.deleteMany({ where: { pipelineCaseId: { startsWith: run } } });
      await tx.pipelineCaseQuote.deleteMany({ where: { caseId: { startsWith: run } } });
      await tx.project.deleteMany({ where: { id: { startsWith: run } } });
      await tx.pipelineCase.deleteMany({ where: { id: { startsWith: run } } });
      await tx.client.deleteMany({ where: { id: { startsWith: run } } });
      await tx.authSession.deleteMany({ where: { id: { startsWith: run } } });
      await tx.tenantMembership.deleteMany({ where: { id: { startsWith: run } } });
      await tx.user.deleteMany({ where: { id: { startsWith: run } } });
      await tx.tenant.deleteMany({ where: { id: { startsWith: run } } });
      await tx.$executeRawUnsafe(`ALTER TABLE "osi"."pipeline_case_commands" ENABLE TRIGGER "pipeline_case_commands_append_only"`);
      await tx.$executeRawUnsafe(`ALTER TABLE "osi"."commercial_audit_logs" ENABLE TRIGGER "commercial_audit_logs_append_only"`);
    });
  } catch (cleanupError) {
    process.stderr.write(`${JSON.stringify({ cleanup: "failed", code: cleanupError.code || null })}\n`);
    process.exitCode = 1;
  }
  await Promise.allSettled([prisma.$disconnect(), appPrisma.$disconnect()]);
}

if (!process.exitCode) process.stdout.write(`${JSON.stringify({ ok: true, assertions: results.length, results }, null, 2)}\n`);
