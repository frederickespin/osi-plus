import assert from "node:assert/strict";
import { identityTransaction } from "../api/_lib/adminUserIdentityDomain.js";

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
process.stdout.write(`${JSON.stringify({ ok: true, assertions: results.length, results }, null, 2)}\n`);
