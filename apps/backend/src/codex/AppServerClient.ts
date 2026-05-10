import { EventEmitter } from "node:events";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}

export interface JsonRpcRequest {
  id: number | string;
  method: string;
  params?: unknown;
}

export interface JsonRpcNotification {
  method: string;
  params?: unknown;
}

export type AppServerConnectionMode = "child" | "proxy";
const CONNECT_TIMEOUT_MS = 8000;

export class AppServerClient extends EventEmitter {
  private child: ChildProcessWithoutNullStreams | null = null;
  private nextId = 1;
  private stderrBuffer = "";
  private readonly pending = new Map<number | string, PendingRequest>();

  constructor(
    private readonly codexBin: string,
    private readonly connectionMode: AppServerConnectionMode = "child"
  ) {
    super();
  }

  async connect(): Promise<void> {
    if (this.child) {
      return;
    }

    const args = this.connectionMode === "proxy" ? ["app-server", "proxy"] : ["app-server"];
    this.stderrBuffer = "";
    this.child = spawn(this.codexBin, args, {
      stdio: ["pipe", "pipe", "pipe"],
      shell: process.platform === "win32",
      windowsHide: true
    });

    this.child.stderr.on("data", (chunk) => {
      const message = chunk.toString("utf8");
      this.stderrBuffer = `${this.stderrBuffer}${message}`.slice(-4000);
      this.emit("stderr", message);
    });

    this.child.on("error", (error) => {
      this.child = null;
      const wrapped = new Error(`codex app-server ${this.connectionMode} failed to start: ${error.message}`);
      this.rejectPending(wrapped);
      this.emit("stderr", wrapped.message);
      this.emit("closed", { code: null, signal: null });
    });

    this.child.on("exit", (code, signal) => {
      this.child = null;
      const detail = this.stderrBuffer.trim();
      this.rejectPending(
        new Error(
          `codex app-server ${this.connectionMode} exited with code=${code} signal=${signal}${detail ? `: ${detail}` : ""}`
        )
      );
      this.emit("closed", { code, signal });
    });

    const lines = createInterface({ input: this.child.stdout });
    lines.on("line", (line) => {
      if (!line.trim()) {
        return;
      }
      this.handleMessage(line);
    });

    try {
      await this.withConnectTimeout(
        this.request("initialize", {
          clientInfo: {
            name: "codexbutler_mobile_companion",
            title: "CodexButler Mobile Companion",
            version: "0.1.0"
          },
          capabilities: {
            experimentalApi: true
          }
        })
      );
      this.notify("initialized", {});
    } catch (error) {
      const detail = this.stderrBuffer.trim();
      const message = error instanceof Error ? error.message : String(error);
      const wrapped = new Error(detail && !message.includes(detail) ? `${message}: ${detail}` : message);
      this.child?.kill();
      this.child = null;
      this.rejectPending(wrapped);
      throw wrapped;
    }
  }

  isConnected(): boolean {
    return this.child !== null;
  }

  getLastDiagnostic(): string | null {
    const detail = this.stderrBuffer.trim();
    return detail.length ? detail : null;
  }

  async request(method: string, params?: unknown): Promise<unknown> {
    if (!this.child) {
      throw new Error("Codex app-server is not connected");
    }
    const id = this.nextId++;
    const message = { jsonrpc: "2.0", id, method, params };
    const response = new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
    return response;
  }

  notify(method: string, params?: unknown): void {
    if (!this.child) {
      throw new Error("Codex app-server is not connected");
    }
    this.child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`);
  }

  respond(id: number | string, result: unknown): void {
    if (!this.child) {
      throw new Error("Codex app-server is not connected");
    }
    this.child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, result })}\n`);
  }

  private handleMessage(line: string): void {
    let message: Record<string, unknown>;
    try {
      message = JSON.parse(line) as Record<string, unknown>;
    } catch (error) {
      this.emit("error", new Error(`Invalid JSON-RPC line: ${String(error)}`));
      return;
    }

    if ("id" in message && ("result" in message || "error" in message) && !("method" in message)) {
      const pending = this.pending.get(message.id as number | string);
      if (!pending) {
        return;
      }
      this.pending.delete(message.id as number | string);
      if ("error" in message) {
        pending.reject(new Error(JSON.stringify(message.error)));
      } else {
        pending.resolve(message.result);
      }
      return;
    }

    if (typeof message.method === "string" && "id" in message) {
      this.emit("request", {
        id: message.id as number | string,
        method: message.method,
        params: message.params
      } satisfies JsonRpcRequest);
      return;
    }

    if (typeof message.method === "string") {
      this.emit("notification", {
        method: message.method,
        params: message.params
      } satisfies JsonRpcNotification);
    }
  }

  private withConnectTimeout<T>(promise: Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`codex app-server ${this.connectionMode} did not initialize within ${CONNECT_TIMEOUT_MS}ms`));
      }, CONNECT_TIMEOUT_MS);

      promise.then(
        (value) => {
          clearTimeout(timeout);
          resolve(value);
        },
        (error) => {
          clearTimeout(timeout);
          reject(error);
        }
      );
    });
  }

  private rejectPending(error: Error): void {
    for (const { reject } of this.pending.values()) {
      reject(error);
    }
    this.pending.clear();
  }
}
