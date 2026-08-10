import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";

export const MT01C1A_BATCH_ID = "MT-01C1A-IPACKERS-DO-V1";
export const MT01C1A_TENANT_CODE = "IPACKERS-DO";

const EMPLOYMENT_STATUS = Object.freeze({
  ACTIVE: "ACTIVE",
  ACTIVO: "ACTIVE",
  ON_LEAVE: "ON_LEAVE",
  LICENCIA: "ON_LEAVE",
  SUSPENDED: "SUSPENDED",
  SUSPENDIDO: "SUSPENDED",
  TERMINATED: "TERMINATED",
  TERMINADO: "TERMINATED",
});

const AVAILABILITY_STATUS = Object.freeze({
  AVAILABLE: "AVAILABLE",
  DISPONIBLE: "AVAILABLE",
  LIMITED: "LIMITED",
  LIMITADA: "LIMITED",
  UNAVAILABLE: "UNAVAILABLE",
  NO_DISPONIBLE: "UNAVAILABLE",
});

const CONTRACT_TYPE = Object.freeze({
  PLANTA: "PERMANENT",
  PERMANENT: "PERMANENT",
  PERSONAL_MOVIL: "MOBILE_STAFF",
  MOBILE_STAFF: "MOBILE_STAFF",
  FIXED_TERM: "FIXED_TERM",
  PLAZO_FIJO: "FIXED_TERM",
  CONTRACTOR: "CONTRACTOR",
  CONTRATISTA: "CONTRACTOR",
});

// Only values found in committed seed/application fixtures are recognized.
// Any other non-empty value blocks the backfill for explicit review.
const DEPARTMENT_CODE = Object.freeze({
  ADMINISTRACION: "ADM",
  ADMINISTRATION: "ADM",
  COMERCIAL: "COM",
  OPERACIONES: "OPS",
  OPERATIONS: "OPS",
  LOGISTICA: "LOG",
  LOGISTICS: "LOG",
  RRHH: "HR",
  RECURSOS_HUMANOS: "HR",
  QA: "QA",
});

function parseEnv(contents) {
  const result = {};
  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    result[match[1]] = match[2].trim().replace(/^(?:"(.*)"|'(.*)')$/, "$1$2");
  }
  return result;
}

export function loadMt01c1aEnvironment() {
  const envPath = path.resolve(process.cwd(), ".env.mt01c1a.local");
  if (fs.existsSync(envPath)) {
    const local = parseEnv(fs.readFileSync(envPath, "utf8"));
    for (const [key, value] of Object.entries(local)) process.env[key] = value;
  }

  const rawUrl = process.env.MT01C1A_DATABASE_URL || process.env.DATABASE_URL || "";
  const url = new URL(rawUrl);
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!new Set(["127.0.0.1", "localhost", "::1"]).has(url.hostname)) {
    throw new Error("MT-01C1A sólo permite PostgreSQL local");
  }
  if (!new Set(["5432", "55432"]).has(url.port)) {
    throw new Error("MT-01C1A rechazó un puerto PostgreSQL no local autorizado");
  }
  if (!database.startsWith("osi_mt01c1a_") && !database.startsWith("osi_db01n_") && database !== "osi_mt01c1b3a_q1_20260809") {
    throw new Error("MT-01C1A requiere una base local aislada MT-01C1A o DB-01N");
  }
  if (process.env.VERCEL_ENV !== "development") {
    throw new Error("MT-01C1A requiere VERCEL_ENV=development");
  }
  process.env.DATABASE_URL = rawUrl;
  process.env.DIRECT_URL = process.env.MT01C1A_DIRECT_URL || process.env.DIRECT_URL || rawUrl;
  return { database, envPath, url };
}

export function createMt01c1aPrisma() {
  loadMt01c1aEnvironment();
  return new PrismaClient();
}

function normalizedLookup(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
}

export function normalizeEmployeeCode(value) {
  return String(value || "").trim().replace(/\s+/g, "").toUpperCase();
}

export function canonicalEmployeeCode(value) {
  return String(value || "").trim().toUpperCase();
}

function mappedValue(map, value, field, issues, { required = false } = {}) {
  if (value === null || value === undefined || String(value).trim() === "") {
    if (required) issues.push({ kind: "INCOMPLETE", field, reason: "MISSING" });
    return null;
  }
  const mapped = map[normalizedLookup(value)];
  if (!mapped) issues.push({ kind: "AMBIGUOUS", field, reason: "UNKNOWN_VALUE" });
  return mapped || null;
}

