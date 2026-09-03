import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { toolError, type ToolError } from "./mcp-io.js";

export const JOB_NAME_RE = /^[a-z][a-z0-9_-]{0,62}$/;
export const DEFAULT_LEASE_TTL_SECONDS = 900;
export const MIN_LEASE_TTL_SECONDS = 30;
export const MAX_LEASE_TTL_SECONDS = 14_400;

export const JOB_HELD_ERROR = "Held";
export const JOB_TOKEN_STALE_ERROR = "Not holding";
export const JOB_HELD_SUGGESTION =
  "Another pass holds this name. read, or wait until the deadline, then claim again.";
export const JOB_TOKEN_STALE_SUGGESTION =
  "This token is not the live hold. claim without it if the name is open, or read.";
export const JOB_TTL_SUGGESTION = `ttl_seconds must be an integer from ${MIN_LEASE_TTL_SECONDS} to ${MAX_LEASE_TTL_SECONDS}.`;
export const JOB_NAME_SUGGESTION =
  "name must start with a letter and contain only lowercase letters, digits, hyphens, and underscores.";

export const JobNameSchema = z
  .string()
  .regex(JOB_NAME_RE, JOB_NAME_SUGGESTION);
export type JobName = z.infer<typeof JobNameSchema>;

export const JobTokenSchema = z.string().uuid();
export type JobToken = z.infer<typeof JobTokenSchema>;

export const JobActionSchema = z.enum(["claim", "finish", "release", "read"]);
export type JobAction = z.infer<typeof JobActionSchema>;

export const JobHolderSchema = z.object({
  name: z.string().min(1),
  label: z.string().min(1),
});
export type JobHolder = z.infer<typeof JobHolderSchema>;

export const JobLastRunSchema = z.object({
  finished_at: z.string(),
  holder: JobHolderSchema,
});
export type JobLastRun = z.infer<typeof JobLastRunSchema>;

export const JobLeaseStateSchema = z.object({
  name: JobNameSchema,
  held: z.boolean(),
  holder: JobHolderSchema.nullable(),
  until: z.string().nullable(),
  last_run: JobLastRunSchema.nullable(),
});
export type JobLeaseState = z.infer<typeof JobLeaseStateSchema>;

export const JobInputSchema = z.object({
  action: JobActionSchema,
  name: JobNameSchema,
  token: JobTokenSchema.optional(),
  ttl_seconds: z.number().int().min(MIN_LEASE_TTL_SECONDS).max(MAX_LEASE_TTL_SECONDS).optional(),
});
export type JobInput = z.infer<typeof JobInputSchema>;

export const JobSuccessSchema = z.object({
  action: JobActionSchema,
  job: JobLeaseStateSchema,
  token: JobTokenSchema.optional(),
});
export type JobSuccess = z.infer<typeof JobSuccessSchema>;

export type JobCommand =
  | { action: "claim"; name: JobName; token?: JobToken; ttlSeconds?: number }
  | { action: "finish"; name: JobName; token: JobToken }
  | { action: "release"; name: JobName; token: JobToken }
  | { action: "read"; name: JobName };

export type JobLeasePolicy = {
  ttlSeconds: number;
};

export type JobLeaseRow = {
  name: string;
  holder_name: string | null;
  holder_label: string | null;
  token_sha256: string | null;
  claimed_at: string | null;
  expires_at: string | null;
  last_run_at: string | null;
  last_run_holder_name: string | null;
  last_run_holder_label: string | null;
};

export function parseJobCommand(input: JobInput): JobCommand | ToolError {
  if (input.action === "claim") {
    return {
      action: "claim",
      name: input.name,
      token: input.token,
      ttlSeconds: input.ttl_seconds,
    };
  }
  if (input.action === "read") {
    if (input.token !== undefined || input.ttl_seconds !== undefined) {
      return toolError(
        "Invalid input",
        "read takes name only. Do not send token or ttl_seconds.",
      );
    }
    return { action: "read", name: input.name };
  }
  if (input.ttl_seconds !== undefined) {
    return toolError("Invalid input", "ttl_seconds is only for claim.");
  }
  if (input.token === undefined) {
    return toolError(
      "Invalid input",
      `${input.action} needs the token from claim.`,
    );
  }
  return { action: input.action, name: input.name, token: input.token };
}

export function resolveLeaseTtl(
  requested: number | undefined,
  policy: JobLeasePolicy,
): number | ToolError {
  const ttl = requested ?? policy.ttlSeconds;
  if (!Number.isInteger(ttl) || ttl < MIN_LEASE_TTL_SECONDS || ttl > MAX_LEASE_TTL_SECONDS) {
    return toolError("Invalid input", JOB_TTL_SUGGESTION);
  }
  return ttl;
}

export function hashJobToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function mintJobToken(): JobToken {
  return randomUUID();
}

export function jobLeaseIsHeld(row: JobLeaseRow, nowIso: string): boolean {
  return row.holder_name !== null && row.expires_at !== null && row.expires_at > nowIso;
}

export function snapshotFromJobRow(row: JobLeaseRow, nowIso: string): JobLeaseState {
  const held = jobLeaseIsHeld(row, nowIso);
  const last_run =
    row.last_run_at && row.last_run_holder_name && row.last_run_holder_label
      ? {
          finished_at: row.last_run_at,
          holder: { name: row.last_run_holder_name, label: row.last_run_holder_label },
        }
      : null;
  return {
    name: row.name,
    held,
    holder:
      held && row.holder_name && row.holder_label
        ? { name: row.holder_name, label: row.holder_label }
        : null,
    until: held ? row.expires_at : null,
    last_run,
  };
}

export function virtualOpenJob(name: JobName): JobLeaseState {
  return { name, held: false, holder: null, until: null, last_run: null };
}

export function heldSuggestion(row: JobLeaseRow): string {
  if (row.holder_label && row.expires_at) {
    return `${row.holder_label} holds ${row.name} until ${row.expires_at}. read, or wait until then.`;
  }
  return JOB_HELD_SUGGESTION;
}
