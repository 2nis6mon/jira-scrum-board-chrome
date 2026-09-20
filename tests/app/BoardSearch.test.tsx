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
    input,
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
  await expect.poll(() => document.querySelectorAll('[role="option"]').length).toBe(1);
  expect(search).toHaveBeenCalledTimes(1);
  expect(search).toHaveBeenCalledWith("Paiement");
  const option = document.querySelector<HTMLButtonElement>('[role="option"]');
  if (!option) throw new Error("suggestion absente");
  option.click();
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
  expect(document.querySelector('[role="listbox"]')).toBeNull();
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

it("ouvre les suggestions sous le champ et permet le choix au clavier", async () => {
  const { type, input, detect } = setup(async () =>
    Array.from({ length: 7 }, (_, index) => ({
      id: index + 1,
      name: `Équipe ${index}`,
      projectKey: null,
    })),
  );
  await tick();
  type("Équipe");
  await expect.poll(() => document.querySelectorAll('[role="option"]').length).toBe(5);
  expect(input.getAttribute("aria-expanded")).toBe("true");
  const key = async (value: string) => {
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: value, bubbles: true, cancelable: true }),
    );
    await tick();
  };
  await key("ArrowDown");
  await key("ArrowDown");
  expect(input.getAttribute("aria-activedescendant")).toBe("board-result-1");
  await key("Escape");
  expect(document.querySelector('[role="listbox"]')).toBeNull();
  await key("Enter");
  expect(detect).not.toHaveBeenCalled();
  await key("ArrowUp");
  await key("Enter");
  expect(detect).toHaveBeenCalledWith(
    "https://acme.atlassian.net/secure/RapidBoard.jspa?rapidView=5",
  );
});
