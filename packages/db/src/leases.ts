import type { JobLeaseRow } from "@foundation/schema";
import type { Queryable } from "./tx.js";
import { iso } from "./tx.js";

type LeaseSqlRow = {
  name: string;
  holder_name: string | null;
  holder_label: string | null;
  token_sha256: string | null;
  claimed_at: Date | string | null;
  expires_at: Date | string | null;
  last_run_at: Date | string | null;
  last_run_holder_name: string | null;
  last_run_holder_label: string | null;
};

function isoOrNull(value: Date | string | null): string | null {
  return value === null ? null : iso(value);
}

export function mapJobLease(row: LeaseSqlRow): JobLeaseRow {
  return {
    name: row.name,
    holder_name: row.holder_name,
    holder_label: row.holder_label,
    token_sha256: row.token_sha256,
    claimed_at: isoOrNull(row.claimed_at),
    expires_at: isoOrNull(row.expires_at),
    last_run_at: isoOrNull(row.last_run_at),
    last_run_holder_name: row.last_run_holder_name,
    last_run_holder_label: row.last_run_holder_label,
  };
}

export type ClaimLeaseArgs = {
  name: string;
  holderName: string;
  holderLabel: string;
  tokenSha256: string;
  ttlSeconds: number;
};

export type TokenLeaseArgs = {
  name: string;
  tokenSha256: string;
  ttlSeconds?: number;
};

export async function getJobLeaseByName(db: Queryable, name: string): Promise<JobLeaseRow | null> {
  const { rows } = await db.query<Omit<LeaseSqlRow, "token_sha256">>(
    `SELECT name, holder_name, holder_label, claimed_at, expires_at,
            last_run_at, last_run_holder_name, last_run_holder_label
       FROM job_leases
      WHERE name = $1`,
    [name],
  );
  return rows[0] ? mapJobLease({ ...rows[0], token_sha256: null }) : null;
}

export async function getLiveJobLeaseByToken(
  db: Queryable,
  tokenSha256: string,
): Promise<JobLeaseRow | null> {
  const { rows } = await db.query<LeaseSqlRow>(
    `SELECT name, holder_name, holder_label, token_sha256, claimed_at, expires_at,
            last_run_at, last_run_holder_name, last_run_holder_label
       FROM job_leases
      WHERE token_sha256 = $1
        AND expires_at > date_trunc('milliseconds', clock_timestamp())`,
    [tokenSha256],
  );
  return rows[0] ? mapJobLease(rows[0]) : null;
}

export async function casClaimJobLease(
  db: Queryable,
  args: ClaimLeaseArgs,
): Promise<JobLeaseRow | null> {
  const { rows } = await db.query<LeaseSqlRow>(
    `INSERT INTO job_leases (
        name, holder_name, holder_label, token_sha256,
        claimed_at, expires_at, updated_at
      ) VALUES (
        $1, $2, $3, $4,
        date_trunc('milliseconds', clock_timestamp()),
        date_trunc('milliseconds', clock_timestamp()) + make_interval(secs => $5),
        date_trunc('milliseconds', clock_timestamp())
      )
      ON CONFLICT (name) DO UPDATE SET
        holder_name = EXCLUDED.holder_name,
        holder_label = EXCLUDED.holder_label,
        token_sha256 = EXCLUDED.token_sha256,
        claimed_at = EXCLUDED.claimed_at,
        expires_at = EXCLUDED.expires_at,
        updated_at = EXCLUDED.updated_at
      WHERE job_leases.token_sha256 IS NULL
         OR job_leases.expires_at <= date_trunc('milliseconds', clock_timestamp())
      RETURNING name, holder_name, holder_label, token_sha256, claimed_at, expires_at,
                last_run_at, last_run_holder_name, last_run_holder_label`,
    [args.name, args.holderName, args.holderLabel, args.tokenSha256, args.ttlSeconds],
  );
  return rows[0] ? mapJobLease(rows[0]) : null;
}

export async function casHeartbeatJobLease(
  db: Queryable,
  args: TokenLeaseArgs,
): Promise<JobLeaseRow | null> {
  const ttl = args.ttlSeconds;
  if (ttl === undefined) {
    return null;
  }
  const { rows } = await db.query<LeaseSqlRow>(
    `UPDATE job_leases
        SET expires_at = date_trunc('milliseconds', clock_timestamp()) + make_interval(secs => $3),
            updated_at = date_trunc('milliseconds', clock_timestamp())
      WHERE name = $1
        AND token_sha256 = $2
        AND expires_at > date_trunc('milliseconds', clock_timestamp())
      RETURNING name, holder_name, holder_label, token_sha256, claimed_at, expires_at,
                last_run_at, last_run_holder_name, last_run_holder_label`,
    [args.name, args.tokenSha256, ttl],
  );
  return rows[0] ? mapJobLease(rows[0]) : null;
}

export async function casFinishJobLease(
  db: Queryable,
  args: TokenLeaseArgs,
): Promise<JobLeaseRow | null> {
  const { rows } = await db.query<LeaseSqlRow>(
    `UPDATE job_leases
        SET last_run_at = date_trunc('milliseconds', clock_timestamp()),
            last_run_holder_name = holder_name,
            last_run_holder_label = holder_label,
            holder_name = NULL,
            holder_label = NULL,
            token_sha256 = NULL,
            claimed_at = NULL,
            expires_at = NULL,
            updated_at = date_trunc('milliseconds', clock_timestamp())
      WHERE name = $1
        AND token_sha256 = $2
        AND expires_at > date_trunc('milliseconds', clock_timestamp())
      RETURNING name, holder_name, holder_label, token_sha256, claimed_at, expires_at,
                last_run_at, last_run_holder_name, last_run_holder_label`,
    [args.name, args.tokenSha256],
  );
  return rows[0] ? mapJobLease(rows[0]) : null;
}

export async function casReleaseJobLease(
  db: Queryable,
  args: TokenLeaseArgs,
): Promise<JobLeaseRow | null> {
  const { rows } = await db.query<LeaseSqlRow>(
    `UPDATE job_leases
        SET holder_name = NULL,
            holder_label = NULL,
            token_sha256 = NULL,
            claimed_at = NULL,
            expires_at = NULL,
            updated_at = date_trunc('milliseconds', clock_timestamp())
      WHERE name = $1
        AND token_sha256 = $2
        AND expires_at > date_trunc('milliseconds', clock_timestamp())
      RETURNING name, holder_name, holder_label, token_sha256, claimed_at, expires_at,
                last_run_at, last_run_holder_name, last_run_holder_label`,
    [args.name, args.tokenSha256],
  );
  return rows[0] ? mapJobLease(rows[0]) : null;
}
