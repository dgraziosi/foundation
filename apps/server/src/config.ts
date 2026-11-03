import { config as loadDotenv } from "dotenv";
import { resolve } from "node:path";
import {
  DEFAULT_LEASE_TTL_SECONDS,
  MAX_LEASE_TTL_SECONDS,
  MIN_LEASE_TTL_SECONDS,
} from "@foundation/schema";
import { z } from "zod";

loadDotenv({ path: resolve(process.cwd(), ".env") });
loadDotenv({ path: resolve(process.cwd(), "../../.env") });

/** Strings `.env.example` ships. A server that sees one is running on a key the whole internet has. */
export const PUBLISHED_API_KEY = "change-me-to-a-long-random-string";
export const PUBLISHED_DATABASE_PASSWORD = "change-me-to-a-password";
export const MIN_KEY_LENGTH = 32;

const MINT_HINT = "Run scripts/keep-vault-up.sh to mint one into .env.";

function blankIsUnset(value: unknown): unknown {
  return typeof value === "string" && value.trim() === "" ? undefined : value;
}

function doorKey(name: string) {
  return z
    .string({ required_error: `${name} is required. ${MINT_HINT}` })
    .refine((key) => key !== PUBLISHED_API_KEY && key !== PUBLISHED_DATABASE_PASSWORD, {
      message: `${name} is the published example. ${MINT_HINT}`,
    })
    .refine((key) => key.length >= MIN_KEY_LENGTH, {
      message: `${name} needs at least ${MIN_KEY_LENGTH} characters. ${MINT_HINT}`,
    });
}

/** Password of a `postgres://` URL, or a libpq `password=` field. */
export function databasePassword(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    return parsed.password ? decodeURIComponent(parsed.password) : undefined;
  } catch {
    return url.match(/(?:^|\s)password\s*=\s*'?([^'\s]*)'?/)?.[1];
  }
}

