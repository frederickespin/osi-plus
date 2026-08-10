import { createMt01c2b1LocalPrisma } from "./mt-01c2b1-local-target.mjs";

function increment(target, key) {
  target[key] = (target[key] || 0) + 1;
}

function distinct(values) {
  return [...new Set(values.filter(Boolean))];
}

function normalizedCode(value) {
  return String(value || "").trim().toUpperCase();
}

function countDuplicateEvidenceGroups(rows, tenantEvidence, codeField) {
  const counts = new Map();
  for (const row of rows) {
    const tenantId = tenantEvidence(row);
    const code = normalizedCode(row[codeField]);
    if (!tenantId || !code) continue;
    const key = `${tenantId}\u0000${code}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.values()].filter((count) => count > 1).length;
}

const { prisma, identity } = await createMt01c2b1LocalPrisma();
try {
  const report = await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL TRANSACTION READ ONLY`);
    await tx.$executeRawUnsafe(`SET LOCAL statement_timeout = '5000ms'`);
    await tx.$executeRawUnsafe(`SET LOCAL lock_timeout = '1000ms'`);

    const [clients, projects, leads, pipelineCases, memberships] = await Promise.all([
      tx.$queryRawUnsafe(`SELECT id, code, tenant_id FROM "osi"."osi_clients" ORDER BY id`),
      tx.$queryRawUnsafe(`SELECT p.id, p.code, p.tenant_id, p."clientId", c.tenant_id AS client_tenant_id FROM "osi"."osi_projects" p LEFT JOIN "osi"."osi_clients" c ON c.id=p."clientId" ORDER BY p.id`),
      tx.$queryRawUnsafe(`SELECT l.id, l.code, l.tenant_id, l."customerId", l."projectId", c.tenant_id AS customer_tenant_id, p.tenant_id AS project_tenant_id FROM "osi"."osi_leads" l LEFT JOIN "osi"."osi_clients" c ON c.id=l."customerId" LEFT JOIN "osi"."osi_projects" p ON p.id=l."projectId" ORDER BY l.id`),
      tx.$queryRawUnsafe(`SELECT id, "caseCode", tenant_id, "ownerId", owner_membership_id, owner_user_id FROM "osi"."osi_pipeline_cases" ORDER BY id`),
      tx.$queryRawUnsafe(`SELECT id, tenant_id, user_id, status FROM "osi"."tenant_memberships" ORDER BY tenant_id, user_id, id`),
    ]);

    const activeByUser = new Map();
    for (const row of memberships) {
      if (row.status !== "ACTIVE") continue;
      const values = activeByUser.get(row.user_id) || [];
      values.push(row);
      activeByUser.set(row.user_id, values);
    }

    const roots = {
      Client: { total: clients.length, alreadyTenantized: 0, convertible: 0, withoutBusinessRoot: 0 },
      Project: { total: projects.length, alreadyTenantized: 0, convertible: 0, withoutBusinessRoot: 0 },
      Lead: { total: leads.length, alreadyTenantized: 0, convertible: 0, withoutBusinessRoot: 0 },
      PipelineCase: { total: pipelineCases.length, alreadyTenantized: 0, convertible: 0, withoutBusinessRoot: 0 },
    };
    for (const row of clients) increment(roots.Client, row.tenant_id ? "alreadyTenantized" : "withoutBusinessRoot");
    for (const row of projects) {
      if (row.tenant_id) increment(roots.Project, "alreadyTenantized");
      else if (row.client_tenant_id) increment(roots.Project, "convertible");
      else increment(roots.Project, "withoutBusinessRoot");
    }

    const parentChildContradictions = { projectClient: 0, leadClient: 0, leadProject: 0, leadEvidenceConflict: 0 };
    for (const row of projects) {
      if (row.tenant_id && row.client_tenant_id && row.tenant_id !== row.client_tenant_id) increment(parentChildContradictions, "projectClient");
    }
    for (const row of leads) {
      const evidence = distinct([row.customer_tenant_id, row.project_tenant_id]);
      if (row.tenant_id) increment(roots.Lead, "alreadyTenantized");
      else if (evidence.length === 1) increment(roots.Lead, "convertible");
      else increment(roots.Lead, "withoutBusinessRoot");
      if (evidence.length > 1) increment(parentChildContradictions, "leadEvidenceConflict");
      if (row.tenant_id && row.customer_tenant_id && row.tenant_id !== row.customer_tenant_id) increment(parentChildContradictions, "leadClient");
      if (row.tenant_id && row.project_tenant_id && row.tenant_id !== row.project_tenant_id) increment(parentChildContradictions, "leadProject");
    }

    const owners = { total: pipelineCases.length, null: 0, convertible: 0, withoutActiveMembership: 0, ambiguousBetweenTenants: 0, alreadyLinked: 0, incompleteEnterpriseTriple: 0 };
    for (const row of pipelineCases) {
      const ownerPair = [row.owner_membership_id, row.owner_user_id].filter(Boolean).length;
      if (ownerPair === 1 || (ownerPair === 2 && !row.tenant_id)) increment(owners, "incompleteEnterpriseTriple");
      if (ownerPair === 2 && row.tenant_id) increment(owners, "alreadyLinked");
      else if (!row.ownerId) increment(owners, "null");
      else {
        const membershipsForOwner = activeByUser.get(row.ownerId) || [];
        if (membershipsForOwner.length === 1) increment(owners, "convertible");
        else if (membershipsForOwner.length === 0) increment(owners, "withoutActiveMembership");
        else increment(owners, "ambiguousBetweenTenants");
      }
      if (row.tenant_id) increment(roots.PipelineCase, "alreadyTenantized");
      else if ((activeByUser.get(row.ownerId) || []).length === 1) increment(roots.PipelineCase, "convertible");
      else increment(roots.PipelineCase, "withoutBusinessRoot");
    }

    const duplicateGroups = await Promise.all([
      tx.$queryRawUnsafe(`SELECT COUNT(*)::integer AS count FROM (SELECT code FROM "osi"."osi_clients" GROUP BY code HAVING COUNT(*) > 1) d`),
      tx.$queryRawUnsafe(`SELECT COUNT(*)::integer AS count FROM (SELECT code FROM "osi"."osi_projects" GROUP BY code HAVING COUNT(*) > 1) d`),
      tx.$queryRawUnsafe(`SELECT COUNT(*)::integer AS count FROM (SELECT code FROM "osi"."osi_leads" GROUP BY code HAVING COUNT(*) > 1) d`),
      tx.$queryRawUnsafe(`SELECT COUNT(*)::integer AS count FROM (SELECT "caseCode" FROM "osi"."osi_pipeline_cases" GROUP BY "caseCode" HAVING COUNT(*) > 1) d`),
    ]);

    const potentialNormalizedDuplicatesUnderTenantEvidence = {
      clientCode: countDuplicateEvidenceGroups(clients, (row) => row.tenant_id, "code"),
      projectCode: countDuplicateEvidenceGroups(projects, (row) => row.tenant_id || row.client_tenant_id, "code"),
      leadCode: countDuplicateEvidenceGroups(leads, (row) => {
        if (row.tenant_id) return row.tenant_id;
        const evidence = distinct([row.customer_tenant_id, row.project_tenant_id]);
        return evidence.length === 1 ? evidence[0] : null;
      }, "code"),
      pipelineCaseCode: countDuplicateEvidenceGroups(pipelineCases, (row) => {
        if (row.tenant_id) return row.tenant_id;
        const evidence = activeByUser.get(row.ownerId) || [];
        return evidence.length === 1 ? evidence[0].tenant_id : null;
      }, "caseCode"),
    };

    return {
      readOnly: true,
      wroteRows: 0,
      roots,
      owners,
      parentChildContradictions,
      duplicateGroupsUnderCurrentGlobalKeys: {
        clientCode: duplicateGroups[0][0].count,
        projectCode: duplicateGroups[1][0].count,
        leadCode: duplicateGroups[2][0].count,
        pipelineCaseCode: duplicateGroups[3][0].count,
      },
      potentialNormalizedDuplicatesUnderTenantEvidence,
      decisions: {
        inferredRows: 0,
        automaticBackfillAllowed: false,
        globalUniquenessChanged: false,
      },
    };
  }, { isolationLevel: "ReadCommitted", maxWait: 2_000, timeout: 10_000 });

  process.stdout.write(`${JSON.stringify({ ok: true, target: identity, ...report }, null, 2)}\n`);
} finally {
  await prisma.$disconnect();
}
