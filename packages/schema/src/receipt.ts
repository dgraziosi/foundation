import { toolError, type ToolError } from "./mcp-io.js";
import {
  RECEIPT_KINDS,
  RECEIPT_SYSTEMS,
  type ReceiptKind,
  type ReceiptRef,
  type ReceiptSystem,
} from "./types.js";

export {
  RECEIPT_KINDS,
  RECEIPT_SYSTEMS,
  ReceiptKindSchema,
  ReceiptRefSchema,
  ReceiptSystemSchema,
  type ReceiptKind,
  type ReceiptRef,
  type ReceiptSystem,
} from "./types.js";

export const RECEIPT_INCOMPLETE_SUGGESTION =
  "Set data.receipt.system to gmail | calendar, data.receipt.id to that system's stable id, and data.receipt.kind to sent | cleared. Foundation stores the ref only — do not fetch or mirror Gmail or Calendar bodies.";

export const RECEIPT_UNKNOWN_SUGGESTION =
  "Use system gmail | calendar and kind sent or cleared. Foundation stores the ref only — do not fetch or mirror those systems' bodies.";

export const RECEIPT_PAIR_SUGGESTION =
  "kind sent goes with system gmail. kind cleared goes with system calendar.";

export function receiptConflictError(existingId: string, receipt: ReceiptRef): ToolError {
  return toolError(
    `Receipt ${receipt.system}:${receipt.id} already belongs to live node ${existingId}`,
    `Call get with ${existingId}. Search with receipt to look up before upsert. Do not create a twin.`,
  );
}

function isBlank(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === "string" && value.trim() === "");
}

function expectedSystemForKind(kind: ReceiptKind): ReceiptSystem {
  return kind === "sent" ? "gmail" : "calendar";
}

/**
 * Read `data.receipt` if present. Missing/empty receipt is allowed.
 * Incomplete, unknown, or unpaired system/kind return `{ error, suggestion }`.
 */
export function receiptFromData(data: Record<string, unknown>): ReceiptRef | ToolError | undefined {
  if (!Object.prototype.hasOwnProperty.call(data, "receipt") || data.receipt == null) {
    return undefined;
  }
  const raw = data.receipt;
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return toolError(
      "data.receipt must be an object with system, id, and kind",
      RECEIPT_INCOMPLETE_SUGGESTION,
    );
  }
  const rec = raw as Record<string, unknown>;
  const systemBlank = isBlank(rec.system);
  const idBlank = isBlank(rec.id);
  const kindBlank = isBlank(rec.kind);
  if (systemBlank && idBlank && kindBlank) {
    return undefined;
  }
  if (systemBlank || idBlank || kindBlank) {
    return toolError("data.receipt requires system, id, and kind", RECEIPT_INCOMPLETE_SUGGESTION);
  }
  if (typeof rec.system !== "string") {
    return toolError("data.receipt.system must be a string", RECEIPT_UNKNOWN_SUGGESTION);
  }
  const system = rec.system.trim();
  if (!RECEIPT_SYSTEMS.includes(system as ReceiptSystem)) {
    return toolError(`Unknown receipt.system "${rec.system.trim()}"`, RECEIPT_UNKNOWN_SUGGESTION);
  }
  if (typeof rec.kind !== "string") {
    return toolError("data.receipt.kind must be a string", RECEIPT_UNKNOWN_SUGGESTION);
  }
  const kind = rec.kind.trim();
  if (!RECEIPT_KINDS.includes(kind as ReceiptKind)) {
    return toolError(`Unknown receipt.kind "${rec.kind.trim()}"`, RECEIPT_UNKNOWN_SUGGESTION);
  }
  if (typeof rec.id !== "string") {
    return toolError("data.receipt.id must be a string", RECEIPT_INCOMPLETE_SUGGESTION);
  }
  const id = rec.id.trim();
  if (!id) {
    return toolError("data.receipt requires system, id, and kind", RECEIPT_INCOMPLETE_SUGGESTION);
  }
  const receiptKind = kind as ReceiptKind;
  const receiptSystem = system as ReceiptSystem;
  if (receiptSystem !== expectedSystemForKind(receiptKind)) {
    return toolError(
      `receipt.kind "${receiptKind}" does not pair with system "${receiptSystem}"`,
      RECEIPT_PAIR_SUGGESTION,
    );
  }
  return { system: receiptSystem, id, kind: receiptKind };
}

/** Persist the trimmed receipt ref so uniqueness and search match lookups. */
export function canonicalizeReceiptInData(data: Record<string, unknown>): Record<string, unknown> {
  if (Object.prototype.hasOwnProperty.call(data, "receipt") && data.receipt === null) {
    const next = { ...data };
    delete next.receipt;
    return next;
  }
  const receipt = receiptFromData(data);
  if (!receipt || isToolErrorReceipt(receipt)) {
    return data;
  }
  const raw = data.receipt as Record<string, unknown>;
  if (raw.system === receipt.system && raw.id === receipt.id && raw.kind === receipt.kind) {
    return data;
  }
  return { ...data, receipt: { ...raw, system: receipt.system, id: receipt.id, kind: receipt.kind } };
}

export function isToolErrorReceipt(value: ReceiptRef | ToolError | undefined): value is ToolError {
  return typeof value === "object" && value !== null && "error" in value;
}
