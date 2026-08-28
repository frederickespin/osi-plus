import { createHash } from "node:crypto";
import { chmod, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Prisma, PrismaClient } from "@prisma/client";
import { appendCommercialAudit } from "../api/_lib/commercialAuditLog.js";
import { ADMIN_MEMBERSHIP_PERMISSIONS } from "../api/_lib/adminMembershipDomain.js";

const BATCH = "V17-ADMIN-IDENTITY-04E1A1-INITIAL-PERMISSIONS";
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const DRY_RUN = Symbol("DRY_RUN");

function sha256(value) { return createHash("sha256").update(String(value), "utf8").digest("hex"); }
function canonical(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
}
function required(value, code) { const text = String(value || "").trim(); if (!text) throw new Error(code); return text; }

function parseArgs(argv) {
  const values = new Map(); let apply = false;
  for (const entry of argv) {
    if (entry === "--apply") { apply = true; continue; }
    const match = /^--([a-z-]+)=(.+)$/.exec(entry);
    if (!match || values.has(match[1])) throw new Error("ARGUMENTS_INVALID");
    values.set(match[1], match[2]);
  }
  const expectedVersion = Number(values.get("expected-version"));
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) throw new Error("EXPECTED_VERSION_INVALID");
  return Object.freeze({
    apply,
    tenantCode: required(values.get("tenant-code"), "TENANT_CODE_REQUIRED"),
    membershipRef: required(values.get("membership-ref"), "MEMBERSHIP_REF_REQUIRED"),
    expectedVersion,
    expectedBranchId: required(values.get("expected-branch-id"), "EXPECTED_BRANCH_ID_REQUIRED"),
    manifestFile: required(values.get("manifest-file"), "MANIFEST_FILE_REQUIRED"),
    authorizationFile: values.get("authorization-file") || null,
  });
}

async function readJsonNoBom(path, code) {
  const bytes = await readFile(resolve(path));
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) throw new Error(`${code}_BOM_FORBIDDEN`);
  return JSON.parse(bytes.toString("utf8"));
}

async function loadAuthorization(command, manifestHash, env) {
  if (!command.apply) return null;
  if (env.V17_ADMIN_INITIAL_PERMISSIONS_CONFIRM !== "APPLY_AUTHORIZED_INITIAL_PERMISSIONS") throw new Error("APPLY_CONFIRMATION_REQUIRED");
  if (!command.authorizationFile) throw new Error("AUTHORIZATION_FILE_REQUIRED");
  const receipt = await readJsonNoBom(command.authorizationFile, "AUTHORIZATION_FILE");
  const valid = receipt?.batch === BATCH && receipt?.executionAuthorized === true
    && receipt?.tenantCode === command.tenantCode && receipt?.membershipRef === command.membershipRef
    && receipt?.expectedVersion === command.expectedVersion && receipt?.expectedBranchId === command.expectedBranchId
    && receipt?.manifestHash === manifestHash && typeof receipt?.authorizationId === "string"
    && ["REHEARSAL", "PRODUCTION"].includes(receipt?.targetEnvironment)
    && Number.isFinite(Date.parse(receipt?.expiresAt)) && Date.parse(receipt.expiresAt) > Date.now();
  if (!valid) throw new Error("AUTHORIZATION_RECEIPT_INVALID");
  if (receipt.targetEnvironment === "PRODUCTION" && typeof receipt.productionAuthorizationId !== "string") throw new Error("PRODUCTION_AUTHORIZATION_REQUIRED");
  return receipt;
}

