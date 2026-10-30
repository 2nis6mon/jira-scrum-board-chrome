import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { AppModel } from "../../src/app/model/AppModel";
import { type AuditEntry, AuditLog } from "../../src/app/model/auditLog";
import { buttonPositionKey } from "../../src/app/model/buttonPosition";
import { planningDraftKey } from "../../src/app/model/PlanningModel";
import { NOT_SITE_DATA_KEYS, SITE_DATA_OWNERS } from "../../src/app/model/siteData";
import { FakeJira } from "../support/fakeJira";
import { fakePlatform } from "../support/fakePlatform";

// Données fictives : deux sites Jira inventés, aucun navigateur ni serveur réel.
const A = "https://acme.atlassian.net";
const B = "https://autre.atlassian.net";

const root = fileURLToPath(new URL("../..", import.meta.url));

/** Clés de la table « Clé `chrome.storage.local` » de docs/technique/donnees.md. */
function documentedKeys(): string[] {
  const doc = readFileSync(`${root}docs/technique/donnees.md`, "utf8");
  const section = doc.split("## Stockage local Chrome")[1]?.split("\n## ")[0] ?? "";
  return section
    .split("\n")
    .filter((line) => line.startsWith("|") && !line.startsWith("|---"))
    .slice(1)
    .flatMap((line) => [...(line.split("|")[1] ?? "").matchAll(/`([^`]+)`/g)].map((m) => m[1]))
    .filter((key): key is string => key !== undefined);
}

const declared = (): string[] => [
  ...SITE_DATA_OWNERS.flatMap((owner) => owner.keys),
  ...NOT_SITE_DATA_KEYS,
];

/** Clés documentées qui ne sont ni à un propriétaire de données de site, ni déclarées hors site. */
function undeclared(keys: readonly string[]): string[] {
  const known = new Set(declared());
  return keys.filter((key) => !known.has(key));
}

describe("liste unique des données de site (AD-4)", () => {
  it("couvre chaque clé de la table des données, et rien d'autre", () => {
    const keys = documentedKeys();
    expect(keys.length).toBeGreaterThanOrEqual(10);
    expect(undeclared(keys)).toEqual([]);
    expect(declared().filter((key) => !keys.includes(key))).toEqual([]);
    // Une clé nouvelle dans la table, sans propriétaire, est signalée.
    expect(undeclared([...keys, "nouvelle.v1"])).toEqual(["nouvelle.v1"]);
  });

  it("ne déclare aucune clé deux fois", () => {
    const keys = declared();
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("garde dans bootstrap.ts le même préfixe de position que son propriétaire", () => {
    const bootstrap = readFileSync(`${root}src/integration/bootstrap.ts`, "utf8");
    expect(bootstrap).toContain(`\`${buttonPositionKey("")}\${location.origin}\``);
  });
});

function audit(site: string) {
  return {
    at: "2026-10-30T10:00:00.000Z",
    site,
    action: "classement",
    issueKey: "ABC-1",
    from: null,
    to: null,
    outcome: "réussi",
    detail: null,
  };
}

/** Une donnée de chaque clé de site, pour A et pour B, et les préférences non liées à un site. */
function seed(stored: Map<string, unknown>, connected: string): void {
  stored.set("connection.v1", { origin: connected });
  stored.set("launcher.v1", `${B}/jira/software/c/projects/ABC/boards/7`);
  stored.set("boards.v1", {
    [A]: { activeBoardId: 7, boards: { "7": { projectKeys: ["ABC"] } } },
    [B]: { activeBoardId: 8, boards: { "8": { projectKeys: ["XYZ"] } } },
  });
  stored.set("dismissedNotices.v1", { [A]: { "7": ["no-goals"] }, [B]: { "8": ["no-goals"] } });
  stored.set("graphqlOrigin.v1", { [A]: "site", [B]: "remove" });
  stored.set("audit.v1", [audit(A), audit(B)]);
  for (const origin of [A, B]) {
    stored.set(planningDraftKey(origin), { "7:1": { version: 1 } });
    stored.set(buttonPositionKey(origin), { x: 0.5, y: 0.5 });
  }
  stored.set("language.v1", "es");
  stored.set("interface.v1", { sidebarWidth: 300, healthOpen: true });
}

