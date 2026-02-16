import { loadSession } from "@/lib/sessionStore";
import type { UserRole } from "@/types/osi.types";

export type AddendumStatus = "PENDING_APPROVAL" | "APPROVED" | "REJECTED";

export type AddendumEvidence = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  dataUrl: string;
  uploadedAt: string;
};

export type CommercialAddendum = {
  id: string;
  projectId: string;
  projectNumber: string;
  customerName: string;
  detail: string;
  amount: number;
  currency: "RD$";
  status: AddendumStatus;
  requestedByName: string;
  requestedByRole: UserRole;
  requestedAt: string;
  approvedByName?: string;
  approvedByRole?: UserRole;
  approvedAt?: string;
  approvalComment?: string;
  evidence: AddendumEvidence[];
  createdAt: string;
  updatedAt: string;
};

const KEY = "osi-plus.commercial.addenda";

const nowIso = () => new Date().toISOString();
const uid = () =>
  crypto?.randomUUID ? crypto.randomUUID() : `adn_${Date.now()}_${Math.random().toString(16).slice(2)}`;

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function loadCommercialAddenda(): CommercialAddendum[] {
  const parsed = safeParse<CommercialAddendum[]>(localStorage.getItem(KEY), []);
  return Array.isArray(parsed) ? parsed : [];
}

export function saveCommercialAddenda(list: CommercialAddendum[]) {
  localStorage.setItem(KEY, JSON.stringify(list));
}

export function listAddendaByProject(projectId: string, projectNumber: string) {
  return loadCommercialAddenda()
    .filter((item) => item.projectId === projectId || item.projectNumber === projectNumber)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function createCommercialAddendum(input: {
  projectId: string;
  projectNumber: string;
  customerName: string;
  detail: string;
  amount: number;
  status: AddendumStatus;
  approvedByName?: string;
  approvedAt?: string;
  approvalComment?: string;
  evidence: AddendumEvidence[];
}) {
  const session = loadSession();
  const requestedByName = session.name?.trim() || `Rol ${session.role}`;
  const requestedByRole = session.role;

  const list = loadCommercialAddenda();
  const createdAt = nowIso();

  const next: CommercialAddendum = {
    id: uid(),
    projectId: input.projectId,
    projectNumber: input.projectNumber,
    customerName: input.customerName,
    detail: input.detail.trim(),
    amount: Number(input.amount || 0),
    currency: "RD$",
    status: input.status,
    requestedByName,
    requestedByRole,
    requestedAt: createdAt,
    approvedByName: input.status === "APPROVED" ? input.approvedByName?.trim() : undefined,
    approvedByRole: input.status === "APPROVED" ? session.role : undefined,
    approvedAt: input.status === "APPROVED" ? input.approvedAt || createdAt : undefined,
    approvalComment: input.approvalComment?.trim() || undefined,
    evidence: input.evidence,
    createdAt,
    updatedAt: createdAt,
  };

  saveCommercialAddenda([next, ...list]);
  return next;
}

export function updateAddendumStatus(
  id: string,
  patch: {
    status: AddendumStatus;
    approvedByName?: string;
    approvedAt?: string;
    approvalComment?: string;
    appendEvidence?: AddendumEvidence[];
  }
) {
  const session = loadSession();
  const list = loadCommercialAddenda();
  const current = list.find((item) => item.id === id);
  if (!current) return null;

  const next: CommercialAddendum = {
    ...current,
    status: patch.status,
    approvedByName:
      patch.status === "APPROVED"
        ? (patch.approvedByName?.trim() || session.name?.trim() || `Rol ${session.role}`)
        : current.approvedByName,
    approvedByRole: patch.status === "APPROVED" ? session.role : current.approvedByRole,
    approvedAt: patch.status === "APPROVED" ? patch.approvedAt || nowIso() : current.approvedAt,
    approvalComment: patch.approvalComment?.trim() || current.approvalComment,
    evidence: [...current.evidence, ...(patch.appendEvidence || [])],
    updatedAt: nowIso(),
  };

  saveCommercialAddenda([next, ...list.filter((item) => item.id !== id)]);
  return next;
}
