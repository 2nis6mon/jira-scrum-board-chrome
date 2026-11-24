// @vitest-environment happy-dom
import { render } from "preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FilterMenu } from "../../src/app/views/board/FilterMenu";
import type { FilterOption } from "../../src/core/boardLayout";

// Données FICTIVES. Recherche dans le menu Parent, commun au board et au planning (story 10.1).

const PARENTS: FilterOption[] = [
  { value: "ABC-90", label: "ABC-90 · Activation MFA", count: 3 },
  { value: "ABC-91", label: "ABC-91 · Paiement", count: 2 },
];

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

let host: HTMLElement | null = null;

afterEach(() => {
  if (host) render(null, host);
  host?.remove();
  host = null;
});

function mount(
  options: { selected?: string[]; searchable?: boolean; onToggle?: (value: string) => void } = {},
) {
  host = document.body.appendChild(document.createElement("div"));
  render(
    <FilterMenu
      label="Parent"
      icon="parent"
      options={PARENTS}
      selected={new Set(options.selected ?? [])}
      onToggle={options.onToggle ?? (() => {})}
      searchable={options.searchable ?? true}
      extra={{ label: "Sans parent", count: 4, checked: false, onToggle: () => {} }}
    />,
    host,
  );
}

const menu = () =>
  document.querySelector<HTMLDetailsElement>("details.filter-menu") as HTMLDetailsElement;
const field = () => menu().querySelector<HTMLInputElement>('input[type="search"]');
const labels = () =>
  [...menu().querySelectorAll(".filter-option-label")].map((label) => label.textContent);
const counts = () =>
  [...menu().querySelectorAll(".filter-option-count")].map((count) => count.textContent);
const status = () => menu().querySelector('[role="status"]')?.textContent;

async function setOpen(open: boolean) {
  menu().open = open;
  await tick();
}

async function type(text: string) {
  const input = field() as HTMLInputElement;
  input.value = text;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  await tick();
}

async function pressEscape() {
  const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
  field()?.dispatchEvent(event);
  await tick();
  return event;
}

describe("recherche dans le menu Parent", () => {
  it("sans `searchable`, aucun champ de recherche", async () => {
    mount({ searchable: false });
    await setOpen(true);
    expect(field()).toBeNull();
    expect(menu().querySelector('[role="status"]')).toBeNull();
    expect(labels()).toEqual(["Sans parent", "ABC-90 · Activation MFA", "ABC-91 · Paiement"]);
  });

  it("à l'ouverture, focus dans le champ nommé, nombre de résultats annoncé", async () => {
    mount();
    await setOpen(true);
    const input = field() as HTMLInputElement;
    expect(document.activeElement).toBe(input);
    expect(input.getAttribute("aria-label")).toBe("Rechercher dans le menu Parent");
    const described = input.getAttribute("aria-describedby") ?? "";
    expect(document.getElementById(described)?.textContent).toBe("2 résultats");
    // Le champ est en tête du panneau, avant « Sans parent ».
    expect(menu().querySelector("fieldset > input")).toBe(input);
  });

  it("filtre par résumé, casse ignorée, nombre de tickets inchangé", async () => {
    mount();
    await setOpen(true);
    await type("mfa");
    expect(labels()).toEqual(["Sans parent", "ABC-90 · Activation MFA"]);
    expect(counts()).toEqual(["4", "3"]);
    expect(status()).toBe("1 résultat");
  });

  it("accents et casse ignorés, recherche par clé", async () => {
    mount();
    await setOpen(true);
    await type("ACTIVATION");
    expect(labels()).toEqual(["Sans parent", "ABC-90 · Activation MFA"]);
    await type("abc-91");
    expect(labels()).toEqual(["Sans parent", "ABC-91 · Paiement"]);
    await type("paiément");
    expect(labels()).toEqual(["Sans parent", "ABC-91 · Paiement"]);
  });

  it("sans résultat : « Aucun résultat », « Sans parent » toujours là", async () => {
    mount();
    await setOpen(true);
    await type("zzz");
    expect(labels()).toEqual(["Sans parent"]);
    expect(menu().querySelector(".filter-empty")?.textContent).toBe("Aucun résultat");
    expect(status()).toBe("0 résultat");
  });

  it("un parent coché que le texte ne trouve pas disparaît sans se décocher, le badge le compte", async () => {
    const onToggle = vi.fn();
    mount({ selected: ["ABC-91"], onToggle });
    await setOpen(true);
    await type("mfa");
    expect(labels()).not.toContain("ABC-91 · Paiement");
    expect(onToggle).not.toHaveBeenCalled();
    expect(menu().querySelector(".filter-badge")?.textContent).toBe("1");
    // Le texte effacé, il réapparaît coché.
    await type("");
    const box = menu().querySelectorAll<HTMLInputElement>("input[type=checkbox]")[2];
    expect(box?.checked).toBe(true);
  });

  it("cocher un parent trouvé change le filtre comme sans recherche", async () => {
    const onToggle = vi.fn();
    mount({ onToggle });
    await setOpen(true);
    await type("paie");
    const boxes = menu().querySelectorAll<HTMLInputElement>("input[type=checkbox]");
    boxes[1]?.dispatchEvent(new Event("change", { bubbles: true }));
    expect(onToggle).toHaveBeenCalledWith("ABC-91");
  });

  it("à la réouverture, champ vide et liste complète, sélection inchangée", async () => {
    mount({ selected: ["ABC-90"] });
    await setOpen(true);
    await type("mfa");
    await setOpen(false);
    await setOpen(true);
    expect(field()?.value).toBe("");
    expect(labels()).toEqual(["Sans parent", "ABC-90 · Activation MFA", "ABC-91 · Paiement"]);
    expect(menu().querySelector(".filter-badge")?.textContent).toBe("1");
  });

  it("Échap efface le texte, puis ferme le menu et rend le focus à son bouton", async () => {
    mount();
    await setOpen(true);
    await type("mfa");
    const first = await pressEscape();
    expect(first.defaultPrevented).toBe(true);
    expect(field()?.value).toBe("");
    expect(menu().open).toBe(true);
    const second = await pressEscape();
    expect(second.defaultPrevented).toBe(true);
    expect(menu().open).toBe(false);
    expect(document.activeElement).toBe(menu().querySelector("summary"));
  });
});
