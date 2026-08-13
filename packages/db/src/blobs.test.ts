import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createHash } from "node:crypto";
import { BLOB_MAX_BYTES, isValidBlobRelativePath } from "@foundation/schema";
import { createPool, migrate, type Pool } from "./index.js";
import {
  BLOB_DIR_MODE,
  BLOB_FILE_MODE,
  ensureBlobLayout,
  getBlobById,
  ingestBlobBytes,
  ingestBlobFromUpload,
  resolveUploadPath,
  sha256Hex,
} from "./blobs.js";

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

test("ensureBlobLayout uses 0700 on blobs and uploads", async () => {
  const root = await mkdtemp(join(tmpdir(), "foundation-blob-layout-"));
  await ensureBlobLayout(root);
  const blobs = await stat(join(root, "blobs"));
  const uploads = await stat(join(root, "uploads"));
  assert.equal(blobs.mode & 0o777, BLOB_DIR_MODE);
  assert.equal(uploads.mode & 0o777, BLOB_DIR_MODE);
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
      const blob = await ingestBlobBytes(
        pool,
        { dataDir: root },
        { mediaType: "application/pdf", bytes: pdf },
      );
      assert.equal("error" in blob, false);
      if ("error" in blob) return;
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
      assert.equal(first.id, second.id);
      assert.equal(first.sha256, second.sha256);
    });

    await t.test("moves an upload into blobs and rejects over-cap", async () => {
      await mkdir(join(root, "uploads"), { recursive: true });
      const pdf = tinyPdf();
      await writeFile(join(root, "uploads", "fixture.pdf"), pdf);
      const blob = await ingestBlobFromUpload(
        pool,
        { dataDir: root },
        { mediaType: "application/pdf", sourcePath: "fixture.pdf" },
      );
      assert.equal("error" in blob, false);
      if ("error" in blob) return;
      const fetched = await getBlobById(pool, blob.id);
      assert.equal(fetched?.sha256, blob.sha256);

      const capped = await ingestBlobBytes(
        pool,
        { dataDir: root, maxBytes: 4 },
        { mediaType: "application/octet-stream", bytes: Buffer.from("too-big") },
      );
      assert.equal("error" in capped, true);
      if (!("error" in capped)) return;
      assert.match(capped.error, /size cap/);
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
