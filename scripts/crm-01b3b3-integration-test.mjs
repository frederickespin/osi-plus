import { performance } from "node:perf_hooks";
import { randomUUID } from "node:crypto";
import { createCrm01b2LocalPrisma } from "./crm-01b2-local-target.mjs";
import { listCrmPipelineOwnerOptions, resolveCrmOwnerRefForAssignment } from "../api/_lib/crmOwnerCatalog.js";
import { readCrmOwnerRef } from "../api/_lib/crmOwnerRef.js";
import { assertOwnerCatalogContract } from "./crm-owner-catalog-contract.mjs";

const results = [];
const metrics = {};
function check(name, condition, detail) {
  results.push({ name, passed: Boolean(condition), ...(detail === undefined ? {} : { detail }) });
  if (!condition) throw new Error(name);
}
function percentile(values, fraction) {
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.min(ordered.length - 1, Math.floor(ordered.length * fraction))];
}
async function measure(name, rounds, operation) {
  const values = [];
  for (let index = 0; index < rounds; index += 1) {
    const started = performance.now();
    await operation(index);
    values.push(performance.now() - started);
  }
  metrics[name] = {
    rounds,
    p50Ms: Number(percentile(values, 0.5).toFixed(2)),
    p95Ms: Number(percentile(values, 0.95).toFixed(2)),
    maxMs: Number(Math.max(...values).toFixed(2)),
  };
}

const { prisma, target } = await createCrm01b2LocalPrisma();
process.env.CRM_PIPELINE_OWNER_REF_SECRET = "A".repeat(64);
const run = `crm01b3b3-${randomUUID()}`;
const prefix = run.toUpperCase();
const tenantOneId = `${run}-tenant-1`;
const tenantTwoId = `${run}-tenant-2`;
const adminContext = Object.freeze({ tenantId: tenantOneId, role: "A", effectivePermissions: Object.freeze(["pipeline:assign"]) });
let queryCount = 0;
const countedPrisma = Object.freeze({
  $queryRaw(...args) { queryCount += 1; return prisma.$queryRaw(...args); },
});
const user = (index, tenant = 1) => ({
  id: `${run}-u-${tenant}-${index}`,
  code: `${prefix}-U-${tenant}-${index}`,
  name: `Vendedor ${String(index).padStart(4, "0")}`,
  email: `${run}-${tenant}-${index}@example.test`,
  phone: "0",
  role: "V",
  status: "active",
  joinDate: "2026-08-13",
  passwordHash: "not-a-login-hash",
});