function dateOnly(value, field, issues) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const raw = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    issues.push({ kind: "AMBIGUOUS", field, reason: "INVALID_DATE_FORMAT" });
    return null;
  }
  const parsed = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== raw) {
    issues.push({ kind: "AMBIGUOUS", field, reason: "INVALID_DATE" });
    return null;
  }
  return parsed;
}

function plainLegacyProfile(value, issues) {
  if (value === null || value === undefined) {
    issues.push({ kind: "INCOMPLETE", field: "employeeProfile", reason: "MISSING" });
    return null;
  }
  if (Array.isArray(value) || typeof value !== "object") {
    issues.push({ kind: "AMBIGUOUS", field: "employeeProfile", reason: "NOT_OBJECT" });
    return null;
  }
  return value;
}

function sameDate(a, b) {
  if (!a || !b) return !a && !b;
  return new Date(a).toISOString().slice(0, 10) === new Date(b).toISOString().slice(0, 10);
}

function isSameProfile(existing, data) {
  return existing.employeeCode === data.employeeCode
    && existing.normalizedEmployeeCode === data.normalizedEmployeeCode
    && existing.jobTitle === data.jobTitle
    && existing.departmentCode === data.departmentCode
    && existing.employmentStatus === data.employmentStatus
    && existing.contractType === data.contractType
    && existing.availabilityStatus === data.availabilityStatus
    && existing.supervisorMembershipId === data.supervisorMembershipId
    && existing.supervisorUserId === data.supervisorUserId
    && sameDate(existing.hiredAt, data.hiredAt)
    && sameDate(existing.contractStartsAt, data.contractStartsAt)
    && sameDate(existing.contractEndsAt, data.contractEndsAt)
    && sameDate(existing.terminatedAt, data.terminatedAt);
}

function observedValues(memberships, selector) {
  const counts = new Map();
  for (const membership of memberships) {
    const selected = selector(membership);
    const value = selected === null || selected === undefined || String(selected).trim() === ""
      ? "<MISSING>"
      : typeof selected === "string" || typeof selected === "number" || typeof selected === "boolean"
        ? String(selected).trim().slice(0, 80)
        : "<NON_SCALAR>";
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => a.value.localeCompare(b.value));
}

export function mapLegacyEmployeeProfile(membership) {
  const issues = [];
  const legacy = plainLegacyProfile(membership.user.employeeProfile, issues);
  const employeeCode = canonicalEmployeeCode(membership.user.code);
  const normalizedEmployeeCode = normalizeEmployeeCode(employeeCode);
  if (!employeeCode || !normalizedEmployeeCode) {
    issues.push({ kind: "INCOMPLETE", field: "employeeCode", reason: "MISSING" });
  }

  const employmentStatus = mappedValue(
    EMPLOYMENT_STATUS,
    legacy?.employmentStatus,
    "employmentStatus",
    issues,
    { required: true },
  );
  const availabilityStatus = mappedValue(
    AVAILABILITY_STATUS,
    legacy?.availabilityStatus,
    "availabilityStatus",
    issues,
    { required: true },
  );
  const contractType = mappedValue(CONTRACT_TYPE, legacy?.contractType, "contractType", issues);
  const departmentSource = legacy?.departmentCode ?? membership.user.department;
  const departmentCode = mappedValue(DEPARTMENT_CODE, departmentSource, "departmentCode", issues);

  const supervisorMembershipId = legacy?.supervisorMembershipId
    ? String(legacy.supervisorMembershipId).trim()
    : null;
  const supervisorUserId = legacy?.supervisorUserId ? String(legacy.supervisorUserId).trim() : null;
  if (Boolean(supervisorMembershipId) !== Boolean(supervisorUserId)) {
    issues.push({ kind: "AMBIGUOUS", field: "supervisor", reason: "INCOMPLETE_PAIR" });
  }
  if (supervisorMembershipId === membership.id) {
    issues.push({ kind: "CONFLICT", field: "supervisor", reason: "SELF_SUPERVISION" });
  }

  const hiredAt = dateOnly(legacy?.hiredAt ?? membership.user.joinDate, "hiredAt", issues);
  const contractStartsAt = dateOnly(legacy?.contractStartsAt, "contractStartsAt", issues);
  const contractEndsAt = dateOnly(legacy?.contractEndsAt ?? legacy?.contractEndDate, "contractEndsAt", issues);
  const terminatedAt = dateOnly(legacy?.terminatedAt, "terminatedAt", issues);

  if (employmentStatus === "TERMINATED" && !terminatedAt) {
    issues.push({ kind: "INCOMPLETE", field: "terminatedAt", reason: "REQUIRED_FOR_TERMINATED" });
  }
  if (employmentStatus && employmentStatus !== "TERMINATED" && terminatedAt) {
    issues.push({ kind: "CONFLICT", field: "terminatedAt", reason: "STATUS_NOT_TERMINATED" });
  }
  if (contractStartsAt && contractEndsAt && contractStartsAt > contractEndsAt) {
    issues.push({ kind: "CONFLICT", field: "contractDates", reason: "START_AFTER_END" });
  }
  if (hiredAt && terminatedAt && hiredAt > terminatedAt) {
    issues.push({ kind: "CONFLICT", field: "terminatedAt", reason: "BEFORE_HIRE" });
  }

  return {
    issues,
    data: {
      tenantId: membership.tenantId,
      membershipId: membership.id,
      userId: membership.userId,
      employeeCode,
      normalizedEmployeeCode,
      jobTitle: legacy?.jobTitle ? String(legacy.jobTitle).trim() || null : null,
      departmentCode,
      employmentStatus,
      contractType,
      availabilityStatus,
      supervisorMembershipId,
      supervisorUserId,
      hiredAt,
      contractStartsAt,
      contractEndsAt,
      terminatedAt,
      provisioningSource: "BACKFILL",
      provisioningBatchId: MT01C1A_BATCH_ID,
    },
  };
}

