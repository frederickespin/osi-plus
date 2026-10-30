import assert from "node:assert/strict";
import { identityTransaction } from "../api/_lib/adminUserIdentityDomain.js";
import { activateUserEnrollment, resolveUserEnrollment } from "../api/_lib/adminUserEnrollmentDomain.js";

const results = [];
for (const error of [
  { code: "P2034" }, { code: "P2002" },
  { code: "P2010", meta: { code: "40001" } }, { code: "P2010", meta: { code: "40P01" } }, { code: "P2010", meta: { code: "23505" } },
]) {
  let calls = 0;
  const prisma = { async $transaction(work, configuration) {
    calls += 1;
    assert.equal(configuration.isolationLevel, "Serializable");
    if (calls === 1) throw error;
    return work({ synthetic: true });
  } };
  const result = await identityTransaction(prisma, async (tx) => tx.synthetic, { timeout: 15000 });
  assert.equal(result, true); assert.equal(calls, 2);
  results.push({ name: `retries only confirmed rollback conflict ${error.code}/${error.meta?.code || ""}`, passed: true });
}
for (const code of ["P1001", "P1017", "P2028", "ADMIN_USER_IDENTITY_VERSION_CONFLICT", "AUDIT_IDEMPOTENCY_CONFLICT"]) {
  let calls = 0;
  const failure = Object.assign(new Error("synthetic uncertain failure"), { code });
  await assert.rejects(() => identityTransaction({ async $transaction() { calls += 1; throw failure; } }, async () => true), (error) => error === failure);
  assert.equal(calls, 1);
  results.push({ name: `does not replay ${code}`, passed: true });
}
let calls = 0;
await assert.rejects(() => identityTransaction({ async $transaction() { calls += 1; throw { code: "P2034" }; } }, async () => true), (error) => error.code === "ADMIN_USER_IDENTITY_CONCURRENT_CHANGE" && error.status === 409);
assert.equal(calls, 3);
results.push({ name: "exhausted confirmed conflicts stop at three attempts", passed: true });

// Canonical PostgreSQL rejects stale normalized_email at its CHECK constraint.
// Independently exercise the domain defense against an inconsistent legacy row.
const legacyToken = `ui1.${Buffer.alloc(32, 19).toString("base64url")}`;
const inconsistentLegacy = {
  async $queryRaw(query) {
    if (query.sql.includes('FROM "osi"."user_enrollments"')) return [{
      status: "PENDING", tenant_status: "ACTIVE", expires_at: new Date("2099-01-01T00:00:00Z"),
      normalized_email: "original@example.invalid",
    }];
    if (query.sql.includes('FROM "osi"."osi_users"')) return [{
      id: "synthetic-legacy-user", status: "active", email: "changed@example.invalid",
    }];
    throw new Error("unexpected query in read-only identity defense");
  },
  async $transaction() { throw new Error("inconsistent legacy identity must not reach a write transaction"); },
};
await assert.rejects(() => resolveUserEnrollment(inconsistentLegacy, legacyToken), (error) => error.code === "ADMIN_USER_IDENTITY_ACTIVATION_INVALID");
results.push({ name: "resolution rejects a stale normalized legacy email", passed: true });
await assert.rejects(() => activateUserEnrollment(inconsistentLegacy, { token: legacyToken }, {
  sub: "synthetic-legacy-user", email: "original@example.invalid",
}), (error) => error.code === "ADMIN_USER_IDENTITY_AUTH_REQUIRED" && error.status === 401);
results.push({ name: "old JWT cannot accept access after the legacy account email changes", passed: true });
process.stdout.write(`${JSON.stringify({ ok: true, assertions: results.length, results }, null, 2)}\n`);
