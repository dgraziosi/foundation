import type { AppBindings } from "./config.js";
import { digestsMatch, secretDigest, type SecretDigest } from "./secret-compare.js";

/**
 * The window's lock. Closed union with no Keyring arm, so an MCP key is never a way in.
 * Without a view key the window stays closed and MCP still serves.
 */
export type WindowLock =
  | { readonly mode: "exclusive"; readonly viewerDigest: SecretDigest }
  | { readonly mode: "closed" };

/** Wire `api_key` / header after boundary parse. Empty is not a secret. */
export type PresentedSecret = string & { readonly __brand: "PresentedSecret" };

/** One client. Writers from different addresses do not share a bucket. */
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

function budgetOf(budget: UnlockBudget): UnlockBudget {
  if (budget.maxFailures < 1 || budget.windowMs <= 0 || budget.cooldownMs <= 0) {
    throw new Error("Unlock budget needs at least one failure and windows above zero");
  }
  return budget;
}

/**
 * Failed presented secrets per source. Callers ask `lockedFor` before any compare,
 * so a locked source learns nothing, not even from the right key.
 */
export class FailureLedger {
  private readonly budget: UnlockBudget;
  private readonly clock: Clock;
  private readonly buckets = new Map<AttemptSource, SourceBucket>();

  constructor(opts?: { budget?: UnlockBudget; clock?: Clock }) {
    this.budget = budgetOf(opts?.budget ?? DEFAULT_UNLOCK_BUDGET);
    this.clock = opts?.clock ?? systemClock;
  }

  /** Seconds left on this source's cooldown, or undefined when it may try. */
  lockedFor(source: AttemptSource): number | undefined {
    const bucket = this.buckets.get(source);
    if (bucket?.lockedUntil === undefined) {
      return undefined;
    }
    const now = this.clock.now();
    if (now >= bucket.lockedUntil) {
      this.buckets.delete(source);
      return undefined;
    }
    return Math.max(1, Math.ceil((bucket.lockedUntil - now) / 1000));
  }

  fail(source: AttemptSource): void {
    const now = this.clock.now();
    const cutoff = now - this.budget.windowMs;
    const failures = (this.buckets.get(source)?.failures ?? []).filter((stamp) => stamp > cutoff);
    failures.push(now);
    const lockedUntil = failures.length >= this.budget.maxFailures ? now + this.budget.cooldownMs : undefined;
    this.buckets.set(source, { failures, lockedUntil });
  }

  clear(source: AttemptSource): void {
    this.buckets.delete(source);
  }
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

export function windowLockOf(config: Pick<AppBindings, "FOUNDATION_VIEW_KEY">): WindowLock {
  const secret = config.FOUNDATION_VIEW_KEY?.trim() ?? "";
  if (secret.length > 0) {
    return { mode: "exclusive", viewerDigest: secretDigest(secret) };
  }
  return { mode: "closed" };
}

function opens(lock: WindowLock, presented: PresentedSecret): boolean {
  if (lock.mode === "closed") {
    return false;
  }
  return digestsMatch(secretDigest(presented), lock.viewerDigest);
}

export class ViewDoor {
  private constructor(
    private readonly lock: WindowLock,
    private readonly ledger: FailureLedger,
  ) {}

  static fromBindings(
    config: Pick<AppBindings, "FOUNDATION_VIEW_KEY">,
    opts?: { budget?: UnlockBudget; clock?: Clock },
  ): ViewDoor {
    return new ViewDoor(windowLockOf(config), new FailureLedger(opts));
  }

  get mode(): WindowLock["mode"] {
    return this.lock.mode;
  }

  /** Unlock ledger. A missing secret is a page load, not a guess, so it never counts. */
  tryUnlock(presented: PresentedSecret | undefined, source: AttemptSource): UnlockDecision {
    const retryAfterSec = this.ledger.lockedFor(source);
    if (retryAfterSec !== undefined) {
      return { kind: "throttle", retryAfterSec };
    }
    if (!presented) {
      return { kind: "refuse" };
    }
    if (opens(this.lock, presented)) {
      this.ledger.clear(source);
      return { kind: "open" };
    }
    this.ledger.fail(source);
    return { kind: "refuse" };
  }

  /** Pure compare. Callers that take a header run their own ledger first. */
  admit(presented: PresentedSecret | undefined): boolean {
    return presented != null && opens(this.lock, presented);
  }
}
