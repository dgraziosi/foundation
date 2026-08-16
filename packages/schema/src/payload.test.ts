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
  extractDataText,
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

test("extractPayloadText strips HTML tags and keeps attribute values", () => {
  const text = extractPayloadText({
    media_type: "text/html",
    storage: "inline",
    body: '<html><body><h1>Kyoto</h1><img alt="café terrace in the park" src="x.jpg"><ol><li>Fushimi Inari</li></ol></body></html>',
  });
  assert.match(text, /Kyoto/);
  assert.match(text, /Fushimi Inari/);
  assert.match(text, /café terrace in the park/);
  assert.equal(text.includes("<"), false);
});

test("extractPayloadText keeps body text between a head script and a footer script", () => {
  const text = extractPayloadText({
    media_type: "text/html",
    storage: "inline",
    body: '<html><head><script>var HEADTOKEN="drop-me";</script></head><body><p>visible meadow report</p></body><script>var FOOTTOKEN="drop-me-too";</script></html>',
  });
  assert.match(text, /visible meadow report/);
  assert.equal(text.includes("HEADTOKEN"), false);
  assert.equal(text.includes("FOOTTOKEN"), false);
});

test("extractPayloadText pulls JSON string values, not the payload wrapper", () => {
  const text = extractPayloadText({
    media_type: "application/json",
    storage: "inline",
    body: '{"city":"Osaka","days":3}',
  });
  assert.match(text, /Osaka/);
  assert.match(text, /3/);
  assert.equal(text.includes("media_type"), false);
  assert.equal(text.includes("storage"), false);
});

test("extractDataText walks nested string values", () => {
  const text = extractDataText({ nickname: "Ada", role: "colleague", extra: { note: "café" } });
  assert.match(text, /Ada/);
  assert.match(text, /colleague/);
  assert.match(text, /café/);
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
