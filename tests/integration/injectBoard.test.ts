// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { injectBoard } from "../../src/integration/injectBoard";

// Pages Jira et fenêtres fictives : aucun accès réseau ni session utilisateur.
const SITE = "https://acme.atlassian.net";
const BOARD = `${SITE}/jira/software/c/projects/ABC/boards/7?sprintGoals=1`;
const EXTENSION = "https://extension-fictive.test";
const TRANSITION = { id: "11", name: "TEST OK", to: "Validé" };
interface Page {
  doc: Document;
  win: Window;
  inaccessible: boolean;
  postMessage: ReturnType<typeof vi.fn>;
}
let pages = new WeakMap<HTMLIFrameElement, Page>();

function page(frame: HTMLIFrameElement): Page {
  let value = pages.get(frame);
  if (value) return value;
  const doc = document.implementation.createHTMLDocument();
  const base = doc.createElement("base");
  base.href = SITE;
  doc.head.append(base);
  const postMessage = vi.fn();
  value = {
    doc,
    win: {
      location: new URL(BOARD),
      innerWidth: 1600,
      innerHeight: 900,
      postMessage,
    } as unknown as Window,
    inaccessible: false,
    postMessage,
  };
  pages.set(frame, value);
  return value;
}

function mount() {
  // Chrome sérialise la fonction : cette copie n'a accès à aucun import ni fermeture du module.
  const copied = new Function(`return (${injectBoard.toString()});`)() as typeof injectBoard;
  copied(`${EXTENSION}/board.html`, BOARD);
  const host = document.getElementById("sprint-goals-direct") as HTMLElement;
  const frame = host.shadowRoot?.querySelector("iframe") as HTMLIFrameElement;
  const board = page(frame);
  const send = (data: unknown, origin = EXTENSION, source: Window = board.win) => {
    window.dispatchEvent(new MessageEvent("message", { origin, source, data }));
  };
  const open = (transition: typeof TRANSITION | null = null, key = "ABC-102") => {
    send({ type: "sprint-goals:open-issue", key, transition });
    const dialog = document.querySelector("dialog") as HTMLDialogElement;
    const ticket = dialog.querySelector("iframe") as HTMLIFrameElement;
    return { dialog, ticket, ...page(ticket) };
  };
  return { host, frame, board, send, open };
}

function bounds(element: HTMLElement, width: number, height: number) {
  vi.spyOn(element, "getBoundingClientRect").mockImplementation(() =>
    element.hidden ? new DOMRect() : new DOMRect(0, 0, width, height),
  );
}

function ticketPanel(doc: Document, key = "ABC-102") {
  const panel = doc.createElement("aside");
  panel.innerHTML = `<button aria-label="Fermer">Fermer</button><a href="/browse/${key}">${key}</a><button aria-label="Changer le statut">Statut</button>`;
  bounds(panel, 600, 900);
  doc.body.append(panel);
  const status = panel.querySelector('[aria-label="Changer le statut"]') as HTMLButtonElement;
  return { panel, status };
}

function menu(doc: Document, entries: { text: string; id?: string }[]) {
  const root = doc.createElement("div");
  root.setAttribute("role", "menu");
  const choices = entries.map((entry) => {
    const element = doc.createElement("button");
    element.setAttribute("role", "menuitem");
    element.textContent = entry.text;
    if (entry.id) element.setAttribute("data-transition-id", entry.id);
    const clicked = vi.fn();
    element.addEventListener("click", clicked);
    root.append(element);
    return { element, clicked };
  });
  doc.body.append(root);
  return { root, choices };
}

