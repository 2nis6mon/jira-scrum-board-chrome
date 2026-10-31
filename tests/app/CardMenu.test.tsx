// @vitest-environment happy-dom
import { render } from "preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../../src/app/App";
import { AppModel } from "../../src/app/model/AppModel";
import type { BoardModel } from "../../src/app/model/BoardModel";
import { SPRINT_PROPERTY_KEYS } from "../../src/jira/writes";
import { BOARD_URL, boardSiteJira, GOALS_DOCUMENT } from "../support/boardFixture";
import { isWriteRequest } from "../support/fakeJira";
import { fakePlatform } from "../support/fakePlatform";

// Menu d'une carte rendu par l'extension : ouverture, clavier, fermeture et focus. FICTIF.

const PROPERTY = `/rest/agile/1.0/sprint/42/properties/${SPRINT_PROPERTY_KEYS.goals}`;

afterEach(() => {
  render(null, document.body);
  vi.restoreAllMocks();
});

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const settle = () => new Promise((resolve) => setTimeout(resolve, 60));

async function connectedBoard() {
  let document_ = { ...GOALS_DOCUMENT };
  const jira = boardSiteJira()
    .on("GET", PROPERTY, () => ({ status: 200, json: { value: document_ } }))
    .on("PUT", PROPERTY, (request) => {
      document_ = request.body as typeof document_;
      return { status: 200 };
    });
  const model = new AppModel(fakePlatform(jira));
  render(<App model={model} />, document.body);
  await model.connect("acme.atlassian.net");
  const connection = model.connection.value;
  if (connection.state !== "connected") throw new Error("connexion attendue");
  const board: BoardModel = connection.board;
  await board.detect(BOARD_URL);
  await tick();
  const before = jira.requests.length;
  const writes = () => jira.requests.slice(before).filter(isWriteRequest);
  return { model, board, jira, writes, links: () => document_.links };
}

function card(key: string): HTMLElement {
  const found = document.querySelector<HTMLElement>(`.card[data-issue-key="${key}"]`);
  if (!found) throw new Error(`carte ${key} introuvable`);
  return found;
}
const menu = () => document.querySelector<HTMLElement>(".card-menu");
const items = (root: Element | null | undefined) =>
  [...(root?.querySelectorAll<HTMLElement>("[role='menuitem']") ?? [])].map((item) =>
    item.textContent?.trim(),
  );
const press = (key: string, options: KeyboardEventInit = {}) =>
  (document.activeElement ?? document.body).dispatchEvent(
    new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...options }),
  );
function rightClick(target: HTMLElement, x = 140, y = 260): MouseEvent {
  const event = new MouseEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    button: 2,
    clientX: x,
    clientY: y,
  });
  target.dispatchEvent(event);
  return event;
}

