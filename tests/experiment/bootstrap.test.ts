// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Données FICTIVES. Script de contenu chargé dans une fausse page Jira, sans navigateur.
const SITE = "https://acme.atlassian.net";
const BOARD = `${SITE}/jira/software/c/projects/ABC/boards/7`;
const sendMessage = vi.fn(async () => ({ ok: true }));

async function load(address: string): Promise<void> {
  (window as unknown as { happyDOM: { setURL(url: string): void } }).happyDOM.setURL(address);
  vi.resetModules();
  // @ts-expect-error script de contenu sans export : il s'exécute à l'import.
  await import("../../src/experiment/bootstrap");
  await vi.advanceTimersByTimeAsync(0);
}
const button = () =>
  document.getElementById("sprint-goals-open")?.shadowRoot?.querySelector("button") ?? null;

beforeEach(() => {
  vi.useFakeTimers();
  sendMessage.mockClear();
  document.documentElement.removeAttribute("sprint-goals-direct-bootstrap");
  document.body.replaceChildren();
  vi.stubGlobal("chrome", {
    runtime: { sendMessage, getURL: (path: string) => `chrome-extension://fictif/${path}` },
  });
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("bouton Sprint Goals sur les boards Jira", () => {
  it.each([
    BOARD,
    `${BOARD}/backlog`,
    `${SITE}/jira/software/projects/ABC/boards/7?selectedIssue=ABC-1`,
  ])("s'affiche sur un board sans rien lancer : %s", async (address) => {
    await load(address);
    expect(button()?.textContent).toBe("Sprint Goals");
    expect(sendMessage).not.toHaveBeenCalled();
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

  it("le clic marque l'adresse du board, sans la fiche ouverte, et lance la vue", async () => {
    await load(`${BOARD}?selectedIssue=ABC-19&filter=3`);
    button()?.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(location.href).toBe(`${BOARD}?filter=3&sprintGoals=1`);
    expect(sendMessage).toHaveBeenCalledExactlyOnceWith({ type: "sprint-goals:launch" });
    expect(document.getElementById("sprint-goals-open")).toBeNull();
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
    sendMessage.mockRejectedValueOnce(new Error("Extension context invalidated."));
    button()?.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(document.getElementById("sprint-goals-open")).toBeNull();
    expect(document.documentElement.hasAttribute("sprint-goals-direct-bootstrap")).toBe(false);
  });
});
