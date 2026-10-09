import { describe, expect, it, vi } from "vitest";
import {
  LauncherModel,
  type LauncherPlatform,
  type LauncherTab,
} from "../../src/experiment/LauncherModel";
import { launchBoardAddress } from "../../src/experiment/launchAddress";

// Données fictives : aucun navigateur connecté ni serveur Jira n'est utilisé.
const SITE = "https://acme.atlassian.net";
const BOARD = `${SITE}/jira/software/c/projects/ABC/boards/7`;
const MARKED = `${BOARD}?sprintGoals=1`;

function setup(tab: LauncherTab | null = null, saved: Record<string, unknown> = {}) {
  const stored = new Map(Object.entries(saved));
  const platform = {
    store: {
      get: vi.fn(async (key: string) => stored.get(key)),
      set: vi.fn(async (key: string, value: unknown) => {
        stored.set(key, value);
      }),
      remove: vi.fn(async (key: string) => {
        stored.delete(key);
      }),
    },
    hasPermission: vi.fn(async () => false),
    requestPermission: vi.fn(async () => true),
    currentTab: vi.fn(async () => tab),
    prepareLaunch: vi.fn(async () => {}),
    navigate: vi.fn(async () => {}),
    close: vi.fn(),
  } satisfies LauncherPlatform;
  const model = new LauncherModel(platform);
  return { model, platform, stored };
}