async function buildDryRun(db, tenantCode = MT01C1A_TENANT_CODE) {
  const tenant = await db.tenant.findUnique({ where: { code: tenantCode } });
  if (!tenant) throw new Error(`MT-01C1A no encontró el tenant ${tenantCode}`);

  const memberships = await db.tenantMembership.findMany({
    where: { tenantId: tenant.id },
    include: { user: true, employeeProfile: true },
    orderBy: { id: "asc" },
  });
  const observedLegacyValues = {
    employmentStatus: observedValues(memberships, (row) => row.user.employeeProfile?.employmentStatus),
    availabilityStatus: observedValues(memberships, (row) => row.user.employeeProfile?.availabilityStatus),
    contractType: observedValues(memberships, (row) => row.user.employeeProfile?.contractType),
    department: observedValues(memberships, (row) => row.user.employeeProfile?.departmentCode ?? row.user.department),
  };
  const membershipKeys = new Set(memberships.map((row) => `${row.id}:${row.userId}`));
  const existingCodes = new Map();
  for (const membership of memberships) {
    if (!membership.employeeProfile) continue;
    const key = membership.employeeProfile.normalizedEmployeeCode;
    existingCodes.set(key, membership.id);
  }

  const records = memberships.map((membership) => {
    if (membership.employeeProfile) {
      const protectedExisting = membership.employeeProfile.provisioningSource !== "BACKFILL"
        || membership.employeeProfile.provisioningBatchId !== MT01C1A_BATCH_ID;
      if (protectedExisting) {
        return {
          membershipId: membership.id,
          classification: "PROTECTED_EXISTING",
          issues: [],
          data: null,
        };
      }
      const mapped = mapLegacyEmployeeProfile(membership);
      const consistent = mapped.issues.length === 0 && isSameProfile(membership.employeeProfile, mapped.data);
      return {
        membershipId: membership.id,
        classification: consistent ? "EXISTING" : "CONFLICTING_EXISTING",
        issues: consistent ? [] : [{ kind: "CONFLICT", field: "employeeProfile", reason: "EXISTING_DIFFERS" }],
        data: mapped.data,
      };
    }

    const mapped = mapLegacyEmployeeProfile(membership);
    if (mapped.data.supervisorMembershipId) {
      const supervisorKey = `${mapped.data.supervisorMembershipId}:${mapped.data.supervisorUserId}`;
      if (!membershipKeys.has(supervisorKey)) {
        mapped.issues.push({ kind: "CONFLICT", field: "supervisor", reason: "CROSS_TENANT_OR_MISSING" });
      }
    }
    const occupiedBy = existingCodes.get(mapped.data.normalizedEmployeeCode);
    if (occupiedBy && occupiedBy !== membership.id) {
      mapped.issues.push({ kind: "CONFLICT", field: "employeeCode", reason: "DUPLICATE_IN_TENANT" });
    }
    return {
      membershipId: membership.id,
      classification: mapped.issues.length === 0 ? "CONVERTIBLE" : mapped.issues.some((x) => x.kind === "CONFLICT")
        ? "CONFLICTING"
        : mapped.issues.some((x) => x.kind === "AMBIGUOUS") ? "AMBIGUOUS" : "INCOMPLETE",
      issues: mapped.issues,
      data: mapped.data,
    };
  });

  const candidatesByCode = new Map();
  for (const record of records.filter((row) => row.classification === "CONVERTIBLE")) {
    const code = record.data.normalizedEmployeeCode;
    const group = candidatesByCode.get(code) || [];
    group.push(record);
    candidatesByCode.set(code, group);
  }
  for (const group of candidatesByCode.values()) {
    if (group.length < 2) continue;
    for (const record of group) {
      record.classification = "CONFLICTING";
      record.issues.push({ kind: "CONFLICT", field: "employeeCode", reason: "DUPLICATE_IN_BATCH" });
    }
  }

  const counts = Object.fromEntries(
    ["CONVERTIBLE", "EXISTING", "PROTECTED_EXISTING", "INCOMPLETE", "AMBIGUOUS", "CONFLICTING", "CONFLICTING_EXISTING"]
      .map((key) => [key.toLowerCase(), records.filter((row) => row.classification === key).length]),
  );
  return { tenantId: tenant.id, tenantCode, memberships: memberships.length, counts, observedLegacyValues, records };
}

