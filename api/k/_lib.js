import { SignalKind, SignalPolicy, PgdItemStatus } from "@prisma/client";

export function parseServiceDateFromProject(project) {
  const raw = String(project?.startDate || "").trim();
  const d = new Date(raw);
  if (!Number.isNaN(d.getTime())) return d;
  // Fallback: 7 days from now to avoid "Invalid Date" breaking signals.
  const now = new Date();
  return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
}

function addDays(date, days) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

export function defaultSignalsForServiceDate(serviceDate) {
  // MVP defaults. We can make these per-service-type later.
  return [
    {
      kind: SignalKind.PAYMENT,
      policy: SignalPolicy.HARD_BLOCK,
      warnAt: addDays(serviceDate, -7),
      dueAt: addDays(serviceDate, -2),
    },
    {
      kind: SignalKind.PERMITS_PARKING,
      policy: SignalPolicy.SOFT_ALERT,
      warnAt: addDays(serviceDate, -2),
      dueAt: addDays(serviceDate, 0),
    },
    {
      kind: SignalKind.CRATES,
      policy: SignalPolicy.HARD_BLOCK,
      warnAt: addDays(serviceDate, -10),
      dueAt: addDays(serviceDate, -2),
    },
    {
      kind: SignalKind.THIRD_PARTIES,
      policy: SignalPolicy.SOFT_ALERT,
      warnAt: addDays(serviceDate, -5),
      dueAt: addDays(serviceDate, -1),
    },
  ];
}

export async function ensureDefaultSignals(prisma, projectId, startDate) {
  const serviceDate = parseServiceDateFromProject({ startDate });
  const defaults = defaultSignalsForServiceDate(serviceDate);

  const existing = await prisma.projectSignal.findMany({
    where: { projectId },
    select: { kind: true, id: true },
  });
  const have = new Set(existing.map((s) => s.kind));

  const missing = defaults.filter((s) => !have.has(s.kind));
  if (missing.length === 0) return;

  await prisma.projectSignal.createMany({
    data: missing.map((s) => ({
      projectId,
      kind: s.kind,
      policy: s.policy,
      warnAt: s.warnAt,
      dueAt: s.dueAt,
    })),
    skipDuplicates: true,
  });
}

export function computeSignalColor(signal, now = new Date()) {
  if (!signal) return "AMBER";
  if (signal.doneAt) return "GREEN";
  if (signal.dueAt && now >= new Date(signal.dueAt)) return "RED";
  if (signal.warnAt && now >= new Date(signal.warnAt)) return "AMBER";
  return "GREEN";
}

export function computePgdBlockingColor(pgd) {
  if (!pgd) return "AMBER";
  const items = pgd.items || [];
  const blockers = items.filter((i) => i.isBlocking);
  if (blockers.length === 0) return "GREEN";
  const missing = blockers.filter((i) => i.status !== PgdItemStatus.VALIDATED);
  return missing.length > 0 ? "RED" : "GREEN";
}

export function pgdBlockingSummary(pgd) {
  if (!pgd) {
    return { applied: false, blockingTotal: 0, blockingValidated: 0, blockingMissing: 0 };
  }
  const blockers = (pgd.items || []).filter((i) => i.isBlocking);
  const blockingValidated = blockers.filter((i) => i.status === PgdItemStatus.VALIDATED).length;
  const blockingMissing = blockers.length - blockingValidated;
  return {
    applied: true,
    blockingTotal: blockers.length,
    blockingValidated,
    blockingMissing,
  };
}