describe("menu d'une carte", () => {
  it("clic droit : menu de l'extension au pointeur, menu du navigateur empêché", async () => {
    const { board } = await connectedBoard();
    const event = rightClick(card("ABC-102"));
    await settle();

    expect(event.defaultPrevented).toBe(true);
    expect(board.cardMenu.value).toMatchObject({ issueKey: "ABC-102", x: 140, y: 260 });
    const panel = menu();
    expect(panel?.getAttribute("role")).toBe("menu");
    expect(panel?.dataset.placed).toBe("");
    const parent = panel?.querySelector<HTMLElement>("[aria-haspopup='menu']");
    expect(parent?.textContent).toContain("Envoyer vers un goal");
    expect(parent?.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(parent);
  });

  it("hors d'une carte, le menu du navigateur est conservé", async () => {
    await connectedBoard();
    const header = document.querySelector<HTMLElement>(".lane-header");
    if (!header) throw new Error("en-tête attendu");
    expect(rightClick(header).defaultPrevented).toBe(false);
    await settle();
    expect(menu()).toBeNull();
  });

  it("Échap ferme le menu et rend le focus à la carte", async () => {
    await connectedBoard();
    rightClick(card("ABC-102"));
    await settle();
    press("Escape");
    await settle();
    expect(menu()).toBeNull();
    expect(document.activeElement).toBe(card("ABC-102"));
  });

  it("un clic ailleurs ferme le menu et rend le focus à la carte", async () => {
    await connectedBoard();
    rightClick(card("ABC-102"));
    await settle();
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    await settle();
    expect(menu()).toBeNull();
    expect(document.activeElement).toBe(card("ABC-102"));
  });

  it("Tab et défilement ferment aussi le menu", async () => {
    await connectedBoard();
    rightClick(card("ABC-102"));
    await settle();
    press("Tab");
    await settle();
    expect(menu()).toBeNull();
    rightClick(card("ABC-102"));
    await settle();
    document.body.dispatchEvent(new Event("scroll"));
    await settle();
    expect(menu()).toBeNull();
  });

  it("au clavier : Maj+F10, liste des objectifs, retour, puis envoi par Entrée", async () => {
    const { board, writes, links } = await connectedBoard();
    const target = card("ABC-101");
    target.focus();
    press("F10", { shiftKey: true });
    await settle();
    expect(board.cardMenu.value?.issueKey).toBe("ABC-101");
    const parent = menu()?.querySelector<HTMLElement>("[aria-haspopup='menu']");
    expect(document.activeElement).toBe(parent);

    press("ArrowRight");
    await settle();
    expect(parent?.getAttribute("aria-expanded")).toBe("true");
    const goals = menu()?.querySelector(".card-menu-goals");
    expect(goals?.getAttribute("role")).toBe("menu");
    // Le ticket est sous « Finaliser le parcours de paiement » : l'autre objectif, puis le retrait.
    expect(items(goals)).toEqual(["Améliorer la stabilité", "Retirer du goal"]);
    expect(document.activeElement?.textContent).toBe("Améliorer la stabilité");
    press("ArrowDown");
    expect(document.activeElement?.textContent).toBe("Retirer du goal");
    press("ArrowDown");
    expect(document.activeElement?.textContent).toBe("Améliorer la stabilité");
    press("End");
    expect(document.activeElement?.textContent).toBe("Retirer du goal");
    press("Home");
    expect(document.activeElement?.textContent).toBe("Améliorer la stabilité");

    press("ArrowLeft");
    await settle();
    expect(menu()?.querySelector(".card-menu-goals")).toBeNull();
    expect(document.activeElement).toBe(menu()?.querySelector("[aria-haspopup='menu']"));
    press("ArrowRight");
    await settle();

    press("Enter");
    await settle();
    expect(menu()).toBeNull();
    expect(writes().map((request) => request.path)).toEqual([PROPERTY]);
    expect(links()).toHaveProperty("ABC-101", "g-stabilite");
    expect(document.activeElement).toBe(card("ABC-101"));
  });

  it("une écriture en cours : action désactivée avec sa raison, rien n'est écrit", async () => {
    const { board, writes } = await connectedBoard();
    board.pendingKeys.value = new Set(["ABC-105"]);
    rightClick(card("ABC-102"));
    await settle();
    const parent = menu()?.querySelector<HTMLElement>("[aria-haspopup='menu']");
    expect(parent?.getAttribute("aria-disabled")).toBe("true");
    expect(menu()?.textContent).toContain("Une écriture est en cours");
    press("ArrowRight");
    press("Enter");
    parent?.click();
    await settle();
    expect(menu()?.querySelector(".card-menu-goals")).toBeNull();
    expect(writes()).toEqual([]);
  });

  it("en daily : pas de changement d'objectif, la raison est affichée", async () => {
    const { model } = await connectedBoard();
    document.documentElement.requestFullscreen = vi.fn(() => Promise.resolve());
    document.querySelector<HTMLButtonElement>("button[aria-label='Lancer la daily']")?.click();
    await settle();
    expect(model.daily.value).not.toBeNull();
    // Deuxième étape : une Flèche gauche échappée au menu ramènerait à la première.
    document.querySelector<HTMLButtonElement>("button[aria-label='Swimlane suivante']")?.click();
    await settle();
    expect(document.querySelector(".daily-step")?.textContent).toContain("2/");
    const shown = document.querySelector<HTMLElement>(".card[data-issue-key]");
    if (!shown) throw new Error("carte attendue");
    rightClick(shown);
    await settle();
    expect(menu()?.querySelector("[aria-haspopup='menu']")?.getAttribute("aria-disabled")).toBe(
      "true",
    );
    expect(menu()?.textContent).toContain("Pas de changement d'objectif pendant la daily");

    // Les flèches restent au menu : l'étape de la daily ne change pas, le menu reste ouvert.
    const step = document.querySelector(".daily-step")?.textContent;
    press("ArrowLeft");
    press("ArrowRight");
    await settle();
    expect(document.querySelector(".daily-step")?.textContent).toBe(step);
    expect(menu()).not.toBeNull();
  });

  it("touche Menu sur la carte focalisée : menu ouvert pour ce ticket", async () => {
    const { board } = await connectedBoard();
    card("ABC-102").focus();
    press("ContextMenu");
    await settle();
    expect(board.cardMenu.value?.issueKey).toBe("ABC-102");
    expect(menu()).not.toBeNull();
  });

  it("menu demandé au clavier (contextmenu sans bouton droit ni position) : sous la carte", async () => {
    const { board } = await connectedBoard();
    const target = card("ABC-102");
    target.getBoundingClientRect = () =>
      ({ top: 300, bottom: 380, left: 50, right: 250, width: 200, height: 80 }) as DOMRect;
    target.dispatchEvent(
      new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        button: 0,
        clientX: 0,
        clientY: 0,
      }),
    );
    await settle();
    expect(board.cardMenu.value).toEqual({ issueKey: "ABC-102", x: 50, y: 380 });
  });
});

