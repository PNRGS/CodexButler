import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

function readEnvFile(path) {
  if (!existsSync(path)) {
    return {};
  }
  return Object.fromEntries(
    readFileSync(path, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const [key, ...valueParts] = line.split("=");
        return [key, valueParts.join("=").replace(/^["']|["']$/g, "")];
      })
  );
}

const scriptDir = dirname(fileURLToPath(import.meta.url));
const env = {
  ...readEnvFile(resolve(scriptDir, "../../../.env")),
  ...readEnvFile(resolve(scriptDir, "../.env")),
  ...readEnvFile(resolve(process.cwd(), ".env")),
  ...process.env
};
const port = env.BACKEND_PORT ?? "4545";
const host = env.BACKEND_HOST ?? "127.0.0.1";
const token = env.BACKEND_AUTH_TOKEN;
const caseId = process.argv[2] ?? "follow-up";

if (!token) {
  console.error("BACKEND_AUTH_TOKEN is required in .env or the environment.");
  process.exit(1);
}

const url = `http://${host}:${port}/debug/mock/approval-cases`;
const response = await fetch(url, {
  method: "POST",
  headers: {
    authorization: `Bearer ${token}`,
    "content-type": "application/json"
  },
  body: JSON.stringify({ caseId })
});
const body = await response.json().catch(() => ({}));

if (!response.ok) {
  console.error(`Failed to seed mock approval (${response.status}): ${body.detail ?? body.error ?? response.statusText}`);
  process.exit(1);
}

console.log(`Seeded mock approval: ${body.approval.id}`);
console.log(`Command: ${body.approval.command}`);
console.log(`Thread: ${body.approval.threadId}`);
