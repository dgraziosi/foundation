import { config as loadDotenv } from "dotenv";
import { resolve } from "node:path";
import { z } from "zod";

loadDotenv({ path: resolve(process.cwd(), ".env") });
loadDotenv({ path: resolve(process.cwd(), "../../.env") });

const EnvSchema = z.object({
  FOUNDATION_API_KEY: z.string().min(1, "FOUNDATION_API_KEY is required"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  FOUNDATION_DATA: z.string().default("./data"),
  PORT: z.coerce.number().int().positive().default(8787),
  HOST: z.string().default("0.0.0.0"),
});

export type AppConfig = z.infer<typeof EnvSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
    throw new Error(`Invalid environment:\n${issues.join("\n")}`);
  }
  return parsed.data;
}
