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

  it("supports millisecond timestamp fields from app-server payloads", () => {
    const turn = normalizeTurn(
      {
        id: "turn-1",
        threadId: "thread-1",
        status: "completed",
        created_at_ms: 1778490000000,
        items: [
          {
            id: "item-1",
            type: "agentMessage",
            text: "Done",
            timestamp_ms: 1778490060000
          }
        ]
      },
      "thread-1"
    );

    expect(turn.createdAt).toBe("2026-05-11T09:00:00.000Z");
    expect(turn.items[0]?.createdAt).toBe("2026-05-11T09:01:00.000Z");
  });

  it("keeps previously known timestamps when a later payload omits them", () => {
    const previous = normalizeTurn(
      {
        id: "turn-1",
        threadId: "thread-1",
        status: "completed",
        createdAt: "2026-05-11T08:00:00.000Z",
        items: [
          {
            id: "item-1",
            type: "agentMessage",
            text: "First body",
            createdAt: "2026-05-11T08:01:00.000Z"
          }
        ]
      },
      "thread-1"
    );

    const refreshed = normalizeTurn(
      {
        id: "turn-1",
        threadId: "thread-1",
        status: "completed",
        items: [
          {
            id: "item-1",
            type: "agentMessage",
            text: "Updated body"
          }
        ]
      },
      "thread-1",
      previous
    );

    expect(refreshed.createdAt).toBe("2026-05-11T08:00:00.000Z");
    expect(refreshed.items[0]?.createdAt).toBe("2026-05-11T08:01:00.000Z");
  });
});
