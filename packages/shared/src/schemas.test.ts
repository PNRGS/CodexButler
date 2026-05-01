import { describe, expect, it } from "vitest";
import { promptSubmissionRequestSchema } from "./schemas.js";

describe("prompt submission schema", () => {
  it("trims valid prompt text", () => {
    expect(promptSubmissionRequestSchema.parse({ text: "  Summarize status  " })).toEqual({
      text: "Summarize status"
    });
  });

  it("rejects blank prompt text", () => {
    expect(() => promptSubmissionRequestSchema.parse({ text: "   " })).toThrow();
  });

  it("rejects prompt text longer than 4000 characters", () => {
    expect(() => promptSubmissionRequestSchema.parse({ text: "x".repeat(4001) })).toThrow();
  });
});
