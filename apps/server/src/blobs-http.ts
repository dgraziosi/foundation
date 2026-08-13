import {
  getBlobById,
  readBlobBytes,
  type Pool,
} from "@foundation/db";
import { isUuid } from "@foundation/schema";
import type { Request, Response } from "express";
import type { AppConfig } from "./config.js";

const MEDIA_TYPE_RE =
  /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/i;

export async function sendBlob(
  pool: Pool,
  config: AppConfig,
  req: Request,
  res: Response,
): Promise<void> {
  const id = String(req.params.id ?? "");
  if (!isUuid(id)) {
    res.status(400).json({ error: "Invalid blob id" });
    return;
  }
  const blob = await getBlobById(pool, id);
  if (!blob) {
    res.status(404).json({ error: "Blob not found" });
    return;
  }
  const bytes = await readBlobBytes(config.FOUNDATION_DATA, blob);
  if ("error" in bytes) {
    res.status(404).json({ error: bytes.error });
    return;
  }
  const mediaType = MEDIA_TYPE_RE.test(blob.media_type)
    ? blob.media_type
    : "application/octet-stream";
  res.setHeader("Content-Type", mediaType);
  res.setHeader("Content-Length", String(bytes.byteLength));
  res.setHeader("ETag", `"${blob.sha256}"`);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.status(200).end(bytes);
}