const LISTEN_ONLY_HOSTS = new Set(["0.0.0.0", "[::]", "::"]);
const HOST_ENTRY_RE = /^(?:\[[0-9a-f:.]+\]|[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?)(?::[0-9]{1,5})?$/;

function hostOnly(entry: string): string {
  return entry.startsWith("[") ? entry.slice(0, entry.indexOf("]") + 1) : entry.replace(/:[0-9]+$/, "");
}

const allowedHosts = z.preprocess(
  (value) =>
    typeof value === "string"
      ? value
          .split(/[\s,]+/)
          .map((entry) => entry.trim().toLowerCase())
          .filter((entry) => entry.length > 0)
      : value,
  z
    .array(
      z
        .string()
        .regex(HOST_ENTRY_RE, "FOUNDATION_ALLOWED_HOSTS lists Host values like vault.example.ts.net or 192.168.1.20:8788")
        .refine((entry) => !LISTEN_ONLY_HOSTS.has(hostOnly(entry)), {
          message: "FOUNDATION_ALLOWED_HOSTS names the Host a browser sends. 0.0.0.0 is a listen address.",
        }),
    )
    .default([]),
);

const publicOrigin = z.preprocess(
  blankIsUnset,
  z
    .string()
    .trim()
    .optional()
    .transform((value, ctx) => {
      if (value === undefined) {
        return undefined;
      }
      let url: URL;
      try {
        url = new URL(value);
      } catch {
        ctx.addIssue({ code: "custom", message: "VIEW_PUBLIC_ORIGIN is an origin like https://vault.example.ts.net" });
        return z.NEVER;
      }
      const bare = url.pathname === "/" && url.search === "" && url.hash === "" && url.username === "";
      if ((url.protocol !== "https:" && url.protocol !== "http:") || !bare) {
        ctx.addIssue({ code: "custom", message: "VIEW_PUBLIC_ORIGIN is an origin like https://vault.example.ts.net" });
        return z.NEVER;
      }
      if (LISTEN_ONLY_HOSTS.has(url.hostname)) {
        ctx.addIssue({
          code: "custom",
          message: "VIEW_PUBLIC_ORIGIN names the Host a browser sends. 0.0.0.0 is a listen address.",
        });
        return z.NEVER;
      }
      return url.origin;
    }),
);

const optInFlag = z.preprocess(
  (value) => {
    if (value === undefined || (typeof value === "string" && value.trim() === "")) {
      return false;
    }
    if (typeof value !== "string") {
      return value;
    }
    const lowered = value.trim().toLowerCase();
    if (["1", "true", "yes"].includes(lowered)) {
      return true;
    }
    if (["0", "false", "no"].includes(lowered)) {
      return false;
    }
    return value;
  },
  z.boolean({ invalid_type_error: "FOUNDATION_ALLOW_CLEARTEXT is 1 or 0" }),
);

const EnvFields = z.object({
  FOUNDATION_API_KEY: doorKey("FOUNDATION_API_KEY"),
  FOUNDATION_API_KEY_LABEL: z.string().trim().min(1).max(200).optional(),
  FOUNDATION_VIEW_KEY: z.preprocess(blankIsUnset, z.string().trim().pipe(doorKey("FOUNDATION_VIEW_KEY")).optional()),
  DATABASE_URL: z
    .string({ required_error: "DATABASE_URL is required" })
    .min(1, "DATABASE_URL is required")
    .refine((url) => databasePassword(url) !== PUBLISHED_DATABASE_PASSWORD, {
      message: "DATABASE_URL uses the published example password. Run scripts/keep-vault-up.sh to mint one into .env.",
    }),
  FOUNDATION_DATA: z.string().default("./data"),
  PORT: z.coerce.number().int().positive().default(8787),
  HOST: z.string().default("127.0.0.1"),
  VIEW_PORT: z.coerce.number().int().positive().default(8788),
  VIEW_HOST: z.string().default("127.0.0.1"),
  FOUNDATION_ALLOWED_HOSTS: allowedHosts,
  VIEW_PUBLIC_ORIGIN: publicOrigin,
  FOUNDATION_ALLOW_CLEARTEXT: optInFlag,
  FOUNDATION_LEASE_TTL_SECONDS: z.coerce
    .number()
    .int()
    .min(MIN_LEASE_TTL_SECONDS)
    .max(MAX_LEASE_TTL_SECONDS)
    .default(DEFAULT_LEASE_TTL_SECONDS),
});

const EnvSchema = EnvFields.refine(
  (env) => env.FOUNDATION_VIEW_KEY === undefined || env.FOUNDATION_VIEW_KEY !== env.FOUNDATION_API_KEY,
  {
    path: ["FOUNDATION_VIEW_KEY"],
    message: `FOUNDATION_VIEW_KEY must differ from FOUNDATION_API_KEY. ${MINT_HINT}`,
  },
);

/** Every name `loadConfig` reads. keep-up forwards exactly these plus a few shell basics under `env -i`. */
export const ENV_NAMES = Object.keys(EnvFields.shape) as ReadonlyArray<keyof z.infer<typeof EnvFields>>;

export const SHELL_ENV_NAMES = ["PATH", "HOME", "TMPDIR", "LANG", "LC_ALL", "USER"] as const;

/** A library that reads a stray `PG*` or cloud token from the environment cannot see it after this. */
export function keepAllowedEnv(env: NodeJS.ProcessEnv = process.env): void {
  const keep = new Set<string>([...SHELL_ENV_NAMES, ...ENV_NAMES]);
  for (const name of Object.keys(env)) {
    if (!keep.has(name)) {
      delete env[name];
    }
  }
}

export type AppConfig = z.infer<typeof EnvSchema>;
export type AppBindings = Pick<AppConfig, "FOUNDATION_API_KEY" | "FOUNDATION_DATA"> &
  Partial<
    Pick<
      AppConfig,
      | "HOST"
      | "PORT"
      | "VIEW_HOST"
      | "VIEW_PORT"
      | "FOUNDATION_API_KEY_LABEL"
      | "FOUNDATION_VIEW_KEY"
      | "FOUNDATION_ALLOWED_HOSTS"
      | "VIEW_PUBLIC_ORIGIN"
      | "FOUNDATION_ALLOW_CLEARTEXT"
      | "FOUNDATION_LEASE_TTL_SECONDS"
    >
  >;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
    throw new Error(`Invalid environment:\n${issues.join("\n")}`);
  }
  return parsed.data;
}
