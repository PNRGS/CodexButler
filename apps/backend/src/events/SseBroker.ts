import type { FastifyReply } from "fastify";
import type { ServerEvent } from "@codexbutler/shared";

export class SseBroker {
  private readonly clients = new Set<FastifyReply>();

  addClient(reply: FastifyReply): void {
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no"
    });
    reply.raw.write(": connected\n\n");
    this.clients.add(reply);
    reply.raw.on("close", () => {
      this.clients.delete(reply);
    });
  }

  publish(event: ServerEvent): void {
    const payload = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
    for (const client of this.clients) {
      client.raw.write(payload);
    }
  }
}
