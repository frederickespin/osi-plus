import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  classifySetCookie,
  evaluateEndpointEvidence,
  requireEndpointEvidence,
  writeFailureEvidence,
} from "./mt-01b1-refresh-race-test.mjs";

const results = [];

function check(name, condition) {
  results.push({ name, passed: Boolean(condition) });
  assert.ok(condition, name);
}

const winner = Object.freeze({
  requestId: "refresh-race-request-01",
  requestHash: "synthetic001",
  index: 0,
  captureId: "capture-01",
  status: 200,
  functionalResult: "WINNER",
  cookie: "AUTH",
  tokenBody: true,
  tokenHeader: false,
  startOrder: 1,
  resolveOrder: 2,
  durationMs: 2,
  errorCode: null,
});
const loser = Object.freeze({
  requestId: "refresh-race-request-02",
  requestHash: "synthetic002",
  index: 1,
  captureId: "capture-02",
  status: 409,
  functionalResult: "LOSER",
  cookie: "NONE",
  tokenBody: false,
  tokenHeader: false,
  startOrder: 2,
  resolveOrder: 1,
  durationMs: 1,
  errorCode: "MT01B_REFRESH_IN_PROGRESS",
});
const validDatabase = Object.freeze({
  active: 1,
  rotated: 1,
  revoked: 0,
  successors: 1,
  replacementLinks: 1,
  audits: 1,
  waitingLocks: 0,
});

function expectFailure(name, requests, database, expectedCode) {
  const assertions = evaluateEndpointEvidence(requests, database, requests.length);
  let observed = null;
  try {
    requireEndpointEvidence(assertions);
  } catch (error) {
    observed = error.code;
  }
  check(name, observed === expectedCode);
}

check("cookie ausente se clasifica NONE", classifySetCookie(undefined) === "NONE");
check("cookie de autenticación se clasifica AUTH", classifySetCookie("__Host-example=opaque; Secure") === "AUTH");
check("cookie de borrado se clasifica CLEAR", classifySetCookie("__Host-example=; Max-Age=0") === "CLEAR");
check("contrato válido no produce fallos", evaluateEndpointEvidence([winner, loser], validDatabase, 2).every((item) => item.passed));

expectFailure("status perdedor diferente de 409", [winner, { ...loser, status: 500, functionalResult: "UNEXPECTED" }], validDatabase, "MT01B_RACE_LOSER_STATUS_COUNT");
expectFailure("cookie AUTH en perdedor", [winner, { ...loser, cookie: "AUTH" }], validDatabase, "MT01B_RACE_LOSER_AUTH_COOKIE");
expectFailure("cookie CLEAR en perdedor", [winner, { ...loser, cookie: "CLEAR" }], validDatabase, "MT01B_RACE_LOSER_CLEAR_COOKIE");
expectFailure("token body en perdedor", [winner, { ...loser, tokenBody: true }], validDatabase, "MT01B_RACE_LOSER_BODY_TOKEN");
expectFailure("token header en perdedor", [winner, { ...loser, tokenHeader: true }], validDatabase, "MT01B_RACE_LOSER_HEADER_TOKEN");
expectFailure("dos ganadores", [winner, { ...loser, status: 200, functionalResult: "WINNER", cookie: "AUTH", tokenBody: true }], validDatabase, "MT01B_RACE_WINNER_COUNT");
expectFailure("dos sucesores", [winner, loser], { ...validDatabase, active: 2, successors: 2 }, "MT01B_RACE_ACTIVE_SUCCESSOR_COUNT");
expectFailure("auditoría duplicada", [winner, loser], { ...validDatabase, audits: 2 }, "MT01B_RACE_AUDIT_COUNT");
expectFailure("captura compartida", [winner, { ...loser, captureId: winner.captureId }], validDatabase, "MT01B_RACE_SHARED_CAPTURE");

const artifactRoot = mkdtempSync(join(tmpdir(), "mt01b-race-evidence-"));
try {
  const artifactPath = join(artifactRoot, "failure.json");
  process.env.MT01B_REFRESH_RACE_ARTIFACT_PATH = artifactPath;
  const assertions = evaluateEndpointEvidence([winner, { ...loser, cookie: "CLEAR" }], validDatabase, 2);
  const error = Object.assign(new Error("synthetic@example.invalid postgresql://user:password@example.invalid/db __Host-osi_refresh=secret"), {
    code: "MT01B_RACE_LOSER_CLEAR_COOKIE",
  });
  const written = writeFailureEvidence({ requests: [winner, { ...loser, cookie: "CLEAR" }], database: validDatabase, assertions }, error);
  const artifact = readFileSync(artifactPath, "utf8");
  check("fallo genera artefacto JSON", written?.written === true && JSON.parse(artifact).schema === "MT01B_REFRESH_RACE_EVIDENCE_V1");
  check("artefacto no contiene credenciales ni valores sensibles", !artifact.includes("user:password") && !artifact.includes("synthetic@example.invalid") && !artifact.includes("=secret"));
} finally {
  delete process.env.MT01B_REFRESH_RACE_ARTIFACT_PATH;
  rmSync(artifactRoot, { recursive: true, force: true });
}

process.stdout.write(`${JSON.stringify({ ok: true, passed: results.length, failed: 0, results }, null, 2)}\n`);
