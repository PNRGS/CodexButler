import type { ApprovalDecisionInput } from "./types.js";

export type CodexApprovalResponseKind = "commandExecution" | "fileChange" | "execCommand" | "applyPatch";

function toCommandExecutionDecision(input: ApprovalDecisionInput): unknown {
  switch (input.decision) {
    case "approveOnce":
      return "accept";
    case "approveForSession":
      return "acceptForSession";
    case "alwaysAllowRule":
      return {
        acceptWithExecpolicyAmendment: {
          execpolicy_amendment: input.rulePrefix ?? []
        }
      };
    case "deny":
      return "decline";
    case "cancel":
      return "cancel";
  }
}

function toFileChangeDecision(input: ApprovalDecisionInput): unknown {
  switch (input.decision) {
    case "approveOnce":
    case "alwaysAllowRule":
      return "accept";
    case "approveForSession":
      return "acceptForSession";
    case "deny":
      return "decline";
    case "cancel":
      return "cancel";
  }
}

function toLegacyReviewDecision(input: ApprovalDecisionInput): unknown {
  switch (input.decision) {
    case "approveOnce":
      return "approved";
    case "approveForSession":
      return "approved_for_session";
    case "alwaysAllowRule":
      return {
        approved_execpolicy_amendment: {
          proposed_execpolicy_amendment: input.rulePrefix ?? []
        }
      };
    case "deny":
      return "denied";
    case "cancel":
      return "abort";
  }
}

export function toCodexApprovalResponse(input: ApprovalDecisionInput, kind: CodexApprovalResponseKind): unknown {
  if (kind === "commandExecution") {
    return { decision: toCommandExecutionDecision(input) };
  }
  if (kind === "fileChange") {
    return { decision: toFileChangeDecision(input) };
  }
  return { decision: toLegacyReviewDecision(input) };
}
