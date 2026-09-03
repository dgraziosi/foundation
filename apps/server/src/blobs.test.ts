import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, mkdtemp, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createPool, migrate, seedSystemOntology, type Pool } from "@foundation/db";
import { isToolError } from "@foundation/schema";
import { createApp } from "./app.js";
import {
  deleteGraphNode,
  getGraphNode,
  listGraphActivity,
  upsertGraphNode,
} from "./graph.js";
import { DESTRUCTIVE } from "./write-context.js";

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
  await seedSystemOntology(pool);
  return pool;
}

test("blob nodes: ingest, get metadata, HTTP bytes, snapshots, delete keeps files", {
  skip: !databaseUrl,
}, async (t) => {
  if (!databaseUrl) {
    return;
  }
  const pool = await poolForSchema("graph_blobs");
  const dataDir = await mkdtemp(join(tmpdir(), "foundation-blobs-"));
  const blobs = { dataDir };
  const apiKey = "test-foundation-key";
  const app = createApp(pool, {
    FOUNDATION_API_KEY: apiKey,
    FOUNDATION_DATA: dataDir,
  });
  const httpServer = app.listen(0);
  await new Promise<void>((resolve) => httpServer.on("listening", () => resolve()));
  const address = httpServer.address();
  assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;

  try {
    await t.test("round-trip a tiny PDF via bytes_base64; get does not inline the body", async () => {
      const pdf = tinyPdf();
      const created = await upsertGraphNode(
        pool,
        {
          type: "note",
          title: "Synthetic PDF fixture",
          payload: {
            media_type: "application/pdf",
            storage: "blob",
            bytes_base64: pdf.toString("base64"),
          },
        },
        blobs,
      );
      assert.equal(isToolError(created), false);
      if (isToolError(created)) return;
      assert.equal(created.node.payload.storage, "blob");
      assert.equal(created.node.payload.body, undefined);
      assert.ok(created.node.payload.blob_id);

      const got = await getGraphNode(pool, created.node.id, { blobs });
      assert.equal(isToolError(got), false);
      if (isToolError(got)) return;
      assert.equal(got.node.payload.storage, "blob");
      assert.equal(got.node.payload.body, undefined);
      assert.ok(got.blob);
      assert.equal(got.blob?.sha256, createHash("sha256").update(pdf).digest("hex"));
      assert.equal(got.blob?.media_type, "application/pdf");
      const json = JSON.stringify(got);
      assert.equal(json.includes(pdf.toString("base64")), false);
      assert.ok(json.length < 8_000);

      const listed = await listGraphActivity(pool, {
        action: "create",
        target: created.node.id,
      });
      assert.equal(isToolError(listed), false);
      if (isToolError(listed)) return;
      const row = listed.activities[0];
      assert.ok(row);
      const after = row.after as {
        payload?: { body?: string; blob_id?: string };
        blob?: { sha256?: string; blob_id?: string };
      };
      assert.equal(after.payload?.body, undefined);
      assert.equal(after.payload?.blob_id, created.node.payload.blob_id);
      assert.equal(after.blob?.sha256, got.blob?.sha256);
      assert.equal(JSON.stringify(row).includes(pdf.toString("base64")), false);
    });

    await t.test("title-only upsert preserves blob_id", async () => {
      const pdf = tinyPdf();
      const created = await upsertGraphNode(
        pool,
        {
          type: "note",
          title: "Keep blob",
          payload: {
            media_type: "application/pdf",
            storage: "blob",
            bytes_base64: pdf.toString("base64"),
          },
        },
        blobs,
      );
      assert.equal(isToolError(created), false);
      if (isToolError(created)) return;
      const blobId = created.node.payload.blob_id;
      assert.ok(blobId);

      const updated = await upsertGraphNode(
        pool,
        {
          id: created.node.id,
          type: "note",
          title: "Renamed blob note",
          base_updated_at: created.node.updated_at,
        },
        blobs,
      );
      assert.equal(isToolError(updated), false);
      if (isToolError(updated)) return;
      assert.equal(updated.node.title, "Renamed blob note");
      assert.equal(updated.node.payload.storage, "blob");
      assert.equal(updated.node.payload.blob_id, blobId);
      assert.equal(updated.node.payload.body, undefined);

      const got = await getGraphNode(pool, created.node.id, { blobs });
      assert.equal(isToolError(got), false);
      if (isToolError(got)) return;
      assert.equal(got.node.payload.blob_id, blobId);
      assert.equal(got.blob?.id, blobId);
    });

    await t.test("HTTP GET /blobs/:id returns bytes with API key", async () => {
      const pdf = tinyPdf();
      const created = await upsertGraphNode(
        pool,
        {
          type: "note",
          title: "HTTP PDF",
          payload: {
            media_type: "application/pdf",
            storage: "blob",
            bytes_base64: pdf.toString("base64"),
          },
        },
        blobs,
      );
      if (isToolError(created) || !created.node.payload.blob_id) {
        assert.fail("upsert failed");
        return;
      }
      const blobId = created.node.payload.blob_id;
      const denied = await fetch(`${origin}/blobs/${blobId}`);
      assert.equal(denied.status, 401);

      const ok = await fetch(`${origin}/blobs/${blobId}`, {
        headers: { authorization: `ApiKey ${apiKey}` },
      });
      assert.equal(ok.status, 200);
      assert.equal(ok.headers.get("content-type"), "application/pdf");
      assert.match(ok.headers.get("content-disposition") ?? "", /attachment/i);
      const body = Buffer.from(await ok.arrayBuffer());
      assert.deepEqual(body, pdf);
    });

    await t.test("uploads source_path is moved into blobs/; traversal is rejected", async () => {
      const pdf = tinyPdf();
      await mkdir(join(dataDir, "uploads"), { recursive: true });
      await writeFile(join(dataDir, "uploads", "moved.pdf"), pdf);
      const created = await upsertGraphNode(
        pool,
        {
          type: "note",
          title: "Uploaded PDF",
          payload: {
            media_type: "application/pdf",
            storage: "blob",
            source_path: "moved.pdf",
          },
        },
        blobs,
      );
      assert.equal(isToolError(created), false);
      if (isToolError(created)) return;
      const blobPath = join(dataDir, "blobs", created.node.payload.blob_id!);
      assert.deepEqual(await readFile(blobPath), pdf);
      await assert.rejects(() => access(join(dataDir, "uploads", "moved.pdf"), fsConstants.F_OK));

      const traversal = await upsertGraphNode(
        pool,
        {
          type: "note",
          title: "evil",
          payload: {
            media_type: "application/pdf",
            storage: "blob",
            source_path: "../secret.pdf",
          },
        },
        blobs,
      );
      assert.equal(isToolError(traversal), true);
      if (!isToolError(traversal)) return;
      assert.match(traversal.error, /traversal/i);

      const absolute = await upsertGraphNode(
        pool,
        {
          type: "note",
          title: "evil abs",
          payload: {
            media_type: "application/pdf",
            storage: "blob",
            source_path: "/etc/passwd",
          },
        },
        blobs,
      );
      assert.equal(isToolError(absolute), true);
    });

    await t.test("over cap is a tool error; get does not inline a large blob into JSON", async () => {
      const over = await upsertGraphNode(
        pool,
        {
          type: "note",
          title: "too big",
          payload: {
            media_type: "application/octet-stream",
            storage: "blob",
            bytes_base64: Buffer.from("hello-world").toString("base64"),
          },
        },
        { dataDir, maxBytes: 4 },
      );
      assert.equal(isToolError(over), true);
      if (!isToolError(over)) return;
      assert.match(over.error, /size cap/);

      const bulky = Buffer.alloc(64 * 1024, 7);
      const created = await upsertGraphNode(
        pool,
        {
          type: "note",
          title: "bulky binary",
          payload: {
            media_type: "application/octet-stream",
            storage: "blob",
            bytes_base64: bulky.toString("base64"),
          },
        },
        blobs,
      );
      assert.equal(isToolError(created), false);
      if (isToolError(created)) return;
      const got = await getGraphNode(pool, created.node.id, { blobs });
      assert.equal(isToolError(got), false);
      if (isToolError(got)) return;
      const json = JSON.stringify(got);
      assert.ok(json.length < bulky.byteLength);
      assert.equal(got.node.payload.body, undefined);
      assert.equal(json.includes(bulky.toString("base64")), false);
    });

    await t.test("failed upsert to a deleted node does not ingest or consume the upload", async () => {
      const created = await upsertGraphNode(pool, { type: "note", title: "doomed" });
      assert.equal(isToolError(created), false);
      if (isToolError(created)) return;
      const deleted = await deleteGraphNode(pool, {
        id: created.node.id,
        base_updated_at: created.node.updated_at,
      }, DESTRUCTIVE);
      assert.equal(isToolError(deleted), false);

      const uniquePdf = Buffer.from(`%PDF-1.1\norphan-${created.node.id}\n%%EOF\n`, "utf8");
      const digest = createHash("sha256").update(uniquePdf).digest("hex");
      await mkdir(join(dataDir, "uploads"), { recursive: true });
      const uploadName = `keep-me-${created.node.id}.pdf`;
      const uploadPath = join(dataDir, "uploads", uploadName);
      await writeFile(uploadPath, uniquePdf);

      const failedUpload = await upsertGraphNode(
        pool,
        {
          id: created.node.id,
          type: "note",
          title: "should fail",
          payload: {
            media_type: "application/pdf",
            storage: "blob",
            source_path: uploadName,
          },
        },
        blobs,
      );
      assert.equal(isToolError(failedUpload), true);
      if (!isToolError(failedUpload)) return;
      assert.match(failedUpload.error, /deleted/);
      await access(uploadPath, fsConstants.F_OK);
      const { rows: uploadRows } = await pool.query<{ id: string }>(
        "SELECT id FROM blobs WHERE sha256 = $1",
        [digest],
      );
      assert.equal(uploadRows.length, 0);

      const uniqueB64 = Buffer.from(`%PDF-1.1\nb64-${created.node.id}\n%%EOF\n`, "utf8");
      const b64Digest = createHash("sha256").update(uniqueB64).digest("hex");
      const failedB64 = await upsertGraphNode(
        pool,
        {
          id: created.node.id,
          type: "note",
          title: "should fail too",
          payload: {
            media_type: "application/pdf",
            storage: "blob",
            bytes_base64: uniqueB64.toString("base64"),
          },
        },
        blobs,
      );
      assert.equal(isToolError(failedB64), true);
      const { rows: b64Rows } = await pool.query<{ id: string }>(
        "SELECT id FROM blobs WHERE sha256 = $1",
        [b64Digest],
      );
      assert.equal(b64Rows.length, 0);

      const names = await readdir(join(dataDir, "blobs"));
      for (const name of names) {
        const bytes = await readFile(join(dataDir, "blobs", name));
        assert.notDeepEqual(bytes, uniquePdf);
        assert.notDeepEqual(bytes, uniqueB64);
      }
    });

    await t.test("soft-delete does not remove blob bytes", async () => {
      const pdf = tinyPdf();
      const created = await upsertGraphNode(
        pool,
        {
          type: "note",
          title: "keep bytes",
          payload: {
            media_type: "application/pdf",
            storage: "blob",
            bytes_base64: pdf.toString("base64"),
          },
        },
        blobs,
      );
      if (isToolError(created) || !created.node.payload.blob_id) {
        assert.fail("upsert failed");
        return;
      }
      const blobId = created.node.payload.blob_id;
      const filePath = join(dataDir, "blobs", blobId);
      const deleted = await deleteGraphNode(pool, {
        id: created.node.id,
        base_updated_at: created.node.updated_at,
      }, DESTRUCTIVE);
      assert.equal(isToolError(deleted), false);
      assert.equal((await stat(filePath)).isFile(), true);
      assert.deepEqual(await readFile(filePath), pdf);

      const still = await fetch(`${origin}/blobs/${blobId}`, {
        headers: { authorization: `ApiKey ${apiKey}` },
      });
      assert.equal(still.status, 200);
    });
  } finally {
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    await pool.end();
  }
});
