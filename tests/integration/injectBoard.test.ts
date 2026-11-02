// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { integrationMessagesEs } from "../../src/i18n/es/integration";
import { integrationMessages } from "../../src/i18n/integration";
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

function mount(preference: "auto" | "fr" | "en" | "es" = "fr") {
  // Chrome sérialise la fonction : cette copie n'a accès à aucun import ni fermeture du module.
  const copied = new Function(`return (${injectBoard.toString()});`)() as typeof injectBoard;
  copied(`${EXTENSION}/board.html`, BOARD, {
    preference,
    messages: { en: integrationMessages, es: integrationMessagesEs },
  });
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
  // Une méthode propre à l'instance : espionner celle du prototype partagerait le dernier rectangle.
  Object.defineProperty(element, "getBoundingClientRect", {
    configurable: true,
    value: vi.fn(() => (element.hidden ? new DOMRect() : new DOMRect(0, 0, width, height))),
  });
}

function ticketPanel(doc: Document, key = "ABC-102") {
  const panel = doc.createElement("aside");
  panel.innerHTML = `<button aria-label="Fermer">Fermer</button><a href="/browse/${key}">${key}</a><button aria-label="Changer le statut">Statut</button>`;
  bounds(panel, 600, 900);
  doc.body.append(panel);
  const status = panel.querySelector('[aria-label="Changer le statut"]') as HTMLButtonElement;
  return { panel, status };
}

