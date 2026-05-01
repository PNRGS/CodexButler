import type { FastifyInstance } from "fastify";

export function registerAuth(app: FastifyInstance, token: string): void {
  app.addHook("onRequest", async (request, reply) => {
    if (request.url === "/health") {
      return;
    }

    const authHeader = request.headers.authorization;
    if (authHeader !== `Bearer ${token}`) {
      request.log.warn({ path: request.url }, "auth failure");
      await reply.code(401).send({ error: "Missing or invalid bearer token" });
    }
  });
}
