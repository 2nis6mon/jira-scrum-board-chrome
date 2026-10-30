import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  message,
  PROTOCOL,
  type ReceivedMessage,
  readMessage,
} from "../../src/integration/messages";

// Protocole hôte ↔ vue (AD-7) : une seule déclaration dans messages.ts, des doublons nommés là où
// l'import est impossible, et une comparaison qui échoue en nommant le message et le champ.

const root = fileURLToPath(new URL("../..", import.meta.url));
const read = (file: string) => readFileSync(join(root, file), "utf8");

const PROTOCOL_START = "// <protocole sprint-goals>";
const PROTOCOL_END = "// </protocole sprint-goals>";
const VALIDATION_START = "// <validation sprint-goals>";
const VALIDATION_END = "// </validation sprint-goals>";

/** Copies du protocole : fichier et messages qu'elle doit déclarer. */
const COPIES: ReadonlyArray<{ file: string; names: readonly string[] }> = [
  { file: "src/integration/injectBoard.ts", names: Object.keys(PROTOCOL) },
  { file: "src/integration/bootstrap.ts", names: ["launch"] },
  { file: "src/app/platform/launcherChrome.ts", names: ["prepareLaunch"] },
];

function blocks(source: string, start: string, end: string): string[] {
  const found: string[] = [];
  let from = source.indexOf(start);
  while (from >= 0) {
    const to = source.indexOf(end, from);
    if (to < 0) throw new Error(`marqueur ${end} manquant`);
    found.push(source.slice(from + start.length, to));
    from = source.indexOf(start, to);
  }
  return found;
}

/** Évalue une copie : un littéral `const PROTOCOL = {…};` sans syntaxe TypeScript. */
function evaluateCopy(block: string): unknown {
  return new Function(`${block}\nreturn PROTOCOL;`)();
}

/** Chemins des écarts entre la déclaration et une copie, par exemple `openIssue.fields.key.pattern`. */
function differences(expected: unknown, actual: unknown, path = ""): string[] {
  const isObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null;
  if (!isObject(expected) || !isObject(actual)) {
    return Object.is(expected, actual) ? [] : [path];
  }
  if (Array.isArray(expected) !== Array.isArray(actual)) return [path];
  const keys = new Set([...Object.keys(expected), ...Object.keys(actual)]);
  return [...keys].flatMap((key) =>
    differences(expected[key], actual[key], path ? `${path}.${key}` : key),
  );
}

// Le formateur peut couper différemment selon l'indentation : seuls comptent les jetons.
const tokens = (code: string) => code.replace(/\s+/g, "").replace(/,(?=[)\]}])/g, "");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

describe("déclaration unique du protocole sprint-goals", () => {
  it("nomme le message et le champ quand une copie diverge", () => {
    const widened = structuredClone(PROTOCOL) as unknown as {
      openIssue: { fields: { key: { pattern: string } } };
      close: { direction: string };
    };
    widened.openIssue.fields.key.pattern = "^.+$";
    widened.close.direction = "host-to-view";
    expect(differences(PROTOCOL, widened)).toEqual([
      "close.direction",
      "openIssue.fields.key.pattern",
    ]);
    // Champ ajouté d'un seul côté, ou longueur différente.
    expect(
      differences(
        { a: { fields: { x: { maxLength: 199 } } } },
        { a: { fields: { x: { maxLength: 200 }, y: { kind: "string" } } } },
      ),
    ).toEqual(["a.fields.x.maxLength", "a.fields.y"]);
  });

  for (const { file, names } of COPIES) {
    it(`garde la copie de ${file} conforme à messages.ts`, () => {
      const found = blocks(read(file), PROTOCOL_START, PROTOCOL_END);
      expect(found, file).toHaveLength(1);
      const copy = evaluateCopy(found[0] ?? "");
      const expected = Object.fromEntries(
        names.map((name) => [name, PROTOCOL[name as keyof typeof PROTOCOL]]),
      );
      expect(differences(expected, copy), file).toEqual([]);
    });
  }

  it("valide dans injectBoard.ts avec le même code que messages.ts", () => {
    const reference = blocks(read("src/integration/messages.ts"), VALIDATION_START, VALIDATION_END);
    const copy = blocks(read("src/integration/injectBoard.ts"), VALIDATION_START, VALIDATION_END);
    expect(reference).toHaveLength(1);
    expect(copy).toHaveLength(1);
    expect(tokens(copy[0] ?? "")).toBe(tokens(reference[0] ?? ""));
  });

  it("n'ouvre de bloc marqué que dans messages.ts et les copies connues", () => {
    const marked = sourceFiles(join(root, "src"))
      .map((path) => relative(root, path).split(sep).join("/"))
      .filter((file) => /<\/?(?:protocole|validation) sprint-goals>/.test(read(file)))
      .sort();
    expect(marked).toEqual(
      ["src/integration/messages.ts", ...COPIES.map(({ file }) => file)].sort(),
    );
  });

  it("n'écrit aucun type sprint-goals: hors de messages.ts et des blocs marqués", () => {
    const offenders = sourceFiles(join(root, "src")).flatMap((path) => {
      const file = relative(root, path).split(sep).join("/");
      if (file === "src/integration/messages.ts") return [];
      let code = read(file);
      for (const block of blocks(code, PROTOCOL_START, PROTOCOL_END))
        code = code.replace(block, "");
      return /sprint-goals:/.test(code) ? [file] : [];
    });
    expect(offenders).toEqual([]);
  });

  it("déclare des types uniques, préfixés et rattachés à un canal connu", () => {
    const declarations = Object.values(PROTOCOL);
    expect(new Set(declarations.map(({ type }) => type)).size).toBe(declarations.length);
    for (const { type, channel, direction } of declarations) {
      expect(type).toMatch(/^sprint-goals:[a-z-]+$/);
      expect(
        channel === "postMessage"
          ? ["view-to-host", "host-to-view"]
          : ["content-to-worker", "launcher-to-worker"],
        type,
      ).toContain(direction);
    }
  });
});

