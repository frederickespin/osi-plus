import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { Prisma, PrismaClient } from "@prisma/client";
import { appendCommercialAudit } from "../api/_lib/commercialAuditLog.js";
import { ADMIN_MEMBERSHIP_PERMISSIONS } from "../api/_lib/adminMembershipDomain.js";

const BATCH = "V17-ADMIN-TENANT-FIRST-04E1A";
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const DRY_RUN_ROLLBACK = Symbol("DRY_RUN_ROLLBACK");

function sha256(value) {
  return createHash("sha256").update(String(value), "utf8").digest("hex");
}

function required(value, name) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(`${name}_REQUIRED`);
  return normalized;
}

function parseArgs(argv) {
  const values = new Map();
  let apply = false;
  for (const entry of argv) {
    if (entry === "--apply") { apply = true; continue; }
    const match = /^--([a-z-]+)=(.+)$/.exec(entry);
    if (!match || values.has(match[1])) throw new Error("ARGUMENTS_INVALID");
    values.set(match[1], match[2]);
  }
  return Object.freeze({
    apply,
    tenantCode: required(values.get("tenant-code"), "TENANT_CODE"),
    expectedBranchId: required(values.get("expected-branch-id"), "EXPECTED_BRANCH_ID"),
    actorMembershipRef: required(values.get("actor-ref"), "ACTOR_REF"),
    authorizationFile: values.get("authorization-file") || null,
  });
}

async function authorizationReceipt(path, command, targetEmailHash, env) {
  if (!command.apply) return null;
  if (env.V17_ADMIN_BOOTSTRAP_CONFIRM !== "APPLY_AUTHORIZED_MEMBERSHIP") throw new Error("APPLY_CONFIRMATION_REQUIRED");
  if (!path) throw new Error("AUTHORIZATION_FILE_REQUIRED");
  const bytes = await readFile(resolve(path));
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) throw new Error("AUTHORIZATION_FILE_BOM_FORBIDDEN");
  const receipt = JSON.parse(bytes.toString("utf8"));
  const exact = receipt?.batch === BATCH
    && receipt?.executionAuthorized === true
    && receipt?.tenantCode === command.tenantCode
    && receipt?.expectedBranchId === command.expectedBranchId
    && receipt?.actorMembershipRef === command.actorMembershipRef
    && receipt?.targetEmailHash === targetEmailHash
    && ["REHEARSAL", "PRODUCTION"].includes(receipt?.targetEnvironment)
    && Number.isFinite(Date.parse(receipt?.expiresAt))
    && Date.parse(receipt.expiresAt) > Date.now();
  if (!exact) throw new Error("AUTHORIZATION_RECEIPT_INVALID");
  if (receipt.targetEnvironment === "PRODUCTION" && typeof receipt.productionAuthorizationId !== "string") {
    throw new Error("PRODUCTION_AUTHORIZATION_REQUIRED");
  }
  return receipt;
}

function publicReport(result) {
  return Object.freeze({
    ok: true,
    batch: BATCH,
    mode: result.mode,
    branchVerified: true,
    tenantVerified: true,
    userAuthenticable: true,
    membershipExists: result.membershipExists,
    wouldCreate: result.wouldCreate,
    created: result.created,
    idempotent: result.idempotent,
    auditWritten: result.auditWritten,
    targetIdentityHashPrefix: result.targetEmailHash.slice(0, 12),
  });
}

