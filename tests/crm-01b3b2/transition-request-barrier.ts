import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import type { Page, Request, TestInfo } from "@playwright/test";

export type SecondPostOutcome =
  | "SECOND_POST_NOT_INITIATED"
  | "SECOND_POST_INITIATED_NOT_INTERCEPTED"
  | "SECOND_POST_OBSERVED";

type TimelineEvent = Readonly<{
  atMs: number;
  kind: string;
  method?: string;
  path?: string;
  detail?: string;
}>;

type BarrierEvidence = Readonly<{
  schemaVersion: 1;
  outcome: SecondPostOutcome | "PENDING";
  expected: Readonly<{ method: "POST"; path: "/api/crm/pipeline-cases/:caseRef/transition" }>;
  browser: string;
  viewport: Readonly<{ width: number; height: number }> | null;
  test: string;
  idempotencyFingerprint: string | null;
  timeline: readonly TimelineEvent[];
}>;

const TRANSITION_PATH = "/api/crm/pipeline-cases/:caseRef/transition" as const;

function monotonicMs() {
  return performance.now();
}

function fingerprint(value: string | undefined) {
  if (!value) return null;
  return createHash("sha256").update(value, "utf8").digest("hex").slice(0, 16);
}

function sanitizeText(value: string) {
  return value
    .replace(/Bearer\s+[^\s"']+/giu, "Bearer [REDACTED]")
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/gu, "[EMAIL]")
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/giu, "[UUID]")
    .replace(/((?:token|authorization|cookie|password|secret))\s*[:=]\s*[^\s,;]+/giu, "$1=[REDACTED]")
    .slice(0, 500);
}

function sanitizedPath(request: Request) {
  const pathname = new URL(request.url()).pathname;
  return /^\/api\/crm\/pipeline-cases\/[0-9a-f-]+\/transition$/iu.test(pathname)
    ? TRANSITION_PATH
    : pathname.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/giu, ":ref");
}

function matchesTransition(request: Request, caseRef: string) {
  return request.method() === "POST"
    && new URL(request.url()).pathname === `/api/crm/pipeline-cases/${caseRef}/transition`;
}

export class SecondPostBarrierError extends Error {
  constructor(public readonly code: Exclude<SecondPostOutcome, "SECOND_POST_OBSERVED">) {
    super(code);
    this.name = "SecondPostBarrierError";
  }
}

export class TransitionFailureEvidence {
  private readonly timeline: TimelineEvent[] = [];
  private readonly onConsole = (message: { type(): string; text(): string }) => {
    this.push("console", undefined, undefined, `${message.type()}:${sanitizeText(message.text())}`);
  };
  private readonly onPageError = (error: Error) => this.push("pageerror", undefined, undefined, sanitizeText(`${error.name}:${error.message}`));
  private readonly onRequestFailed = (request: Request) => this.push(
    "requestfailed",
    request.method(),
    sanitizedPath(request),
    sanitizeText(request.failure()?.errorText ?? "unknown"),
  );
  private readonly onResponse = (response: { request(): Request; status(): number; headers(): Record<string, string> }) => {
    const request = response.request();
    this.push(
      "response",
      request.method(),
      sanitizedPath(request),
      `status=${response.status()};content-type=${sanitizeText(response.headers()["content-type"] ?? "absent")}`,
    );
  };

  constructor(private readonly page: Page, private readonly testInfo: TestInfo) {
    page.on("console", this.onConsole);
    page.on("pageerror", this.onPageError);
    page.on("requestfailed", this.onRequestFailed);
    page.on("response", this.onResponse);
  }

  push(kind: string, method?: string, path?: string, detail?: string) {
    this.timeline.push(Object.freeze({ atMs: monotonicMs(), kind, method, path, detail }));
  }

  async attach(barrier: SecondTransitionRequestBarrier, error: unknown) {
    this.push("test-failure", undefined, undefined, sanitizeText(error instanceof Error ? `${error.name}:${error.message}` : String(error)));
    const evidence = barrier.evidence(this.testInfo, this.timeline);
    const path = this.testInfo.outputPath("crm-transition-request-evidence.json");
    await writeFile(path, `${JSON.stringify(evidence, null, 2)}\n`, { encoding: "utf8" });
    await this.testInfo.attach("crm-transition-request-evidence.json", { path, contentType: "application/json" });
  }

