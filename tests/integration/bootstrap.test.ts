// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Données FICTIVES. Script de contenu chargé dans une fausse page Jira, sans navigateur.
const SITE = "https://acme.atlassian.net";
const BOARD = `${SITE}/jira/software/c/projects/ABC/boards/7`;
const sendMessage = vi.fn(async () => ({ ok: true }));
const POSITION_KEY = `jira-button-position.v1:${SITE}`;
const stored = new Map<string, unknown>();
const listeners = new Set<
  (changes: Record<string, chrome.storage.StorageChange>, area: string) => void
>();
const get = vi.fn(async (key: string) => ({ [key]: stored.get(key) }));
const set = vi.fn(async (values: Record<string, unknown>) => {
  for (const [key, value] of Object.entries(values)) stored.set(key, value);
});
const host = () => document.getElementById("sprint-goals-open") as HTMLElement;
const grip = () =>
  host().shadowRoot?.querySelector<HTMLButtonElement>(".grip") as HTMLButtonElement;
const point = () => ({
  x: Number.parseFloat(host().style.left),
  y: Number.parseFloat(host().style.top),
});
function pointer(type: string, x: number, y: number) {
  grip().dispatchEvent(new PointerEvent(type, { pointerId: 1, button: 0, clientX: x, clientY: y }));
}

async function load(address: string): Promise<void> {
  (window as unknown as { happyDOM: { setURL(url: string): void } }).happyDOM.setURL(address);
  vi.resetModules();
  // @ts-expect-error script de contenu sans export : il s'exécute à l'import.
  await import("../../src/integration/bootstrap");
  await vi.advanceTimersByTimeAsync(0);
}
const button = () =>
  document
    .getElementById("sprint-goals-open")
    ?.shadowRoot?.querySelector<HTMLButtonElement>(".open") ?? null;

beforeEach(() => {
  vi.useFakeTimers();
  sendMessage.mockReset().mockResolvedValue({ ok: true });
  stored.clear();
  listeners.clear();
  get.mockClear();
  set.mockClear();
  vi.stubGlobal("innerWidth", 1200);
  vi.stubGlobal("innerHeight", 800);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
    this: HTMLElement,
  ) {
    return new DOMRect(
      Number.parseFloat(this.style.left) || 0,
      Number.parseFloat(this.style.top) || 0,
      58,
      34,
    );
  });
  vi.spyOn(HTMLElement.prototype, "setPointerCapture").mockImplementation(() => {});
  vi.spyOn(HTMLElement.prototype, "hasPointerCapture").mockReturnValue(false);
  document.documentElement.removeAttribute("sprint-goals-direct-bootstrap");
  document.documentElement.lang = "fr";
  document.body.replaceChildren();
  vi.stubGlobal("chrome", {
    runtime: { sendMessage, getURL: (path: string) => `chrome-extension://fictif/${path}` },
    storage: {
      local: { get, set },
      onChanged: {
        addListener: (listener: typeof storageListener) => listeners.add(listener),
        removeListener: (listener: typeof storageListener) => listeners.delete(listener),
      },
    },
  });
});

function storageListener(_changes: Record<string, chrome.storage.StorageChange>, _area: string) {}

