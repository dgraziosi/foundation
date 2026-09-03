import assert from "node:assert/strict";
import { test } from "node:test";
import { isToolError } from "./mcp-io.js";
import {
  DEFAULT_LEASE_TTL_SECONDS,
  JOB_TTL_SUGGESTION,
  JobInputSchema,
  JobSuccessSchema,
  hashJobToken,
  parseJobCommand,
  resolveLeaseTtl,
  snapshotFromJobRow,
  virtualOpenJob,
} from "./job-lease.js";

test("job input accepts claim with name only", () => {
  const parsed = JobInputSchema.parse({ action: "claim", name: "dream" });
  assert.equal(parsed.action, "claim");
  assert.equal(parsed.name, "dream");
});

test("job name allows skill-folder hyphens", () => {
  JobInputSchema.parse({ action: "read", name: "vault-health" });
  JobInputSchema.parse({ action: "read", name: "backup_vault" });
  assert.throws(() => JobInputSchema.parse({ action: "read", name: "Dream" }));
  assert.throws(() => JobInputSchema.parse({ action: "read", name: "1dream" }));
});

test("parseJobCommand refuses token on read and ttl on finish", () => {
  const read = parseJobCommand({
    action: "read",
    name: "dream",
    token: "11111111-1111-4111-8111-111111111111",
  });
  assert.equal(isToolError(read), true);
  const finish = parseJobCommand({
    action: "finish",
    name: "dream",
    ttl_seconds: 60,
  });
  assert.equal(isToolError(finish), true);
  const ok = parseJobCommand({
    action: "finish",
    name: "dream",
    token: "11111111-1111-4111-8111-111111111111",
  });
  assert.equal(isToolError(ok), false);
});

test("resolveLeaseTtl uses policy default and refuses out of range", () => {
  const policy = { ttlSeconds: DEFAULT_LEASE_TTL_SECONDS };
  assert.equal(resolveLeaseTtl(undefined, policy), DEFAULT_LEASE_TTL_SECONDS);
  assert.equal(resolveLeaseTtl(60, policy), 60);
  const miss = resolveLeaseTtl(10, policy);
  assert.equal(isToolError(miss), true);
  if (isToolError(miss)) {
    assert.equal(miss.suggestion, JOB_TTL_SUGGESTION);
  }
});

test("snapshot treats a live holder as held without reading a token hash", () => {
  const now = "2026-09-03T22:00:00.000Z";
  const snap = snapshotFromJobRow(
    {
      name: "dream",
      holder_name: "vault-keeper",
      holder_label: "Vault Keeper",
      token_sha256: null,
      claimed_at: "2026-09-03T21:50:00.000Z",
      expires_at: "2026-09-03T22:15:00.000Z",
      last_run_at: null,
      last_run_holder_name: null,
      last_run_holder_label: null,
    },
    now,
  );
  assert.equal(snap.held, true);
  assert.equal(snap.holder?.label, "Vault Keeper");
  assert.equal(snap.until, "2026-09-03T22:15:00.000Z");
  assert.equal("token" in snap, false);
});

test("snapshot hides expired holder and never includes a token", () => {
  const now = "2026-09-03T22:00:00.000Z";
  const snap = snapshotFromJobRow(
    {
      name: "dream",
      holder_name: "vault-keeper",
      holder_label: "Vault Keeper",
      token_sha256: "a".repeat(64),
      claimed_at: "2026-09-03T21:00:00.000Z",
      expires_at: "2026-09-03T21:30:00.000Z",
      last_run_at: "2026-09-02T06:00:00.000Z",
      last_run_holder_name: "vault-keeper",
      last_run_holder_label: "Vault Keeper",
    },
    now,
  );
  assert.equal(snap.held, false);
  assert.equal(snap.holder, null);
  assert.equal(snap.until, null);
  assert.equal(snap.last_run?.finished_at, "2026-09-02T06:00:00.000Z");
  assert.equal("token" in snap, false);
});

test("JobSuccessSchema allows token only as an optional field", () => {
  const open = virtualOpenJob("dream");
  JobSuccessSchema.parse({ action: "read", job: open });
  JobSuccessSchema.parse({
    action: "claim",
    job: { ...open, held: true, holder: { name: "root", label: "root" }, until: "2026-09-03T22:15:00.000Z" },
    token: "11111111-1111-4111-8111-111111111111",
  });
});

test("hashJobToken is stable hex", () => {
  const hash = hashJobToken("11111111-1111-4111-8111-111111111111");
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.equal(hash, hashJobToken("11111111-1111-4111-8111-111111111111"));
});
