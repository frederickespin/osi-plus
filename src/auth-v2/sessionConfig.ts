import type { SessionCoordinatorPolicy } from "./sessionTypes.ts";

export const DEFAULT_SESSION_COORDINATOR_POLICY: Readonly<SessionCoordinatorPolicy> = Object.freeze({
  refreshAheadMs: 60_000,
  recentActivityMs: 5 * 60_000,
  winnerWaitMs: 1_500,
  maxRetries: 3,
  maxRetryAfterMs: 2_000,
  retryJitterMs: 125,
  maxBroadcastAgeMs: 10_000,
  maxClockSkewMs: 30_000,
  maxAccessTokenTtlMs: 60 * 60_000,
  maxBroadcastMessageBytes: 24_576,
  maxReplayNonces: 512,
  maxMessagesPerWindow: 512,
});

export function isMt01b2ClientEnabled(env: Record<string, unknown>): boolean {
  return String(env.VITE_MT01B2_CLIENT_ENABLED ?? "false").trim().toLowerCase() === "true";
}
export function resolveSessionCoordinatorPolicy(
  overrides: Partial<SessionCoordinatorPolicy> = {},
): SessionCoordinatorPolicy {
  const policy = { ...DEFAULT_SESSION_COORDINATOR_POLICY, ...overrides };
  const positive = [
    "refreshAheadMs",
    "recentActivityMs",
    "winnerWaitMs",
    "maxRetries",
    "maxRetryAfterMs",
    "maxBroadcastAgeMs",
    "maxClockSkewMs",
    "maxAccessTokenTtlMs",
    "maxBroadcastMessageBytes",
    "maxReplayNonces",
    "maxMessagesPerWindow",
  ] as const;
  for (const key of positive) {
    if (!Number.isInteger(policy[key]) || policy[key] <= 0) throw new Error(`MT01B2_INVALID_POLICY:${key}`);
  }
  if (!Number.isInteger(policy.retryJitterMs) || policy.retryJitterMs < 0 || policy.retryJitterMs > 1_000) {
    throw new Error("MT01B2_INVALID_POLICY:retryJitterMs");
  }
  if (policy.maxRetries > 5
    || policy.maxRetryAfterMs > 5_000
    || policy.maxAccessTokenTtlMs > 60 * 60_000
    || policy.maxBroadcastMessageBytes > 65_536
    || policy.maxReplayNonces > 2_048
    || policy.maxMessagesPerWindow > 2_048) {
    throw new Error("MT01B2_UNSAFE_POLICY");
  }
  return policy;
}