afterEach(async () => {
  // Invalide le contexte comme un rechargement d'extension pour détacher aussi les écouteurs DOM.
  sendMessage.mockRejectedValueOnce(new Error("Extension context invalidated."));
  history.replaceState(null, "", `${BOARD}?sprintGoals=1&cleanup=1`);
  await vi.advanceTimersByTimeAsync(500);
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("bouton Sprint Goals sur les boards Jira", () => {
  it.each([
    ["fr_FR", "auto", "Ouvrir ce board"],
    ["fr-CA", "auto", "Ouvrir ce board"],
    ["de", "auto", "Open this board"],
    ["fr", "en", "Open this board"],
    ["en", "fr", "Ouvrir ce board"],
    ["es-MX", "auto", "Abrir este tablero"],
    ["es_419", "auto", "Abrir este tablero"],
    ["fr", "es", "Abrir este tablero"],
    ["es", "en", "Open this board"],
  ])("choisit la langue Jira %s avec préférence %s", async (locale, preference, expected) => {
    document.documentElement.lang = locale;
    stored.set("language.v1", preference);
    await load(BOARD);
    expect(button()?.getAttribute("aria-label")).toContain(expected);
    expect(set).not.toHaveBeenCalled();
  });

  it("traduit le bouton existant après changement de préférence et respecte la suppression du choix", async () => {
    await load(BOARD);
    const original = button();
    for (const listener of listeners) listener({ "language.v1": { newValue: "en" } }, "local");
    expect(button()).toBe(original);
    expect(button()?.title).toContain("Open this board");
    for (const listener of listeners) listener({ "language.v1": { newValue: "es" } }, "local");
    expect(button()).toBe(original);
    expect(button()?.title).toContain("Abrir este tablero");
    for (const listener of listeners) listener({ "language.v1": {} }, "local");
    expect(button()?.title).toContain("Ouvrir ce board");
  });

  it.each([
    BOARD,
    `${BOARD}/backlog`,
    `${SITE}/jira/software/projects/ABC/boards/7?selectedIssue=ABC-1`,
  ])("s'affiche sur un board sans rien lancer : %s", async (address) => {
    await load(address);
    expect(button()?.textContent).toBe("Sprint Goals");
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("garde un nom accessible et deux boutons distincts pour ouvrir ou déplacer", async () => {
    await load(BOARD);
    const openButton = button();
    expect(openButton?.getAttribute("aria-label")).toBe("Ouvrir ce board dans Sprint Goals");
    expect(openButton?.title).toBe("Ouvrir ce board dans Sprint Goals");
    expect(openButton?.querySelector(".label")?.textContent).toBe("Sprint Goals");
    expect(openButton?.querySelector("img")?.alt).toBe("");
    expect(openButton?.querySelector("img")?.draggable).toBe(false);
    expect(openButton?.type).toBe("button");
    expect(grip().getAttribute("aria-label")).toBe("Déplacer le bouton Sprint Goals");
    expect(grip().type).toBe("button");
    openButton?.focus();
    expect(host().shadowRoot?.activeElement).toBe(openButton);
    grip().focus();
    expect(host().shadowRoot?.activeElement).toBe(grip());
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("conserve l'emplacement par défaut à 96 px du bord droit et 28 px du bas", async () => {
    await load(BOARD);
    expect(point()).toEqual({ x: 1046, y: 738 });
    expect(set).not.toHaveBeenCalled();
  });

  it.each([
    `${SITE}/browse/ABC-7`,
    `${SITE}/jira/your-work`,
    `${SITE}/jira/software/c/projects/ABC/boards/0`,
    `${SITE}/secure/RapidBoard.jspa?rapidView=7`,
  ])("reste inerte hors d'un board : %s", async (address) => {
    await load(address);
    expect(document.getElementById("sprint-goals-open")).toBeNull();
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("le clic charge l'adresse marquée du board, sans la fiche ouverte", async () => {
    await load(`${BOARD}?selectedIssue=ABC-19&filter=3`);
    const assign = vi.spyOn(location, "assign").mockImplementation(() => {});
    button()?.click();
    // Un vrai chargement de page, pas un simple changement d'adresse que Jira peut défaire.
    expect(assign).toHaveBeenCalledExactlyOnceWith(`${BOARD}?filter=3&sprintGoals=1`);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("suit la navigation interne de Jira : le bouton disparaît puis revient", async () => {
    await load(BOARD);
    history.pushState(null, "", "/browse/ABC-7");
    await vi.advanceTimersByTimeAsync(500);
    expect(document.getElementById("sprint-goals-open")).toBeNull();
    history.pushState(null, "", "/jira/software/c/projects/XYZ/boards/12");
    await vi.advanceTimersByTimeAsync(500);
    expect(button()).not.toBeNull();
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("un bouton emporté par une reconstruction de la page Jira est reposé", async () => {
    await load(BOARD);
    document.body.replaceChildren();
    expect(button()).toBeNull();
    await vi.advanceTimersByTimeAsync(500);
    expect(button()).not.toBeNull();
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("une adresse déjà marquée lance la vue sans bouton", async () => {
    await load(`${BOARD}?sprintGoals=1`);
    expect(document.getElementById("sprint-goals-open")).toBeNull();
    expect(sendMessage).toHaveBeenCalledOnce();
  });

  it("extension rechargée : le script s'efface au lieu de laisser un bouton mort", async () => {
    await load(BOARD);
    expect(button()).not.toBeNull();
    sendMessage.mockRejectedValueOnce(new Error("Extension context invalidated."));
    history.pushState(null, "", `${BOARD}?sprintGoals=1`);
    await vi.advanceTimersByTimeAsync(500);
    expect(document.getElementById("sprint-goals-open")).toBeNull();
    expect(document.documentElement.hasAttribute("sprint-goals-direct-bootstrap")).toBe(false);
  });

  it("déplace par la poignée, borne les coordonnées et n'enregistre qu'au relâchement", async () => {
    await load(BOARD);
    const start = point();
    pointer("pointerdown", start.x + 10, start.y + 10);
    pointer("pointermove", -100, -100);
    expect(point()).toEqual({ x: 4, y: 4 });
    expect(set).not.toHaveBeenCalled();
    pointer("pointerup", -100, -100);
    grip().click();
    expect(set).toHaveBeenCalledExactlyOnceWith({ [POSITION_KEY]: { x: 0, y: 0 } });
    expect(sendMessage).not.toHaveBeenCalled();
    expect(location.search).toBe("");
  });

  it.each([
    { name: "haut gauche", x: -1000, y: -1000, left: 4, top: 4, ratio: { x: 0, y: 0 } },
    { name: "haut droit", x: 3000, y: -1000, left: 1138, top: 4, ratio: { x: 1, y: 0 } },
    { name: "bas gauche", x: -1000, y: 3000, left: 4, top: 762, ratio: { x: 0, y: 1 } },
    { name: "bas droit", x: 3000, y: 3000, left: 1138, top: 762, ratio: { x: 1, y: 1 } },
  ])(
    "atteint le coin $name, y compris près de l'en-tête, sans sortir de l'écran",
    async ({ x, y, left, top, ratio }) => {
      await load(BOARD);
      const start = point();
      const assign = vi.spyOn(location, "assign").mockImplementation(() => {});
      pointer("pointerdown", start.x + 10, start.y + 10);
      pointer("pointermove", x, y);
      expect(point()).toEqual({ x: left, y: top });
      expect(set).not.toHaveBeenCalled();
      pointer("pointerup", x, y);
      expect(set).toHaveBeenCalledExactlyOnceWith({ [POSITION_KEY]: ratio });
      expect(point().x + 58).toBeLessThanOrEqual(innerWidth - 4);
      expect(point().y + 34).toBeLessThanOrEqual(innerHeight - 4);
      grip().click();
      expect(assign).not.toHaveBeenCalled();
    },
  );

  it("un petit mouvement ou un geste annulé ne change pas la préférence", async () => {
    await load(BOARD);
    const start = point();
    pointer("pointerdown", 10, 10);
    pointer("pointerup", 12, 11);
    expect(point()).toEqual(start);
    pointer("pointerdown", 10, 10);
    pointer("pointermove", 110, 110);
    grip().dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    pointer("pointerup", 110, 110);
    expect(point()).toEqual(start);
    pointer("pointerdown", 10, 10);
    pointer("pointermove", -100, -100);
    pointer("pointercancel", -100, -100);
    expect(point()).toEqual(start);
    expect(set).not.toHaveBeenCalled();
  });

  it("restaure la position par site et adapte la fenêtre sans modifier le stockage", async () => {
    stored.set(POSITION_KEY, { x: 1, y: 1 });
    await load(BOARD);
    expect(point()).toEqual({ x: 1138, y: 762 });
    vi.stubGlobal("innerWidth", 500);
    vi.stubGlobal("innerHeight", 300);
    window.dispatchEvent(new Event("resize"));
    expect(point()).toEqual({ x: 438, y: 262 });
    vi.stubGlobal("innerWidth", 1200);
    vi.stubGlobal("innerHeight", 800);
    window.dispatchEvent(new Event("resize"));
    expect(point()).toEqual({ x: 1138, y: 762 });
    document.body.replaceChildren();
    await vi.advanceTimersByTimeAsync(500);
    expect(point()).toEqual({ x: 1138, y: 762 });
    expect(set).not.toHaveBeenCalled();
  });

  it("relit les anciens ratios v1 sans migration ni réécriture de la préférence", async () => {
    const saved = { x: 0.25, y: 0.75 };
    stored.set(POSITION_KEY, saved);
    await load(BOARD);
    expect(point()).toEqual({ x: 287.5, y: 572.5 });
    expect(get).toHaveBeenCalledWith(POSITION_KEY);
    expect(stored.get(POSITION_KEY)).toEqual(saved);
    expect(set).not.toHaveBeenCalled();
  });

  it.each([null, "incorrect", { x: Number.NaN, y: 1 }, { x: 0, y: "1" }])(
    "ignore une position invalide : %s",
    async (value) => {
      stored.set(POSITION_KEY, value);
      await load(BOARD);
      expect(point()).toEqual({ x: 1046, y: 738 });
      expect(set).not.toHaveBeenCalled();
    },
  );

  it("ramène une ancienne position hors écran dans les bornes", async () => {
    stored.set(POSITION_KEY, { x: 20, y: -5 });
    await load(BOARD);
    expect(point()).toEqual({ x: 1138, y: 4 });
  });

  it("le clavier déplace le bouton et une remise à zéro est répercutée seulement pour ce site", async () => {
    await load(BOARD);
    grip().dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft" }));
    expect(point().x).toBeCloseTo(1036);
    grip().dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", shiftKey: true }));
    expect(point().y).toBeCloseTo(737);
    for (const listener of listeners)
      listener({ "jira-button-position.v1:https://other.atlassian.net": {} }, "local");
    expect(point().y).toBeCloseTo(737);
    for (const listener of listeners) listener({ [POSITION_KEY]: {} }, "local");
    expect(point()).toEqual({ x: 1046, y: 738 });
  });

  it("une lecture tardive du stockage ne remplace pas un déplacement plus récent", async () => {
    let resolve: (value: Record<string, unknown>) => void = () => {};
    get.mockImplementation(async (key) =>
      key === POSITION_KEY
        ? new Promise((done) => {
            resolve = done;
          })
        : { [key]: stored.get(key) },
    );
    await load(BOARD);
    grip().dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft" }));
    resolve({ [POSITION_KEY]: { x: 0, y: 0 } });
    await vi.advanceTimersByTimeAsync(0);
    expect(point().x).toBeCloseTo(1036);
    get.mockImplementation(async (key) => ({ [key]: stored.get(key) }));
  });

  it("le bouton reste utilisable lorsque le stockage échoue", async () => {
    get.mockRejectedValueOnce(new Error("Stockage indisponible"));
    set.mockRejectedValueOnce(new Error("Stockage indisponible"));
    await load(BOARD);
    grip().dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft" }));
    await vi.advanceTimersByTimeAsync(0);
    expect(point().x).toBeCloseTo(1036);
    expect(host().shadowRoot?.querySelector('[role="status"]')?.textContent).toContain(
      "impossible de l'enregistrer",
    );
    const assign = vi.spyOn(location, "assign").mockImplementation(() => {});
    button()?.click();
    expect(assign).toHaveBeenCalledOnce();
  });
});
