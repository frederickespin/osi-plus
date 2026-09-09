import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  applyClientVisitAction,
  confirmClientVisitQr,
  createClientTemporaryAccess,
  listClientTemporaryAccess,
  openClientTemporaryAccess,
  openClientTemporaryAccessByCode,
  revokeClientTemporaryAccess,
  saveClientMiniSurvey,
  uploadClientSurveyAsset,
} from "../api/_lib/clientTemporaryAccessDomain.js";
import { clientTemporaryPayloadHash } from "../api/_lib/clientTemporaryAccessContract.js";
import { createMemorySurveyStorage } from "../api/_lib/crmSurveyStorage.js";

const raw = process.env.V17_CLIENT_TEMPORARY_PORTAL_TEST_DATABASE_URL;
assert.ok(raw, "V17_CLIENT_TEMPORARY_PORTAL_TEST_DATABASE_URL_REQUIRED");
const target = new URL(raw);
assert.ok(["127.0.0.1", "localhost"].includes(target.hostname) && target.port === "55439" && target.pathname === "/v17_client_portal_16a" && target.searchParams.get("schema") === "osi", "PostgreSQL 18 local aislado requerido");
const prisma = new PrismaClient({ datasourceUrl: raw });
const marker = randomUUID().slice(0, 8).toUpperCase(); let checks = 0;
const pass = (condition, message) => { assert.ok(condition, message); checks += 1; };
const rejected = async (code, task) => { let caught; try { await task(); } catch (error) { caught = error; } pass(caught?.code === code, `${code} esperado`); };
const requestId = (label) => `${label}-${marker}-${randomUUID()}`;
const signed = (operation, body) => ({ ...body, payloadHash: clientTemporaryPayloadHash({ operation, ...body }) });