describe("lanceur de Sprint Goals dans Jira", () => {
  it("attend une adresse et un clic à la première installation", async () => {
    const { model, platform } = setup();
    await model.start();
    expect(model.ready.value).toBe(true);
    expect(model.address.value).toBe("");
    expect(platform.requestPermission).not.toHaveBeenCalled();
    expect(platform.navigate).not.toHaveBeenCalled();
    expect(platform.prepareLaunch).not.toHaveBeenCalled();
  });

  it("demande l'accès dans le geste puis attend le script de contenu avant d'ouvrir Jira", async () => {
    const { model, platform, stored } = setup();
    await model.start();
    model.address.value = BOARD;
    let accept: ((granted: boolean) => void) | undefined;
    platform.requestPermission.mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          accept = resolve;
        }),
    );
    let prepared: (() => void) | undefined;
    platform.prepareLaunch.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          prepared = resolve;
        }),
    );
    const opening = model.open();
    // Pas même un contrôle de permission asynchrone avant la demande du geste.
    expect(platform.requestPermission).toHaveBeenCalledWith(`${SITE}/*`);
    expect(platform.hasPermission).not.toHaveBeenCalled();
    expect(platform.prepareLaunch).not.toHaveBeenCalled();
    expect(platform.navigate).not.toHaveBeenCalled();
    accept?.(true);
    await vi.waitFor(() => expect(platform.prepareLaunch).toHaveBeenCalledOnce());
    expect(platform.navigate).not.toHaveBeenCalled();
    prepared?.();
    await opening;
    expect(platform.navigate).toHaveBeenCalledWith(MARKED, null);
    expect(stored.get("connection.v1")).toEqual({ origin: SITE });
    expect(stored.get("launcher.v1")).toBe(MARKED);
    expect(platform.close).toHaveBeenCalledOnce();
    expect(model.busy.value).toBe(false);
  });

  it("un refus Chrome laisse le formulaire sans navigation ni changement du stockage", async () => {
    const { model, platform, stored } = setup();
    await model.start();
    model.address.value = BOARD;
    platform.requestPermission.mockResolvedValue(false);
    await model.open();
    expect(model.error.value).toContain("n'a pas été autorisé");
    expect(model.busy.value).toBe(false);
    expect(platform.prepareLaunch).not.toHaveBeenCalled();
    expect(platform.navigate).not.toHaveBeenCalled();
    expect(platform.close).not.toHaveBeenCalled();
    expect(stored.size).toBe(0);
    // Le refus n'empêche pas de recommencer avec un nouveau geste.
    platform.requestPermission.mockResolvedValue(true);
    await model.open();
    expect(platform.navigate).toHaveBeenCalledWith(MARKED, null);
  });

  it.each([
    "https://example.com/jira/software/c/projects/ABC/boards/7",
    "http://acme.atlassian.net/jira/software/c/projects/ABC/boards/7",
    "https://user:secret@acme.atlassian.net/jira/software/c/projects/ABC/boards/7",
    `${SITE}/browse/ABC-7`,
    `${SITE}/jira/software/c/projects/ABC/boards/0`,
    SITE,
  ])("refuse %s avant la demande d'accès", async (address) => {
    const { model, platform } = setup();
    await model.start();
    model.address.value = address;
    await model.open();
    expect(model.error.value).toContain("adresse complète");
    expect(platform.requestPermission).not.toHaveBeenCalled();
    expect(platform.navigate).not.toHaveBeenCalled();
  });

  it("ouvre directement le board courant déjà autorisé, avant celui enregistré", async () => {
    const tab = { id: 12, url: `${BOARD}?selectedIssue=ABC-19` };
    const { model, platform } = setup(tab, {
      "launcher.v1": `${SITE}/jira/software/c/projects/XYZ/boards/8`,
    });
    platform.hasPermission.mockResolvedValue(true);
    await model.start();
    expect(model.address.value).toBe(MARKED);
    expect(platform.hasPermission).toHaveBeenCalledWith(`${SITE}/*`);
    expect(platform.requestPermission).not.toHaveBeenCalled();
    expect(platform.navigate).toHaveBeenCalledWith(MARKED, tab);
  });

  it("retrouve le board enregistré depuis une ancienne installation, même sans URL d'onglet", async () => {
    const { model, platform } = setup(
      { id: 12 },
      {
        "connection.v1": { origin: SITE },
        "boards.v1": {
          [SITE]: { activeBoardId: 7, boards: { "7": { projectKeys: ["ABC"] } } },
        },
      },
    );
    platform.hasPermission.mockResolvedValue(true);
    await model.start();
    expect(model.address.value).toBe(MARKED);
    expect(platform.navigate).toHaveBeenCalledWith(MARKED, { id: 12 });
    expect(platform.requestPermission).not.toHaveBeenCalled();
  });

  it("attend un nouveau geste quand l'autorisation d'un board enregistré a été retirée", async () => {
    const { model, platform } = setup(null, { "launcher.v1": BOARD });
    await model.start();
    expect(model.address.value).toBe(MARKED);
    expect(platform.navigate).not.toHaveBeenCalled();
    expect(platform.requestPermission).not.toHaveBeenCalled();
  });

  it("un échec d'enregistrement du script ne navigue pas et autorise une nouvelle tentative", async () => {
    const { model, platform } = setup(null, { "launcher.v1": BOARD });
    platform.hasPermission.mockResolvedValue(true);
    platform.prepareLaunch.mockRejectedValueOnce(new Error("Chrome indisponible"));
    await model.start();
    expect(model.error.value).toContain("réessayer");
    expect(platform.navigate).not.toHaveBeenCalled();
    expect(model.ready.value).toBe(true);
    await model.open();
    expect(platform.navigate).toHaveBeenCalledWith(MARKED, null);
  });

  it("reconnaît une ancienne adresse Jira avec clé de projet et refuse un stockage hors Jira", async () => {
    expect(launchBoardAddress(`${SITE}/secure/RapidBoard.jspa?rapidView=7&projectKey=ABC`)).toBe(
      MARKED,
    );
    const { model, platform } = setup(null, {
      "connection.v1": { origin: "https://example.com" },
      "boards.v1": {
        "https://example.com": { activeBoardId: 7, boards: { "7": { projectKeys: ["ABC"] } } },
      },
      "launcher.v1": "https://example.com/jira/software/c/projects/ABC/boards/7",
    });
    await model.start();
    expect(model.address.value).toBe("");
    expect(platform.hasPermission).not.toHaveBeenCalled();
    expect(platform.navigate).not.toHaveBeenCalled();
  });

  it("reconnaît le board de l'onglet au clic sur l'icône, sans demander l'accès avant le geste", async () => {
    // activeTab : Chrome donne l'adresse de l'onglet courant, le site n'est pas encore autorisé.
    const tab = { id: 4, url: `${BOARD}/backlog?selectedIssue=ABC-19` };
    const { model, platform } = setup(tab);
    await model.start();
    expect(model.detected.value).toBe(true);
    expect(model.offBoard.value).toBe(false);
    expect(model.address.value).toBe(`${BOARD}/backlog?sprintGoals=1`);
    expect(platform.requestPermission).not.toHaveBeenCalled();
    expect(platform.navigate).not.toHaveBeenCalled();
    await model.open();
    expect(platform.requestPermission).toHaveBeenCalledWith(`${SITE}/*`);
    expect(platform.navigate).toHaveBeenCalledWith(`${BOARD}/backlog?sprintGoals=1`, tab);
  });

  it.each([
    [`${SITE}/browse/ABC-7`, true],
    [`${SITE}/jira/your-work`, true],
    ["https://example.com/jira/software/c/projects/ABC/boards/7", false],
    ["chrome://extensions/", false],
  ])("hors d'un board (%s), rien n'est prérempli et l'aide suit la page", async (url, jira) => {
    const { model, platform } = setup({ id: 4, url });
    await model.start();
    expect(model.detected.value).toBe(false);
    expect(model.offBoard.value).toBe(jira);
    expect(model.address.value).toBe("");
    expect(platform.hasPermission).not.toHaveBeenCalled();
    expect(platform.navigate).not.toHaveBeenCalled();
  });
});
