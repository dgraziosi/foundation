import { createHash, timingSafeEqual } from "node:crypto";

/** SHA-256 of a secret. Every digest is 32 bytes, so a compare never leaks the secret's length. */
export type SecretDigest = Buffer & { readonly __brand: "SecretDigest" };

const DIGEST_HEX_RE = /^[0-9a-f]{64}$/;

export function secretDigest(secret: string): SecretDigest {
  return createHash("sha256").update(secret, "utf8").digest() as SecretDigest;
}

/** A stored `secret_sha256`. Anything other than 64 lowercase hex chars is not a digest. */
export function secretDigestFromHex(hex: string): SecretDigest | undefined {
  return DIGEST_HEX_RE.test(hex) ? (Buffer.from(hex, "hex") as SecretDigest) : undefined;
}

export function digestsMatch(left: SecretDigest, right: SecretDigest): boolean {
  return timingSafeEqual(left, right);
}
