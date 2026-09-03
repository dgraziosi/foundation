import {
  casClaimJobLease,
  casFinishJobLease,
  casHeartbeatJobLease,
  casReleaseJobLease,
  getJobLeaseByName,
  getLiveJobLeaseByToken,
  type Queryable,
} from "@foundation/db";
import {
  DEFAULT_LEASE_TTL_SECONDS,
  JOB_HELD_ERROR,
  JOB_HELD_SUGGESTION,
  JOB_TOKEN_STALE_ERROR,
  JOB_TOKEN_STALE_SUGGESTION,
  JobSuccessSchema,
  hashJobToken,
  heldSuggestion,
  isToolError,
  mintJobToken,
  parseJobCommand,
  resolveLeaseTtl,
  snapshotFromJobRow,
  toolError,
  virtualOpenJob,
  type JobInput,
  type JobLeasePolicy,
  type JobLeaseRow,
  type JobSuccess,
  type ToolError,
} from "@foundation/schema";
import type { AgentPrincipal } from "./keyring.js";

export function leasePolicyFromSeconds(ttlSeconds = DEFAULT_LEASE_TTL_SECONDS): JobLeasePolicy {
  return { ttlSeconds };
}

function nowIso(): string {
  return new Date().toISOString();
}

function success(
  action: JobSuccess["action"],
  row: JobLeaseRow | null,
  name: string,
  token?: string,
): JobSuccess {
  const job = row ? snapshotFromJobRow(row, nowIso()) : virtualOpenJob(name);
  return JobSuccessSchema.parse(token ? { action, job, token } : { action, job });
}

export async function applyJob(
  db: Queryable,
  input: JobInput,
  principal: Pick<AgentPrincipal, "name" | "actor_label">,
  policy: JobLeasePolicy = leasePolicyFromSeconds(),
): Promise<JobSuccess | ToolError> {
  const command = parseJobCommand(input);
  if (isToolError(command)) {
    return command;
  }

  if (command.action === "read") {
    const row = await getJobLeaseByName(db, command.name);
    return success("read", row, command.name);
  }

  if (command.action === "claim") {
    const ttl = resolveLeaseTtl(command.ttlSeconds, policy);
    if (isToolError(ttl)) {
      return ttl;
    }
    if (command.token) {
      const live = await getLiveJobLeaseByToken(db, hashJobToken(command.token));
      if (live && live.name === command.name) {
        const kept = await casHeartbeatJobLease(db, {
          name: command.name,
          tokenSha256: hashJobToken(command.token),
          ttlSeconds: ttl,
        });
        if (kept) {
          return success("claim", kept, command.name, command.token);
        }
      }
      if (live && live.name !== command.name) {
        return toolError(
          JOB_TOKEN_STALE_ERROR,
          "token is live on a different name. release or finish that name, or claim without this token.",
        );
      }
    }
    const token = mintJobToken();
    const taken = await casClaimJobLease(db, {
      name: command.name,
      holderName: principal.name,
      holderLabel: principal.actor_label,
      tokenSha256: hashJobToken(token),
      ttlSeconds: ttl,
    });
    if (taken) {
      return success("claim", taken, command.name, token);
    }
    const current = await getJobLeaseByName(db, command.name);
    return toolError(JOB_HELD_ERROR, current ? heldSuggestion(current) : JOB_HELD_SUGGESTION);
  }

  const hash = hashJobToken(command.token);
  const written =
    command.action === "finish"
      ? await casFinishJobLease(db, { name: command.name, tokenSha256: hash })
      : await casReleaseJobLease(db, { name: command.name, tokenSha256: hash });
  if (!written) {
    return toolError(JOB_TOKEN_STALE_ERROR, JOB_TOKEN_STALE_SUGGESTION);
  }
  return success(command.action, written, command.name);
}
