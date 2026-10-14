// @vitest-environment happy-dom
import { signal } from "@preact/signals";
import { render } from "preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BoardModel } from "../../src/app/model/BoardModel";
import { JqlSwimlaneSettings } from "../../src/app/views/settings/JqlSwimlaneSettings";
import type { TicketSwimlane } from "../../src/core/boardConfiguration";
import { type SwimlanePreview, withJqlSwimlanes } from "../../src/core/jqlSwimlanes";
import { makeConfiguration } from "../support/jiraFixtures";

afterEach(() => render(null, document.body));
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
function button(label: string) {
  const found = [...document.querySelectorAll("button")].find(
    (item) => item.textContent?.trim() === label,
  );
  if (!found) throw new Error(`Bouton ${label} absent`);
  return found;
}
function input(selector: string, value: string) {
  const field = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector);
  if (!field) throw new Error(`Champ ${selector} absent`);
  field.value = value;
  field.dispatchEvent(new Event("input", { bubbles: true }));
}
function setup(configuration = makeConfiguration()) {
  const stored = signal(configuration);
  const validate = vi.fn(async (text: string) => ({
    text,
    status: text.includes("invalide") ? ("invalid" as const) : ("valid" as const),
    errors: text.includes("invalide") ? ["Le champ est inconnu."] : [],
    warnings: [],
  }));
  const previewSwimlanes = vi.fn(
    async (lanes: readonly TicketSwimlane[]): Promise<SwimlanePreview> => ({
      lanes: lanes.map((lane) => ({
        id: lane.id,
        matched: 4,
        assigned: 2,
        goals: 1,
        earlier: 1,
        issueKeys: ["ABC-1", "ABC-2"],
      })),
      defaultCount: 3,
    }),
  );
  const applyJqlSwimlanes = vi.fn(async (lanes: readonly TicketSwimlane[]) => {
    stored.value = withJqlSwimlanes(stored.value, lanes);
    return true;
  });
  const applySettings = vi.fn();
  const canEditSettings = signal(true);
  const model = {
    configuration: stored,
    canEditSettings,
    setupBusy: signal(false),
    jql: { validate, suggest: vi.fn(async () => []) },
    previewSwimlanes,
    applyJqlSwimlanes,
    applySettings,
    refreshStructure: vi.fn(),
  } as unknown as BoardModel;
  function View() {
    return <JqlSwimlaneSettings board={model} configuration={stored.value} />;
  }
  render(<View />, document.body);
  return {
    stored,
    model,
    validate,
    previewSwimlanes,
    applyJqlSwimlanes,
    applySettings,
    canEditSettings,
  };
}
async function preview() {
  for (const verify of document.querySelectorAll<HTMLButtonElement>(".jql-verify")) verify.click();
  await expect.poll(() => button("Vérifier et prévisualiser").disabled).toBe(false);
  button("Vérifier et prévisualiser").click();
  await expect
    .poll(() => document.querySelector(".jql-swimlane-preview")?.textContent)
    .toContain("ABC-1");
}