try {
  const migrations = await prisma.$queryRaw`SELECT migration_name,finished_at,rolled_back_at,applied_steps_count FROM "osi"."_prisma_migrations" ORDER BY started_at`;
  pass(migrations.filter((row) => row.finished_at && !row.rolled_back_at && row.applied_steps_count === 1).length === 35, "35/35 migraciones completas");
  const version = await prisma.$queryRaw`SHOW server_version_num`; pass(Number(version[0].server_version_num) >= 180000, "PostgreSQL 18");

  const tenant = await prisma.tenant.create({ data: { id: `cta_t_${marker}`, code: `CTA${marker}`, name: "Client access synthetic", countryCode: "DO" } });
  const otherTenant = await prisma.tenant.create({ data: { id: `cta_x_${marker}`, code: `CTX${marker}`, name: "Client access cross tenant", countryCode: "DO" } });
  const user = await prisma.user.create({ data: { id: `cta_u_${marker}`, code: `CTAU${marker}`, name: "Synthetic portal administrator", email: `cta-${marker}@example.invalid`, phone: "0000000000", role: "A", status: "ACTIVE", joinDate: "2026-09-16", passwordHash: "synthetic-not-login-capable" } });
  const membership = await prisma.tenantMembership.create({ data: { id: `cta_m_${marker}`, tenantId: tenant.id, userId: user.id, role: "A", status: "ACTIVE", isDefault: true, grantedPermissions: ["client-access:view", "client-access:create", "client-access:revoke", "client-access:manage"] } });
  const evaluatorProfile = await prisma.employeeProfile.create({ data: { id: `cta_p_${marker}`, tenantId: tenant.id, membershipId: membership.id, userId: user.id, employeeCode: `EV-${marker}`, normalizedEmployeeCode: `EV-${marker}`, jobTitle: "Evaluador", employmentStatus: "ACTIVE", availabilityStatus: "AVAILABLE" } });
  const client = await prisma.client.create({ data: { id: `cta_c_${marker}`, tenantId: tenant.id, code: `CTAC${marker}`, name: "Synthetic portal client", email: `client-${marker}@example.invalid`, phone: "0000000000", address: "Synthetic address", type: "PERSON", status: "ACTIVE", createdAt: "2026-09-16" } });
  const pipelineCase = await prisma.pipelineCase.create({ data: { id: `cta_case_${marker}`, tenantId: tenant.id, clientId: client.id, caseCode: `CTA-${marker}`, mode: "LOCAL", serviceType: "MOVING", customerType: "L4_PERSONAL", ownerName: user.name, ownerId: user.id, ownerMembershipId: membership.id, ownerUserId: user.id, originLocation: "Synthetic origin", destinationLocation: "Synthetic destination" } });
  await prisma.pipelineCaseRouteSnapshot.createMany({ data: [{ tenantId: tenant.id, pipelineCaseId: pipelineCase.id, routeVersion: 1, role: "ORIGIN", stopOrder: 0, countryCode: "DO", provinceState: "Distrito Nacional", cityMunicipality: "Santo Domingo", streetAndNumber: "Synthetic origin" }, { tenantId: tenant.id, pipelineCaseId: pipelineCase.id, routeVersion: 1, role: "DESTINATION", stopOrder: 0, countryCode: "DO", provinceState: "Santiago", cityMunicipality: "Santiago", streetAndNumber: "Synthetic destination" }] });
  await prisma.pipelineCase.update({ where: { id: pipelineCase.id }, data: { routeContractVersion: 2, routeRevision: 1, destinationStatus: "CONFIRMED" } });
  const serviceRevision = await prisma.pipelineCaseServiceRevision.create({ data: { id: `cta_sr_${marker}`, tenantId: tenant.id, pipelineCaseId: pipelineCase.id, revision: 1, modeSnapshot: "LOCAL", source: "MANUAL", createdByMembershipId: membership.id, createdByUserId: user.id } });
  const assignment = await prisma.surveyAssignment.create({ data: { id: `cta_as_${marker}`, tenantId: tenant.id, pipelineCaseId: pipelineCase.id, serviceRevisionId: serviceRevision.id, routeVersion: 1, evaluatorMembershipId: membership.id, evaluatorUserId: user.id, scheduledStart: new Date("2026-09-18T14:00:00.000Z"), scheduledEnd: new Date("2026-09-18T16:00:00.000Z"), contextSnapshot: { evaluationMethod: "IN_PERSON" }, instructionSnapshot: "Presentar acceso al llegar", createdByMembershipId: membership.id, createdByUserId: user.id } });
  const entity = await prisma.commercialEntity.create({ data: { id: `cta_e_${marker}`, tenantId: tenant.id, clientId: client.id, code: `CTAE${marker}`, displayName: client.name, kind: "PERSON", countryCode: "DO" } });
  const contact = await prisma.commercialEntityContact.create({ data: { id: `cta_ct_${marker}`, tenantId: tenant.id, entityId: entity.id, displayName: "Synthetic authorized contact", emailNormalized: `contact-${marker}@example.invalid`, phoneNormalized: "0000000000", preferredChannel: "WHATSAPP" } });
  const context = await prisma.pipelineCaseCommercialContextVersion.create({ data: { id: `cta_cc_${marker}`, seriesRef: randomUUID(), tenantId: tenant.id, pipelineCaseId: pipelineCase.id, version: 1, state: "PUBLISHED", logicalSha256: "a".repeat(64), createdByMembershipId: membership.id, createdByUserId: user.id, publishedAt: new Date() } });
  await prisma.pipelineCaseCommercialParty.create({ data: { id: `cta_cp_${marker}`, tenantId: tenant.id, contextId: context.id, entityId: entity.id, role: "COMPANY" } });
  const catalog = await prisma.surveyCatalogVersion.create({ data: { id: `cta_cat_${marker}`, tenantId: tenant.id, version: 1, status: "ACTIVE", activatedAt: new Date(), createdByMembershipId: membership.id, createdByUserId: user.id } });
  const article = await prisma.surveyArticleCatalogItem.create({ data: { id: `cta_art_${marker}`, articleRef: randomUUID(), tenantId: tenant.id, catalogVersionId: catalog.id, code: `BOX-${marker}`, name: "Caja sintética", defaultVolumeM3: 0.12, defaultWeightKg: 4.5, weightSource: "CATALOG" } });
  const reason = await prisma.visitReason.create({ data: { id: `cta_r_${marker}`, tenantId: tenant.id, code: `RESCHEDULE-${marker}`, name: "Cambio solicitado por cliente", kind: "RESCHEDULE", requesterOrigin: "CLIENT", visibleToClient: true } });
  const actor = { tenantId: tenant.id, membershipId: membership.id, userId: user.id };

  const createBody = { requestId: requestId("create"), caseRef: pipelineCase.publicRef, assignmentRef: assignment.assignmentRef, contactRef: contact.contactRef, communicationRef: null, purpose: "VISIT", scopes: ["MINI_SURVEY_EDIT", "SURVEY_INFO_UPLOAD", "VISIT_CANCEL_REQUEST", "VISIT_CHANGE_REQUEST", "VISIT_CONFIRM", "VISIT_QR_CONFIRM", "VISIT_VIEW"], expiresAt: "2026-09-20T12:00:00.000Z", maxUses: 100, shortCodeEnabled: true };
  const createCommand = signed("ACCESS_CREATE", createBody);
  const concurrentCreate = await Promise.allSettled([createClientTemporaryAccess(actor, createCommand, prisma, new Date("2026-09-16T12:00:00.000Z")), createClientTemporaryAccess(actor, createCommand, prisma, new Date("2026-09-16T12:00:00.000Z"))]);
  const fulfilledCreates = concurrentCreate.filter((entry) => entry.status === "fulfilled");
  const accessCountAfterCreate = await prisma.clientTemporaryAccess.count({ where: { tenantId: tenant.id } });
  pass(fulfilledCreates.length >= 1 && accessCountAfterCreate === 1, `creación concurrente idempotente produce un acceso (${fulfilledCreates.length}/${accessCountAfterCreate}; ${concurrentCreate.map((entry) => entry.status === "rejected" ? [entry.reason?.code, entry.reason?.cause?.code, entry.reason?.cause?.meta?.code].filter(Boolean).join("/") || "REJECTED" : "OK").join(",")})`);
  const credentialResult = fulfilledCreates.find((entry) => entry.value.oneTimeCredentials);
  const created = (credentialResult || fulfilledCreates[0]).value;
  const credential = credentialResult?.value.oneTimeCredentials;
  pass(Boolean(credential?.link) && !JSON.stringify(await prisma.clientTemporaryAccess.findFirst({ where: { tenantId: tenant.id } })).includes(credential.link.split("#token=")[1]), "token sólo se devuelve una vez y no se persiste");
  const token = credential.link.split("#token=")[1]; const accessRef = created.access.accessRef;
  pass((await listClientTemporaryAccess(actor, pipelineCase.publicRef, prisma)).length === 1, "listado interno tenant/case-first");
  const opened = await openClientTemporaryAccess(accessRef, token, prisma, new Date("2026-09-16T12:01:00.000Z"));
  pass(opened.case.caseCode === pipelineCase.caseCode && opened.visit.route.length === 2 && opened.notices.externalTransportEnabled === false, "vista externa mínima, ruta y transportes cerrados");
  await rejected("CLIENT_TEMPORARY_ACCESS_UNAVAILABLE", () => openClientTemporaryAccess(accessRef, "x".repeat(43), prisma, new Date("2026-09-16T12:01:00.000Z")));
  const wrongShortCode = credential.shortCode === "999999" ? "000000" : "999999";
  await rejected("CLIENT_TEMPORARY_ACCESS_UNAVAILABLE", () => openClientTemporaryAccessByCode(accessRef, wrongShortCode, prisma, new Date("2026-09-16T12:01:00.000Z")));
  pass((await prisma.clientTemporaryAccess.findFirstOrThrow({ where: { tenantId: tenant.id, accessRef } })).shortCodeFailedCount === 1, "intento corto fallido persiste sin revelar identidad");

  const visitBody = { requestId: requestId("visit"), action: "VISIT_CHANGE_REQUEST", expectedVersion: 0, reasonRef: reason.reasonRef, comment: "Otra fecha", suggestedAvailability: ["2026-09-19T14:00:00.000Z"] };
  const { action: visitOperation, ...visitPayload } = visitBody;
  const visitCommand = { ...visitBody, payloadHash: clientTemporaryPayloadHash({ operation: visitOperation, ...visitPayload }) };
  const concurrentVisit = await Promise.allSettled([applyClientVisitAction(accessRef, token, visitCommand, prisma, new Date("2026-09-16T12:02:00.000Z")), applyClientVisitAction(accessRef, token, visitCommand, prisma, new Date("2026-09-16T12:02:00.000Z"))]);
  const visitResponseCount = await prisma.clientTemporaryVisitResponse.count({ where: { tenantId: tenant.id, accessId: (await prisma.clientTemporaryAccess.findFirstOrThrow({ where: { accessRef } })).id } });
  pass(concurrentVisit.some((entry) => entry.status === "fulfilled") && visitResponseCount === 1, `respuesta concurrente tiene un solo estado (${visitResponseCount}; ${concurrentVisit.map((entry) => entry.status === "rejected" ? entry.reason?.code || "REJECTED" : "OK").join(",")})`);
  const unchangedAssignment = await prisma.surveyAssignment.findFirstOrThrow({ where: { tenantId: tenant.id, assignmentRef: assignment.assignmentRef } });
  pass(unchangedAssignment.scheduledStart.toISOString() === "2026-09-18T14:00:00.000Z" && unchangedAssignment.clientConfirmation === "CHANGE_REQUESTED", "solicitud no reprograma automáticamente");

  const visitBeforeRace = await prisma.clientTemporaryVisitResponse.findFirstOrThrow({ where: { tenantId: tenant.id, accessId: (await prisma.clientTemporaryAccess.findFirstOrThrow({ where: { accessRef } })).id } });
  const raceVisitBody = (action) => ({ requestId: requestId(action), action, expectedVersion: visitBeforeRace.version, reasonRef: null, comment: null, suggestedAvailability: [] });
  const signVisit = (body) => { const { action, ...payload } = body; return { ...body, payloadHash: clientTemporaryPayloadHash({ operation: action, ...payload }) }; };
  const confirmVsCancel = await Promise.allSettled([applyClientVisitAction(accessRef, token, signVisit(raceVisitBody("VISIT_CONFIRM")), prisma, new Date("2026-09-16T12:02:30.000Z")), applyClientVisitAction(accessRef, token, signVisit(raceVisitBody("VISIT_CANCEL_REQUEST")), prisma, new Date("2026-09-16T12:02:30.000Z"))]);
  const finalVisitResponse = await prisma.clientTemporaryVisitResponse.findFirstOrThrow({ where: { tenantId: tenant.id, accessId: (await prisma.clientTemporaryAccess.findFirstOrThrow({ where: { accessRef } })).id } });
  const visitRaceWinners = confirmVsCancel.filter((entry) => entry.status === "fulfilled").length; const assignmentCountAfterRace = await prisma.surveyAssignment.count({ where: { tenantId: tenant.id, id: assignment.id } });
  pass(visitRaceWinners === 1 && finalVisitResponse.version === visitBeforeRace.version + 1 && assignmentCountAfterRace === 1, `confirmación vs cancelación conserva un único estado y la cita histórica (${visitRaceWinners}/${finalVisitResponse.version}/${assignmentCountAfterRace}; ${confirmVsCancel.map((entry) => entry.status === "rejected" ? entry.reason?.code || "REJECTED" : "OK").join(",")})`);

  const miniBody = { requestId: requestId("mini"), expectedVersion: 0, submit: true, notes: null, items: [{ articleRef: article.articleRef, quantity: 2, measurements: null, notes: null }] };
  const mini = await saveClientMiniSurvey(accessRef, token, signed("MINI_SURVEY_COMPLETE", miniBody), prisma, new Date("2026-09-16T12:03:00.000Z"));
  pass(mini.contribution.source === "CLIENT_SUPPLIED" && mini.contribution.estimatedVolumeM3 === 0.24 && mini.contribution.estimatedWeightKg === 9, "Mini usa catálogo versionado y fuente no verificada");
  const uploadBytes = Buffer.from("synthetic-client-photo"); const uploadRequestId = requestId("upload"); const uploadSha = createHash("sha256").update(uploadBytes).digest("hex");
  const uploadSigned = { operation: "SURVEY_ASSET_UPLOAD", requestId: uploadRequestId, category: "PHOTO", documentType: null, mimeType: "image/webp", sizeBytes: uploadBytes.length, sha256: uploadSha };
  const upload = await uploadClientSurveyAsset(accessRef, token, { requestId: uploadRequestId, payloadHash: clientTemporaryPayloadHash(uploadSigned), category: "PHOTO", documentType: null, mimeType: "image/webp" }, uploadBytes, prisma, createMemorySurveyStorage(), new Date("2026-09-16T12:03:30.000Z"));
  pass(upload.source === "CLIENT_SUPPLIED" && upload.category === "PHOTO", "upload reutiliza blob Survey y conserva fuente CLIENT_SUPPLIED");
  const qrPayload = `osi-visit:v1:${assignment.assignmentRef}:${evaluatorProfile.profileRef}`; const qrBody = { requestId: requestId("qr"), qrPayload };
  const qr = await confirmClientVisitQr(accessRef, token, signed("QR_CONFIRM", qrBody), prisma, new Date("2026-09-16T12:04:00.000Z"));
  pass(qr.verified === true, "QR confirma visita/evaluador por referencias públicas");

  const otherCase = await prisma.pipelineCase.create({ data: { id: `cta_xcase_${marker}`, tenantId: otherTenant.id, caseCode: `CTX-${marker}`, mode: "LOCAL", serviceType: "MOVING", customerType: "L4_PERSONAL", ownerName: "None", originLocation: "Synthetic", destinationLocation: "Synthetic" } });
  await rejected("CLIENT_TEMPORARY_RESOURCE_NOT_FOUND", () => listClientTemporaryAccess(actor, otherCase.publicRef, prisma));
  const stored = await prisma.clientTemporaryAccess.findFirstOrThrow({ where: { tenantId: tenant.id, accessRef } }); const revokeBody = { requestId: requestId("revoke"), expectedVersion: stored.version, reason: "Synthetic lifecycle close" };
  const revoked = await revokeClientTemporaryAccess(actor, accessRef, signed("ACCESS_REVOKE", revokeBody), prisma, new Date("2026-09-16T12:05:00.000Z"));
  pass(revoked.access.status === "REVOKED", "revocación versionada");
  await rejected("CLIENT_TEMPORARY_ACCESS_UNAVAILABLE", () => openClientTemporaryAccess(accessRef, token, prisma, new Date("2026-09-16T12:06:00.000Z")));
  pass(await prisma.clientTemporaryAccessCommand.count({ where: { tenantId: tenant.id } }) >= 4 && await prisma.clientTemporaryAccessEvent.count({ where: { tenantId: tenant.id } }) >= 5, "comandos y auditoría append-only");
  pass(await prisma.clientTemporaryAccess.count({ where: { tenantId: otherTenant.id } }) === 0, "cero relación cross-tenant");
  process.stdout.write(`${JSON.stringify({ ok: true, checks, postgres: 18, migrations: "35/35", accessRows: 1, miniTypes: 1, qr: "VERIFIED", concurrency: "single-state", productionApiEnabled: false })}\n`);
} finally { await prisma.$disconnect(); }
