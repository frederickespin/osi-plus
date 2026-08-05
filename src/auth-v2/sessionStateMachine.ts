import type { SessionReason, SessionSnapshot, SessionState } from "./sessionTypes.ts";

const TRANSITIONS: Readonly<Record<SessionState, readonly SessionState[]>> = Object.freeze({
  DISABLED: ["DISABLED"],
  LEGACY: ["LEGACY", "INITIALIZING", "LOGGED_OUT"],
  INITIALIZING: ["AUTHENTICATED", "REFRESHING", "RECOVERABLE_WAIT", "OFFLINE", "REAUTH_REQUIRED", "LEGACY", "LOGGED_OUT"],
  AUTHENTICATED: ["AUTHENTICATED", "REFRESHING", "OFFLINE", "REAUTH_REQUIRED", "LOGGED_OUT", "LEGACY"],
  REFRESHING: ["AUTHENTICATED", "RECOVERABLE_WAIT", "OFFLINE", "REAUTH_REQUIRED", "LOGGED_OUT", "LEGACY"],
  RECOVERABLE_WAIT: ["REFRESHING", "AUTHENTICATED", "OFFLINE", "REAUTH_REQUIRED", "LOGGED_OUT", "LEGACY"],
  OFFLINE: ["INITIALIZING", "REFRESHING", "AUTHENTICATED", "REAUTH_REQUIRED", "LOGGED_OUT", "LEGACY"],
  REAUTH_REQUIRED: ["INITIALIZING", "LOGGED_OUT", "LEGACY"],
  LOGGED_OUT: ["INITIALIZING", "LOGGED_OUT", "LEGACY"],
});

export type SessionStateListener = (snapshot: SessionSnapshot) => void;

export class SessionStateMachine {
  readonly #listeners = new Set<SessionStateListener>();
  #snapshot: SessionSnapshot;

  constructor(initial: SessionState, reason: SessionReason) {
    this.#snapshot = {
      state: initial,
      reason,
      expiresAt: null,
      authorizationVersion: null,
      hasAccessToken: false,
    };
  }

  get snapshot(): SessionSnapshot {
    return { ...this.#snapshot };
  }

  transition(next: SessionState, reason: SessionReason, details: Partial<Omit<SessionSnapshot, "state" | "reason">> = {}): void {
    if (next !== this.#snapshot.state && !TRANSITIONS[this.#snapshot.state].includes(next)) {
      throw new Error(`MT01B2_INVALID_TRANSITION:${this.#snapshot.state}->${next}`);
    }
    this.#snapshot = { ...this.#snapshot, ...details, state: next, reason };
    for (const listener of this.#listeners) listener(this.snapshot);
  }

  subscribe(listener: SessionStateListener): () => void {
    this.#listeners.add(listener);
    listener(this.snapshot);
    return () => this.#listeners.delete(listener);
  }
}