describe("menu d'une carte — top et basse priorité", () => {
  const RANK = "/rest/agile/1.0/issue/rank";
  const rootItems = () => [
    ...(menu()?.querySelectorAll<HTMLElement>(":scope > [role='menuitem']") ?? []),
  ];

  it("deux actions après « Envoyer vers un goal » ; déjà dernier : désactivée, raison visible", async () => {
    const { writes } = await connectedBoard();
    rightClick(card("ABC-102"));
    await settle();
    const [send, top, bottom] = rootItems();
    expect(send?.textContent).toContain("Envoyer vers un goal");
    expect(top?.textContent).toBe("Mettre en top priorité");
    expect(top?.getAttribute("aria-disabled")).toBeNull();
    expect(bottom?.textContent).toContain("Mettre en basse priorité");
    expect(bottom?.getAttribute("aria-disabled")).toBe("true");
    expect(bottom?.textContent).toContain("Déjà en fin de sa swimlane");
    const reason = bottom?.getAttribute("aria-describedby");
    expect(reason && document.getElementById(reason)?.textContent).toBe(
      "Déjà en fin de sa swimlane",
    );
    bottom?.click();
    await settle();
    expect(writes()).toEqual([]);
  });

  it("au clavier : Flèche bas puis Entrée classe en tête, focus rendu à la carte", async () => {
    const { jira, writes } = await connectedBoard();
    jira.on("PUT", RANK, { status: 204 });
    card("ABC-102").focus();
    press("F10", { shiftKey: true });
    await settle();
    press("ArrowDown");
    expect(document.activeElement?.textContent).toBe("Mettre en top priorité");
    press("Enter");
    await settle();
    expect(menu()).toBeNull();
    expect(writes().map((request) => [request.path, request.body])).toEqual([
      [RANK, { issues: ["ABC-102"], rankBeforeIssue: "ABC-101" }],
    ]);
    expect(document.activeElement).toBe(card("ABC-102"));
  });

  it("une écriture en cours : les deux actions désactivées, rien n'est écrit", async () => {
    const { board, writes } = await connectedBoard();
    board.pendingKeys.value = new Set(["ABC-105"]);
    rightClick(card("ABC-101"));
    await settle();
    const [, top, bottom] = rootItems();
    expect(top?.getAttribute("aria-disabled")).toBe("true");
    expect(bottom?.getAttribute("aria-disabled")).toBe("true");
    expect(top?.textContent).toContain("Une écriture est en cours");
    top?.click();
    await settle();
    expect(writes()).toEqual([]);
  });
  it("rang inconnu sans champ de rang lu (configuration ancienne) : la raison dit quoi faire", async () => {
    const { board } = await connectedBoard();
    const real = board.cardMenuOptions.bind(board);
    vi.spyOn(board, "cardMenuOptions").mockImplementation((key, context) => {
      const options = real(key, context);
      return (
        options && {
          ...options,
          top: { blocked: "unknownRank" },
          bottom: { blocked: "unknownRank" },
        }
      );
    });
    expect(board.configuration.value?.rankFieldId).toBeNull();
    rightClick(card("ABC-102"));
    await settle();
    const [, top] = rootItems();
    expect(top?.textContent).toContain(
      "Ordre de rang Jira indisponible Utilisez « Relire colonnes et types depuis Jira » pour lire le rang Jira.",
    );
    board.closeCardMenu();
    await settle();

    // Champ de rang connu : la raison seule, sans invitation à relire la structure.
    const configuration = board.configuration.value;
    if (!configuration) throw new Error("configuration attendue");
    board.configuration.value = { ...configuration, rankFieldId: "customfield_10019" };
    rightClick(card("ABC-102"));
    await settle();
    const [, known] = rootItems();
    expect(known?.textContent).toContain("Ordre de rang Jira indisponible");
    expect(known?.textContent).not.toContain("Relire colonnes et types");
  });
});
