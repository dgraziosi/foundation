import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { access, mkdtemp, mkdir, readFile, readdir, realpath, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { BLOB_MAX_BYTES, isValidBlobRelativePath } from "@foundation/schema";
import { createPool, migrate, type Pool } from "./index.js";
import {
  BLOB_DIR_MODE,
  BLOB_FILE_MODE,
  UPLOAD_DIR_MODE,
  ensureBlobLayout,
  getBlobById,
  ingestBlobBytes,
  ingestBlobFromUpload,
  resolveUploadPath,
  sha256Hex,
} from "./blobs.js";
import { withTransaction } from "./tx.js";

const databaseUrl = process.env.DATABASE_URL;

function tinyPdf(): Buffer {
  return Buffer.from(
    "%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 72 72]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
    "utf8",
  );
}

async function poolForSchema(schema: string): Promise<Pool> {
  const admin = createPool(databaseUrl!);
  await admin.query("CREATE EXTENSION IF NOT EXISTS pgcrypto");
  await admin.query("CREATE EXTENSION IF NOT EXISTS vector");
  await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await admin.query(`CREATE SCHEMA ${schema}`);
  await admin.end();
  const pool = createPool(databaseUrl!, { options: `-c search_path=${schema},public` });
  await migrate(pool);
  return pool;
}

test("resolveUploadPath rejects traversal and absolute paths", () => {
  const root = "/tmp/foundation-data";
  for (const bad of ["../secret.pdf", "/etc/passwd", "uploads/../../etc/passwd"]) {
    const result = resolveUploadPath(root, bad);
    assert.equal(typeof result, "object");
    if (typeof result === "object") {
      assert.match(result.error, /traversal/i);
    }
  }
  const ok = resolveUploadPath(root, "fixture.pdf");
  assert.equal(typeof ok, "string");
  assert.equal(ok, join(root, "uploads", "fixture.pdf"));
});

test("docker-compose db-init keeps blobs 0700 and uploads as a host drop-box", async () => {
  const compose = await readFile(
    join(fileURLToPath(new URL(".", import.meta.url)), "../../../docker-compose.yml"),
    "utf8",
  );
  assert.match(compose, /chmod 0700 \/data\/blobs/);
  assert.match(compose, /chmod 1777 \/data\/uploads/);
  assert.equal(/chmod 0700 \/data\/blobs \/data\/uploads/.test(compose), false);
  assert.equal(/chmod 0?777 \/data\/blobs/.test(compose), false);
});

test("ensureBlobLayout uses 0700 on blobs and 1777 sticky on uploads", async () => {
  const root = await mkdtemp(join(tmpdir(), "foundation-blob-layout-"));
  await ensureBlobLayout(root);
  const blobs = await stat(join(root, "blobs"));
  const uploads = await stat(join(root, "uploads"));
  assert.equal(blobs.mode & 0o777, BLOB_DIR_MODE);
  assert.equal(uploads.mode & 0o7777, UPLOAD_DIR_MODE);
});

test("blob ingest round-trip, sha256 dedup, and path constraints", { skip: !databaseUrl }, async (t) => {
  if (!databaseUrl) {
    return;
  }
  const pool = await poolForSchema("slice10_blobs");
  const root = await mkdtemp(join(tmpdir(), "foundation-blob-data-"));
  try {
    await t.test("writes bytes under blobs/<uuid> with sha256 and 0600 file mode", async () => {
      const pdf = tinyPdf();
      const ingested = await ingestBlobBytes(
        pool,
        { dataDir: root },
        { mediaType: "application/pdf", bytes: pdf },
      );
      assert.equal("error" in ingested, false);
      if ("error" in ingested) return;
      const blob = ingested.blob;
      assert.equal(ingested.created, true);
      assert.equal(isValidBlobRelativePath(blob.path), true);
      assert.equal(blob.media_type, "application/pdf");
      assert.equal(blob.byte_size, pdf.byteLength);
      assert.equal(blob.sha256, sha256Hex(pdf));
      assert.equal(blob.sha256, createHash("sha256").update(pdf).digest("hex"));
      const onDisk = await readFile(join(root, blob.path));
      assert.deepEqual(onDisk, pdf);
      const mode = (await stat(join(root, blob.path))).mode & 0o777;
      assert.equal(mode, BLOB_FILE_MODE);
    });

    await t.test("dedups by sha256", async () => {
      const pdf = tinyPdf();
      const first = await ingestBlobBytes(
        pool,
        { dataDir: root },
        { mediaType: "application/pdf", bytes: pdf },
      );
      const second = await ingestBlobBytes(
        pool,
        { dataDir: root },
        { mediaType: "application/pdf", bytes: pdf },
      );
      assert.equal("error" in first, false);
      assert.equal("error" in second, false);
      if ("error" in first || "error" in second) return;
      assert.equal(first.blob.id, second.blob.id);
      assert.equal(first.blob.sha256, second.blob.sha256);
      assert.equal(second.created, false);
    });

    await t.test("ingests an upload into blobs without unlinking until caller commits", async () => {
      await mkdir(join(root, "uploads"), { recursive: true });
      const pdf = tinyPdf();
      const uploadPath = join(root, "uploads", "fixture.pdf");
      await writeFile(uploadPath, pdf);
      const ingested = await ingestBlobFromUpload(
        pool,
        { dataDir: root },
        { mediaType: "application/pdf", sourcePath: "fixture.pdf" },
      );
      assert.equal("error" in ingested, false);
      if ("error" in ingested) return;
      const fetched = await getBlobById(pool, ingested.blob.id);
      assert.equal(fetched?.sha256, ingested.blob.sha256);
      assert.equal(ingested.sourceAbs, await realpath(uploadPath));
      await access(uploadPath, fsConstants.F_OK);

      const capped = await ingestBlobBytes(
        pool,
        { dataDir: root, maxBytes: 4 },
        { mediaType: "application/octet-stream", bytes: Buffer.from("too-big") },
      );
      assert.equal("error" in capped, true);
      if (!("error" in capped)) return;
      assert.match(capped.error, /size cap/);
    });

    await t.test("sha256 conflict inside a transaction does not abort the tx", async () => {
      const pdf = Buffer.from(`%PDF-1.1\nrace-${randomUUID()}\n%%EOF\n`, "utf8");
      const digest = sha256Hex(pdf);
      const winnerId = randomUUID();
      const winnerPath = `blobs/${winnerId}`;
      await mkdir(join(root, "blobs"), { recursive: true });
      await writeFile(join(root, winnerPath), pdf);

      const holder = await pool.connect();
      try {
        await holder.query("BEGIN");
        await holder.query(
          `INSERT INTO blobs (id, media_type, byte_size, sha256, path)
           VALUES ($1, 'application/pdf', $2, $3, $4)`,
          [winnerId, pdf.byteLength, digest, winnerPath],
        );

        const ingestPromise = withTransaction(pool, async (client) => {
          const ingested = await ingestBlobBytes(
            client,
            { dataDir: root },
            { mediaType: "application/pdf", bytes: pdf },
          );
          const { rows } = await client.query<{ ok: number }>("SELECT 1 AS ok");
          assert.equal(rows[0]?.ok, 1);
          return ingested;
        });

        const deadline = Date.now() + 5000;
        while (Date.now() < deadline) {
          const { rows } = await pool.query<{ n: string }>(
            `SELECT COUNT(*)::text AS n
             FROM pg_stat_activity
             WHERE wait_event_type = 'Lock' AND state = 'active'`,
          );
          if (Number(rows[0]?.n) > 0) {
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 25));
        }
        await holder.query("COMMIT");

        const ingested = await ingestPromise;
        assert.equal("error" in ingested, false);
        if ("error" in ingested) return;
        assert.equal(ingested.blob.id, winnerId);
        assert.equal(ingested.created, false);
        const leftover = (await readdir(join(root, "blobs"))).filter((name) => name !== winnerId);
        for (const name of leftover) {
          if (name.endsWith(".tmp")) {
            continue;
          }
          const bytes = await readFile(join(root, "blobs", name));
          assert.notDeepEqual(bytes, pdf);
        }
      } finally {
        try {
          await holder.query("ROLLBACK");
        } catch {
          // already committed
        }
        holder.release();
      }
    });

    await t.test("database rejects path traversal on blobs.path", async () => {
      await assert.rejects(
        () =>
          pool.query(
            `INSERT INTO blobs (media_type, byte_size, sha256, path)
             VALUES ('application/pdf', 1, $1, $2)`,
            ["a".repeat(64), "../etc/passwd"],
          ),
        /blobs_path_relative|check constraint/i,
      );
      await assert.rejects(
        () =>
          pool.query(
            `INSERT INTO blobs (media_type, byte_size, sha256, path)
             VALUES ('application/pdf', 1, $1, $2)`,
            ["b".repeat(64), "/tmp/evil"],
          ),
        /blobs_path_relative|check constraint/i,
      );
    });

    await t.test("default cap is 20MB", () => {
      assert.equal(BLOB_MAX_BYTES, 20 * 1024 * 1024);
    });
  } finally {
    await pool.end();
  }
});
