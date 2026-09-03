import { config as loadDotenv } from "dotenv";
import { resolve } from "node:path";
import { z } from "zod";

loadDotenv({ path: resolve(process.cwd(), ".env") });
loadDotenv({ path: resolve(process.cwd(), "../../.env") });

const optionalViewKey = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().trim().min(1).optional(),
);

const EnvSchema = z.object({
  FOUNDATION_API_KEY: z.string().min(1, "FOUNDATION_API_KEY is required"),
  FOUNDATION_API_KEY_LABEL: z.string().trim().min(1).max(200).optional(),
  FOUNDATION_VIEW_KEY: optionalViewKey,
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  FOUNDATION_DATA: z.string().default("./data"),
  PORT: z.coerce.number().int().positive().default(8787),
  HOST: z.string().default("127.0.0.1"),
  VIEW_PORT: z.coerce.number().int().positive().default(8788),
  VIEW_HOST: z.string().default("127.0.0.1"),
});

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
