import type { ApprovalDecisionKind } from "./models.js";

export const defaultAllowPrefixes = [
  ["pwd"],
  ["ls"],
  ["find"],
  ["cat"],
  ["grep"],
  ["git", "status"],
  ["git", "diff"],
  ["npm", "test"],
  ["pnpm", "test"],
  ["pnpm", "lint"],
  ["pnpm", "typecheck"],
  ["pytest", "-q"]
];

export const defaultPromptPrefixes = [
  ["git", "push"],
  ["git", "commit"],
  ["git", "merge"],
  ["gh", "pr", "create"],
  ["gh", "pr", "merge"]
];

export const defaultForbiddenPrefixes = [
  ["rm", "-rf", "/"],
  ["sudo"],
  ["su"],
  ["ssh"]
];

export function splitCommandPrefix(command: string): string[] {
  return command
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

export function startsWithPrefix(commandParts: string[], prefix: string[]): boolean {
  return prefix.every((part, index) => commandParts[index] === part);
}

export function classifyCommand(command: string): "allow" | "prompt" | "forbid" {
  const parts = splitCommandPrefix(command);
  if (defaultForbiddenPrefixes.some((prefix) => startsWithPrefix(parts, prefix))) {
    return "forbid";
  }
  if (defaultAllowPrefixes.some((prefix) => startsWithPrefix(parts, prefix))) {
    return "allow";
  }
  if (defaultPromptPrefixes.some((prefix) => startsWithPrefix(parts, prefix))) {
    return "prompt";
  }
  return "prompt";
}

export function allowedDecisionsForCommand(command: string | null): ApprovalDecisionKind[] {
  if (!command || classifyCommand(command) === "forbid") {
    return ["deny", "cancel"];
  }
  return ["approveOnce", "approveForSession", "alwaysAllowRule", "deny", "cancel"];
}
