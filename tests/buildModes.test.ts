import { describe, expect, it } from "vitest";
import extensionConfig from "../vite.config";
import harnessConfig from "../vite.harness.config";

describe.each([
  ["extension", extensionConfig],
  ["banc navigateur", harnessConfig],
] as const)("feature flags de compilation : %s", (_name, config) => {
  const resolve = async (mode: string) =>
    typeof config === "function" ? config({ command: "build", mode }) : config;

  it.each([
    ["dist", true],
    ["development", true],
    ["test", true],
    ["package", false],
    ["production", false],
    ["autre-mode", false],
  ])("mode %s : Sprint Planning actif = %s", async (mode, enabled) => {
    const resolved = await resolve(mode);
    expect(resolved.define?.__SPRINT_PLANNING_ENABLED__).toBe(enabled);
  });

  // Comportement visible identique dans dist/ et dans le paquet : santé masquée, diagnostic actif.
  it.each(["dist", "package", "development", "test", "production", "autre-mode"])(
    "mode %s : santé du sprint masquée, diagnostic actif",
    async (mode) => {
      const resolved = await resolve(mode);
      expect(resolved.define?.__SPRINT_HEALTH_ENABLED__).toBe(false);
      expect(resolved.define?.__DIAGNOSTIC_ENABLED__).toBe(true);
    },
  );
});
