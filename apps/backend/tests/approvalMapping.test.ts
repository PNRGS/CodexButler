import { describe, expect, it } from "vitest";
import { toCodexApprovalResponse } from "../src/codex/approvalMapping.js";

describe("approval decision mapping", () => {
  it("maps mobile decisions to app-server command approval responses", () => {
    expect(toCodexApprovalResponse({ decision: "approveOnce" }, "commandExecution")).toEqual({ decision: "accept" });
    expect(toCodexApprovalResponse({ decision: "approveForSession" }, "commandExecution")).toEqual({
      decision: "acceptForSession"
    });
    expect(toCodexApprovalResponse({ decision: "deny" }, "commandExecution")).toEqual({ decision: "decline" });
    expect(toCodexApprovalResponse({ decision: "cancel" }, "commandExecution")).toEqual({ decision: "cancel" });
    expect(toCodexApprovalResponse({ decision: "alwaysAllowRule", rulePrefix: ["pnpm", "test"] }, "commandExecution")).toEqual({
      decision: {
        acceptWithExecpolicyAmendment: {
          execpolicy_amendment: ["pnpm", "test"]
        }
      }
    });
  });

  it("maps mobile decisions to legacy exec approval responses", () => {
    expect(toCodexApprovalResponse({ decision: "approveOnce" }, "execCommand")).toEqual({ decision: "approved" });
    expect(toCodexApprovalResponse({ decision: "approveForSession" }, "execCommand")).toEqual({
      decision: "approved_for_session"
    });
    expect(toCodexApprovalResponse({ decision: "deny" }, "execCommand")).toEqual({ decision: "denied" });
    expect(toCodexApprovalResponse({ decision: "cancel" }, "execCommand")).toEqual({ decision: "abort" });
    expect(toCodexApprovalResponse({ decision: "alwaysAllowRule", rulePrefix: ["pnpm", "test"] }, "execCommand")).toEqual({
      decision: {
        approved_execpolicy_amendment: {
          proposed_execpolicy_amendment: ["pnpm", "test"]
        }
      }
    });
  });
});
