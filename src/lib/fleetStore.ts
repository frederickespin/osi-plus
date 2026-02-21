import { mockMaintenanceRecords, mockVehicles } from "@/data/mockData";
import type { MaintenanceRecord, Vehicle } from "@/types/osi.types";

export type FleetVehicleRecord = Vehicle & {
  driverId?: string;
  backupDriverId?: string;
  backupDriverApprovalId?: string;
  updatedAt?: string;
};

export type FuelLogRecord = {
  id: string;
  vehicleId: string;
  liters: number;
  cost: number;
  date: string;
  station?: string;
  createdAt: string;
};

export type BackupDriverApprovalStatus = "PENDING" | "APPROVED" | "REJECTED";

export type BackupDriverApprovalRequest = {
  id: string;
  vehicleId: string;
  vehiclePlate: string;
  primaryDriverId: string;
  backupDriverId: string;
  status: BackupDriverApprovalStatus;
  requestedAt: string;
  requestedBy: string;
  reviewedAt?: string;
  reviewedBy?: string;
  note?: string;
};

const VEHICLES_KEY = "osi-plus.fleet.vehicles";
const MAINTENANCE_KEY = "osi-plus.fleet.maintenance";
const FUEL_KEY = "osi-plus.fleet.fuelLogs";
const APPROVALS_KEY = "osi-plus.fleet.backupDriverApprovals";

