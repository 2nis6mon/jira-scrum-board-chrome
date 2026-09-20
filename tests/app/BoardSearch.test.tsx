// @vitest-environment happy-dom
import { signal } from "@preact/signals";
import { render } from "preact";
import { afterEach, expect, it, vi } from "vitest";
import type { BoardModel } from "../../src/app/model/BoardModel";
import { BoardSearch } from "../../src/app/views/BoardSearch";
import type { JiraBoardChoice } from "../../src/jira/client";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
afterEach(() => {
  render(null, document.body);
});
function setup(searchBoards: (query: string) => Promise<JiraBoardChoice[]>) {
  const detect = vi.fn();
  const board = {
    searchBoards,
    detect,
    site: { origin: "https://acme.atlassian.net" },
    setupBusy: signal(false),
  } as unknown as BoardModel;
  render(<BoardSearch board={board} />, document.body);
  const input = document.querySelector("input");
  if (!input) throw new Error("champ absent");
  return {
    detect,
    type: (value: string) => {
      input.value = value;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    },
  };
}
it("diffère la recherche et ouvre le board choisi par son identifiant", async () => {
  const search = vi.fn(async () => [{ id: 42, name: "Paiement", projectKey: "ABC" }]);
  const { type, detect } = setup(search);
  await tick();
  type("Pa");
  await tick();
  type("Paiement");
  expect(search).not.toHaveBeenCalled();
  await expect.poll(() => document.querySelectorAll("option").length).toBe(2);
  expect(search).toHaveBeenCalledTimes(1);
  expect(search).toHaveBeenCalledWith("Paiement");
  const select = document.querySelector("select");
  if (!select) throw new Error("liste absente");
  select.value = "42";
  select.dispatchEvent(new Event("change", { bubbles: true }));
  expect(detect).toHaveBeenCalledWith(
    "https://acme.atlassian.net/secure/RapidBoard.jspa?rapidView=42",
  );
});
it("ignore les réponses anciennes et affiche les résultats vides", async () => {
  let resolveOld: (items: JiraBoardChoice[]) => void = () => {};
  const search = vi.fn((query: string) =>
    query === "ancien"
      ? new Promise<JiraBoardChoice[]>((resolve) => {
          resolveOld = resolve;
        })
      : Promise.resolve([]),
  );
  const { type } = setup(search);
  await tick();
  type("ancien");
  await expect.poll(() => search.mock.calls.length).toBe(1);
  type("nouveau");
  await tick();
  await expect.poll(() => document.body.textContent).toContain("Aucun board Scrum");
  resolveOld([{ id: 1, name: "ancien", projectKey: null }]);
  await tick();
  expect(document.querySelector("select")).toBeNull();
});
it("affiche les erreurs et efface les résultats après suppression du texte", async () => {
  const { type } = setup(async () => {
    throw new Error("Session expirée");
  });
  await tick();
  type("équipe");
  await expect.poll(() => document.body.textContent).toContain("Session expirée");
  type("");
  await tick();
  expect(document.body.textContent).not.toContain("Session expirée");
});
