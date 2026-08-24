import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test as base } from "@playwright/test";

const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const BEARER_PATTERN = /\bBearer\s+[^\s,;]+/gi;
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;
const CONNECTION_PATTERN = /\bpostgres(?:ql)?:\/\/[^\s"']+/gi;
const URL_PATTERN = /https?:\/\/[^\s"')]+/gi;
const MAX_EVENTS = 500;

export function sanitizeDiagnosticText(value) {
  return String(value ?? "")
    .replace(CONNECTION_PATTERN, "[REDACTED_CONNECTION]")
    .replace(BEARER_PATTERN, "Bearer [REDACTED]")
    .replace(JWT_PATTERN, "[REDACTED_TOKEN]")
    .replace(EMAIL_PATTERN, "[REDACTED_EMAIL]")
    .replace(UUID_PATTERN, ":caseRef")
    .replace(URL_PATTERN, (candidate) => safePathname(candidate));
}

export function safePathname(value) {
  try {
    const url = new URL(value, "http://diagnostic.invalid");
    return url.pathname.replace(UUID_PATTERN, ":caseRef");
  } catch {
    return sanitizeDiagnosticText(String(value).split(/[?#]/, 1)[0]);
  }
}

function safeFileSegment(value) {
  return String(value).normalize("NFKD").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "test";
}

export class CommercialDiagnostics {
  #events = [];
  #sequence = 0;
  #viewport = null;

  record(type, details = {}) {
    if (this.#events.length >= MAX_EVENTS) return;
    const safeDetails = {};
    for (const [key, raw] of Object.entries(details)) {
      if (raw === undefined) continue;
      if (key === "pathname") safeDetails.pathname = safePathname(raw);
      else if (typeof raw === "number" || typeof raw === "boolean" || raw === null) safeDetails[key] = raw;
      else safeDetails[key] = sanitizeDiagnosticText(raw);
    }
    this.#events.push({ sequence: ++this.#sequence, type, ...safeDetails });
  }

  attach(page) {
    this.#viewport = page.viewportSize();
    page.on("request", (request) => this.record("request", {
      method: request.method(),
      pathname: request.url(),
    }));
    page.on("response", (response) => this.record("response", {
      method: response.request().method(),
      pathname: response.url(),
      status: response.status(),
      contentType: response.headers()["content-type"] ?? null,
    }));
    page.on("requestfailed", (request) => this.record("requestfailed", {
      method: request.method(),
      pathname: request.url(),
      errorText: request.failure()?.errorText ?? "unknown",
    }));
    page.on("pageerror", (error) => this.record("pageerror", { message: error.message }));
    page.on("console", (message) => {
      if (message.type() === "warning" || message.type() === "error") {
        this.record("console", { level: message.type(), message: message.text() });
      }
    });
  }

  snapshot({ projectName, testName, status, expectedStatus }) {
    return {
      schemaVersion: 1,
      suite: "v17-commercial-crm",
      project: sanitizeDiagnosticText(projectName),
      viewport: this.#viewport,
      testName: sanitizeDiagnosticText(testName),
      status: sanitizeDiagnosticText(status),
      expectedStatus: sanitizeDiagnosticText(expectedStatus),
      events: this.#events,
    };
  }

  async writeFailureArtifact(directory, testInfo) {
    if (!directory) return null;
    await mkdir(directory, { recursive: true });
    const filename = `${safeFileSegment(testInfo.project.name)}-${safeFileSegment(testInfo.title)}-${testInfo.workerIndex}-${testInfo.retry}.json`;
    const target = join(directory, filename);
    const payload = this.snapshot({
      projectName: testInfo.project.name,
      testName: testInfo.title,
      status: testInfo.status,
      expectedStatus: testInfo.expectedStatus,
    });
    await writeFile(target, `${JSON.stringify(payload, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    return target;
  }
}

export class DetailFulfillmentBarrier {
  #active = null;
  #diagnostics;
  #nextId = 0;

  constructor(diagnostics) {
    this.#diagnostics = diagnostics;
  }

  prepare(label, exactPathname) {
    if (this.#active) throw new Error("DETAIL_BARRIER_ALREADY_ARMED");
    let resolve;
    let reject;
    const completion = new Promise((onResolve, onReject) => { resolve = onResolve; reject = onReject; });
    void completion.catch(() => undefined);
    const ticket = {
      id: ++this.#nextId,
      label,
      exactPathname,
      state: "ARMED",
      uiStable: false,
      completion,
      resolve,
      reject,
    };
    this.#active = ticket;
    this.#diagnostics.record("detail:expected", { label, pathname: exactPathname, fulfillFinished: false });
    return ticket;
  }

  begin(exactPathname) {
    const ticket = this.#active;
    if (!ticket || ticket.exactPathname !== exactPathname || ticket.state !== "ARMED") {
      this.#diagnostics.record("detail:unexpected", { pathname: exactPathname, fulfillFinished: false });
      throw new Error("DETAIL_BARRIER_UNEXPECTED_REQUEST");
    }
    ticket.state = "INTERCEPTED";
    this.#diagnostics.record("detail:intercepted", { label: ticket.label, pathname: exactPathname, fulfillFinished: false });
    return {
      ticket,
      fulfillStarted: () => {
        if (ticket.state !== "INTERCEPTED") throw new Error("DETAIL_BARRIER_INVALID_START");
        ticket.state = "FULFILLING";
        this.#diagnostics.record("detail:fulfill:start", { label: ticket.label, pathname: exactPathname, fulfillFinished: false });
      },
      fulfilled: (status, contentType) => {
        if (ticket.state !== "FULFILLING") throw new Error("DETAIL_BARRIER_INVALID_COMPLETION");
        ticket.state = "FULFILLED";
        this.#active = null;
        this.#diagnostics.record("detail:fulfill:done", { label: ticket.label, pathname: exactPathname, status, contentType, fulfillFinished: true });
        ticket.resolve({ status, contentType });
      },
      failed: (cause) => {
        ticket.state = "FAILED";
        this.#active = null;
        const error = cause instanceof Error ? cause : new Error("DETAIL_BARRIER_FULFILL_FAILED");
        this.#diagnostics.record("detail:fulfill:failed", { label: ticket.label, pathname: exactPathname, message: error.message, fulfillFinished: false });
        ticket.reject(error);
      },
    };
  }

  markUiStable(ticket, signal) {
    if (ticket.state !== "FULFILLED") throw new Error("DETAIL_BARRIER_RESPONSE_PENDING");
    ticket.uiStable = true;
    this.#diagnostics.record("detail:ui:stable", { label: ticket.label, signal, fulfillFinished: true });
  }

  assertReadyForReload(ticket) {
    if (this.#active || ticket.state !== "FULFILLED" || !ticket.uiStable) {
      throw new Error("DETAIL_BARRIER_RELOAD_BLOCKED");
    }
    this.#diagnostics.record("detail:reload:allowed", { label: ticket.label, fulfillFinished: true });
  }

  interceptorRemoved(ticket) {
    if (this.#active !== ticket || ticket.state !== "ARMED") throw new Error("DETAIL_BARRIER_NOT_ARMED");
    ticket.state = "FAILED";
    this.#active = null;
    const error = new Error("DETAIL_BARRIER_INTERCEPTOR_REMOVED");
    this.#diagnostics.record("detail:interceptor:removed", { label: ticket.label, fulfillFinished: false });
    ticket.reject(error);
  }

  get pendingCount() {
    return this.#active ? 1 : 0;
  }
}

export function createControlledGate() {
  let release;
  const promise = new Promise((resolve) => { release = resolve; });
  return { promise, release: () => release() };
}

export const test = base.extend({
  commercialDiagnostics: [async ({ page }, use, testInfo) => {
    const diagnostics = new CommercialDiagnostics();
    diagnostics.attach(page);
    await use(diagnostics);
    if (testInfo.status !== testInfo.expectedStatus) {
      await diagnostics.writeFailureArtifact(process.env.COMMERCIAL_CRM_ARTIFACT_DIR, testInfo);
    }
  }, { auto: true }],
});

export { expect };
