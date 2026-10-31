import assert from "node:assert/strict";
import { fleetDriversTransaction, __fleetDriversInternals } from "../api/_lib/fleetDriversDomain.js";

const results = [];
function check(name, condition) { assert.ok(condition, name); results.push({ name, passed: true }); }
for (const error of [{ code: "P2034" }, { meta: { code: "40001" } }, { cause: { code: "40P01" } }]) {
  let attempts = 0;
  const prisma = { async $transaction(work, options) {
    assert.equal(options.isolationLevel, "Serializable");
    attempts += 1; if (attempts === 1) throw error; return work({});
  } };
  check("confirmed serialization rollback may retry", await fleetDriversTransaction(prisma, async () => "ok") === "ok" && attempts === 2);
}
for (const code of ["P1001", "P1017", "P2028", "AUDIT_IDEMPOTENCY_CONFLICT"]) {
  let attempts = 0; const error = Object.assign(new Error(code), { code });
  await assert.rejects(() => fleetDriversTransaction({ async $transaction() { attempts += 1; throw error; } }, async () => {}), (actual) => actual === error);
  check(`uncertain outcome ${code} is never retried`, attempts === 1);
}
let conflicts = 0;
await assert.rejects(() => fleetDriversTransaction({ async $transaction() { conflicts += 1; throw { code: "P2034" }; } }, async () => {}), { code: "FLEET_DRIVERS_VERSION_CONFLICT" });
check("retry attempts are bounded", conflicts === 3);
let duplicates = 0;
await assert.rejects(() => fleetDriversTransaction({ async $transaction() { duplicates += 1; throw { meta: { code: "23505" } }; } }, async () => {}), { code: "FLEET_DRIVERS_REQUEST_CONFLICT" });
check("a unique conflict is not silently replayed", duplicates === 1);

const now = new Date("2026-10-31T12:00:00.000Z");
const driver = { membership_id: "driver", membership_ref: "driver-public", user_id: "user-driver", display_name: "Chofer real", membership_role: "E", membership_status: "ACTIVE", user_status: "active", profile_id: null };
check("active role E membership needs no invented profile capability", __fleetDriversInternals.eligible(driver, now));
check("inactive membership is not eligible", !__fleetDriversInternals.eligible({ ...driver, membership_status: "SUSPENDED" }, now));
check("inactive account is not eligible", !__fleetDriversInternals.eligible({ ...driver, user_status: "inactive" }, now));
check("an existing profile must be active", !__fleetDriversInternals.eligible({ ...driver, profile_id: "p", employment_status: "ON_LEAVE" }, now));
check("profile end is exclusive", !__fleetDriversInternals.eligible({ ...driver, profile_id: "p", employment_status: "ACTIVE", operational_valid_to: now }, now));
check("profile start is inclusive", __fleetDriversInternals.eligible({ ...driver, profile_id: "p", employment_status: "ACTIVE", operational_valid_from: now }, now));
const hired = { ...driver, profile_id: "p", employment_status: "ACTIVE", hired_at: new Date("2026-10-31T00:00:00.000Z") };
check("date-only employment does not begin before midnight in Santo Domingo", !__fleetDriversInternals.eligible(hired, new Date("2026-10-31T03:59:59.999Z")));
check("date-only employment begins at Santo Domingo midnight", __fleetDriversInternals.eligible(hired, new Date("2026-10-31T04:00:00.000Z")));
const ended = { ...driver, profile_id: "p", employment_status: "ACTIVE", contract_ends_at: new Date("2026-10-30T00:00:00.000Z") };
check("contract final calendar day stays eligible through Santo Domingo midnight", __fleetDriversInternals.eligible(ended, new Date("2026-10-31T03:59:59.999Z")));
check("contract expires on the next local calendar day", !__fleetDriversInternals.eligible(ended, new Date("2026-10-31T04:00:00.000Z")));
const actor = { userId: "manager-user", effective: new Set(["fleet:drivers:authorize"]) };
const people = new Map([["driver", driver], ["manager", { membership_ref: "manager-public", display_name: "Responsable" }]]);
const row = { id: "authorization", driver_membership_id: "driver", driver_user_id: "user-driver", requested_by_membership_id: "manager", requested_at: now,
  request_reason: "Servicio", starts_at: now, ends_at: new Date(now.getTime() + 1000), approval_status: "PENDING", row_version: 1 };
const vehicle = { operational_status: "AVAILABLE", retired_at: null };
const expired = __fleetDriversInternals.temporaryDto(row, people, actor, vehicle, new Date(now.getTime() + 1000));
check("pending expiry is derived at the exclusive boundary without a write", expired.status === "EXPIRED" && expired.effectiveStatus === "EXPIRED" && !expired.canApprove && !expired.canReject && row.approval_status === "PENDING");
const generic = __fleetDriversInternals.temporaryDto({ ...row, approval_status: "APPROVED" }, people, actor, vehicle, now);
check("generic approval without a fleet seal is unavailable", generic.effectiveStatus === "UNAVAILABLE" && !generic.canRevoke);
const historical = __fleetDriversInternals.temporaryDto(row, new Map([...people, ["driver", { ...driver, user_status: "inactive" }]]), actor, vehicle, now);
check("historical names remain visible when a driver becomes ineligible", historical.driver.displayName === "Chofer real" && !historical.driverEligible && !historical.canApprove && historical.canReject);
process.stdout.write(JSON.stringify({ ok: true, assertions: results.length, results }, null, 2) + "\n");
