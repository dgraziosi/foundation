import { timingSafeEqual } from "node:crypto";
import type { AppBindings } from "./config.js";
import type { Keyring } from "./keyring.js";

/**
 * The window's lock. Closed union: exclusive physically cannot see Keyring.
 * If a Viewer credential exists, an MCP key is not a way in.
 */
export type WindowLock =
  | { readonly mode: "exclusive"; readonly viewerSecret: string }
  | { readonly mode: "fallback"; readonly keyring: Keyring };

/** Wire `api_key` / cookie / header after boundary parse. Empty is not a secret. */
export type PresentedSecret = string & { readonly __brand: "PresentedSecret" };

/** One client. Unlock writers do not share a bucket. */
export type AttemptSource = string & { readonly __brand: "AttemptSource" };

export type UnlockBudget = {
  readonly maxFailures: number;
  readonly windowMs: number;
  readonly cooldownMs: number;
};

export const DEFAULT_UNLOCK_BUDGET: UnlockBudget = {
  maxFailures: 5,
  windowMs: 15 * 60_000,
  cooldownMs: 15 * 60_000,
};

export type Clock = { now(): number };

export type UnlockDecision =
  | { readonly kind: "open" }
  | { readonly kind: "refuse" }
  | { readonly kind: "throttle"; readonly retryAfterSec: number };

type SourceBucket = {
  failures: number[];
  lockedUntil: number | undefined;
};

const systemClock: Clock = { now: () => Date.now() };

function safeEqualUtf8(left: string, right: string): boolean {
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");
  if (a.length === 0 || a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}

function budgetOf(budget: UnlockBudget): UnlockBudget {
  if (budget.maxFailures < 1 || budget.windowMs <= 0 || budget.cooldownMs <= 0) {
    throw new Error("Unlock budget needs at least one failure and windows above zero");
  }
  return budget;
}

export function presentedSecret(raw: unknown): PresentedSecret | undefined {
  if (typeof raw !== "string") {
    return undefined;
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  return trimmed as PresentedSecret;
}

export function attemptSourceFrom(remoteAddress: string): AttemptSource {
  const trimmed = remoteAddress.trim();
  return (trimmed.length > 0 ? trimmed : "unknown") as AttemptSource;
}

export function attemptSource(req: { socket: { remoteAddress?: string } }): AttemptSource {
  return attemptSourceFrom(req.socket.remoteAddress ?? "unknown");
}

export function windowLockOf(config: AppBindings, keyring: Keyring): WindowLock {
  const secret = config.FOUNDATION_VIEW_KEY?.trim() ?? "";
  if (secret.length > 0) {
    return { mode: "exclusive", viewerSecret: secret };
  }
  return { mode: "fallback", keyring };
}

function secretsMatch(lock: WindowLock, presented: PresentedSecret): boolean {
  if (lock.mode === "exclusive") {
    return safeEqualUtf8(presented, lock.viewerSecret);
  }
  return lock.keyring.resolve(presented) != null;
}

export class ViewDoor {
  private constructor(
    private readonly lock: WindowLock,
    private readonly budget: UnlockBudget,
    private readonly clock: Clock,
    private readonly buckets: Map<AttemptSource, SourceBucket>,
  ) {}

  static fromBindings(
    config: AppBindings,
    keyring: Keyring,
    opts?: { budget?: UnlockBudget; clock?: Clock },
  ): ViewDoor {
    return new ViewDoor(
      windowLockOf(config, keyring),
      budgetOf(opts?.budget ?? DEFAULT_UNLOCK_BUDGET),
      opts?.clock ?? systemClock,
      new Map(),
    );
  }

  tryUnlock(presented: PresentedSecret | undefined, source: AttemptSource): UnlockDecision {
    const now = this.clock.now();
    if (presented && secretsMatch(this.lock, presented)) {
      this.buckets.delete(source);
      return { kind: "open" };
    }
    const existing = this.buckets.get(source);
    if (existing?.lockedUntil !== undefined && now < existing.lockedUntil) {
      return {
        kind: "throttle",
        retryAfterSec: Math.max(1, Math.ceil((existing.lockedUntil - now) / 1000)),
      };
    }
    const cutoff = now - this.budget.windowMs;
    const failures = (existing?.failures ?? []).filter((stamp) => stamp > cutoff);
    failures.push(now);
    const lockedUntil =
      failures.length >= this.budget.maxFailures ? now + this.budget.cooldownMs : undefined;
    this.buckets.set(source, { failures, lockedUntil });
    return { kind: "refuse" };
  }

  admit(presented: PresentedSecret | undefined): boolean {
    return presented != null && secretsMatch(this.lock, presented);
  }
}