export async function dryRunEmployeeProfiles(prisma, tenantCode = MT01C1A_TENANT_CODE) {
  return buildDryRun(prisma, tenantCode);
}

export async function applyEmployeeProfileBackfill(prisma, tenantCode = MT01C1A_TENANT_CODE) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`MT-01C1A:${tenantCode}`}))`);
    const report = await buildDryRun(tx, tenantCode);
    const blockers = report.records.filter((row) => !new Set(["CONVERTIBLE", "EXISTING", "PROTECTED_EXISTING"]).has(row.classification));
    if (blockers.length > 0) {
      const error = new Error(`MT-01C1A_BACKFILL_BLOCKED: ${blockers.length} perfiles requieren revisión`);
      error.code = "MT01C1A_BACKFILL_BLOCKED";
      error.summary = report.counts;
      throw error;
    }

    let created = 0;
    for (const record of report.records.filter((row) => row.classification === "CONVERTIBLE")) {
      const createdAt = new Date();
      await tx.employeeProfile.create({ data: { id: randomUUID(), ...record.data, createdAt, updatedAt: createdAt } });
      created += 1;
    }
    return {
      batchId: MT01C1A_BATCH_ID,
      tenantId: report.tenantId,
      memberships: report.memberships,
      created,
      existing: report.counts.existing,
      protectedExisting: report.counts.protected_existing,
      finalCount: await tx.employeeProfile.count({ where: { tenantId: report.tenantId } }),
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
}

export async function rollbackEmployeeProfileBackfill(prisma, tenantCode = MT01C1A_TENANT_CODE) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`MT-01C1A:${tenantCode}`}))`);
    const tenant = await tx.tenant.findUnique({ where: { code: tenantCode } });
    if (!tenant) throw new Error(`MT-01C1A no encontró el tenant ${tenantCode}`);
    const rows = await tx.employeeProfile.findMany({
      where: { tenantId: tenant.id, provisioningSource: "BACKFILL", provisioningBatchId: MT01C1A_BATCH_ID },
      select: { id: true, createdAt: true, updatedAt: true },
    });
    const unchanged = rows.filter((row) => row.createdAt.getTime() === row.updatedAt.getTime());
    const modified = rows.filter((row) => row.createdAt.getTime() !== row.updatedAt.getTime());
    if (unchanged.length > 0) {
      await tx.employeeProfile.deleteMany({ where: { id: { in: unchanged.map((row) => row.id) } } });
    }
    return { batchId: MT01C1A_BATCH_ID, deleted: unchanged.length, preservedModified: modified.length };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
}

export function publicDryRunReport(report) {
  return {
    ok: true,
    batchId: MT01C1A_BATCH_ID,
    tenantCode: report.tenantCode,
    memberships: report.memberships,
    observedLegacyValues: report.observedLegacyValues,
    ...report.counts,
    issueSummary: report.records.flatMap((row) => row.issues).reduce((summary, issue) => {
      const key = `${issue.kind}:${issue.field}:${issue.reason}`;
      summary[key] = (summary[key] || 0) + 1;
      return summary;
    }, {}),
  };
}
