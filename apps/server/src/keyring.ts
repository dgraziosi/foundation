import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { digestsMatch, secretDigest, secretDigestFromHex, type SecretDigest } from "./secret-compare.js";

export const API_KEYS_FILE = "api-keys.json";
export const BOOTSTRAP_KEY_NAME = "root";

export type AgentPrincipal = {
  name: string;
  actor: "agent";
  actor_label: string;
  destructive: boolean;
};

export type NamedKeyRecord = {
  name: string;
  secret_sha256: string;
  actor_label: string;
  scopes: string[];
};

export type NamedKeysFile = {
  keys: NamedKeyRecord[];
};

export const KEY_NAME_RE = /^[a-z][a-z0-9_-]{0,62}$/;

export function hashApiKey(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

export function mintApiKeySecret(): string {
  return randomBytes(32).toString("hex");
}

export function namedKeysPath(dataDir: string): string {
  return join(dataDir, API_KEYS_FILE);
}

function scopesOf(scopes: unknown): { ok: true; destructive: boolean } | { ok: false; error: string } {
  if (!Array.isArray(scopes)) {
    return { ok: false, error: "scopes must be an array" };
  }
  let destructive = false;
  for (const scope of scopes) {
    if (scope === "destructive") {
      destructive = true;
      continue;
    }
    if (typeof scope !== "string") {
      return { ok: false, error: "scopes must be strings" };
    }
    return { ok: false, error: `unknown scope: ${scope}` };
  }
  return { ok: true, destructive };
}

export function parseNamedKeysFile(raw: string): { keys: NamedKeyRecord[] } | { error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { error: "api-keys.json is not JSON" };
  }
  if (!parsed || typeof parsed !== "object" || !("keys" in parsed) || !Array.isArray((parsed as NamedKeysFile).keys)) {
    return { error: "api-keys.json must be { keys: [...] }" };
  }
  const keys: NamedKeyRecord[] = [];
  const names = new Set<string>();
  for (const row of (parsed as NamedKeysFile).keys) {
    if (!row || typeof row !== "object") {
      return { error: "each key must be an object" };
    }
    if (typeof row.name !== "string" || !KEY_NAME_RE.test(row.name)) {
      return { error: "each key needs a name like chief or vault-keeper" };
    }
    if (row.name === BOOTSTRAP_KEY_NAME) {
      return { error: "name root is reserved for FOUNDATION_API_KEY" };
    }
    if (names.has(row.name)) {
      return { error: `duplicate key name: ${row.name}` };
    }
    if (typeof row.secret_sha256 !== "string" || !/^[0-9a-f]{64}$/.test(row.secret_sha256)) {
      return { error: `key ${row.name} needs secret_sha256 (64 hex chars)` };
    }
    const scopes = scopesOf(row.scopes ?? []);
    if (!scopes.ok) {
      return { error: `key ${row.name}: ${scopes.error}` };
    }
    const label =
      typeof row.actor_label === "string" && row.actor_label.trim().length > 0
        ? row.actor_label.trim().slice(0, 200)
        : row.name;
    names.add(row.name);
    keys.push({
      name: row.name,
      secret_sha256: row.secret_sha256,
      actor_label: label,
      scopes: scopes.destructive ? ["destructive"] : [],
    });
  }
  return { keys };
}

export function loadNamedKeys(dataDir: string): NamedKeyRecord[] {
  const path = namedKeysPath(dataDir);
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    if (code === "ENOENT") {
      return [];
    }
    console.error(`Could not read ${path}`, error);
    return [];
  }
  const parsed = parseNamedKeysFile(raw);
  if ("error" in parsed) {
    console.error(`Ignoring ${path}: ${parsed.error}`);
    return [];
  }
  return parsed.keys;
}

export function bootstrapPrincipal(label?: string): AgentPrincipal {
  const actor_label = label?.trim() ? label.trim().slice(0, 200) : BOOTSTRAP_KEY_NAME;
  return {
    name: BOOTSTRAP_KEY_NAME,
    actor: "agent",
    actor_label,
    destructive: true,
  };
}

export type KeyringBindings = {
  FOUNDATION_API_KEY: string;
  FOUNDATION_DATA: string;
  FOUNDATION_API_KEY_LABEL?: string;
};

export type MemoryKey = {
  secret: string;
  name: string;
  actor_label?: string;
  destructive?: boolean;
};

type DigestKey = { digest: SecretDigest; principal: AgentPrincipal };

function memoryKeyOf(key: MemoryKey): DigestKey {
  return {
    digest: secretDigest(key.secret),
    principal: {
      name: key.name,
      actor: "agent",
      actor_label: key.actor_label?.trim() || key.name,
      destructive: key.destructive === true,
    },
  };
}

export class Keyring {
  private readonly bootstrapDigest: SecretDigest;
  private readonly memory: DigestKey[];

  private constructor(
    bootstrapSecret: string,
    private readonly bootstrap: AgentPrincipal,
    private readonly dataDir: string | undefined,
    memory: MemoryKey[],
  ) {
    this.bootstrapDigest = secretDigest(bootstrapSecret);
    this.memory = memory.map(memoryKeyOf);
  }

  static fromBindings(config: KeyringBindings): Keyring {
    return new Keyring(
      config.FOUNDATION_API_KEY,
      bootstrapPrincipal(config.FOUNDATION_API_KEY_LABEL),
      config.FOUNDATION_DATA,
      [],
    );
  }

  static fromSecrets(bootstrapSecret: string, named: MemoryKey[] = [], label?: string): Keyring {
    return new Keyring(bootstrapSecret, bootstrapPrincipal(label), undefined, named);
  }

  resolve(provided: string | undefined): AgentPrincipal | undefined {
    if (!provided) {
      return undefined;
    }
    const digest = secretDigest(provided);
    if (digestsMatch(digest, this.bootstrapDigest)) {
      return this.bootstrap;
    }
    let match: AgentPrincipal | undefined;
    for (const key of this.memory) {
      if (digestsMatch(digest, key.digest)) {
        match = key.principal;
      }
    }
    if (this.dataDir) {
      for (const key of loadNamedKeys(this.dataDir)) {
        const stored = secretDigestFromHex(key.secret_sha256);
        if (stored && digestsMatch(digest, stored)) {
          match = {
            name: key.name,
            actor: "agent",
            actor_label: key.actor_label,
            destructive: key.scopes.includes("destructive"),
          };
        }
      }
    }
    return match;
  }
}
