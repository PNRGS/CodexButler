import { z } from "zod";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, parse } from "node:path";

const envSchema = z.object({
  BACKEND_HOST: z.string().default("127.0.0.1"),
  BACKEND_PORT: z.coerce.number().int().positive().default(4545),
  BACKEND_PUBLIC_BIND: z
    .string()
    .default("false")
    .transform((value) => value === "true"),
  BACKEND_ALLOWED_ORIGINS: z
    .string()
    .default("")
    .transform((value) =>
      value
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean)
    ),
  BACKEND_AUTH_TOKEN: z.string().min(32, "BACKEND_AUTH_TOKEN must be at least 32 characters"),
  CODEX_BIN: z.string().default("codex"),
  CODEX_MOCK_MODE: z
    .string()
    .default("true")
    .transform((value) => value === "true"),
  CODEX_CONNECTION_MODE: z.enum(["child", "proxy"]).default("child"),
  SQLITE_PATH: z.string().default("./concierge.sqlite")
});

export type AppConfig = z.infer<typeof envSchema>;

function parseEnvFile(path: string): Record<string, string> {
  return Object.fromEntries(
    readFileSync(path, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const [key, ...valueParts] = line.split("=");
        return [(key ?? "").trim(), valueParts.join("=").trim().replace(/^["']|["']$/g, "")];
      })
  );
}

function loadEnvFiles(startDir = process.cwd()): Record<string, string> {
  const paths: string[] = [];
  let current = startDir;
  const root = parse(current).root;

  while (true) {
    const path = join(current, ".env");
    if (existsSync(path)) {
      paths.push(path);
    }
    if (current === root) {
      break;
    }
    current = dirname(current);
  }

  return paths.reverse().reduce<Record<string, string>>((env, path) => ({ ...env, ...parseEnvFile(path) }), {});
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return envSchema.parse({ ...loadEnvFiles(), ...env });
}
