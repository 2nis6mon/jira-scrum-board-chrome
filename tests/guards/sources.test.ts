import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, posix, relative, sep } from "node:path";
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
  file: relative(root, path).split(sep).join("/"),
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

  it("n'encode et n'écrit sprintgoals.v1 que dans son module propriétaire (AD-4)", () => {
    expect(filesMatching(/\bencodeSprintGoalDocument\b/)).toEqual(["src/core/sprintGoals.ts"]);
    // Seule exception : la lecture tolérante d'affichage du board.
    expect(filesMatching(/\bdecodeSprintGoalDocument\b/).sort()).toEqual([
      "src/core/boardSync.ts",
      "src/core/sprintGoals.ts",
    ]);
    const putsGoals = sources
      .filter(({ code }) => /["'`]sprintProperty\.put["'`]/.test(code))
      .filter(({ code }) => /SPRINT_PROPERTY_KEYS\.goals/.test(code))
      .map(({ file }) => file);
    expect(putsGoals).toEqual(["src/core/sprintGoals.ts"]);
  });

  it("ne nomme une méthode HTTP d'écriture que dans le transport et l'inventaire", () => {
    expect(filesMatching(/["'`](POST|PUT|PATCH|DELETE)["'`]/).sort()).toEqual([
      "src/jira/transport.ts",
      "src/jira/writes.ts",
    ]);
    expect(filesMatching(/["'`]PATCH["'`]/)).toEqual([]);
  });

  it("limite les chemins sprint aux propriétés, au texte et aux ajouts du planning", () => {
    const writes = sources.find(({ file }) => file === "src/jira/writes.ts");
    const sprintPaths = writes?.code.match(/\/rest\/agile\/1\.0\/sprint[^`"']*/g) ?? [];
    expect(sprintPaths.length).toBeGreaterThan(0);
    for (const path of sprintPaths) {
      expect(path).toMatch(
        /^\/rest\/agile\/1\.0\/sprint\/\$\{(?:sprintId|write\.sprintId)\}(?:\/properties\/\$\{key\}|\/issue)?$/,
      );
    }
    // Le corps de publication ne peut porter ni état de sprint, ni dates, ni création.
    expect(writes?.code).not.toMatch(
      /state:\s*write\.|startDate:\s*write\.|endDate:\s*write\.|name:\s*write\./,
    );
  });

  it("ne déclare de mutation GraphQL que dans l'inventaire, et seulement les deux de rattachement", () => {
    expect(filesMatching(/\bmutation\s+\w*\s*[({]/)).toEqual(["src/jira/writes.ts"]);
    const writes = sources.find(({ file }) => file === "src/jira/writes.ts")?.code ?? "";
    const mutated = [...writes.matchAll(/\bmutation\s+\w+[^{]*\{\s*(\w+)\(/g)].map((m) => m[1]);
    expect(mutated.sort()).toEqual(["goals_linkWorkItem", "goals_unlinkWorkItem"]);
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

  it("n'ouvre un nouvel onglet qu'avec noopener, et un lien de Goal que vers Atlassian", () => {
    for (const { file, code } of sources) {
      const blank = code.match(/target="_blank"/g)?.length ?? 0;
      const safe = code.match(/rel="noopener noreferrer"/g)?.length ?? 0;
      expect(safe, file).toBe(blank);
    }
    // L'adresse d'un Goal peut venir de la propriété du sprint : elle passe par atlassianLink.
    expect(filesMatching(/href=\{[^}]*atlassianUrl/)).toEqual([]);
  });

  it("garde le métier, Jira et les services indépendants de chrome.* et du DOM", () => {
    const modules = sources.filter(({ file }) => /^src\/(core|jira|app\/services)\//.test(file));
    for (const { file, code } of modules) {
      expect(code, file).not.toMatch(/\bchrome\.|\bwindow\.|\bnavigator\./);
      if (file.startsWith("src/jira/")) expect(code, file).not.toMatch(/\bdocument\./);
      // « document » nomme aussi une propriété Jira décodée ; viser les API du DOM.
      expect(code, file).not.toMatch(
        /\bdocument\.(?:body|head|documentElement|create\w+|querySelector\w*|getElement\w+|addEventListener|removeEventListener|location|cookie)\b|\b(?:HTMLElement|MutationObserver|DOMParser)\b/,
      );
    }
  });

  it("interdit aux couches métier et Jira de dépendre de l'interface ou de l'intégration", () => {
    for (const { file, code } of sources.filter(({ file }) => /^src\/(core|jira)\//.test(file))) {
      for (const match of code.matchAll(/(?:from\s*|import\s*\(\s*)["']([^"']+)["']/g)) {
        const target = posix.normalize(posix.join(posix.dirname(file), match[1] ?? ""));
        expect(target, `${file} → ${target}`).not.toMatch(/^src\/(app|integration)\//);
      }
    }
  });

  it("interdit aux services de revenir vers la façade BoardModel ou les vues", () => {
    for (const { file, code } of sources.filter(({ file }) =>
      file.startsWith("src/app/services/"),
    )) {
      for (const match of code.matchAll(/(?:from\s*|import\s*\(\s*)["']([^"']+)["']/g)) {
        expect(match[1], file).not.toMatch(/^@preact\/|^preact(?:\/|$)/);
        const target = posix.normalize(posix.join(posix.dirname(file), match[1] ?? ""));
        expect(target, `${file} → ${target}`).not.toMatch(/\/views\/|\/BoardModel(?:\.|$)/);
      }
    }
  });
});