export async function runAdminMembershipBootstrap({ prisma, command, env = process.env, auditWriter = appendCommercialAudit }) {
  if (!UUID_V4.test(command.actorMembershipRef)) throw new Error("ACTOR_REF_INVALID");
  const targetEmail = required(env.V17_ADMIN_BOOTSTRAP_TARGET_EMAIL, "TARGET_EMAIL").toLowerCase();
  const targetEmailHash = sha256(targetEmail);
  const receipt = await authorizationReceipt(command.authorizationFile, command, targetEmailHash, env);
  let report;
  try {
    await prisma.$transaction(async (tx) => {
      if (!command.apply) await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
      const branchRows = await tx.$queryRaw(Prisma.sql`SELECT current_setting('neon.branch_id', true) AS "branch_id"`);
      const branchId = String(branchRows[0]?.branch_id || env.V17_ADMIN_BOOTSTRAP_LOCAL_BRANCH_ID || "");
      if (branchId !== command.expectedBranchId) throw new Error("TARGET_BRANCH_MISMATCH");
      if (command.apply && receipt?.expectedBranchId !== branchId) throw new Error("AUTHORIZATION_BRANCH_MISMATCH");

      const tenantLock = command.apply ? Prisma.sql` FOR UPDATE` : Prisma.empty;
      const actorLock = command.apply ? Prisma.sql` FOR UPDATE OF tm` : Prisma.empty;
      const userLock = command.apply ? Prisma.sql` FOR UPDATE` : Prisma.empty;
      const membershipLock = command.apply ? Prisma.sql` FOR UPDATE` : Prisma.empty;
      const tenants = await tx.$queryRaw(Prisma.sql`
        SELECT "id", "status"::text AS "status" FROM "osi"."tenants"
        WHERE "code"=${command.tenantCode}${tenantLock}
      `);
      if (tenants.length !== 1 || tenants[0].status !== "ACTIVE") throw new Error("TENANT_NOT_ACTIVE_OR_UNIQUE");
      const tenantId = String(tenants[0].id);
      const actors = await tx.$queryRaw(Prisma.sql`
        SELECT tm."id", tm."user_id", tm."role"::text AS "role", tm."status"::text AS "status",
               tm."granted_permissions", tm."denied_permissions", u."status" AS "user_status"
        FROM "osi"."tenant_memberships" tm JOIN "osi"."osi_users" u ON u."id"=tm."user_id"
        WHERE tm."tenant_id"=${tenantId} AND tm."public_ref"=CAST(${command.actorMembershipRef} AS uuid)
        ${actorLock}
      `);
      const actor = actors[0];
      const actorGrants = new Set(actor?.granted_permissions || []);
      const actorDenies = new Set(actor?.denied_permissions || []);
      if (!actor || actor.role !== "A" || actor.status !== "ACTIVE" || String(actor.user_status).toUpperCase() !== "ACTIVE"
        || !ADMIN_MEMBERSHIP_PERMISSIONS.every((permission) => actorGrants.has(permission) && !actorDenies.has(permission))) {
        throw new Error("ACTOR_NOT_AUTHORIZED");
      }

      const users = await tx.$queryRaw(Prisma.sql`
        SELECT "id", "status", ("passwordHash" ~ '^\\$2[aby]\\$[0-9]{2}\\$') AS "authenticable"
        FROM "osi"."osi_users" WHERE LOWER(TRIM("email"))=${targetEmail}
        ${userLock}
      `);
      if (users.length !== 1 || String(users[0].status).toUpperCase() !== "ACTIVE" || users[0].authenticable !== true) {
        throw new Error("TARGET_USER_NOT_AUTHENTICABLE_OR_UNIQUE");
      }
      const userId = String(users[0].id);
      const memberships = await tx.$queryRaw(Prisma.sql`
        SELECT "id", "role"::text AS "role", "status"::text AS "status", "granted_permissions", "denied_permissions"
        FROM "osi"."tenant_memberships" WHERE "tenant_id"=${tenantId} AND "user_id"=${userId}
        ${membershipLock}
      `);
      if (memberships.length > 1) throw new Error("TARGET_MEMBERSHIP_AMBIGUOUS");
      if (memberships[0]) {
        const grants = new Set(memberships[0].granted_permissions || []);
        const denies = new Set(memberships[0].denied_permissions || []);
        const exact = memberships[0].role === "A" && memberships[0].status === "ACTIVE"
          && ADMIN_MEMBERSHIP_PERMISSIONS.every((permission) => grants.has(permission) && !denies.has(permission));
        if (!exact) throw new Error("TARGET_MEMBERSHIP_CONFLICT");
        report = publicReport({ mode: command.apply ? "APPLY" : "DRY_RUN", membershipExists: true, wouldCreate: false, created: false, idempotent: true, auditWritten: false, targetEmailHash });
        if (!command.apply) throw DRY_RUN_ROLLBACK;
        return;
      }

      report = publicReport({ mode: command.apply ? "APPLY" : "DRY_RUN", membershipExists: false, wouldCreate: true, created: false, idempotent: false, auditWritten: false, targetEmailHash });
      if (!command.apply) throw DRY_RUN_ROLLBACK;
      const membershipCount = await tx.tenantMembership.count({ where: { userId } });
      const created = await tx.tenantMembership.create({ data: {
        tenantId, userId, role: "A", status: "ACTIVE",
        grantedPermissions: [...ADMIN_MEMBERSHIP_PERMISSIONS], deniedPermissions: [],
        isDefault: membershipCount === 0, provisioningSource: "MANUAL", provisioningBatchId: BATCH,
      } });
      await auditWriter(tx, { tenantId, actorKind: "MEMBERSHIP", actorMembershipId: String(actor.id) }, {
        action: "MEMBERSHIP_BOOTSTRAPPED", entity: "TENANT_MEMBERSHIP", entityId: created.id,
        afterJson: { membershipRef: created.publicRef, role: created.role, status: created.status, grantedPermissions: created.grantedPermissions, deniedPermissions: created.deniedPermissions },
        metadataJson: { batch: BATCH }, source: "V17_ADMIN_BOOTSTRAP", requestId: receipt.authorizationId,
        correlationId: receipt.authorizationId, critical: true,
      });
      report = publicReport({ mode: "APPLY", membershipExists: false, wouldCreate: true, created: true, idempotent: false, auditWritten: true, targetEmailHash });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 3_000, timeout: 10_000 });
  } catch (error) {
    if (error !== DRY_RUN_ROLLBACK) throw error;
  }
  return report;
}

async function main() {
  const command = parseArgs(process.argv.slice(2));
  const prisma = new PrismaClient();
  try {
    const report = await runAdminMembershipBootstrap({ prisma, command });
    process.stdout.write(`${JSON.stringify(report)}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

if (resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({ ok: false, error: String(error?.message || "BOOTSTRAP_FAILED") })}\n`);
    process.exitCode = 1;
  });
}
