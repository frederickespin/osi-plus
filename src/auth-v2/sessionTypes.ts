export const SESSION_STATES = [
  "DISABLED",
  "LEGACY",
  "INITIALIZING",
  "AUTHENTICATED",
  "REFRESHING",
  "RECOVERABLE_WAIT",
  "OFFLINE",
  "REAUTH_REQUIRED",
  "LOGGED_OUT",
] as const;

export type SessionState = (typeof SESSION_STATES)[number];

export type SessionReason =
  | "BOOTSTRAP"
  | "EXPIRING"
  | "EXPLICIT"
  | "RECONNECTED"
  | "CROSS_TAB"
  | "LOGOUT"
  | "REVOKED"
  | "SERVER_DISABLED"
  | "RECOVERABLE_ERROR";

export type SessionIdentity = {
  tenantId: string;
  membershipId: string;
  role: string;
  authorizationVersion: number;
};

export type SessionFence = {
  sessionId: string;
  sessionEpoch: string;
  subject: string;
  tenantId: string;
  membershipId: string;
  authorizationVersion: number;
};
export type RefreshResponse = {
  ok: true;
  token: string;
  session: SessionIdentity;
};

export type UpgradeResponse = RefreshResponse & {
  user: {
    id: string;
    name: string;
    role: string;
  } | null;
};

export type SessionTransport = {
  refresh(signal: AbortSignal): Promise<RefreshResponse>;
  logout(signal: AbortSignal): Promise<void>;
};

export type FrontendSessionTransport = SessionTransport & {
  upgrade(legacyAccessToken: string, signal: AbortSignal): Promise<UpgradeResponse>;
};

export type SessionClock = {
  now(): number;
  sleep(milliseconds: number, signal?: AbortSignal): Promise<void>;
};

export type SessionActivity = {
  isOnline(): boolean;
  isVisible(): boolean;
  lastActivityAt(): number;
};

export type LockResult<T> =
  | { acquired: true; value: T }
  | { acquired: false };

export type SessionLock = {
  tryRun<T>(name: string, task: () => Promise<T>): Promise<LockResult<T>>;
};

type SessionMessageFence = SessionFence & {
  version: 2;
  senderId: string;
  nonce: string;
  issuedAt: number;
};

export type RefreshStartedMessage = SessionMessageFence & {
  type: "REFRESH_STARTED";
};

export type AuthenticatedMessage = SessionMessageFence & {
  type: "AUTHENTICATED";
  operationNonce: string;
  expiresAt: number;
  accessToken: string;
};

export type TerminalMessage = SessionMessageFence & {
  type: "LOGOUT" | "REAUTH_REQUIRED";
};

export type SessionChannelMessage = RefreshStartedMessage | AuthenticatedMessage | TerminalMessage;

export type SessionChannel = {
  post(message: SessionChannelMessage): void;
  subscribe(listener: (message: unknown) => void): () => void;
  close(): void;
};

export type SessionCoordinatorPolicy = {
  refreshAheadMs: number;
  recentActivityMs: number;
  winnerWaitMs: number;
  maxRetries: number;
  maxRetryAfterMs: number;
  retryJitterMs: number;
  maxBroadcastAgeMs: number;
  maxClockSkewMs: number;
  maxAccessTokenTtlMs: number;
  maxBroadcastMessageBytes: number;
  maxReplayNonces: number;
  maxMessagesPerWindow: number;
};

export type SessionSnapshot = {
  state: SessionState;
  reason: SessionReason;
  expiresAt: number | null;
  authorizationVersion: number | null;
  hasAccessToken: boolean;
};

export type SessionCoordinatorOptions = {
  enabled: boolean;
  tabId: string;
  transport: SessionTransport;
  channel: SessionChannel;
  lock: SessionLock | null;
  clock: SessionClock;
  activity: SessionActivity;
  randomNonce(): string;
  randomUnit(): number;
  expectedSession?: SessionFence;
  dispose?: () => void;
  policy?: Partial<SessionCoordinatorPolicy>;
};