function manifestFor(command, row) {
  const grants = [...new Set((row.granted_permissions || []).map(String))].sort();
  const denies = [...new Set((row.denied_permissions || []).map(String))].sort();
  if (ADMIN_MEMBERSHIP_PERMISSIONS.some((permission) => denies.includes(permission))) throw new Error("ADMIN_PERMISSION_EXPLICITLY_DENIED");
  const nextGrants = [...new Set([...grants, ...ADMIN_MEMBERSHIP_PERMISSIONS])].sort();
  const body = Object.freeze({
    batch: BATCH,
    expectedBranchId: command.expectedBranchId,
    tenantCode: command.tenantCode,
    membershipRef: command.membershipRef,
    expectedVersion: command.expectedVersion,
    before: { role: row.role, status: row.status, grantedPermissions: grants, deniedPermissions: denies },
    after: { role: row.role, status: row.status, grantedPermissions: nextGrants, deniedPermissions: denies },
  });
  return Object.freeze({ ...body, manifestHash: sha256(canonical(body)) });
}

async function writePrivateManifest(path, manifest) {
  await writeFile(resolve(path), `${JSON.stringify(manifest, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  await chmod(resolve(path), 0o600);
}

export async function runInitialAdminPermissionsBootstrap({ prisma, command, env = process.env, auditWriter = appendCommercialAudit }) {
  if (!UUID_V4.test(command.membershipRef)) throw new Error("MEMBERSHIP_REF_INVALID");
  let manifest;
  if (command.apply) {
    manifest = await readJsonNoBom(command.manifestFile, "MANIFEST_FILE");
    const { manifestHash, ...body } = manifest;
    if (manifestHash !== sha256(canonical(body))) throw new Error("MANIFEST_HASH_INVALID");
  }
  const receipt = command.apply ? await loadAuthorization(command, manifest.manifestHash, env) : null;
  let report;
  try {
    await prisma.$transaction(async (tx) => {
      if (!command.apply) await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
      const branchRows = await tx.$queryRaw(Prisma.sql`SELECT current_setting('neon.branch_id', true) AS "branch_id"`);
      const branchId = String(branchRows[0]?.branch_id || env.V17_ADMIN_INITIAL_PERMISSIONS_LOCAL_BRANCH_ID || "");
      if (branchId !== command.expectedBranchId) throw new Error("TARGET_BRANCH_MISMATCH");
      const lock = command.apply ? Prisma.sql` FOR UPDATE OF tm` : Prisma.empty;
      const rows = await tx.$queryRaw(Prisma.sql`
        SELECT tm."id", tm."public_ref", tm."role"::text AS "role", tm."status"::text AS "status",
               tm."granted_permissions", tm."denied_permissions", tm."authorization_version", tm."tenant_id", tm."user_id",
               u."status" AS "user_status", t."status"::text AS "tenant_status"
        FROM "osi"."tenant_memberships" tm JOIN "osi"."osi_users" u ON u."id"=tm."user_id"
        JOIN "osi"."tenants" t ON t."id"=tm."tenant_id"
        WHERE t."code"=${command.tenantCode} AND tm."public_ref"=CAST(${command.membershipRef} AS uuid)
        ${lock}
      `);
      const row = rows[0];
      if (!row || rows.length !== 1 || row.role !== "A" || row.status !== "ACTIVE"
        || String(row.user_status).toUpperCase() !== "ACTIVE" || row.tenant_status !== "ACTIVE") throw new Error("TARGET_ADMIN_INVALID");
      const already = ADMIN_MEMBERSHIP_PERMISSIONS.every((permission) => row.granted_permissions.includes(permission));
      if (Number(row.authorization_version) === command.expectedVersion + 1 && already && command.apply) {
        const audits = await tx.$queryRaw(Prisma.sql`
          SELECT "id" FROM "osi"."commercial_audit_logs"
          WHERE "tenant_id"=${row.tenant_id} AND "request_id"=${receipt.authorizationId}
            AND "action"='MEMBERSHIP_INITIAL_ADMIN_PERMISSIONS_GRANTED'
            AND "entity"='TENANT_MEMBERSHIP' AND "entity_id"=${row.id}
          LIMIT 1
        `);
        if (!audits[0]) throw new Error("IDEMPOTENT_AUDIT_NOT_FOUND");
        report = Object.freeze({ ok: true, batch: BATCH, mode: "APPLY", branchVerified: true,
          membershipVerified: true, expectedVersion: command.expectedVersion, manifestHash: manifest.manifestHash,
          wouldUpdate: false, updated: false, idempotent: true, sessionsRevoked: true, auditWritten: true });
        return;
      }
      if (Number(row.authorization_version) !== command.expectedVersion) throw new Error("AUTHORIZATION_VERSION_CONFLICT");
      const currentManifest = manifestFor(command, row);
      if (command.apply && currentManifest.manifestHash !== manifest.manifestHash) throw new Error("MANIFEST_STATE_CHANGED");
      report = Object.freeze({ ok: true, batch: BATCH, mode: command.apply ? "APPLY" : "DRY_RUN", branchVerified: true,
        membershipVerified: true, expectedVersion: command.expectedVersion, manifestHash: currentManifest.manifestHash,
        wouldUpdate: !already, updated: false, idempotent: already, sessionsRevoked: false, auditWritten: false });
      if (!command.apply) { manifest = currentManifest; throw DRY_RUN; }
      if (already) return;
      const updated = await tx.$executeRaw(Prisma.sql`
        UPDATE "osi"."tenant_memberships" SET "granted_permissions"=${currentManifest.after.grantedPermissions},
          "authorization_version"="authorization_version"+1, "updated_at"=CURRENT_TIMESTAMP
        WHERE "tenant_id"=${row.tenant_id} AND "id"=${row.id} AND "authorization_version"=${command.expectedVersion}
      `);
      if (updated !== 1) throw new Error("AUTHORIZATION_VERSION_CONFLICT");
      await tx.$executeRaw(Prisma.sql`
        UPDATE "osi"."auth_sessions" SET "status"='REVOKED', "revoked_at"=CURRENT_TIMESTAMP,
          "revocation_reason"='AUTHORIZATION_CHANGED', "updated_at"=CURRENT_TIMESTAMP
        WHERE "tenant_id"=${row.tenant_id} AND "membership_id"=${row.id} AND "status"='ACTIVE'
      `);
      await tx.$executeRaw(Prisma.sql`
        UPDATE "osi"."auth_refresh_tokens" rt SET "status"='REVOKED', "revoked_at"=CURRENT_TIMESTAMP
        FROM "osi"."auth_sessions" s WHERE rt."tenant_id"=s."tenant_id" AND rt."session_id"=s."id"
          AND s."tenant_id"=${row.tenant_id} AND s."membership_id"=${row.id} AND rt."status"='ACTIVE'
      `);
      await auditWriter(tx, { tenantId: row.tenant_id, actorKind: "MEMBERSHIP", actorMembershipId: row.id }, {
        action: "MEMBERSHIP_INITIAL_ADMIN_PERMISSIONS_GRANTED", entity: "TENANT_MEMBERSHIP", entityId: row.id,
        source: "V17_ADMIN_IDENTITY_BOOTSTRAP", requestId: receipt.authorizationId, correlationId: receipt.authorizationId, critical: true,
        beforeJson: currentManifest.before, afterJson: { ...currentManifest.after, authorizationVersion: command.expectedVersion + 1 },
        metadataJson: { batch: BATCH, manifestHash: manifest.manifestHash },
      });
      report = Object.freeze({ ...report, updated: true, idempotent: false, sessionsRevoked: true, auditWritten: true });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 3_000, timeout: 10_000 });
  } catch (error) { if (error !== DRY_RUN) throw error; }
  if (!command.apply) await writePrivateManifest(command.manifestFile, manifest);
  return report;
}

async function main() {
  const command = parseArgs(process.argv.slice(2));
  const prisma = new PrismaClient();
  try { process.stdout.write(`${JSON.stringify(await runInitialAdminPermissionsBootstrap({ prisma, command }))}\n`); }
  finally { await prisma.$disconnect(); }
}

if (resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  main().catch((error) => { process.stderr.write(`${JSON.stringify({ ok: false, error: String(error?.message || "BOOTSTRAP_FAILED") })}\n`); process.exitCode = 1; });
}