try {
  await prisma.tenant.createMany({ data: [
    { id: tenantOneId, code: `${prefix}-T1`, name: "Tenant one" },
    { id: tenantTwoId, code: `${prefix}-T2`, name: "Tenant two" },
  ] });
  const users = Array.from({ length: 2_000 }, (_, index) => user(index + 1));
  users.push(user(1, 2));
  await prisma.user.createMany({ data: users });
  await prisma.tenantMembership.createMany({ data: [
    ...users.slice(0, 2_000).map((entry, index) => ({
      id: `${run}-m-1-${index + 1}`,
      tenantId: tenantOneId,
      userId: entry.id,
      role: "V",
      status: "ACTIVE",
      deniedPermissions: index === 1_999 ? ["pipeline:update"] : [],
    })),
    { id: `${run}-m-2-1`, tenantId: tenantTwoId, userId: users[2_000].id, role: "V", status: "ACTIVE" },
  ] });

  queryCount = 0;
  const first = await listCrmPipelineOwnerOptions(adminContext, { page: "1", pageSize: "100" }, { prisma: countedPrisma });
  check("2.000 memberships se filtran sin N+1", first.total === 1_999 && first.data.length === 100 && queryCount === 1, { queries: queryCount });
  const forbiddenFixtureValues = users.flatMap((entry, index) => [
    { kind: "USER_ID", value: entry.id },
    { kind: "EMAIL", value: entry.email },
    { kind: "PHONE", value: entry.phone },
    { kind: "MEMBERSHIP_ID", value: index < 2_000 ? `${run}-m-1-${index + 1}` : `${run}-m-2-1` },
    { kind: "TENANT_ID", value: index < 2_000 ? tenantOneId : tenantTwoId },
  ]);
  const contract = assertOwnerCatalogContract(first.data, {
    forbiddenValues: forbiddenFixtureValues,
    verifyOwnerRef: (value) => readCrmOwnerRef(value, { env: process.env }),
  });
  check("contrato real no expone IDs ni PII", contract.entries === 100 && contract.fields === 3);
  const foreignCatalog = await listCrmPipelineOwnerOptions(Object.freeze({ ...adminContext, tenantId: tenantTwoId }), {}, { prisma });
  check("segundo tenant recibe únicamente su vendedor", foreignCatalog.total === 1 && foreignCatalog.data.length === 1);
  check("nombre idéntico en otro tenant no vuelve ambiguo el catálogo", foreignCatalog.data[0].displayName === first.data[0].displayName);

  await measure("firstPage", 30, () => listCrmPipelineOwnerOptions(adminContext, { page: "1", pageSize: "100" }, { prisma }));
  await measure("deepPage", 30, () => listCrmPipelineOwnerOptions(adminContext, { page: "20", pageSize: "100" }, { prisma }));
  await measure("search", 30, () => listCrmPipelineOwnerOptions(adminContext, { page: "1", pageSize: "100", q: "Vendedor 19" }, { prisma }));
  await measure("emit100", 30, () => listCrmPipelineOwnerOptions(adminContext, { page: "1", pageSize: "100" }, { prisma }));
  await measure("decryptRevalidate", 30, () => resolveCrmOwnerRefForAssignment(adminContext, first.data[0].ownerRef, { prisma }));
  check("backend cálido dentro de 100 ms p95", Object.values(metrics).every((entry) => entry.p95Ms <= 100), metrics);

  const foreignContext = Object.freeze({ ...adminContext, tenantId: tenantTwoId });
  queryCount = 0;
  let crossCode = null;
  try { await resolveCrmOwnerRefForAssignment(foreignContext, first.data[0].ownerRef, { prisma: countedPrisma }); }
  catch (error) { crossCode = error.code; }
  check("ownerRef cross-tenant devuelve 404 antes de SQL", crossCode === "CRM_PIPELINE_RESOURCE_NOT_FOUND" && queryCount === 0);

  const selectedMembershipId = `${run}-m-1-1`;
  await prisma.tenantMembership.update({ where: { id: selectedMembershipId }, data: { status: "SUSPENDED" } });
  let suspendedCode = null;
  try { await resolveCrmOwnerRefForAssignment(adminContext, first.data[0].ownerRef, { prisma }); }
  catch (error) { suspendedCode = error.code; }
  check("revalidación real rechaza owner suspendido", suspendedCode === "CRM_PIPELINE_OWNER_INELIGIBLE");
  await prisma.tenantMembership.update({ where: { id: selectedMembershipId }, data: { status: "ACTIVE" } });

  await prisma.tenantMembership.update({ where: { id: selectedMembershipId }, data: { deniedPermissions: ["pipeline:view"] } });
  let deniedCode = null;
  try { await resolveCrmOwnerRefForAssignment(adminContext, first.data[0].ownerRef, { prisma }); }
  catch (error) { deniedCode = error.code; }
  check("deny añadido después de emitir ownerRef lo vuelve inelegible", deniedCode === "CRM_PIPELINE_OWNER_INELIGIBLE");
  await prisma.tenantMembership.update({ where: { id: selectedMembershipId }, data: { deniedPermissions: [] } });

  const duplicateUserId = `${run}-u-1-1500`;
  const duplicateMembershipId = `${run}-m-1-1500`;
  for (const [label, firstName, duplicateName] of [
    ["case y espacios extremos", "Vendedor 0001", "  vEnDeDoR 0001  "],
    ["espacios internos repetidos", "Ana María", "Ana    María"],
    ["Unicode canónico NFC/NFD", "José Vendedor", "Jose\u0301 Vendedor"],
    ["Unicode de compatibilidad NFKC", "Ａｎａ", "Ana"],
  ]) {
    await prisma.user.update({ where: { id: `${run}-u-1-1` }, data: { name: firstName } });
    await prisma.user.update({ where: { id: duplicateUserId }, data: { name: duplicateName } });
    let ambiguousCode = null;
    try { await listCrmPipelineOwnerOptions(adminContext, { page: "20", pageSize: "100", q: "Vendedor 19" }, { prisma }); }
    catch (error) { ambiguousCode = error.code; }
    check(`duplicado global fuera de página/filtro: ${label}`, ambiguousCode === "CRM_PIPELINE_OWNER_CATALOG_AMBIGUOUS");
  }
  await prisma.user.update({ where: { id: `${run}-u-1-1` }, data: { name: "Vendedor 0001" } });
  await prisma.user.update({ where: { id: duplicateUserId }, data: { name: "Vendedor 0001" } });
  await prisma.tenantMembership.update({ where: { id: duplicateMembershipId }, data: { status: "SUSPENDED" } });
  const inactiveDuplicate = await listCrmPipelineOwnerOptions(adminContext, {}, { prisma });
  check("duplicado inelegible queda fuera de ambigüedad", inactiveDuplicate.total === 1_998);
  await prisma.tenantMembership.update({ where: { id: duplicateMembershipId }, data: { status: "ACTIVE" } });
  await prisma.user.update({ where: { id: duplicateUserId }, data: { name: "Vendedor 1500" } });
  check("destino PostgreSQL 18 local exacto", target.address === "127.0.0.1" && target.port === 55432 && !target.neonBranchId);
} catch (error) {
  process.stdout.write(`${JSON.stringify({ ok: false, assertions: results.filter((entry) => entry.passed).length, error: { name: error.name, code: error.code || null, message: error.message }, metrics }, null, 2)}\n`);
  process.exitCode = 1;
} finally {
  try {
    await prisma.tenantMembership.deleteMany({ where: { id: { startsWith: run } } });
    await prisma.user.deleteMany({ where: { id: { startsWith: run } } });
    await prisma.tenant.deleteMany({ where: { id: { startsWith: run } } });
  } catch (cleanupError) {
    process.stderr.write(`${JSON.stringify({ cleanup: "failed", code: cleanupError.code || null })}\n`);
    process.exitCode = 1;
  }
  await prisma.$disconnect();
}

if (!process.exitCode) process.stdout.write(`${JSON.stringify({ ok: true, assertions: results.length, fixtureMemberships: 2_001, metrics, results }, null, 2)}\n`);