/** Dialogue natif récent : son conteneur peut occuper toute la fenêtre de Jira. */
function nativeTicketDialog(doc: Document, key = "ABC-102") {
  const result = ticketPanel(doc, key);
  result.panel.setAttribute("role", "dialog");
  bounds(result.panel, 1600, 900);
  return result;
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
  document.documentElement.lang = "fr";
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
  it.each(["es_ES", "es-MX"])(
    "reconnaît Jira %s dans la copie injectée et conserve la clé du ticket",
    (locale) => {
      document.documentElement.lang = locale;
      const { board, open, send } = mount("auto");
      expect(new URL(board.win.location.href).searchParams.get("jiraLocale")).toBe(
        locale.replace("_", "-").toLowerCase(),
      );
      let current = open();
      expect(current.dialog.getAttribute("aria-label")).toBe("Incidencia de Jira ABC-102");
      expect(current.dialog.querySelector('[role="status"]')?.textContent).toBe(
        "Cargando ABC-102…",
      );
      send({ type: "sprint-goals:language", language: "en" }, "https://evil.example");
      current = open();
      expect(current.dialog.getAttribute("aria-label")).toBe("Incidencia de Jira ABC-102");
      send({ type: "sprint-goals:language", language: "en" });
      current = open();
      expect(current.dialog.getAttribute("aria-label")).toBe("Jira issue ABC-102");
      send({ type: "sprint-goals:language", language: "es" });
      current = open();
      expect(current.dialog.getAttribute("aria-label")).toBe("Incidencia de Jira ABC-102");
    },
  );

  it("reconnaît la fiche native espagnole même si l'extension est en français", async () => {
    document.documentElement.lang = "es-ES";
    const { open } = mount("fr");
    const current = open();
    const { panel } = nativeTicketDialog(current.doc);
    const close = panel.querySelector("button");
    close?.setAttribute("aria-label", "Cerrar");
    if (close) close.textContent = "Cerrar";
    await vi.advanceTimersByTimeAsync(300);
    expect(current.dialog.getAttribute("aria-label")).toBe("Ticket Jira ABC-102");
    expect(current.ticket.style.visibility).toBe("visible");
    expect(panel.hasAttribute("data-sprint-goals-ticket")).toBe(true);
  });

  it("ouvre la transition depuis Cambiar estado sans traduire ni soumettre le formulaire Jira", async () => {
    document.documentElement.lang = "es-ES";
    const { open } = mount("auto");
    const transition = { id: "11", name: "Aceptar revisión", to: "Validado" };
    const current = open(transition);
    const { panel, status } = ticketPanel(current.doc);
    const close = panel.querySelector("button");
    close?.setAttribute("aria-label", "Cerrar");
    if (close) close.textContent = "Cerrar";
    status.setAttribute("aria-label", "Cambiar estado");
    status.textContent = "En revisión";
    const submitted = vi.fn();
    current.doc.addEventListener("submit", submitted);
    const menuOpened = vi.fn(() => {
      const choices = menu(current.doc, [
        { text: "Aceptar revisión → Validado" },
        { text: "Aceptar revisión → Rechazado" },
      ]).choices;
      choices[0]?.element.addEventListener("click", () => form(current.doc, transition.name));
      return choices;
    });
    status.addEventListener("click", menuOpened);
    await vi.advanceTimersByTimeAsync(1500);
    expect(current.ticket.style.visibility).toBe("visible");
    expect(current.doc.querySelector("[data-sprint-goals-transition] h2")?.textContent).toBe(
      "Aceptar revisión",
    );
    expect(current.doc.querySelector("input")?.value).toBe("");
    expect(menuOpened).toHaveBeenCalledTimes(1);
    const choices = menuOpened.mock.results[0]?.value ?? [];
    expect(choices[0]?.clicked).toHaveBeenCalledTimes(1);
    expect(choices[1]?.clicked).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(9000);
    expect(menuOpened).toHaveBeenCalledTimes(1);
    expect(submitted).not.toHaveBeenCalled();
  });

  it("transmet la langue Jira normalisée et traduit seulement l'habillage de la fiche", () => {
    document.documentElement.lang = "de-DE";
    const { board, open, send } = mount("auto");
    expect(new URL(board.win.location.href).searchParams.get("jiraLocale")).toBe("de-de");
    let current = open();
    expect(current.dialog.getAttribute("aria-label")).toBe("Jira issue ABC-102");
    expect(current.dialog.querySelector('[role="status"]')?.textContent).toBe("Loading ABC-102…");
    send({ type: "sprint-goals:language", language: "fr" }, "https://evil.example");
    current = open();
    expect(current.dialog.getAttribute("aria-label")).toBe("Jira issue ABC-102");
    send({ type: "sprint-goals:language", language: "fr" });
    current = open();
    expect(current.dialog.getAttribute("aria-label")).toBe("Ticket Jira ABC-102");
    send({ type: "sprint-goals:language", language: "xx" });
    current = open();
    expect(current.dialog.getAttribute("aria-label")).toBe("Ticket Jira ABC-102");
  });

  it("ignore un message bien formé venu d'une autre fenêtre ou d'une autre origine", () => {
    const { send } = mount();
    const request = { type: "sprint-goals:open-issue", key: "ABC-102" };
    send(request, "https://evil.example");
    send(request, EXTENSION, window);
    send({ type: "sprint-goals:open-board", boardId: 8, projectKey: "XYZ" }, EXTENSION, window);
    send({ type: "sprint-goals:close" }, "https://evil.example");
    expect(document.querySelector("dialog")).toBeNull();
    expect(document.getElementById("sprint-goals-direct")?.hasAttribute("data-leaving")).toBe(
      false,
    );
  });

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
    expect(current.dialog.style.width).toBe("100%");
    expect(current.dialog.style.height).toBe("100%");
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

  it("conserve les dimensions et le défilement natifs du panneau et de ses descendants", async () => {
    const { open } = mount();
    const current = open();
    const { panel } = nativeTicketDialog(current.doc);
    panel.style.cssText =
      "position:relative;width:1280px;height:calc(100vh - 120px);max-height:900px;overflow:hidden;display:flex";
    const content = current.doc.createElement("div");
    content.style.cssText = "display:flex;flex:1;min-height:0;overflow:auto";
    const description = current.doc.createElement("section");
    description.style.cssText = "height:auto;min-height:1800px;overflow:visible";
    description.textContent = "Description et activité du ticket";
    content.append(description);
    panel.append(content);
    const before = [panel, content, description].map((element) => element.getAttribute("style"));
    await vi.advanceTimersByTimeAsync(1200);
    expect(current.ticket.style.visibility).toBe("visible");
    expect(panel.hasAttribute("data-sprint-goals-ticket")).toBe(true);
    expect([panel, content, description].map((element) => element.getAttribute("style"))).toEqual(
      before,
    );
    expect(current.dialog.style.width).toBe("100%");
    expect(current.dialog.style.height).toBe("100%");
    expect(current.dialog.style.maxWidth).toBe("none");
    expect(current.dialog.style.maxHeight).toBe("none");
    expect(current.doc.querySelectorAll("style[data-sprint-goals-ticket-style]")).toHaveLength(1);
    expect(
      current.doc.querySelector("style[data-sprint-goals-ticket-style]")?.textContent,
    ).toContain("visibility:hidden");
  });

  it("préfère le dialogue natif pleine largeur à un panneau latéral de la même fiche", async () => {
    const { open } = mount();
    const current = open();
    const { panel: sidebar } = ticketPanel(current.doc);
    const { panel: native } = nativeTicketDialog(current.doc);
    expect(sidebar.getBoundingClientRect().width).toBe(600);
    expect(native.getBoundingClientRect().width).toBe(1600);
    expect(sidebar.querySelector("button")?.getBoundingClientRect().width).toBe(100);
    await vi.advanceTimersByTimeAsync(300);
    expect(current.ticket.style.visibility).toBe("visible");
    expect(native.hasAttribute("data-sprint-goals-ticket")).toBe(true);
    expect(sidebar.hasAttribute("data-sprint-goals-ticket")).toBe(false);
    expect(current.doc.querySelectorAll("[data-sprint-goals-ticket]")).toHaveLength(1);
  });

  it("ignore les dialogues sans lien vers le bon ticket, même avec un bouton Fermer", async () => {
    const { open } = mount();
    const current = open();
    const { panel: wrongIssue } = nativeTicketDialog(current.doc, "ABC-999");
    const { panel: noLink } = nativeTicketDialog(current.doc);
    noLink.querySelector("a")?.remove();
    noLink.append("ABC-102");
    await vi.advanceTimersByTimeAsync(900);
    expect(current.ticket.style.visibility).toBe("hidden");
    expect(current.doc.querySelector("[data-sprint-goals-ticket]")).toBeNull();
    const { panel: rightIssue } = nativeTicketDialog(current.doc);
    await vi.advanceTimersByTimeAsync(300);
    expect(current.ticket.style.visibility).toBe("visible");
    expect(rightIssue.hasAttribute("data-sprint-goals-ticket")).toBe(true);
    expect(wrongIssue.hasAttribute("data-sprint-goals-ticket")).toBe(false);
    expect(noLink.hasAttribute("data-sprint-goals-ticket")).toBe(false);
  });

  it("reconnaît le panneau remplacé par Jira sans dupliquer le style et actualise une seule fois à la fermeture", async () => {
    const { open, board } = mount();
    const current = open();
    let { panel } = nativeTicketDialog(current.doc);
    await vi.advanceTimersByTimeAsync(300);
    expect(panel.hasAttribute("data-sprint-goals-ticket")).toBe(true);
    const isolation = current.doc.querySelector("style[data-sprint-goals-ticket-style]");
    expect(isolation).not.toBeNull();
    for (let replacement = 0; replacement < 2; replacement += 1) {
      panel.remove();
      panel = nativeTicketDialog(current.doc).panel;
      panel.style.cssText = "position:relative;overflow:hidden;height:80vh";
      const nativeStyle = panel.getAttribute("style");
      await vi.advanceTimersByTimeAsync(600);
      expect(panel.hasAttribute("data-sprint-goals-ticket")).toBe(true);
      expect(panel.getAttribute("style")).toBe(nativeStyle);
      expect(current.ticket.style.visibility).toBe("visible");
      expect(current.doc.querySelectorAll("style[data-sprint-goals-ticket-style]")).toHaveLength(1);
      expect(current.doc.querySelector("style[data-sprint-goals-ticket-style]")).toBe(isolation);
      expect(board.postMessage).not.toHaveBeenCalled();
    }
    current.win.location.href = `${SITE}/jira/software/c/projects/ABC/boards/7`;
    await vi.advanceTimersByTimeAsync(900);
    current.dialog.dispatchEvent(new Event("cancel", { cancelable: true }));
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
    expect(current.dialog.style.width).toBe("100%");
    expect(current.dialog.style.height).toBe("100%");
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

  it("préserve le formulaire natif, son contenu et les dimensions que Jira modifie après affichage", async () => {
    const { open } = mount();
    const current = open(TRANSITION);
    ticketPanel(current.doc);
    const native: HTMLElement[] = [];
    const initialStyles: (string | null)[] = [];
    const choice = menu(current.doc, [{ text: "TEST OK" }]).choices[0];
    choice?.element.addEventListener("click", () => {
      const modal = form(current.doc);
      modal.style.cssText =
        "position:fixed;inset:40px auto auto 25%;width:640px;height:auto;max-height:calc(100vh - 80px);display:flex;flex-direction:column;overflow:hidden";
      const header = current.doc.createElement("header");
      header.style.cssText = "flex:0 0 auto;height:64px;overflow:visible";
      header.append(modal.querySelector("h2") as HTMLElement);
      const body = current.doc.createElement("main");
      body.style.cssText = "flex:1;min-height:0;overflow:auto";
      body.append(modal.querySelector("form") as HTMLFormElement);
      const footer = current.doc.createElement("footer");
      footer.style.cssText = "flex:0 0 auto;height:56px;position:relative";
      footer.append(body.querySelector("button") as HTMLButtonElement);
      modal.append(header, body, footer);
      native.push(modal, header, body, footer);
      initialStyles.push(...native.map((element) => element.getAttribute("style")));
    });
    await vi.advanceTimersByTimeAsync(1500);
    const [modal, , body] = native;
    if (!modal || !body) throw new Error("Formulaire Jira attendu");
    expect(current.ticket.style.visibility).toBe("visible");
    expect(modal.hasAttribute("data-sprint-goals-transition")).toBe(true);
    expect(native.map((element) => element.getAttribute("style"))).toEqual(initialStyles);
    expect(current.dialog.style.width).toBe("100%");
    expect(current.dialog.style.height).toBe("100%");
    expect(current.dialog.style.maxWidth).toBe("none");
    expect(current.dialog.style.maxHeight).toBe("none");
    const isolation = current.doc.querySelector("style[data-sprint-goals-transition-style]");
    expect(isolation).not.toBeNull();
    expect(isolation?.textContent).not.toMatch(/(?:position|height|width|overflow)\s*:/);

    // Jira agrandit le formulaire après validation d'un champ : sa nouvelle mise en page reste libre.
    modal.style.width = "720px";
    modal.style.maxHeight = "calc(100vh - 40px)";
    body.style.minHeight = "120px";
    bounds(modal, 720, 620);
    const updatedStyles = native.map((element) => element.getAttribute("style"));
    await vi.advanceTimersByTimeAsync(1200);
    expect(native.map((element) => element.getAttribute("style"))).toEqual(updatedStyles);
    expect(modal.getBoundingClientRect().height).toBe(620);
    expect(current.dialog.style.width).toBe("100%");
    expect(current.dialog.style.height).toBe("100%");
    expect(current.doc.querySelectorAll("style[data-sprint-goals-transition-style]")).toHaveLength(
      1,
    );
    expect(current.doc.querySelector("style[data-sprint-goals-transition-style]")).toBe(isolation);
    expect(choice?.clicked).toHaveBeenCalledTimes(1);
    expect(current.doc.querySelector("input")?.value).toBe("");
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
    const native: HTMLElement[] = [];
    const initialStyles: (string | null)[] = [];
    choice?.element.addEventListener("click", () => {
      const modal = form(current.doc, "");
      modal.style.cssText =
        "position:absolute;top:80px;left:400px;width:640px;height:auto;max-height:80vh;overflow:hidden";
      const classic = current.doc.createElement("iframe");
      classic.style.cssText = "width:100%;height:480px;border:0;display:block";
      modal.replaceChildren(classic);
      nested = page(classic).doc;
      nested.body.style.cssText = "margin:0;height:auto;overflow:auto";
      nested.body.innerHTML = "<h2>TEST OK — Temps passé</h2><form><input required></form>";
      native.push(modal, classic, nested.body);
      initialStyles.push(...native.map((element) => element.getAttribute("style")));
      Object.defineProperty(nested, "readyState", { configurable: true, value: "loading" });
    });
    await vi.advanceTimersByTimeAsync(1500);
    expect(current.ticket.style.visibility).toBe("hidden");
    expect(nested).not.toBeNull();
    Object.defineProperty(nested, "readyState", { configurable: true, value: "complete" });
    await vi.advanceTimersByTimeAsync(1200);
    expect(current.ticket.style.visibility).toBe("visible");
    expect(current.dialog.style.width).toBe("100%");
    expect(current.dialog.style.height).toBe("100%");
    expect(native.map((element) => element.getAttribute("style"))).toEqual(initialStyles);
    expect(native[0]?.hasAttribute("data-sprint-goals-transition")).toBe(true);
    expect(native[2]?.querySelector("input")?.value).toBe("");
    expect(choice?.clicked).toHaveBeenCalledTimes(1);
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

/** Ligne de sprint de la page backlog fictive : titre, compteur et bouton natif. */
function sprintRow(doc: Document, name: string, button: string) {
  const row = doc.createElement("div");
  row.innerHTML = `<h3>${name}</h3><span>3 tickets</span><button>${button}</button>`;
  doc.body.append(row);
  const element = row.querySelector("button") as HTMLButtonElement;
  const clicked = vi.fn();
  element.addEventListener("click", clicked);
  return { row, element, clicked };
}

/** Fenêtre native de Jira ouverte par le bouton : champs requis, jamais remplis ici. */
function sprintWindow(doc: Document, title: string) {
  const element = doc.createElement("section");
  element.setAttribute("role", "dialog");
  element.innerHTML = `<h2>${title}</h2><form><input name="goal"><button>${title}</button></form>`;
  bounds(element, 600, 420);
  doc.body.append(element);
  return element;
}

describe("hôte Jira — fenêtres natives de clôture et de démarrage", () => {
  const BACKLOG = `${SITE}/jira/software/c/projects/ABC/boards/7/backlog`;
  const request = (
    send: ReturnType<typeof mount>["send"],
    action: "complete" | "start",
    sprintName: string,
  ) => {
    send({ type: "sprint-goals:sprint-dialog", action, sprintName });
    const dialog = document.querySelector("dialog") as HTMLDialogElement;
    const backlog = dialog.querySelector("iframe") as HTMLIFrameElement;
    return { dialog, backlog, ...page(backlog) };
  };

  it("démarre par le seul bouton de la ligne du sprint, isole la fenêtre et relit à sa fermeture", async () => {
    const { send, board } = mount();
    const current = request(send, "start", "Sprint 13");
    expect(current.dialog.getAttribute("aria-label")).toBe("Démarrer le sprint « Sprint 13 »");
    expect(current.win.location.href).toBe(BACKLOG);
    expect(current.backlog.style.visibility).toBe("hidden");
    // « Sprint 1 » ne doit pas désigner la ligne de « Sprint 13 », ni l'inverse.
    const other = sprintRow(current.doc, "Sprint 1", "Démarrer le sprint");
    const target = sprintRow(current.doc, "Sprint 13", "Démarrer le sprint");
    const opened: HTMLElement[] = [];
    target.element.addEventListener("click", () => {
      opened.push(sprintWindow(current.doc, "Démarrer le sprint"));
    });
    const submitted = vi.fn();
    current.doc.addEventListener("submit", submitted);
    await vi.advanceTimersByTimeAsync(600);
    expect(target.clicked).toHaveBeenCalledTimes(1);
    expect(other.clicked).not.toHaveBeenCalled();
    expect(current.backlog.style.visibility).toBe("hidden");
    await vi.advanceTimersByTimeAsync(1200);
    expect(current.backlog.style.visibility).toBe("visible");
    expect(opened).toHaveLength(1);
    expect(opened[0]?.hasAttribute("data-sprint-goals-sprint-dialog")).toBe(true);
    expect(
      current.doc.querySelector("style[data-sprint-goals-sprint-dialog-style]"),
    ).not.toBeNull();
    expect(current.doc.querySelector("input")?.value).toBe("");
    expect(board.postMessage).not.toHaveBeenCalled();

    opened[0]?.remove();
    await vi.advanceTimersByTimeAsync(1200);
    expect(current.dialog.isConnected).toBe(false);
    expect(board.postMessage).toHaveBeenCalledExactlyOnceWith(
      { type: "sprint-goals:refresh" },
      EXTENSION,
    );
    expect(target.clicked).toHaveBeenCalledTimes(1);
    expect(submitted).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("reconnaît le nom entier du sprint, sans le confondre avec un nom qui le prolonge", async () => {
    const { send } = mount();
    const current = request(send, "start", "Sprint 1");
    const longer = sprintRow(current.doc, "Sprint 13", "Démarrer le sprint");
    const target = sprintRow(current.doc, "Sprint 1", "Démarrer le sprint");
    await vi.advanceTimersByTimeAsync(600);
    expect(target.clicked).toHaveBeenCalledTimes(1);
    expect(longer.clicked).not.toHaveBeenCalled();
  });

  it("termine par le bouton anglais unique du sprint actif", async () => {
    document.documentElement.lang = "en";
    const { send } = mount("en");
    const current = request(send, "complete", "Sprint 12");
    expect(current.dialog.getAttribute("aria-label")).toBe("Complete sprint “Sprint 12”");
    const active = sprintRow(current.doc, "Sprint 12", "Complete sprint");
    const future = sprintRow(current.doc, "Sprint 13", "Start sprint");
    active.element.addEventListener("click", () => sprintWindow(current.doc, "Complete sprint"));
    await vi.advanceTimersByTimeAsync(2100);
    expect(active.clicked).toHaveBeenCalledTimes(1);
    expect(future.clicked).not.toHaveBeenCalled();
    expect(current.backlog.style.visibility).toBe("visible");
    expect(current.doc.querySelector("[data-sprint-goals-sprint-dialog] h2")?.textContent).toBe(
      "Complete sprint",
    );
  });

  it("rend la page sans rien cliquer si le bouton est ambigu, inexact ou dans une autre langue", async () => {
    const { send, board } = mount();
    const current = request(send, "start", "Sprint 13");
    const rows = [
      sprintRow(current.doc, "Sprint 13", "Démarrer le sprint"),
      sprintRow(current.doc, "Sprint 13", "Démarrer le sprint"),
      sprintRow(current.doc, "Sprint 14", "Sprint starten"),
      sprintRow(current.doc, "Sprint 15", "Démarrer le sprint maintenant"),
    ];
    await vi.advanceTimersByTimeAsync(9900);
    expect(current.backlog.style.visibility).toBe("hidden");
    await vi.advanceTimersByTimeAsync(300);
    expect(current.backlog.style.visibility).toBe("visible");
    for (const row of rows) expect(row.clicked).not.toHaveBeenCalled();

    // Page rendue : la fenêtre que l'utilisateur ouvre lui-même referme la popin à sa fermeture.
    const opened = sprintWindow(current.doc, "Démarrer le sprint");
    await vi.advanceTimersByTimeAsync(300);
    opened.remove();
    await vi.advanceTimersByTimeAsync(1200);
    expect(current.dialog.isConnected).toBe(false);
    expect(board.postMessage).toHaveBeenCalledExactlyOnceWith(
      { type: "sprint-goals:refresh" },
      EXTENSION,
    );
    for (const row of rows) expect(row.clicked).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("referme la page rendue par Échap dans Jira ou sur la popin, avec une seule relecture", async () => {
    const { send, board } = mount();
    let current = request(send, "complete", "Sprint 12");
    await vi.advanceTimersByTimeAsync(10500);
    expect(current.backlog.style.visibility).toBe("visible");
    current.doc.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(current.dialog.isConnected).toBe(false);
    expect(board.postMessage).toHaveBeenCalledTimes(1);

    current = request(send, "complete", "Sprint 12");
    current.dialog.dispatchEvent(new Event("cancel", { cancelable: true }));
    expect(current.dialog.isConnected).toBe(false);
    expect(board.postMessage).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(300);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("refuse une page hôte qui n'est pas un board et ignore une demande d'une autre fenêtre", () => {
    const { send, host } = mount();
    const valid = { type: "sprint-goals:sprint-dialog", action: "start", sprintName: "Sprint 13" };
    send(valid, "https://evil.example");
    send(valid, EXTENSION, window);
    send({ ...valid, action: "create" });
    expect(document.querySelector("dialog")).toBeNull();

    (window as unknown as { happyDOM: { setURL(url: string): void } }).happyDOM.setURL(
      `${SITE}/jira/software/c/projects/ABC/boards/7/timeline?sprintGoals=1`,
    );
    send(valid);
    expect(document.querySelector("dialog")).toBeNull();
    expect(host.hasAttribute("data-error")).toBe(true);
    expect(host.shadowRoot?.textContent).toContain(
      "Jira n'a pas permis d'ouvrir la fenêtre du sprint ici.",
    );
  });
});
