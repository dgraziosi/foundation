import assert from "node:assert/strict";
import { test } from "node:test";
import {
  BLOB_MAX_BYTES,
  blobRelativePath,
  isValidBlobRelativePath,
  isValidUploadSourcePath,
} from "./blobs.js";
import {
  DEFAULT_PAYLOAD,
  extractPayloadText,
  storedBlobPayload,
  validateBlobRelativePath,
  validateInlinePayload,
  validateUploadSourcePath,
} from "./payload.js";
import { PayloadSchema, UpsertPayloadSchema } from "./index.js";

test("default payload is inline markdown", () => {
  const parsed = PayloadSchema.parse(DEFAULT_PAYLOAD);
  assert.equal(parsed.media_type, "text/markdown");
  assert.equal(parsed.storage, "inline");
  assert.equal(parsed.body, "");
});

test("inline html, markdown, json, and plain payloads round-trip parse", () => {
  for (const media_type of ["text/markdown", "text/html", "application/json", "text/plain"]) {
    const body = media_type === "application/json" ? "{\"when\":\"2026-08-13\"}" : "# hi";
    PayloadSchema.parse({ media_type, storage: "inline", body });
    assert.equal(
      validateInlinePayload({ media_type, storage: "inline", body }),
      null,
    );
  }
});

test("blob storage is allowed with blob_id and does not require body", () => {
  const payload = {
    media_type: "application/pdf",
    storage: "blob" as const,
    blob_id: "11111111-1111-4111-8111-111111111111",
  };
  PayloadSchema.parse(payload);
  assert.equal(validateInlinePayload(payload), null);
  assert.equal(storedBlobPayload("application/pdf", payload.blob_id).body, undefined);
});

test("upsert blob ingest accepts bytes_base64 or source_path without blob_id", () => {
  UpsertPayloadSchema.parse({
    media_type: "application/pdf",
    storage: "blob",
    bytes_base64: Buffer.from("tiny").toString("base64"),
  });
  UpsertPayloadSchema.parse({
    media_type: "application/pdf",
    storage: "blob",
    source_path: "fixture.pdf",
  });
  UpsertPayloadSchema.parse({
    media_type: "application/pdf",
    storage: "blob",
    blob_id: "11111111-1111-4111-8111-111111111111",
  });
});

test("upsert blob ingest rejects mixing blob_id with bytes_base64", () => {
  const parsed = UpsertPayloadSchema.safeParse({
    media_type: "application/pdf",
    storage: "blob",
    blob_id: "11111111-1111-4111-8111-111111111111",
    bytes_base64: "dGlueQ==",
  });
  assert.equal(parsed.success, false);
});

test("application/json body must parse as JSON", () => {
  const err = validateInlinePayload({
    media_type: "application/json",
    storage: "inline",
    body: "not-json",
  });
  assert.ok(err);
  assert.match(err.error, /valid JSON/);
});

test("extractPayloadText strips HTML tags for itinerary search", () => {
  const text = extractPayloadText({
    media_type: "text/html",
    storage: "inline",
    body: "<html><body><h1>Kyoto</h1><ol><li>Fushimi Inari</li></ol></body></html>",
  });
  assert.match(text, /Kyoto/);
  assert.match(text, /Fushimi Inari/);
  assert.equal(text.includes("<"), false);
});

test("extractPayloadText stringifies JSON payloads", () => {
  const text = extractPayloadText({
    media_type: "application/json",
    storage: "inline",
    body: '{"city":"Osaka","days":3}',
  });
  assert.match(text, /Osaka/);
  assert.match(text, /days/);
});

test("extractPayloadText ignores blob payloads", () => {
  assert.equal(
    extractPayloadText({
      media_type: "application/pdf",
      storage: "blob",
      blob_id: "11111111-1111-4111-8111-111111111111",
    }),
    "",
  );
});

test("blob relative path must be blobs/<uuid>; traversal and absolute paths are rejected", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  assert.equal(blobRelativePath(id), `blobs/${id}`);
  assert.equal(isValidBlobRelativePath(`blobs/${id}`), true);
  assert.equal(validateBlobRelativePath(`blobs/${id}`), null);

  for (const bad of [
    "/etc/passwd",
    "/blobs/" + id,
    "../blobs/" + id,
    "blobs/../" + id,
    "blobs/../../etc/passwd",
    "blobs/" + id + "/extra",
    "other/" + id,
    "blobs/not-a-uuid",
    "",
  ]) {
    assert.equal(isValidBlobRelativePath(bad), false, bad);
    const err = validateBlobRelativePath(bad);
    assert.ok(err, bad);
    assert.match(err.error, /path/i);
  }
  assert.equal(BLOB_MAX_BYTES, 20 * 1024 * 1024);
});

test("upload source_path rejects .. and absolute paths", () => {
  assert.equal(isValidUploadSourcePath("fixture.pdf"), true);
  assert.equal(isValidUploadSourcePath("uploads/fixture.pdf"), true);
  assert.equal(validateUploadSourcePath("fixture.pdf"), null);

  for (const bad of ["../secret.pdf", "/tmp/secret.pdf", "uploads/../../etc/passwd", "~/file.pdf"]) {
    assert.equal(isValidUploadSourcePath(bad), false, bad);
    const err = validateUploadSourcePath(bad);
    assert.ok(err, bad);
    assert.match(err.error, /traversal|empty/i);
  }
});