const nowIso = () => new Date().toISOString();
const uid = (prefix: string) =>
  crypto?.randomUUID
    ? `${prefix}_${crypto.randomUUID()}`
    : `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;

const safeParse = <T>(raw: string | null, fallback: T): T => {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

const seedVehicles = (): FleetVehicleRecord[] =>
  mockVehicles.map((vehicle) => ({
    ...vehicle,
    driverId: undefined,
    backupDriverId: undefined,
    backupDriverApprovalId: undefined,
    updatedAt: nowIso(),
  }));

const seedMaintenance = (): MaintenanceRecord[] =>
  mockMaintenanceRecords.map((record) => ({ ...record }));

const seedFuelLogs = (): FuelLogRecord[] => {
  const primary = mockVehicles[0];
  if (!primary) return [];
  return [
    {
      id: uid("fuel"),
      vehicleId: primary.id,
      liters: 45,
      cost: 315,
      date: "2026-01-22",
      station: "Estación Central",
      createdAt: nowIso(),
    },
    {
      id: uid("fuel"),
      vehicleId: primary.id,
      liters: 38,
      cost: 266,
      date: "2026-01-20",
      station: "Estación Norte",
      createdAt: nowIso(),
    },
  ];
};

const normalizeVehicle = (item: unknown): FleetVehicleRecord | null => {
  if (!item || typeof item !== "object") return null;
  const row = item as Record<string, unknown>;
  if (typeof row.id !== "string" || typeof row.plate !== "string") return null;
  return {
    id: row.id,
    code: String(row.code || row.id),
    plate: String(row.plate),
    type: String(row.type || "Camión"),
    brand: String(row.brand || ""),
    model: String(row.model || ""),
    year: Number(row.year || 0),
    capacity: Number(row.capacity || 0),
    status: (row.status as FleetVehicleRecord["status"]) || "available",
    mileage: Number(row.mileage || 0),
    lastMaintenance: row.lastMaintenance ? String(row.lastMaintenance) : undefined,
    nextMaintenance: row.nextMaintenance ? String(row.nextMaintenance) : undefined,
    assignedDriver: row.assignedDriver ? String(row.assignedDriver) : undefined,
    driverId: row.driverId ? String(row.driverId) : undefined,
    backupDriverId: row.backupDriverId ? String(row.backupDriverId) : undefined,
    backupDriverApprovalId: row.backupDriverApprovalId ? String(row.backupDriverApprovalId) : undefined,
    updatedAt: row.updatedAt ? String(row.updatedAt) : nowIso(),
  };
};

export const loadFleetVehicles = (): FleetVehicleRecord[] => {
  if (typeof window === "undefined") return seedVehicles();
  const parsed = safeParse<unknown>(window.localStorage.getItem(VEHICLES_KEY), []);
  if (!Array.isArray(parsed) || parsed.length === 0) {
    const seeded = seedVehicles();
    window.localStorage.setItem(VEHICLES_KEY, JSON.stringify(seeded));
    return seeded;
  }
  const normalized = parsed.map(normalizeVehicle).filter((v): v is FleetVehicleRecord => Boolean(v));
  if (normalized.length === 0) {
    const seeded = seedVehicles();
    window.localStorage.setItem(VEHICLES_KEY, JSON.stringify(seeded));
    return seeded;
  }
  if (normalized.length !== parsed.length) {
    window.localStorage.setItem(VEHICLES_KEY, JSON.stringify(normalized));
  }
  return normalized;
};

export const saveFleetVehicles = (list: FleetVehicleRecord[]) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(VEHICLES_KEY, JSON.stringify(list));
};

export const upsertFleetVehicle = (vehicle: FleetVehicleRecord) => {
  const list = loadFleetVehicles();
  const next = { ...vehicle, updatedAt: nowIso() };
  const merged = [next, ...list.filter((item) => item.id !== next.id)];
  saveFleetVehicles(merged);
  return next;
};

export const createFleetVehicle = (input: Omit<FleetVehicleRecord, "id" | "code" | "updatedAt">) => {
  const next: FleetVehicleRecord = {
    ...input,
    id: uid("veh"),
    code: `VH-${Math.floor(Math.random() * 9000 + 1000)}`,
    updatedAt: nowIso(),
  };
  return upsertFleetVehicle(next);
};

export const loadFleetMaintenanceRecords = (): MaintenanceRecord[] => {
  if (typeof window === "undefined") return seedMaintenance();
  const parsed = safeParse<MaintenanceRecord[]>(window.localStorage.getItem(MAINTENANCE_KEY), []);
  if (parsed.length === 0) {
    const seeded = seedMaintenance();
    window.localStorage.setItem(MAINTENANCE_KEY, JSON.stringify(seeded));
    return seeded;
  }
  return parsed;
};

export const loadFleetFuelLogs = (): FuelLogRecord[] => {
  if (typeof window === "undefined") return seedFuelLogs();
  const parsed = safeParse<FuelLogRecord[]>(window.localStorage.getItem(FUEL_KEY), []);
  if (parsed.length === 0) {
    const seeded = seedFuelLogs();
    window.localStorage.setItem(FUEL_KEY, JSON.stringify(seeded));
    return seeded;
  }
  return parsed;
};

export const saveFleetFuelLogs = (logs: FuelLogRecord[]) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(FUEL_KEY, JSON.stringify(logs));
};

export const createFuelLog = (input: Omit<FuelLogRecord, "id" | "createdAt">) => {
  const logs = loadFleetFuelLogs();
  const next: FuelLogRecord = {
    ...input,
    id: uid("fuel"),
    createdAt: nowIso(),
  };
  saveFleetFuelLogs([next, ...logs]);
  return next;
};

export const loadBackupDriverApprovals = (): BackupDriverApprovalRequest[] => {
  if (typeof window === "undefined") return [];
  return safeParse<BackupDriverApprovalRequest[]>(window.localStorage.getItem(APPROVALS_KEY), []);
};

export const saveBackupDriverApprovals = (list: BackupDriverApprovalRequest[]) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(APPROVALS_KEY, JSON.stringify(list));
};

export const createBackupDriverApprovalRequest = (
  input: Omit<BackupDriverApprovalRequest, "id" | "requestedAt" | "status">
) => {
  const list = loadBackupDriverApprovals();
  const duplicatedPending = list.find(
    (item) =>
      item.status === "PENDING" &&
      item.vehicleId === input.vehicleId &&
      item.primaryDriverId === input.primaryDriverId &&
      item.backupDriverId === input.backupDriverId
  );
  if (duplicatedPending) return duplicatedPending;

  const next: BackupDriverApprovalRequest = {
    ...input,
    id: uid("apr"),
    status: "PENDING",
    requestedAt: nowIso(),
  };
  saveBackupDriverApprovals([next, ...list]);
  return next;
};

export const updateBackupDriverApprovalRequest = (
  requestId: string,
  patch: Partial<BackupDriverApprovalRequest>
) => {
  const list = loadBackupDriverApprovals();
  const current = list.find((item) => item.id === requestId);
  if (!current) return null;
  const next = { ...current, ...patch };
  saveBackupDriverApprovals([next, ...list.filter((item) => item.id !== requestId)]);
  return next;
};

export const findApprovedBackupDriverRequest = (params: {
  vehicleId: string;
  primaryDriverId: string;
  backupDriverId: string;
}) => {
  return loadBackupDriverApprovals().find(
    (item) =>
      item.status === "APPROVED" &&
      item.vehicleId === params.vehicleId &&
      item.primaryDriverId === params.primaryDriverId &&
      item.backupDriverId === params.backupDriverId
  );
};