function form(doc: Document, title = "TEST OK") {
  const element = doc.createElement("div");
  element.setAttribute("role", "dialog");
  element.innerHTML = `<h2>${title}</h2><form><input required><button>Valider</button></form>`;
  bounds(element, 640, 480);
  doc.body.append(element);
  return element;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-13T10:00:00Z"));
  (window as unknown as { happyDOM: { setURL(url: string): void } }).happyDOM.setURL(BOARD);
  pages = new WeakMap();
  document.body.replaceChildren();
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(HTMLDialogElement.prototype, "showModal").mockImplementation(function (
    this: HTMLDialogElement,
  ) {
    this.open = true;
  });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
    this: HTMLElement,
  ) {
    return this.hidden ? new DOMRect() : new DOMRect(0, 0, 100, 30);
  });
  vi.spyOn(HTMLIFrameElement.prototype, "src", "set").mockImplementation(function (
    this: HTMLIFrameElement,
    value: string,
  ) {
    page(this).win.location.href = value;
  });
  vi.spyOn(HTMLIFrameElement.prototype, "contentDocument", "get").mockImplementation(function (
    this: HTMLIFrameElement,
  ) {
    const context = page(this);
    return context.inaccessible ? null : context.doc;
  });
  vi.spyOn(HTMLIFrameElement.prototype, "contentWindow", "get").mockImplementation(function (
    this: HTMLIFrameElement,
  ) {
    return page(this).win;
  });
});