describe("swimlanes JQL : brouillon, validation et publication explicite", () => {
  it("prépare l'ancienne configuration sans écriture, puis exige l'aperçu avant la migration", async () => {
    const { stored, applyJqlSwimlanes, applySettings, previewSwimlanes } = setup();
    expect(document.querySelector<HTMLTextAreaElement>("textarea")?.value).toBe(
      'issuetype in ("10004")',
    );
    expect(button("Appliquer").disabled).toBe(true);
    expect(stored.value.swimlaneMode).toBeUndefined();
    expect(applySettings).not.toHaveBeenCalled();
    expect(applyJqlSwimlanes).not.toHaveBeenCalled();
    await preview();
    expect(previewSwimlanes).toHaveBeenCalledOnce();
    expect(document.body.textContent).toContain(
      "4 correspondent · 1 dans un objectif · 1 dans une règle précédente",
    );
    expect(applyJqlSwimlanes).not.toHaveBeenCalled();
    expect(button("Appliquer").disabled).toBe(false);
    button("Appliquer").click();
    await expect.poll(() => stored.value.swimlaneMode).toBe("jql");
    expect(applyJqlSwimlanes).toHaveBeenCalledOnce();
    await expect.poll(() => button("Appliquer").disabled).toBe(true);
  });

  it("une nouvelle saisie invalide l'aperçu et une erreur Jira interdit l'application", async () => {
    const { applyJqlSwimlanes } = setup();
    await preview();
    input("textarea", "champinvalide = 1");
    await tick();
    expect(button("Appliquer").disabled).toBe(true);
    expect(document.querySelector(".jql-swimlane-preview")).toBeNull();
    button("Vérifier").click();
    await expect.poll(() => document.body.textContent).toContain("Le champ est inconnu.");
    expect(button("Vérifier et prévisualiser").disabled).toBe(true);
    expect(applyJqlSwimlanes).not.toHaveBeenCalled();
    button("Annuler").click();
    await tick();
    expect(document.querySelector<HTMLTextAreaElement>("textarea")?.value).toBe(
      'issuetype in ("10004")',
    );
  });

  it("conserve le brouillon après un échec de lecture ou d'enregistrement", async () => {
    const { previewSwimlanes, applyJqlSwimlanes } = setup();
    input(".jql-swimlane-name", "RUN modifié");
    await tick();
    previewSwimlanes.mockRejectedValueOnce(new Error("indisponible"));
    button("Vérifier").click();
    await expect.poll(() => button("Vérifier et prévisualiser").disabled).toBe(false);
    button("Vérifier et prévisualiser").click();
    await expect
      .poll(() => document.querySelector("[role=alert]")?.textContent)
      .toContain("brouillon est conservé");
    expect(document.querySelector<HTMLInputElement>(".jql-swimlane-name")?.value).toBe(
      "RUN modifié",
    );
    await preview();
    applyJqlSwimlanes.mockResolvedValueOnce(false);
    button("Appliquer").click();
    await expect
      .poll(() => document.querySelector("[role=alert]")?.textContent)
      .toContain("n'ont pas été enregistrées");
    expect(document.querySelector<HTMLInputElement>(".jql-swimlane-name")?.value).toBe(
      "RUN modifié",
    );
    expect(button("Annuler").disabled).toBe(false);
  });

  it("conserve les saisies lors d'une synchronisation et les réinitialise pour un autre board", async () => {
    const { stored, applyJqlSwimlanes } = setup();
    input(".jql-swimlane-name", "Mon brouillon");
    await tick();
    await preview();
    expect(button("Appliquer").disabled).toBe(false);
    stored.value = {
      ...stored.value,
      ticketSwimlanes: stored.value.ticketSwimlanes.map((lane) => ({
        ...lane,
        name: "Depuis Jira",
      })),
    };
    await tick();
    expect(document.querySelector<HTMLInputElement>(".jql-swimlane-name")?.value).toBe(
      "Mon brouillon",
    );
    expect(document.body.textContent).toContain("Les réglages ont changé depuis votre saisie");
    expect(button("Appliquer").disabled).toBe(true);
    button("Appliquer").click();
    expect(applyJqlSwimlanes).not.toHaveBeenCalled();
    button("Annuler").click();
    await tick();
    expect(document.querySelector<HTMLInputElement>(".jql-swimlane-name")?.value).toBe(
      "Depuis Jira",
    );
    expect(document.body.textContent).not.toContain("Enregistrement bloqué");
    stored.value = makeConfiguration({ boardId: 99, ticketSwimlanes: [] });
    await expect.poll(() => document.querySelector(".jql-swimlane")).toBeNull();
  });

  it("réordonne au clavier et conserve activation et masquage dans le brouillon", async () => {
    const config = withJqlSwimlanes(makeConfiguration(), [
      { id: "a", name: "RUN", typeIds: [], jql: 'labels = "run"', enabled: true, hidden: false },
      {
        id: "b",
        name: "Support",
        typeIds: [],
        jql: 'labels = "support"',
        enabled: true,
        hidden: false,
      },
    ]);
    const { applyJqlSwimlanes, stored } = setup(config);
    document
      .querySelector('[aria-label="Déplacer la swimlane Support"]')
      ?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
    await tick();
    expect(
      [...document.querySelectorAll<HTMLInputElement>(".jql-swimlane-name")].map(
        (field) => field.value,
      ),
    ).toEqual(["Support", "RUN"]);
    document.querySelector<HTMLInputElement>('[aria-label="Masquer la swimlane Support"]')?.click();
    await tick();
    expect(stored.value.ticketSwimlanes[0]?.name).toBe("RUN");
    expect(applyJqlSwimlanes).not.toHaveBeenCalled();
    await preview();
    button("Appliquer").click();
    await expect.poll(() => stored.value.ticketSwimlanes[0]?.name).toBe("Support");
    expect(stored.value.ticketSwimlanes[0]?.hidden).toBe(true);
  });

  it("empêche les modifications sans droit d'édition", async () => {
    const { canEditSettings, applyJqlSwimlanes, applySettings } = setup();
    canEditSettings.value = false;
    await tick();
    expect(button("Nouvelle swimlane").disabled).toBe(true);
    expect(
      document.querySelector<HTMLFieldSetElement>("fieldset.jql-swimlane-fields")?.disabled,
    ).toBe(true);
    expect(button("Appliquer").disabled).toBe(true);
    expect(applyJqlSwimlanes).not.toHaveBeenCalled();
    expect(applySettings).not.toHaveBeenCalled();
  });

  it("n'accepte jamais un aperçu revenu après une nouvelle saisie", async () => {
    const { previewSwimlanes, applyJqlSwimlanes } = setup();
    let resolvePreview: ((value: SwimlanePreview) => void) | undefined;
    previewSwimlanes.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolvePreview = resolve;
        }),
    );
    button("Vérifier").click();
    await expect.poll(() => button("Vérifier et prévisualiser").disabled).toBe(false);
    button("Vérifier et prévisualiser").click();
    await tick();
    input("textarea", 'labels = "support"');
    await tick();
    resolvePreview?.({ lanes: [], defaultCount: 0 });
    await tick();
    expect(document.querySelector(".jql-swimlane-preview")).toBeNull();
    expect(button("Appliquer").disabled).toBe(true);
    expect(applyJqlSwimlanes).not.toHaveBeenCalled();
  });

  it("accepte une règle valide sans résultat et explique un refus d'évaluation", async () => {
    const { previewSwimlanes } = setup();
    previewSwimlanes.mockImplementationOnce(async (lanes) => ({
      lanes: lanes.map((lane) => ({
        id: lane.id,
        matched: 0,
        assigned: 0,
        goals: 0,
        earlier: 0,
        issueKeys: [],
      })),
      defaultCount: 3,
    }));
    button("Vérifier").click();
    await expect.poll(() => button("Vérifier et prévisualiser").disabled).toBe(false);
    button("Vérifier et prévisualiser").click();
    await expect.poll(() => button("Appliquer").disabled).toBe(false);
    expect(document.querySelector(".jql-swimlane-preview")?.textContent).toContain(
      "0 ticket dans cette swimlane",
    );
    previewSwimlanes.mockImplementationOnce(async (lanes) => ({
      lanes: lanes.map((lane) => ({
        id: lane.id,
        matched: 0,
        assigned: 0,
        goals: 0,
        earlier: 0,
        issueKeys: [],
        error: "Lecture refusée par Jira.",
      })),
      defaultCount: 3,
    }));
    button("Vérifier et prévisualiser").click();
    await expect
      .poll(() => document.querySelector(".jql-swimlane-preview")?.textContent)
      .toContain("Lecture refusée par Jira.");
    expect(button("Appliquer").disabled).toBe(true);
  });
});
