import { PrismaClient } from "@prisma/client";

const ASCII_EMAIL = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,63}$/;

export function classifyEmail(value) {
  const raw = typeof value === "string" ? value : "";
  const trimmed = raw.trim();
  if (!trimmed) return { classification: "EMPTY", normalizedEmail: null };
  if (/[^\x20-\x7e]/.test(trimmed)) return { classification: "UNICODE_OR_IDNA", normalizedEmail: null };
  const normalizedEmail = trimmed.toLowerCase();
  if (normalizedEmail.length > 320 || !ASCII_EMAIL.test(normalizedEmail)) {
    return { classification: "INVALID_FORMAT", normalizedEmail: null };
  }
  return { classification: "CANDIDATE", normalizedEmail };
}

function groupIds(rows, keyOf) {
  const groups = new Map();
  for (const row of rows) {
    const key = keyOf(row);
    if (key == null) continue;
    const values = groups.get(key) || [];
    values.push(row.id);
    groups.set(key, values);
  }
  return new Map([...groups].filter(([, ids]) => ids.length > 1));
}

export function buildEmailNormalizationReport(users) {
  const records = users.map((user) => ({
    id: user.id,
    rawEmail: user.email,
    storedNormalizedEmail: user.normalizedEmail,
    ...classifyEmail(user.email),
  }));
  const exactDuplicates = groupIds(records, (row) => row.rawEmail || null);
  const normalizedDuplicates = groupIds(records, (row) => row.normalizedEmail);
  const storedOwners = new Map();
  for (const row of records) {
    if (!row.storedNormalizedEmail) continue;
    const owners = storedOwners.get(row.storedNormalizedEmail) || [];
    owners.push(row.id);
    storedOwners.set(row.storedNormalizedEmail, owners);
  }

  for (const row of records) {
    if (row.classification !== "CANDIDATE") continue;
    if (exactDuplicates.has(row.rawEmail)) row.classification = "DUPLICATE_EXACT";
    else if (normalizedDuplicates.has(row.normalizedEmail)) row.classification = "DUPLICATE_NORMALIZED";
    const conflictingStoredOwners = (storedOwners.get(row.normalizedEmail) || []).filter((id) => id !== row.id);
    if (conflictingStoredOwners.length > 0) row.classification = "DUPLICATE_NORMALIZED";
  }

  const counts = Object.fromEntries(
    ["CANDIDATE", "INVALID_FORMAT", "UNICODE_OR_IDNA", "DUPLICATE_EXACT", "DUPLICATE_NORMALIZED", "EMPTY"]
      .map((classification) => [classification.toLowerCase(), records.filter((row) => row.classification === classification).length]),
  );
  const blockers = records.filter((row) => row.classification !== "CANDIDATE");
  return {
    ok: blockers.length === 0,
    readOnly: true,
    users: records.length,
    counts,
    collisionsBlockBackfill: blockers.some((row) => row.classification.startsWith("DUPLICATE_")),
    blockers: blockers.map(({ id, classification }) => ({ id, classification })),
  };
}

export async function dryRunNormalizedEmails(prisma) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
    const users = await tx.user.findMany({
      select: { id: true, email: true, normalizedEmail: true },
      orderBy: { id: "asc" },
    });
    return buildEmailNormalizationReport(users);
  });
}

export function createMt01c1b1Prisma() {
  const url = process.env.MT01C1B1_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) throw new Error("MT01C1B1_DATABASE_URL o DATABASE_URL es obligatoria");
  return new PrismaClient({ datasources: { db: { url } } });
}
