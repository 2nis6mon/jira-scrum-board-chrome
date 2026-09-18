import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Garde-fous sur le code de production. Ils complètent le typage : une écriture Jira ne
// peut naître que dans src/jira/writes.ts, et une requête que dans src/jira/transport.ts.

const root = fileURLToPath(new URL("../..", import.meta.url));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

const sources = sourceFiles(join(root, "src")).map((path) => ({
  file: relative(root, path),
  // Les commentaires décrivent les règles ; seul le code compte ici.
  code: readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, ""),
}));

function filesMatching(pattern: RegExp): string[] {
  return sources.filter(({ code }) => pattern.test(code)).map(({ file }) => file);
}

describe("code de production", () => {
  it("n'appelle fetch qu'à deux endroits : le transport et son branchement", () => {
    expect(filesMatching(/\bfetch\s*\(/).sort()).toEqual([
      "src/app/platform/chrome.ts",
      "src/jira/transport.ts",
    ]);
    expect(filesMatching(/XMLHttpRequest|WebSocket|EventSource|sendBeacon/)).toEqual([]);
  });

  it("ne nomme une méthode HTTP d'écriture que dans le transport et l'inventaire", () => {
    expect(filesMatching(/["'`](POST|PUT|PATCH|DELETE)["'`]/).sort()).toEqual([
      "src/jira/transport.ts",
      "src/jira/writes.ts",
    ]);
    expect(filesMatching(/["'`]PATCH["'`]/)).toEqual([]);
  });

  it("n'écrit jamais le sprint lui-même (champ « Sprint Goal »)", () => {
    const writes = sources.find(({ file }) => file === "src/jira/writes.ts");
    const sprintPaths = writes?.code.match(/\/rest\/agile\/1\.0\/sprint[^`"']*/g) ?? [];
    expect(sprintPaths.length).toBeGreaterThan(0);
    for (const path of sprintPaths) expect(path).toContain("/properties/");
  });

  it("ne contient aucune mutation GraphQL à cette étape", () => {
    expect(
      filesMatching(/goals_linkWorkItem|goals_unlinkWorkItem|\bmutation\s+\w*\s*[({]/),
    ).toEqual([]);
  });

  it("n'utilise ni storage.sync, ni cookies, ni exécution de code dynamique", () => {
    expect(
      filesMatching(/storage\.sync|chrome\.cookies|document\.cookie|\beval\s*\(|new Function\s*\(/),
    ).toEqual([]);
    expect(filesMatching(/dangerouslySetInnerHTML|\.innerHTML\b/)).toEqual([]);
  });

  it("n'importe rien depuis tests/ et n'embarque aucune donnée fictive", () => {
    expect(filesMatching(/from\s+["'][^"']*tests\//)).toEqual([]);
    expect(filesMatching(/acme\.atlassian|fakeJira|jiraFixtures|Lorem ipsum/i)).toEqual([]);
    // Mot exact : le compteur `toDo` des indicateurs n'est pas un marqueur de travail inachevé.
    expect(filesMatching(/\b(TODO|FIXME|XXX)\b/)).toEqual([]);
  });

  it("ne touche aux en-têtes réseau qu'à un endroit : la règle Origin de la passerelle", () => {
    expect(filesMatching(/declarativeNetRequest/)).toEqual(["src/app/platform/chrome.ts"]);
    expect(filesMatching(/modifyHeaders|requestHeaders/)).toEqual([
      "src/app/platform/originRule.ts",
    ]);
    expect(filesMatching(/webRequest|responseHeaders/)).toEqual([]);
  });

  it("garde jira/ indépendant de chrome.* et du DOM", () => {
    const jira = sources.filter(({ file }) => file.startsWith("src/jira/"));
    for (const { file, code } of jira) {
      expect(code, file).not.toMatch(/\bchrome\.|\bdocument\.|\bwindow\.|\bnavigator\./);
    }
  });
});
