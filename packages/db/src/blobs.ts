import {
  BLOB_MAX_BYTES,
  blobRelativePath,
  formatBlobSizeCapError,
  toolError,
  validateBlobRelativePath,
  validateUploadSourcePath,
  type Blob,
  type ToolError,
} from "@foundation/schema";
import { createHash, randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, realpath, rename, stat, unlink, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { iso, isUniqueViolation, type Queryable } from "./tx.js";

export const BLOB_DIR_MODE = 0o700;
export const BLOB_FILE_MODE = 0o600;

export type BlobRuntime = {
  dataDir: string;
  maxBytes?: number;
};

type BlobRow = {
  id: string;
  media_type: string;
  byte_size: number;
  sha256: string;
  path: string;
  created_at: Date;
};

export function mapBlob(row: BlobRow): Blob {
  return {
    id: row.id,
    media_type: row.media_type,
    byte_size: Number(row.byte_size),
    sha256: row.sha256,
    path: row.path,
    created_at: iso(row.created_at),
  };
}

export async function ensureBlobLayout(dataDir: string): Promise<void> {
  const blobs = join(dataDir, "blobs");
  const uploads = join(dataDir, "uploads");
  await mkdir(blobs, { recursive: true, mode: BLOB_DIR_MODE });
  await mkdir(uploads, { recursive: true, mode: BLOB_DIR_MODE });
  await chmod(blobs, BLOB_DIR_MODE);
  await chmod(uploads, BLOB_DIR_MODE);
}

export async function getBlobById(db: Queryable, id: string): Promise<Blob | undefined> {
  const { rows } = await db.query<BlobRow>(
    `SELECT id, media_type, byte_size, sha256, path, created_at FROM blobs WHERE id = $1`,
    [id],
  );
  return rows[0] ? mapBlob(rows[0]) : undefined;
}

export async function getBlobBySha256(db: Queryable, sha256: string): Promise<Blob | undefined> {
  const { rows } = await db.query<BlobRow>(
    `SELECT id, media_type, byte_size, sha256, path, created_at FROM blobs WHERE sha256 = $1`,
    [sha256],
  );
  return rows[0] ? mapBlob(rows[0]) : undefined;
}

export function sha256Hex(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function decodeBytesBase64(value: string): Buffer | ToolError {
  const trimmed = value.trim().replace(/\s+/g, "");
  const dataUrl = trimmed.match(/^data:[^;]+;base64,(.+)$/i);
  const b64 = dataUrl?.[1] ?? trimmed;
  if (!b64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(b64) || b64.length % 4 !== 0) {
    return toolError(
      "bytes_base64 is not valid base64",
      "Pass standard base64 (optional data: URL prefix). Do not send raw binary in JSON.",
    );
  }
  return Buffer.from(b64, "base64");
}

/**
 * Resolve a source_path to an absolute file under FOUNDATION_DATA/uploads.
 * Rejects traversal even when the path looks relative.
 */
export function resolveUploadPath(dataDir: string, sourcePath: string): string | ToolError {
  const pathErr = validateUploadSourcePath(sourcePath);
  if (pathErr) {
    return pathErr;
  }
  const uploadsRoot = resolve(dataDir, "uploads");
  let relativePart = sourcePath.trim().replace(/\\/g, "/");
  if (relativePart === "uploads" || relativePart.startsWith("uploads/")) {
    relativePart = relativePart.slice("uploads".length).replace(/^\/+/, "");
  }
  if (!relativePart) {
    return toolError(
      "source_path is empty",
      "Pass a filename under FOUNDATION_DATA/uploads.",
    );
  }
  const abs = resolve(uploadsRoot, relativePart);
  if (!isInsideDir(uploadsRoot, abs)) {
    return toolError(
      "source_path traversal is not allowed",
      "Pass a relative path under FOUNDATION_DATA/uploads (no .., no absolute path).",
    );
  }
  return abs;
}

export function resolveBlobFilePath(dataDir: string, storedPath: string): string | ToolError {
  const pathErr = validateBlobRelativePath(storedPath);
  if (pathErr) {
    return pathErr;
  }
  const root = resolve(dataDir);
  const abs = resolve(root, storedPath);
  const blobsRoot = resolve(root, "blobs");
  if (!isInsideDir(blobsRoot, abs)) {
    return toolError(
      "Blob path traversal is not allowed",
      "Path must be exactly blobs/<uuid> relative to FOUNDATION_DATA.",
    );
  }
  return abs;
}

function isInsideDir(dir: string, target: string): boolean {
  const rel = relative(dir, target);
  return rel !== "" && !rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel);
}

export async function readBlobBytes(
  dataDir: string,
  blob: Blob,
): Promise<Buffer | ToolError> {
  const abs = resolveBlobFilePath(dataDir, blob.path);
  if (typeof abs !== "string") {
    return abs;
  }
  try {
    const realFile = await realpath(abs);
    const realRoot = await realpath(resolve(dataDir, "blobs"));
    if (!isInsideDir(realRoot, realFile) && realFile !== realRoot) {
      return toolError(
        "Blob path traversal is not allowed",
        "Path must be exactly blobs/<uuid> relative to FOUNDATION_DATA.",
      );
    }
    return await readFile(realFile);
  } catch {
    return toolError(
      `Blob bytes not found: ${blob.id}`,
      "The blob row exists but the file is missing under FOUNDATION_DATA/blobs.",
    );
  }
}

export async function ingestBlobBytes(
  db: Queryable,
  runtime: BlobRuntime,
  input: { mediaType: string; bytes: Buffer; sourceAbs?: string },
): Promise<Blob | ToolError> {
  const maxBytes = runtime.maxBytes ?? BLOB_MAX_BYTES;
  if (input.bytes.byteLength > maxBytes) {
    return formatBlobSizeCapError(maxBytes);
  }
  await ensureBlobLayout(runtime.dataDir);
  const digest = sha256Hex(input.bytes);
  const existing = await getBlobBySha256(db, digest);
  if (existing) {
    const pathErr = validateBlobRelativePath(existing.path);
    if (pathErr) {
      return pathErr;
    }
    if (input.sourceAbs) {
      await unlinkQuiet(input.sourceAbs);
    }
    return existing;
  }

  const id = randomUUID();
  const storedPath = blobRelativePath(id);
  const pathErr = validateBlobRelativePath(storedPath);
  if (pathErr) {
    return pathErr;
  }
  const abs = resolveBlobFilePath(runtime.dataDir, storedPath);
  if (typeof abs !== "string") {
    return abs;
  }

  const tmp = `${abs}.tmp`;
  try {
    await writeFile(tmp, input.bytes, { mode: BLOB_FILE_MODE });
    await chmod(tmp, BLOB_FILE_MODE);
    await rename(tmp, abs);
    await chmod(abs, BLOB_FILE_MODE);
  } catch (error) {
    await unlinkQuiet(tmp);
    throw error;
  }

  try {
    const { rows } = await db.query<BlobRow>(
      `INSERT INTO blobs (id, media_type, byte_size, sha256, path)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, media_type, byte_size, sha256, path, created_at`,
      [id, input.mediaType, input.bytes.byteLength, digest, storedPath],
    );
    if (input.sourceAbs) {
      await unlinkQuiet(input.sourceAbs);
    }
    return mapBlob(rows[0]!);
  } catch (error) {
    if (isUniqueViolation(error)) {
      await unlinkQuiet(abs);
      const raced = await getBlobBySha256(db, digest);
      if (raced) {
        if (input.sourceAbs) {
          await unlinkQuiet(input.sourceAbs);
        }
        return raced;
      }
    }
    await unlinkQuiet(abs);
    throw error;
  }
}

export async function ingestBlobFromUpload(
  db: Queryable,
  runtime: BlobRuntime,
  input: { mediaType: string; sourcePath: string },
): Promise<Blob | ToolError> {
  const maxBytes = runtime.maxBytes ?? BLOB_MAX_BYTES;
  const abs = resolveUploadPath(runtime.dataDir, input.sourcePath);
  if (typeof abs !== "string") {
    return abs;
  }
  let fileStat;
  try {
    fileStat = await stat(abs);
  } catch {
    return toolError(
      `Upload not found: ${input.sourcePath}`,
      "Place the file under FOUNDATION_DATA/uploads and pass a relative source_path.",
    );
  }
  if (!fileStat.isFile()) {
    return toolError(
      `Upload is not a file: ${input.sourcePath}`,
      "source_path must point at a file under FOUNDATION_DATA/uploads.",
    );
  }
  if (fileStat.size > maxBytes) {
    return formatBlobSizeCapError(maxBytes);
  }
  let realFile: string;
  try {
    realFile = await realpath(abs);
    const realRoot = await realpath(resolve(runtime.dataDir, "uploads"));
    if (!isInsideDir(realRoot, realFile) && realFile !== realRoot) {
      return toolError(
        "source_path traversal is not allowed",
        "Pass a relative path under FOUNDATION_DATA/uploads (no .., no absolute path).",
      );
    }
  } catch {
    return toolError(
      `Upload not found: ${input.sourcePath}`,
      "Place the file under FOUNDATION_DATA/uploads and pass a relative source_path.",
    );
  }
  const bytes = await readFile(realFile);
  return ingestBlobBytes(db, runtime, {
    mediaType: input.mediaType,
    bytes,
    sourceAbs: realFile,
  });
}

async function unlinkQuiet(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch {
    // ignore missing temp/source files
  }
}
