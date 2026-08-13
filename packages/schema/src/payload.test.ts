import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_PAYLOAD, extractPayloadText, validateInlinePayload } from "./payload.js";
import { PayloadSchema } from "./types.js";

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

test("blob storage is rejected until the blob slice", () => {
  const payload = {
    media_type: "text/html",
    storage: "blob" as const,
    blob_id: "11111111-1111-4111-8111-111111111111",
  };
  PayloadSchema.parse(payload);
  const err = validateInlinePayload(payload);
  assert.ok(err);
  assert.match(err.error, /Blob payloads are not implemented/);
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
      media_type: "text/html",
      storage: "blob",
      blob_id: "11111111-1111-4111-8111-111111111111",
    }),
    "",
  );
});
