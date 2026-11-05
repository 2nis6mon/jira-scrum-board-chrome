// @vitest-environment happy-dom
import { render } from "preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../../src/app/App";
import { AppModel } from "../../src/app/model/AppModel";
import type { BoardModel } from "../../src/app/model/BoardModel";
import { CardSelection } from "../../src/app/model/CardSelection";
import { BOARD_URL, boardSiteJira } from "../support/boardFixture";
import { isWriteRequest } from "../support/fakeJira";
import { fakePlatform } from "../support/fakePlatform";

// Story 8.30 : sur le Sprint Board, Ctrl/Cmd+clic et Maj+clic sélectionnent les cartes comme dans
// le planning, sans ouvrir d'onglet. Données FICTIVES.

afterEach(() => {
  render(null, document.body);
  vi.restoreAllMocks();
});

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

async function connectedBoard() {
  const jira = boardSiteJira();
  const model = new AppModel(fakePlatform(jira));
  render(<App model={model} />, document.body);
  await model.connect("acme.atlassian.net");
  const connection = model.connection.value;
  if (connection.state !== "connected") throw new Error("connexion attendue");
  const board: BoardModel = connection.board;
  await board.detect(BOARD_URL);
  await tick();
  const before = jira.requests.length;
  return { board, writes: () => jira.requests.slice(before).filter(isWriteRequest) };
}

function card(key: string): HTMLElement {
  const found = document.querySelector<HTMLElement>(`.card[data-issue-key="${key}"]`);
  if (!found) throw new Error(`carte ${key} introuvable`);
  return found;
}

function click(target: Element, init: MouseEventInit = {}): MouseEvent {
  const event = new MouseEvent("click", { bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}

const chip = () => document.querySelector<HTMLElement>(".board-selection");

describe("sélection de cartes : le modèle", () => {
  it("Ctrl/Cmd+clic ajoute ou retire ; Maj+clic prend la plage de la liste ; Échap vide", () => {
    const selection = new CardSelection();
    const cell = ["A-1", "A-2", "A-3", "A-4"];
    selection.toggle("A-1");
    selection.toggle("A-3");
    selection.toggle("A-3");
    expect([...selection.keys.value]).toEqual(["A-1"]);
    // Départ de la plage : la dernière carte choisie, ici A-3 (retirée).
    selection.extend("A-4", cell);
    expect([...selection.keys.value].sort()).toEqual(["A-1", "A-3", "A-4"]);
    // Départ hors de la liste : comme Ctrl/Cmd+clic.
    selection.extend("B-1", ["B-1", "B-2"]);
    expect(selection.keys.value.has("B-1")).toBe(true);
    selection.clear();
    expect(selection.keys.value.size).toBe(0);
    // Sans départ : comme Ctrl/Cmd+clic.
    selection.extend("A-2", cell);
    expect([...selection.keys.value]).toEqual(["A-2"]);
  });
});

describe("sélection de cartes sur le board (8.30)", () => {
  it("Ctrl/Cmd+clic et Maj+clic : sélection, compteur et repère, sans onglet ni écriture", async () => {
    const { board, writes } = await connectedBoard();
    const ctrl = click(card("ABC-101"), { ctrlKey: true });
    const meta = click(card("ABC-102"), { metaKey: true });
    await tick();
    // Le lien de la carte ne s'ouvre pas : aucun onglet ni fenêtre.
    expect(ctrl.defaultPrevented).toBe(true);
    expect(meta.defaultPrevented).toBe(true);
    expect([...board.selectedKeys.value].sort()).toEqual(["ABC-101", "ABC-102"]);
    expect(card("ABC-101").classList.contains("card-selected")).toBe(true);
    expect(card("ABC-101").textContent).toContain("Sélectionné");
    expect(card("ABC-103").classList.contains("card-selected")).toBe(false);
    expect(chip()?.textContent).toContain("2 tickets sélectionnés");

    // Ctrl+clic de nouveau : la carte sort de la sélection.
    click(card("ABC-102"), { ctrlKey: true });
    await tick();
    expect(chip()?.textContent).toContain("1 ticket sélectionné");

    const shift = click(card("ABC-103"), { shiftKey: true });
    await tick();
    expect(shift.defaultPrevented).toBe(true);
    expect(board.selectedKeys.value.has("ABC-103")).toBe(true);
    expect(writes()).toEqual([]);
  });

  it("clic simple : la carte garde son lien (fiche native dans Jira), sans sélection", async () => {
    const { board } = await connectedBoard();
    const plain = click(card("ABC-101"));
    expect(plain.defaultPrevented).toBe(false);
    expect(board.selectedKeys.value.size).toBe(0);
    expect(card("ABC-101").getAttribute("target")).toBe("_blank");
  });

  it("Échap et « Vider la sélection » vident la sélection", async () => {
    const { board } = await connectedBoard();
    click(card("ABC-101"), { ctrlKey: true });
    await tick();
    document.body.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
    );
    await tick();
    expect(board.selectedKeys.value.size).toBe(0);
    expect(chip()).toBeNull();

    click(card("ABC-102"), { ctrlKey: true });
    await tick();
    chip()?.querySelector("button")?.click();
    await tick();
    expect(board.selectedKeys.value.size).toBe(0);
  });
});