function expectOnlyB(stored: Map<string, unknown>): void {
  expect(stored.get("launcher.v1")).toBe(`${B}/jira/software/c/projects/ABC/boards/7`);
  expect(stored.get("boards.v1")).toEqual({
    [B]: { activeBoardId: 8, boards: { "8": { projectKeys: ["XYZ"] } } },
  });
  expect(stored.get("dismissedNotices.v1")).toEqual({ [B]: { "8": ["no-goals"] } });
  expect(stored.get("graphqlOrigin.v1")).toEqual({ [B]: "remove" });
  expect(stored.get("audit.v1")).toEqual([audit(B)]);
  expect(stored.has(planningDraftKey(A))).toBe(false);
  expect(stored.has(buttonPositionKey(A))).toBe(false);
  expect(stored.get(planningDraftKey(B))).toEqual({ "7:1": { version: 1 } });
  expect(stored.get(buttonPositionKey(B))).toEqual({ x: 0.5, y: 0.5 });
  expect(stored.get("language.v1")).toBe("es");
  expect(stored.get("interface.v1")).toEqual({ sidebarWidth: 300, healthOpen: true });
}

async function connected() {
  const platform = fakePlatform(new FakeJira());
  const model = new AppModel(platform);
  await model.connect(A);
  return { platform, model };
}

describe("déconnexion : données du site effacées, celles des autres sites gardées", () => {
  it("efface toutes les données de A et garde celles de B", async () => {
    const { platform, model } = await connected();
    seed(platform.stored, A);
    await model.disconnect();
    expect(platform.stored.has("connection.v1")).toBe(false);
    expectOnlyB(platform.stored);
  });

  it("garde le site connecté et la dernière adresse enregistrés pour un autre site", async () => {
    const { platform, model } = await connected();
    seed(platform.stored, B);
    await model.disconnect();
    expect(platform.stored.get("connection.v1")).toEqual({ origin: B });
    expectOnlyB(platform.stored);
  });

  it("efface la dernière adresse du lanceur sur A et un site connecté illisible", async () => {
    const { platform, model } = await connected();
    seed(platform.stored, A);
    platform.stored.set("connection.v1", "valeur abîmée");
    platform.stored.set("launcher.v1", `${A}/jira/software/c/projects/ABC/boards/7`);
    await model.disconnect();
    expect(platform.stored.has("connection.v1")).toBe(false);
    expect(platform.stored.has("launcher.v1")).toBe(false);
  });

  it("efface aussi une adresse du lanceur sur A qui n'est pas celle d'un board", async () => {
    const { platform, model } = await connected();
    platform.stored.set("launcher.v1", `${A}/`);
    await model.disconnect();
    expect(platform.stored.has("launcher.v1")).toBe(false);
  });

  it("un ajout au journal pour A en cours pendant la déconnexion ne survit pas", async () => {
    const { platform, model } = await connected();
    const { set } = platform.store;
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let delayed = false;
    // La première écriture de audit.v1 attend qu'on la libère.
    platform.store.set = async (key, value) => {
      if (key === "audit.v1" && !delayed) {
        delayed = true;
        await held;
      }
      await set(key, value);
    };
    const appended = new AuditLog(platform.store).append(audit(A) as AuditEntry);
    await expect.poll(() => delayed).toBe(true);
    platform.stored.set(buttonPositionKey(A), { x: 0, y: 0 });
    const disconnected = model.disconnect();
    // L'effacement du site a commencé ; l'ajout n'est libéré qu'ensuite.
    await expect.poll(() => platform.stored.has(buttonPositionKey(A))).toBe(false);
    release();
    await Promise.all([appended, disconnected]);
    const entries = (platform.stored.get("audit.v1") ?? []) as AuditEntry[];
    expect(entries.filter((entry) => entry.site === A)).toEqual([]);
  });

  it("un propriétaire en échec n'empêche ni les autres ni la déconnexion", async () => {
    const { platform, model } = await connected();
    seed(platform.stored, A);
    const { set, remove } = platform.store;
    // Le stockage refuse toute écriture de boards.v1 ; les autres clés restent écrivables.
    platform.store.set = async (key, value) => {
      if (key === "boards.v1") throw new Error("stockage indisponible");
      await set(key, value);
    };
    platform.store.remove = async (key) => {
      if (key === "boards.v1") throw new Error("stockage indisponible");
      await remove(key);
    };
    await model.disconnect();
    expect(model.connection.value.state).toBe("disconnected");
    expect(platform.stored.has("connection.v1")).toBe(false);
    expect(platform.stored.get("dismissedNotices.v1")).toEqual({ [B]: { "8": ["no-goals"] } });
    expect(platform.stored.get("audit.v1")).toEqual([audit(B)]);
    expect(platform.stored.has(buttonPositionKey(A))).toBe(false);
    expect(platform.stored.has(planningDraftKey(A))).toBe(false);
  });
});
