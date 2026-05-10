import { loadConfig } from "./config.js";
import { buildServer } from "./server.js";
import { AuditStore } from "./storage/AuditStore.js";
import { AppServerCodexRepository } from "./codex/AppServerCodexRepository.js";
import { MockCodexRepository } from "./codex/MockCodexRepository.js";

const config = loadConfig();
const auditStore = await AuditStore.open(config.SQLITE_PATH);
const codex = config.CODEX_MOCK_MODE
  ? new MockCodexRepository()
  : new AppServerCodexRepository(config.CODEX_BIN, config.CODEX_CONNECTION_MODE);

const app = buildServer({ config, codex, auditStore });

try {
  await codex.connect();
  app.log.info(
    { mockMode: config.CODEX_MOCK_MODE, codexConnectionMode: config.CODEX_CONNECTION_MODE },
    "codex connection initialized"
  );
} catch (error) {
  app.log.error({ error }, "codex connection failed");
}

const host = config.BACKEND_PUBLIC_BIND ? "0.0.0.0" : config.BACKEND_HOST;
await app.listen({ host, port: config.BACKEND_PORT });
app.log.info({ host, port: config.BACKEND_PORT }, "codexbutler backend started");

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    auditStore.close();
    await app.close();
    process.exit(0);
  });
}