afterEach(async () => {
  document.body.replaceChildren();
  await vi.advanceTimersByTimeAsync(300);
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe("hôte Jira — parcours natif autonome", () => {
  it("exécute la copie sérialisée, montre la fiche et actualise une fois à sa fermeture", async () => {
    const { frame, board, open } = mount();
    expect(new URL(board.win.location.href).searchParams.get("jiraHost")).toBe(SITE);
    expect(new URL(board.win.location.href).searchParams.get("jiraBoard")).toBe(BOARD);
    expect(frame.allow).toBe("fullscreen");
    const current = open();
    ticketPanel(current.doc);
    expect(current.ticket.style.visibility).toBe("hidden");
    await vi.advanceTimersByTimeAsync(300);
    expect(current.ticket.style.visibility).toBe("visible");
    expect(current.dialog.style.width).toBe("1280px");
    expect(board.postMessage).not.toHaveBeenCalled();

    current.win.location.href = `${SITE}/jira/software/c/projects/ABC/boards/7`;
    await vi.advanceTimersByTimeAsync(3000);
    expect(current.dialog.isConnected).toBe(false);
    expect(board.postMessage).toHaveBeenCalledExactlyOnceWith(
      { type: "sprint-goals:refresh" },
      EXTENSION,
    );
    expect(vi.getTimerCount()).toBe(0);
  });

  it("ignore les messages usurpés et les clés de ticket invalides", async () => {
    const { send, board } = mount();
    const request = { type: "sprint-goals:open-issue", key: "ABC-102", transition: TRANSITION };
    send(request, SITE);
    send(request, EXTENSION, window);
    send({ ...request, key: "ABC-0" });
    send({ ...request, key: "https://autre.test" });
    expect(document.querySelector("dialog")).toBeNull();
    expect(board.postMessage).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(300);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("isole le formulaire stable après le seul choix exact, sans remplir ni soumettre", async () => {
    const { open } = mount();
    const current = open(TRANSITION);
    const submitted = vi.fn();
    current.doc.addEventListener("submit", submitted);
    const { status } = ticketPanel(current.doc);
    const menuOpened = vi.fn(() => {
      const items = menu(current.doc, [{ text: "TEST OK → Validé" }, { text: "TEST OK → Refusé" }]);
      items.choices[0]?.element.addEventListener("click", () => form(current.doc));
      return items;
    });
    status.addEventListener("click", menuOpened);
    await vi.advanceTimersByTimeAsync(1200);
    expect(current.ticket.style.visibility).toBe("hidden");
    await vi.advanceTimersByTimeAsync(300);
    expect(current.ticket.style.visibility).toBe("visible");
    expect(current.dialog.style.width).toBe("640px");
    expect(current.dialog.style.height).toBe("480px");
    expect(current.doc.querySelector("[data-sprint-goals-transition]")).not.toBeNull();
    expect(current.doc.querySelector("input")?.value).toBe("");
    const [valid, wrong] = menuOpened.mock.results[0]?.value.choices ?? [];
    expect(valid?.clicked).toHaveBeenCalledTimes(1);
    expect(wrong?.clicked).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(9000);
    expect(valid?.clicked).toHaveBeenCalledTimes(1);
    expect(menuOpened).toHaveBeenCalledTimes(1);
    expect(submitted).not.toHaveBeenCalled();
  });

  it("rend la main devant deux transitions ambiguës, sans réessayer même si une disparaît", async () => {
    const { open } = mount();
    const current = open(TRANSITION);
    ticketPanel(current.doc);
    const choices = menu(current.doc, [{ text: "TEST OK" }, { text: "TEST OK" }]).choices;
    await vi.advanceTimersByTimeAsync(300);
    expect(current.ticket.style.visibility).toBe("visible");
    choices[1]?.element.remove();
    await vi.advanceTimersByTimeAsync(9000);
    expect(choices.every(({ clicked }) => clicked.mock.calls.length === 0)).toBe(true);
    expect(current.doc.querySelector("[data-sprint-goals-transition]")).toBeNull();
  });

  it("distingue un identifiant exact d'un identifiant qui le contient", async () => {
    const { open } = mount();
    const current = open(TRANSITION);
    ticketPanel(current.doc);
    const choices = menu(current.doc, [
      { text: "TEST OK → Validé", id: "transition-211" },
      { text: "TEST OK → Refusé", id: "transition-11" },
    ]).choices;
    await vi.advanceTimersByTimeAsync(900);
    expect(choices[0]?.clicked).not.toHaveBeenCalled();
    expect(choices[1]?.clicked).toHaveBeenCalledTimes(1);
  });

  it("ne choisit aucun des deux boutons de statut et montre Jira après huit secondes", async () => {
    const { open } = mount();
    const current = open(TRANSITION);
    const { panel, status } = ticketPanel(current.doc);
    const other = status.cloneNode(true) as HTMLButtonElement;
    panel.append(other);
    const clicked = vi.fn();
    status.addEventListener("click", clicked);
    other.addEventListener("click", clicked);
    await vi.advanceTimersByTimeAsync(8100);
    expect(current.ticket.style.visibility).toBe("hidden");
    await vi.advanceTimersByTimeAsync(300);
    expect(current.ticket.style.visibility).toBe("visible");
    expect(clicked).not.toHaveBeenCalled();
  });

  it("ne capture pas des formulaires ambigus ou déjà présents avant le choix", async () => {
    const { open } = mount();
    const current = open(TRANSITION);
    ticketPanel(current.doc);
    const old = form(current.doc);
    const choice = menu(current.doc, [{ text: "TEST OK" }]).choices[0];
    const created: HTMLElement[] = [];
    choice?.element.addEventListener("click", () => {
      created.push(form(current.doc), form(current.doc));
    });
    await vi.advanceTimersByTimeAsync(9000);
    expect(current.doc.querySelector("[data-sprint-goals-transition]")).toBeNull();
    expect(current.ticket.style.visibility).toBe("visible");
    created[1]?.remove();
    await vi.advanceTimersByTimeAsync(1200);
    expect(old.hasAttribute("data-sprint-goals-transition")).toBe(false);
    expect(created[0]?.hasAttribute("data-sprint-goals-transition")).toBe(true);
  });

  it("attend le chargement de l'iframe d'un formulaire classique avant sa stabilisation", async () => {
    const { open } = mount();
    const current = open(TRANSITION);
    ticketPanel(current.doc);
    const choice = menu(current.doc, [{ text: "TEST OK" }]).choices[0];
    let nested: Document | null = null;
    choice?.element.addEventListener("click", () => {
      const modal = form(current.doc, "");
      modal.replaceChildren(current.doc.createElement("iframe"));
      nested = page(modal.querySelector("iframe") as HTMLIFrameElement).doc;
      nested.body.textContent = "TEST OK — Temps passé";
      Object.defineProperty(nested, "readyState", { configurable: true, value: "loading" });
    });
    await vi.advanceTimersByTimeAsync(1500);
    expect(current.ticket.style.visibility).toBe("hidden");
    expect(nested).not.toBeNull();
    Object.defineProperty(nested, "readyState", { configurable: true, value: "complete" });
    await vi.advanceTimersByTimeAsync(1200);
    expect(current.ticket.style.visibility).toBe("visible");
    expect(current.dialog.style.height).toBe("480px");
  });

  it("tolère une disparition brève du formulaire puis ferme et actualise une seule fois", async () => {
    const { open, board } = mount();
    const current = open(TRANSITION);
    ticketPanel(current.doc);
    let modal: HTMLElement | null = null;
    menu(current.doc, [{ text: "TEST OK" }]).choices[0]?.element.addEventListener("click", () => {
      modal = form(current.doc);
    });
    await vi.advanceTimersByTimeAsync(1200);
    if (!modal) throw new Error("Formulaire Jira attendu");
    const displayed = modal as HTMLElement;
    displayed.hidden = true;
    await vi.advanceTimersByTimeAsync(600);
    displayed.hidden = false;
    await vi.advanceTimersByTimeAsync(300);
    expect(current.dialog.isConnected).toBe(true);
    displayed.remove();
    await vi.advanceTimersByTimeAsync(1200);
    expect(current.dialog.isConnected).toBe(false);
    await vi.advanceTimersByTimeAsync(3000);
    expect(board.postMessage).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("annule les temporisations à Échap, rouvre sans résidu et ignore l'ancien dialogue", async () => {
    const { open, board } = mount();
    const previous = open(TRANSITION);
    previous.dialog.dispatchEvent(new Event("cancel", { cancelable: true }));
    await vi.advanceTimersByTimeAsync(300);
    expect(vi.getTimerCount()).toBe(0);
    const next = open();
    ticketPanel(next.doc);
    previous.dialog.dispatchEvent(new Event("cancel", { cancelable: true }));
    await vi.advanceTimersByTimeAsync(15000);
    expect(next.dialog.isConnected).toBe(true);
    expect(next.ticket.style.visibility).toBe("visible");
    expect(board.postMessage).toHaveBeenCalledTimes(1);
    next.dialog.dispatchEvent(new Event("cancel", { cancelable: true }));
    expect(board.postMessage).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(300);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("montre la page non reconnue après douze secondes sans choisir de transition", async () => {
    const { open, board } = mount();
    const current = open(TRANSITION);
    ticketPanel(current.doc, "ABC-999");
    await vi.advanceTimersByTimeAsync(12000);
    expect(current.ticket.style.visibility).toBe("hidden");
    await vi.advanceTimersByTimeAsync(300);
    expect(current.ticket.style.visibility).toBe("visible");
    expect(current.dialog.isConnected).toBe(true);
    expect(board.postMessage).not.toHaveBeenCalled();
  });

  it("remplace une popin ouverte en arrêtant son ancien parcours avant d'ouvrir la suivante", async () => {
    const { open, board, host } = mount();
    const previous = open(TRANSITION);
    ticketPanel(previous.doc);
    const oldChoice = menu(previous.doc, [{ text: "TEST OK" }]).choices[0];
    const next = open(null, "ABC-103");
    ticketPanel(next.doc, "ABC-103");
    // L'ancienne page ne doit plus tenter de choisir une transition ni fermer la nouvelle.
    page(previous.ticket).inaccessible = true;
    previous.dialog.dispatchEvent(new Event("cancel", { cancelable: true }));
    await vi.advanceTimersByTimeAsync(21000);
    expect(previous.dialog.isConnected).toBe(false);
    expect(oldChoice?.clicked).not.toHaveBeenCalled();
    expect(next.dialog.isConnected).toBe(true);
    expect(next.ticket.style.visibility).toBe("visible");
    expect(host.hasAttribute("data-error")).toBe(false);
    expect(board.postMessage).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(1);
  });

  it("ferme après vingt secondes si Jira refuse le cadre, avec une erreur et une actualisation", async () => {
    const { open, board, host } = mount();
    const current = open();
    page(current.ticket).inaccessible = true;
    await vi.advanceTimersByTimeAsync(19800);
    expect(current.dialog.isConnected).toBe(true);
    await vi.advanceTimersByTimeAsync(300);
    expect(current.dialog.isConnected).toBe(false);
    expect(host.hasAttribute("data-error")).toBe(true);
    expect(host.shadowRoot?.textContent).toContain("Jira n'a pas permis d'afficher ce ticket");
    expect(board.postMessage).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("retire dialogue, temporisation et écouteur quand la vue hôte disparaît", async () => {
    const { host, open, send, board } = mount();
    const current = open(TRANSITION);
    host.remove();
    await vi.advanceTimersByTimeAsync(300);
    expect(current.dialog.isConnected).toBe(false);
    send({ type: "sprint-goals:open-issue", key: "ABC-102" });
    expect(document.querySelector("dialog")).toBeNull();
    expect(board.postMessage).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