  dispose() {
    this.page.off("console", this.onConsole);
    this.page.off("pageerror", this.onPageError);
    this.page.off("requestfailed", this.onRequestFailed);
    this.page.off("response", this.onResponse);
  }
}

export class SecondTransitionRequestBarrier {
  private readonly timeline: TimelineEvent[] = [];
  private initiatedAt: number | null = null;
  private interceptedAt: number | null = null;
  private idempotencyKey: string | undefined;
  private outcome: SecondPostOutcome | "PENDING" = "PENDING";
  private resolveObserved!: () => void;
  private readonly observed = new Promise<void>((resolve) => { this.resolveObserved = resolve; });
  private readonly onRequest = (request: Request) => {
    if (!matchesTransition(request, this.caseRef) || this.initiatedAt !== null) return;
    this.initiatedAt = monotonicMs();
    this.idempotencyKey = request.headers()["idempotency-key"];
    this.timeline.push(Object.freeze({ atMs: this.initiatedAt, kind: "second-post-initiated", method: "POST", path: TRANSITION_PATH }));
    this.resolveIfObserved();
  };

  constructor(
    private readonly page: Page,
    private readonly caseRef: string,
    private readonly timeoutMs = 8_000,
  ) {
    page.on("request", this.onRequest);
    this.timeline.push(Object.freeze({ atMs: monotonicMs(), kind: "barrier-registered", method: "POST", path: TRANSITION_PATH }));
  }

  observeIntercepted(request: Request) {
    if (!matchesTransition(request, this.caseRef) || this.interceptedAt !== null) return;
    this.interceptedAt = monotonicMs();
    this.idempotencyKey ??= request.headers()["idempotency-key"];
    this.timeline.push(Object.freeze({ atMs: this.interceptedAt, kind: "second-post-intercepted", method: "POST", path: TRANSITION_PATH }));
    this.resolveIfObserved();
  }

  private resolveIfObserved() {
    if (this.initiatedAt !== null && this.interceptedAt !== null) this.resolveObserved();
  }

  async wait() {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const expired = new Promise<"timeout">((resolve) => { timeout = setTimeout(() => resolve("timeout"), this.timeoutMs); });
    const result = await Promise.race([this.observed.then(() => "observed" as const), expired]);
    if (timeout) clearTimeout(timeout);

    if (result === "observed") {
      this.outcome = "SECOND_POST_OBSERVED";
      this.timeline.push(Object.freeze({ atMs: monotonicMs(), kind: this.outcome, method: "POST", path: TRANSITION_PATH }));
      return Object.freeze({ outcome: this.outcome, idempotencyKey: this.idempotencyKey });
    }

    this.outcome = this.initiatedAt === null
      ? "SECOND_POST_NOT_INITIATED"
      : "SECOND_POST_INITIATED_NOT_INTERCEPTED";
    this.timeline.push(Object.freeze({ atMs: monotonicMs(), kind: this.outcome, method: "POST", path: TRANSITION_PATH }));
    throw new SecondPostBarrierError(this.outcome);
  }

  evidence(testInfo: TestInfo, preceding: readonly TimelineEvent[] = []): BarrierEvidence {
    const ordered = [...preceding, ...this.timeline].sort((a, b) => a.atMs - b.atMs);
    const origin = ordered[0]?.atMs ?? monotonicMs();
    return Object.freeze({
      schemaVersion: 1,
      outcome: this.outcome,
      expected: Object.freeze({ method: "POST", path: TRANSITION_PATH }),
      browser: testInfo.project.name,
      viewport: this.page.viewportSize(),
      test: testInfo.titlePath.join(" > "),
      idempotencyFingerprint: fingerprint(this.idempotencyKey),
      timeline: Object.freeze(ordered.map((event) => Object.freeze({
        ...event,
        atMs: Number((event.atMs - origin).toFixed(3)),
      }))),
    });
  }

  dispose() {
    this.page.off("request", this.onRequest);
  }
}
