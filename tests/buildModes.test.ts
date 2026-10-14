import { describe, expect, it } from "vitest";
import extensionConfig from "../vite.config";
import harnessConfig from "../vite.harness.config";

describe.each([
  ["extension", extensionConfig],
  ["banc navigateur", harnessConfig],
] as const)("feature flags de compilation : %s", (_name, config) => {
  it.each([
    ["dist", true],
    ["development", true],
    ["test", true],
    ["package", false],
    ["production", false],
    ["autre-mode", false],
  ])("mode %s : Sprint Planning actif = %s", async (mode, enabled) => {
    const resolved = await (typeof config === "function"
      ? config({ command: "build", mode })
      : config);
    expect(resolved.define?.__SPRINT_PLANNING_ENABLED__).toBe(enabled);
  });
});
