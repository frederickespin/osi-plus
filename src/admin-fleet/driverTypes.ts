import type { FleetStatus } from "./types";

export type FleetDriverPerson = Readonly<{ membershipRef: string; displayName: string }>;
export type FleetDriverHistoryKind = "PRIMARY" | "TEMPORARY";
export type FleetDriverDecision = "APPROVE" | "REJECT" | "REVOKE";
export type FleetDriverPrimaryEvent = Readonly<{
  kind: "PRIMARY";
  assignmentRef: string;
  revision: number;
  driver: FleetDriverPerson | null;
  driverEligible: boolean;
  assignedBy: FleetDriverPerson;
  assignedAt: string;
  reason: string;
}>;
export type FleetDriverAuthorization = Readonly<{
  kind: "TEMPORARY";
  authorizationRef: string;
  driver: FleetDriverPerson;
  driverEligible: boolean;
  startsAt: string;
  endsAt: string;
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED" | "EXPIRED";
  effectiveStatus: "PENDING" | "SCHEDULED" | "ACTIVE" | "EXPIRED" | "REJECTED" | "CANCELLED" | "REVOKED" | "UNAVAILABLE";
  requestedBy: FleetDriverPerson;
  requestedAt: string;
  decidedBy: FleetDriverPerson | null;
  decidedAt: string | null;
  decisionReason: string | null;
  revokedBy: FleetDriverPerson | null;
  revokedAt: string | null;
  revocationReason: string | null;
  version: number;
  canApprove: boolean;
  canReject: boolean;
  canRevoke: boolean;
}>;
export type FleetDriverHistoryEntry = FleetDriverPrimaryEvent | FleetDriverAuthorization;
export type FleetDriverPageFilters = Readonly<{ page: number; pageSize: number }>;
export type FleetDriverOptions = FleetDriverPageFilters & Readonly<{ data: readonly FleetDriverPerson[]; total: number }>;
export type FleetDriverWorkspace = FleetDriverPageFilters & Readonly<{
  vehicle: Readonly<{ vehicleRef: string; businessCode: string; plate: string | null; operationalStatus: FleetStatus }>;
  primaryDriver: FleetDriverPrimaryEvent | null;
  primaryVersion: number;
  generatedAt: string;
  historyKind: FleetDriverHistoryKind;
  data: readonly FleetDriverHistoryEntry[];
  total: number;
  permissions: Readonly<{ assign: boolean; request: boolean; authorize: boolean }>;
}>;
export type FleetDriverReceipt = Readonly<{ vehicleRef: string; reference: string; version: number; idempotent: boolean }>;
export type FleetDriverPrimaryInput = Readonly<{ requestId: string; expectedVersion: number; driverMembershipRef: string | null; reason: string }>;
export type FleetDriverRequestInput = Readonly<{ requestId: string; driverMembershipRef: string; startsAt: string; endsAt: string; reason: string }>;
export type FleetDriverDecisionInput = Readonly<{ requestId: string; expectedVersion: number; action: FleetDriverDecision; reason?: string }>;

export const FLEET_DRIVER_STATUS_LABELS: Readonly<Record<FleetDriverAuthorization["effectiveStatus"], string>> = {
  PENDING: "Pendiente", SCHEDULED: "Programada", ACTIVE: "Vigente", EXPIRED: "Vencida",
  REJECTED: "Rechazada", CANCELLED: "Cancelada", REVOKED: "Revocada", UNAVAILABLE: "No habilitada",
};

export function canDecideFleetDriver(row: FleetDriverAuthorization, action: FleetDriverDecision) {
  if (action === "APPROVE") return row.canApprove && row.driverEligible && row.status === "PENDING" && row.effectiveStatus === "PENDING";
  if (action === "REJECT") return row.canReject && row.status === "PENDING" && ["PENDING", "UNAVAILABLE"].includes(row.effectiveStatus);
  return row.canRevoke && row.status === "APPROVED" && row.revokedAt === null;
}
