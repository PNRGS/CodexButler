import { describe, expect, it } from "vitest";
import { normalizeTurn, normalizeTurnItem } from "../src/codex/normalizers.js";

describe("codex normalizers", () => {
  it("preserves ISO timestamps from turn items", () => {
    const item = normalizeTurnItem({
      id: "item-1",
      type: "agentMessage",
      text: "Done",
      createdAt: "2026-05-11T10:15:30.000Z",
      completedAt: "2026-05-11T10:16:00.000Z"
    });

    expect(item.createdAt).toBe("2026-05-11T10:15:30.000Z");
    expect(item.completedAt).toBe("2026-05-11T10:16:00.000Z");
  });

  it("uses the parent turn timestamp when an item has no timestamp", () => {
    const turn = normalizeTurn(
      {
        id: "turn-1",
        threadId: "thread-1",
        status: "completed",
        createdAt: "2026-05-11T09:00:00.000Z",
        completedAt: "2026-05-11T09:05:00.000Z",
        items: [
          {
            id: "item-1",
            type: "userMessage",
            text: "Run the checks"
          }
        ]
      },
      "thread-1"
    );

    expect(turn.items[0]?.createdAt).toBe("2026-05-11T09:00:00.000Z");
  });
});
