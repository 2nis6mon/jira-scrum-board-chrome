import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, posix, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { english } from "../../src/i18n";

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

type Source = { file: string; code: string };

// Imports des fichiers `from` vers une cible `to`, chacun écrit « fichier → cible » pour
// qu'un échec désigne le fautif. Couvre `from`, `import()` et l'import d'effet de bord.
function forbiddenImports(files: Source[], from: RegExp, to: RegExp): string[] {
  return files
    .filter(({ file }) => from.test(file))
    .flatMap(({ file, code }) =>
      [...code.matchAll(/(?:from\s*|import\s*\(\s*|^\s*import\s+)["']([^"']+)["']/gm)]
        .map((match) => posix.normalize(posix.join(posix.dirname(file), match[1] ?? "")))
        .filter((target) => to.test(target))
        .map((target) => `${file} → ${target}`),
    );
}

// Imports de VALEUR des fichiers `from` vers une cible `to` : `import type` et `export type`
// n'y comptent pas, un import mêlant types et valeurs (`{ type A, b }`) si. Couvre aussi les
// réexportations, `import()` et l'import d'effet de bord. Chaque entrée est « fichier → cible ».
function valueImports(files: Source[], from: RegExp, to: RegExp): string[] {
  const statement =
    /^\s*(?:import|export)\s+(type\s+)?(?:[^;'"]*?\s+from\s*)?["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']/gm;
  return files
    .filter(({ file }) => from.test(file))
    .flatMap(({ file, code }) =>
      [...code.matchAll(statement)]
        .filter((match) => match[1] === undefined)
        .map((match) =>
          posix.normalize(posix.join(posix.dirname(file), match[2] ?? match[3] ?? "")),
        )
        .filter((target) => to.test(target))
        .map((target) => `${file} → ${target}`),
    );
}

// Racine de composition (AD-1) : seuls ces modèles construisent l'accès Jira et le journal ;
// tout autre module les reçoit par injection.
const COMPOSITION_ROOTS = [
  "src/app/model/AppModel.ts",
  "src/app/model/BoardModel.ts",
  "src/app/model/DiagnosticModel.ts",
];

function constructionsOutsideRoots(files: Source[]): string[] {
  return files
    .filter(({ file }) => !COMPOSITION_ROOTS.includes(file))
    .flatMap(({ file, code }) =>
      [
        ...code.matchAll(
          /\bnew\s+(JiraTransport|JiraClient|GoalsClient|AuditLog)\s*(?:<[^>]*>\s*)?\(/g,
        ),
      ].map((match) => `${file} → new ${match[1]}`),
    );
}

// Phrases de l'interface (AD, convention « Erreurs et messages ») : `core` rend des raisons
// typées, l'application produit le texte. Un littéral de `src/core/` égal à une clé du catalogue,
// ou à sa partie fixe une fois les paramètres remplacés, est une phrase écrite au mauvais endroit.
const placeholders = (text: string, pattern: RegExp) => {
  let index = 0;
  return text.replace(pattern, () => `{p${index++}}`);
};
const CATALOG_SHAPES = new Set(
  Object.keys(english).map((key) => placeholders(key, /\{[a-zA-Z]\w*\}/g)),
);

// Littéraux "…", '…' et gabarits `…${x}…` (les `${…}` deviennent des paramètres). Les
// commentaires sont consommés dans le même balayage, sans capture : une apostrophe ou un
// accent grave dans un commentaire ne décale pas l'analyse, et `//` dans une chaîne reste à elle.
const STRING_LITERALS =
  /\/\/[^\n]*|\/\*[\s\S]*?\*\/|"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.|\$\{[^}]*\})*)`/g;

/**
 * Valeurs persistées qui coïncident avec une clé du catalogue : ce sont des données, pas des
 * messages. Le nom de la règle intégrée est écrit dans les réglages du board depuis 0.27 ; le
 * changer modifierait un format persisté.
 */
const PERSISTED_CATALOG_VALUES = [
  { file: "src/core/cardColors.ts", text: "Ajouté en cours de sprint" },
];

function catalogPhrases(files: Source[]): string[] {
  return files
    .filter(({ file }) => file.startsWith("src/core/"))
    .flatMap(({ file, code }) =>
      [...code.matchAll(STRING_LITERALS)]
        .filter(
          (match) => match[1] !== undefined || match[2] !== undefined || match[3] !== undefined,
        )
        .map((match) =>
          match[3] === undefined
            ? (match[1] ?? match[2] ?? "")
            : placeholders(match[3], /\$\{[^}]*\}/g),
        )
        .filter(
          (text) =>
            CATALOG_SHAPES.has(placeholders(text, /\{[a-zA-Z]\w*\}/g)) &&
            !PERSISTED_CATALOG_VALUES.some((value) => value.file === file && value.text === text),
        )
        .map((text) => `${file} → « ${text} »`),
    );
}

describe("gardes de dépendances", () => {
  // Sources fictives en mémoire : la garde doit échouer en nommant le fichier fautif.
  it("signale un import jira → core en nommant le fichier", () => {
    const fictive = [
      { file: "src/jira/x.ts", code: 'import { y } from "../core/y";' },
      { file: "src/jira/z.ts", code: 'import { errors } from "./errors";' },
      { file: "src/core/w.ts", code: 'import type { JiraClient } from "../jira/client";' },
      { file: "src/jira/effet.ts", code: 'const a = 1;\nimport "../core/x";' },
      { file: "src/jira/dossier.ts", code: 'export { y } from "../core";' },
    ];
    expect(forbiddenImports(fictive, /^src\/jira\//, /^src\/core(?:\/|$)/)).toEqual([
      "src/jira/x.ts → src/core/y",
      "src/jira/effet.ts → src/core/x",
      "src/jira/dossier.ts → src/core",
    ]);
  });

  it("signale une construction hors de la racine de composition en nommant le fichier", () => {
    const fictive = [
      { file: "src/app/services/X.ts", code: "const client = new JiraClient(transport);" },
      { file: "src/app/model/BoardModel.ts", code: "this.audit = new AuditLog(store);" },
      { file: "src/app/services/Y.ts", code: "const goals = new GoalsClient<Goal>(transport);" },
    ];
    expect(constructionsOutsideRoots(fictive)).toEqual([
      "src/app/services/X.ts → new JiraClient",
      "src/app/services/Y.ts → new GoalsClient",
    ]);
  });
});

describe("garde des phrases de core", () => {
  it("signale une phrase du catalogue écrite dans core, en nommant le fichier", () => {
    const fictive = [
      { file: "src/core/x.ts", code: 'throw new Error("La sélection contient des doublons.");' },
      // Partie fixe d'une clé à paramètre, écrite en gabarit.
      { file: "src/core/y.ts", code: "const text = `Jira a refusé de classer $" + "{key}.`;" },
      { file: "src/core/z.ts", code: 'throw new CoreError({ code: "goalGone" });' },
      { file: "src/app/model/a.ts", code: 'message("La sélection contient des doublons.");' },
      { file: "src/core/cardColors.ts", code: 'const name = "Ajouté en cours de sprint";' },
      // Commentaires pièges : un accent grave et une apostrophe isolés ne décalent pas l'analyse,
      // et une phrase citée en commentaire n'est pas un littéral.
      {
        file: "src/core/w.ts",
        code: [
          'const url = "https://x.atlassian.net"; // l\'accent ` ouvre un faux gabarit',
          "/* « La sélection contient des doublons. » n'est qu'une citation */",
          'const a = "Jira a renvoyé un autre sprint.";',
        ].join("\n"),
      },
    ];
    expect(catalogPhrases(fictive)).toEqual([
      "src/core/x.ts → « La sélection contient des doublons. »",
      "src/core/y.ts → « Jira a refusé de classer {p0}. »",
      "src/core/w.ts → « Jira a renvoyé un autre sprint. »",
    ]);
  });
});

describe("code de production", () => {
  it("n'écrit dans core aucune phrase du catalogue : raisons typées seulement", () => {
    expect(catalogPhrases(sources)).toEqual([]);
  });

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

  it("ne nomme les clés de connexion et de boards que dans leur module propriétaire (AD-4)", () => {
    expect(filesMatching(/["'`]connection\.v1["'`]/)).toEqual(["src/app/model/connectionStore.ts"]);
    expect(filesMatching(/["'`]launcher\.v1["'`]/)).toEqual(["src/app/model/connectionStore.ts"]);
    expect(filesMatching(/["'`]boards\.v1["'`]/)).toEqual(["src/app/model/boardStore.ts"]);
  });

  it("ne déclare d'interrupteur de fonction que dans app/featureFlags.ts, fixé à la compilation (AD-5)", () => {
    const declaration = /(?:export\s+)?(?:const|let|var)\s+[A-Z0-9_]+_ENABLED\b/;
    expect(
      sources
        .filter(({ file, code }) => file !== "src/app/featureFlags.ts" && declaration.test(code))
        .map(({ file }) => file),
    ).toEqual([]);
    const flags = sources.find(({ file }) => file === "src/app/featureFlags.ts");
    expect(flags).toBeDefined();
    // Aucune préférence, aucun réglage ni aucune URL : seulement des constantes de compilation.
    expect(forbiddenImports(flags ? [flags] : [], /./, /./)).toEqual([]);
    const found = [
      ...(flags?.code.matchAll(
        /(?:export\s+)?(?:const|let|var)\s+([A-Z0-9_]+_ENABLED)\s*(?::\s*[^=;]+)?=\s*([^;]+);/g,
      ) ?? []),
    ];
    expect(found.map((match) => match[1]).sort()).toEqual([
      "DIAGNOSTIC_ENABLED",
      "SPRINT_HEALTH_ENABLED",
      "SPRINT_PLANNING_ENABLED",
    ]);
    for (const match of found) expect(match[2]?.trim(), match[1]).toBe(`__${match[1]}__`);
  });

  it("ne choisit le stockage des Goals épinglés que dans core/pinnedGoals.ts (AD-4)", () => {
    // Service et vue de l'épinglage consomment le stockage résolu, sans tester le type du board.
    const pinning = [
      "src/app/services/BoardSettingsService.ts",
      "src/app/views/settings/SprintGoalsPanel.tsx",
    ];
    for (const file of pinning) {
      const source = sources.find((candidate) => candidate.file === file);
      expect(source, file).toBeDefined();
      expect(source?.code, file).not.toMatch(/\bboardType\b/);
    }
    expect(filesMatching(/\bfunction pinnedGoalsStorage\b/)).toEqual(["src/core/pinnedGoals.ts"]);
  });

  it("laisse à core l'enchaînement des écritures de déplacement et de réglages (AD-2)", () => {
    // Les services déclenchent et traduisent les résultats ; séquences et relectures sont
    // portées par core/boardMove.ts et core/teamSettings.ts.
    for (const file of [
      "src/app/services/BoardMovementService.ts",
      "src/app/services/BoardSettingsService.ts",
    ]) {
      const source = sources.find((candidate) => candidate.file === file);
      expect(source, file).toBeDefined();
      expect(source?.code, file).not.toMatch(
        /\b(moveToColumn|rankIssue|setLink|boardProperty|publishTeamSettings|linkToTextGoal)\s*\(/,
      );
    }
  });

  it("fait passer les écritures du board par sa seule porte (AD-6)", () => {
    // Services et planning reçoivent la porte, jamais le transport brut, et ne tiennent pas de
    // file d'écriture propre : `BoardModel` détient la seule, `app/model/BoardWriteGate.ts`.
    const gated = sources.filter(
      ({ file }) =>
        file.startsWith("src/app/services/") || file === "src/app/model/PlanningModel.ts",
    );
    expect(gated.length).toBeGreaterThan(1);
    for (const { file, code } of gated) {
      expect(code, file).not.toMatch(/\bJiraTransport\b|\bgraphqlWrite\b/);
      if (file.startsWith("src/app/services/")) expect(code, file).not.toMatch(/\.then\(/);
      // Seule file tolérée : les brouillons locaux du planning (`#saveQueue`), sans écriture Jira.
      const queues = [...code.matchAll(/#\w*[Qq]ueue\b/g)].map((match) => match[0]);
      expect(new Set(queues), file).toEqual(
        new Set(file.endsWith("PlanningModel.ts") && queues.length > 0 ? ["#saveQueue"] : []),
      );
    }
    expect(filesMatching(/\bnew\s+BoardWriteGate\b/)).toEqual(["src/app/model/BoardModel.ts"]);
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
    expect(
      forbiddenImports(sources, /^src\/(core|jira)\//, /^src\/(app|integration)(?:\/|$)/),
    ).toEqual([]);
  });

  it("garde sans import le script copié par executeScript et le script de contenu (AD-7)", () => {
    // Leurs doublons du protocole sont comparés à integration/messages.ts par un test dédié.
    const selfContained = sources.filter(({ file }) =>
      /^src\/integration\/(?:injectBoard|bootstrap)\.ts$/.test(file),
    );
    expect(selfContained).toHaveLength(2);
    // Même extracteur que les gardes de dépendances, sur le code sans commentaires.
    expect(forbiddenImports(selfContained, /./, /./)).toEqual([]);
    for (const { file, code } of selfContained) expect(code, file).not.toMatch(/\brequire\s*\(/);
  });

  it("interdit à Jira de dépendre du métier, sans exception (AD-1)", () => {
    expect(sources.some(({ file }) => file.startsWith("src/jira/"))).toBe(true);
    expect(forbiddenImports(sources, /^src\/jira\//, /^src\/core(?:\/|$)/)).toEqual([]);
  });

  it("ne construit transport, clients et journal que dans la racine de composition (AD-1)", () => {
    for (const file of COMPOSITION_ROOTS) {
      expect(
        sources.some((source) => source.file === file),
        file,
      ).toBe(true);
    }
    expect(constructionsOutsideRoots(sources)).toEqual([]);
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

  it("signale un import de valeur interdit en nommant le fichier, pas un import de type", () => {
    const fictive = [
      { file: "src/app/services/A.ts", code: 'import { message } from "../model/appMessage";' },
      { file: "src/app/services/B.ts", code: 'import type { X } from "../model/BoardTypes";' },
      {
        file: "src/app/services/C.ts",
        code: 'import {\n  type Y,\n  z,\n} from "../model/coreText";',
      },
      { file: "src/app/services/D.ts", code: 'export { w } from "../model/LoadDiagnostics";' },
    ];
    expect(valueImports(fictive, /^src\/app\/services\//, /^src\/app\/model\//)).toEqual([
      "src/app/services/A.ts → src/app/model/appMessage",
      "src/app/services/C.ts → src/app/model/coreText",
      "src/app/services/D.ts → src/app/model/LoadDiagnostics",
    ]);
  });

  it("les services n'importent des modèles que des types et model/messages.ts (AD-1)", () => {
    expect(
      valueImports(sources, /^src\/app\/services\//, /^src\/app\/model\//).filter(
        (entry) => !entry.endsWith("→ src/app/model/messages"),
      ),
    ).toEqual([]);
  });

  it("les vues n'importent des services que des types (AD-1)", () => {
    expect(valueImports(sources, /^src\/app\/views\//, /^src\/app\/services\//)).toEqual([]);
  });

  it("platform n'importe d'integration que des types (AD-1)", () => {
    expect(valueImports(sources, /^src\/app\/platform\//, /^src\/integration\//)).toEqual([]);
  });

  it("i18n et featureFlags.ts n'importent rien de src hors d'eux-mêmes (AD-1)", () => {
    expect(forbiddenImports(sources, /^src\/i18n\//, /^src\/(?!i18n\/)/)).toEqual([]);
    expect(forbiddenImports(sources, /^src\/app\/featureFlags\.ts$/, /^src\//)).toEqual([]);
  });
});
