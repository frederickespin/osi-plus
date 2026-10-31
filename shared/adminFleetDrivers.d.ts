export const ADMIN_FLEET_DRIVERS_BATCH: "V17-FLEET-DRIVER-AUTHORITY-19F";
export const ADMIN_FLEET_DRIVERS_MODES: Readonly<{ DISABLED: "DISABLED"; LOCAL_ONLY: "LOCAL_ONLY"; PREVIEW_REHEARSAL: "PREVIEW_REHEARSAL" }>;
export const FLEET_DRIVER_PERMISSIONS: Readonly<{ ASSIGN: "fleet:drivers:assign"; REQUEST: "fleet:drivers:request"; AUTHORIZE: "fleet:drivers:authorize" }>;
export const FLEET_DRIVER_HISTORY_KINDS: readonly ["PRIMARY", "TEMPORARY"];
export const FLEET_DRIVER_DECISIONS: readonly ["APPROVE", "REJECT", "REVOKE"];
export const FLEET_DRIVER_TIME_ZONE: "America/Santo_Domingo";
export const FLEET_DRIVERS_MIGRATION: "20261031010000_v17_fleet_driver_authority";
export const FLEET_DRIVERS_MIGRATION_CHECKSUM: string;