describe("lecture des messages reçus", () => {
  it("accepte les messages bien formés, sans champ non déclaré", () => {
    expect(
      readMessage(
        { type: "sprint-goals:open-board", boardId: 8, projectKey: "XYZ", url: "https://x" },
        "view-to-host",
      ),
    ).toEqual({ type: "sprint-goals:open-board", boardId: 8, projectKey: "XYZ" });
    expect(readMessage({ type: "sprint-goals:language", language: "es" }, "view-to-host")).toEqual({
      type: "sprint-goals:language",
      language: "es",
    });
    expect(readMessage({ type: "sprint-goals:close" }, "view-to-host")).toEqual({
      type: "sprint-goals:close",
    });
    expect(readMessage({ type: "sprint-goals:refresh" }, "host-to-view")).toEqual({
      type: "sprint-goals:refresh",
    });
    expect(readMessage({ type: "sprint-goals:launch" }, "content-to-worker")).toEqual({
      type: "sprint-goals:launch",
    });
    expect(readMessage({ type: "sprint-goals:prepare-launch" }, "launcher-to-worker")).toEqual({
      type: "sprint-goals:prepare-launch",
    });
  });

  it("ignore un open-board dont l'identifiant ou la clé de projet est invalide", () => {
    for (const fields of [
      { boardId: 8, projectKey: "abc" },
      { boardId: 8, projectKey: "../../x" },
      { boardId: 8, projectKey: "XYZ/boards/9?x=" },
      { boardId: "8", projectKey: "XYZ" },
      { boardId: 0, projectKey: "XYZ" },
      { boardId: 1.5, projectKey: "XYZ" },
      { boardId: 2 ** 53, projectKey: "XYZ" },
      { projectKey: "XYZ" },
    ]) {
      expect(
        readMessage({ type: "sprint-goals:open-board", ...fields }, "view-to-host"),
        JSON.stringify(fields),
      ).toBeNull();
    }
  });

  it("ignore une langue inconnue, un type inconnu ou un message dans le mauvais sens", () => {
    expect(readMessage({ type: "sprint-goals:language", language: "xx" }, "view-to-host")).toBe(
      null,
    );
    expect(readMessage({ type: "sprint-goals:language" }, "view-to-host")).toBeNull();
    expect(readMessage({ type: "sprint-goals:unknown" }, "view-to-host")).toBeNull();
    expect(readMessage({ type: "sprint-goals:refresh" }, "view-to-host")).toBeNull();
    expect(readMessage({ type: "sprint-goals:close" }, "host-to-view")).toBeNull();
    expect(readMessage({ type: "sprint-goals:launch" }, "launcher-to-worker")).toBeNull();
    expect(readMessage({ type: "sprint-goals:prepare-launch" }, "content-to-worker")).toBeNull();
    for (const data of [null, undefined, "sprint-goals:close", 3, []]) {
      expect(readMessage(data, "view-to-host")).toBeNull();
    }
  });

  it("valide la clé du ticket et ramène une transition invalide à null", () => {
    const issue = (fields: Record<string, unknown>) =>
      readMessage(
        { type: "sprint-goals:open-issue", ...fields },
        "view-to-host",
      ) as ReceivedMessage<"openIssue"> | null;
    expect(issue({ key: "ABC-102" })).toEqual({
      type: "sprint-goals:open-issue",
      key: "ABC-102",
      transition: null,
    });
    for (const key of [
      "abc-1",
      "ABC-0",
      "ABC-01",
      "ABC",
      "1BC-2",
      " ABC-2",
      undefined,
      ["ABC-1"],
    ]) {
      expect(issue({ key }), String(key)).toBeNull();
    }
    const valid = { id: "51", name: "TEST OK", to: "Validé" };
    expect(issue({ key: "ABC-1", transition: valid })?.transition).toEqual(valid);
    expect(issue({ key: "ABC-1", transition: { id: "51", name: "TEST OK" } })?.transition).toEqual({
      id: "51",
      name: "TEST OK",
      to: null,
    });
    expect(
      issue({ key: "ABC-1", transition: { ...valid, to: "x".repeat(200) } })?.transition,
    ).toEqual({ id: "51", name: "TEST OK", to: null });
    expect(
      issue({ key: "ABC-1", transition: { ...valid, name: "x".repeat(199) } })?.transition,
    ).toEqual({ ...valid, name: "x".repeat(199) });
    for (const transition of [
      { ...valid, id: "5a" },
      { ...valid, id: 51 },
      { ...valid, name: "x".repeat(200) },
      { id: "51" },
      "51",
      false,
    ]) {
      const read = issue({ key: "ABC-1", transition });
      expect(read?.key, JSON.stringify(transition)).toBe("ABC-1");
      expect(read?.transition, JSON.stringify(transition)).toBeNull();
    }
  });

  it("construit les messages avec le type déclaré", () => {
    expect(message("close")).toEqual({ type: "sprint-goals:close" });
    expect(message("openIssue", { key: "ABC-1" })).toEqual({
      type: "sprint-goals:open-issue",
      key: "ABC-1",
    });
    expect(message("openBoard", { boardId: 8, projectKey: "XYZ" })).toEqual({
      type: "sprint-goals:open-board",
      boardId: 8,
      projectKey: "XYZ",
    });
  });
});
