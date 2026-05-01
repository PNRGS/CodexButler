import { describe, expect, it } from "vitest";
import { classifyCommand, splitCommandPrefix, startsWithPrefix } from "./policy.js";

describe("command policy", () => {
  it("splits command prefixes", () => {
    expect(splitCommandPrefix("  git status --short ")).toEqual(["git", "status", "--short"]);
  });

  it("detects matching prefixes", () => {
    expect(startsWithPrefix(["git", "status", "--short"], ["git", "status"])).toBe(true);
  });

  it("classifies safe read commands as allow candidates", () => {
    expect(classifyCommand("git status --short")).toBe("allow");
  });

  it("classifies destructive and privileged commands as forbidden", () => {
    expect(classifyCommand("rm -rf /")).toBe("forbid");
    expect(classifyCommand("sudo npm install")).toBe("forbid");
  });
});
