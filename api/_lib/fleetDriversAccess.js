import { Prisma } from "@prisma/client";
import { assertAdminFleetDatabase, requireAdminFleetAccess, requireAdminFleetContext } from "./adminFleetAccess.js";
import { ADMIN_FLEET_DRIVERS_BATCH, FLEET_DRIVERS_MIGRATION, FLEET_DRIVERS_MIGRATION_CHECKSUM } from "../../shared/adminFleetDrivers.js";
import { fleetDriverFail } from "./fleetDriversContract.js";

export function requireFleetDriversAccess(req, env = process.env) {
  const requested = env.ADMIN_FLEET_DRIVERS_MODE ?? "DISABLED";
  if (requested === "DISABLED") fleetDriverFail("DISABLED", 409);
  const mode = requireAdminFleetAccess(req, env);
  if (requested !== mode || !["LOCAL_ONLY", "PREVIEW_REHEARSAL"].includes(mode)) fleetDriverFail("CONFIGURATION_INVALID", 503);
  if (mode === "PREVIEW_REHEARSAL" && (env.ADMIN_FLEET_DRIVERS_BATCH !== ADMIN_FLEET_DRIVERS_BATCH
    || env.VERCEL_GIT_COMMIT_REF !== "feature/v17-consolidated-preview")) fleetDriverFail("CONFIGURATION_INVALID", 503);
  return mode;
}
export function requireFleetDriversContext(env, mode, context) { requireAdminFleetContext(env, mode, context); }
export async function assertFleetDriversDatabase(prisma, mode, env = process.env) {
  await assertAdminFleetDatabase(prisma, mode, env);
  const rows = await prisma.$queryRaw(Prisma.sql`
    SELECT to_regclass('osi.fleet_driver_primary_events') IS NOT NULL AS "primary_exists",
      to_regclass('osi.fleet_driver_authorizations') IS NOT NULL AS "authorizations_exists",
      to_regclass('osi.approval_requests') IS NOT NULL AS "approvals_exists",
      to_regclass('osi.tenant_user_identities') IS NOT NULL AS "identities_exists",
      to_regclass('osi._prisma_migrations') IS NOT NULL AS "history_exists"
  `);
  if (rows.length !== 1 || Object.values(rows[0]).some((value) => value !== true)) fleetDriverFail("SCHEMA_UNAVAILABLE", 503);
  const history = await prisma.$queryRaw(Prisma.sql`
    SELECT "checksum", "finished_at", "rolled_back_at", "applied_steps_count"
    FROM "osi"."_prisma_migrations" WHERE "migration_name"=${FLEET_DRIVERS_MIGRATION}
  `);
  if (!/^[a-f0-9]{64}$/u.test(FLEET_DRIVERS_MIGRATION_CHECKSUM) || history.length !== 1
    || history[0].checksum !== FLEET_DRIVERS_MIGRATION_CHECKSUM || !history[0].finished_at
    || history[0].rolled_back_at !== null || Number(history[0].applied_steps_count) !== 1) fleetDriverFail("SCHEMA_UNAVAILABLE", 503);
}
