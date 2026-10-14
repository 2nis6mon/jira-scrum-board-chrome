// @vitest-environment happy-dom
import { signal } from "@preact/signals";
import { render } from "preact";
import { afterEach, expect, it, vi } from "vitest";
import type { BoardModel } from "../../src/app/model/BoardModel";
import type { JqlValidation } from "../../src/app/services/JqlService";
import { CardColorSettings } from "../../src/app/views/settings/CardColorSettings";
import type { BoardConfiguration } from "../../src/core/boardConfiguration";
import { makeConfiguration } from "../support/jiraFixtures";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
afterEach(() => render(null, document.body));
function button(label: string) {
  const found = [...document.querySelectorAll("button")].find(
    (item) => item.textContent?.trim() === label,
  );
  if (!found) throw new Error(`Bouton ${label} absent`);
  return found;
}
function setup() {
  const configuration = { ...makeConfiguration(), cardColorRules: [] };
  const stored = signal<BoardConfiguration>(configuration);
  const applyColorRules = vi.fn(async () => false);
  const validate = vi.fn(
    async (text: string): Promise<JqlValidation> => ({
      text,
      status: text.includes("invalid") || !text ? "invalid" : "valid",
      errors: text.includes("invalid") ? ["Champ inconnu"] : [],
      warnings: [],
    }),
  );
  const board = {
    configuration: stored,
    canEditSettings: signal(true),
    cardColors: signal({}),
    colorRuleCounts: signal({}),
    colorRuleIssues: signal({}),
    snapshot: signal(null),
    jql: { validate, suggest: vi.fn(async () => []) },
    applyColorRules,
  } as unknown as BoardModel;
  function View() {
    return <CardColorSettings board={board} configuration={stored.value} />;
  }
  render(<View />, document.body);
  return { applyColorRules, validate, stored };
}
function type(value: string) {
  const input = document.querySelector("textarea");
  if (!input) throw new Error("champ absent");
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

it("interdit les brouillons activés sans validation du texte courant et conserve le texte après refus de publication", async () => {
  const { applyColorRules } = setup();
  button("Nouvelle règle").click();
  await tick();
  expect(button("Appliquer").disabled).toBe(true);
  type("invalid = x");
  await tick();
  button("Vérifier").click();
  await expect.poll(() => document.body.textContent).toContain("Champ inconnu");
  expect(button("Appliquer").disabled).toBe(true);
  expect(applyColorRules).not.toHaveBeenCalled();
  type("labels = run");
  await tick();
  expect(button("Appliquer").disabled).toBe(true);
  button("Vérifier").click();
  await expect.poll(() => button("Appliquer").disabled).toBe(false);
  button("Appliquer").click();
  await tick();
  expect(applyColorRules).toHaveBeenCalledOnce();
  expect(document.querySelector("textarea")?.value).toBe("labels = run");
  expect(button("Appliquer").disabled).toBe(false);
  type("labels = other");
  await tick();
  expect(button("Appliquer").disabled).toBe(true);
});

it("bloque une publication qui écraserait une modification distante et recharge sur Annuler", async () => {
  const { stored, applyColorRules } = setup();
  button("Nouvelle règle").click();
  await tick();
  type("labels = run");
  await tick();
  button("Vérifier").click();
  await expect.poll(() => button("Appliquer").disabled).toBe(false);
  const remote = {
    id: "remote",
    name: "Distante",
    jql: "priority = High",
    color: "red",
    kind: null,
    enabled: true,
  } as const;
  stored.value = { ...stored.value, cardColorRules: [remote] };
  await tick();
  expect(document.querySelector("textarea")?.value).toBe("labels = run");
  expect(document.body.textContent).toContain("Les couleurs ont changé dans Jira");
  expect(button("Appliquer").disabled).toBe(true);
  button("Appliquer").click();
  expect(applyColorRules).not.toHaveBeenCalled();
  button("Annuler").click();
  await tick();
  expect(document.querySelector("textarea")?.value).toBe("priority = High");
  expect(button("Appliquer").disabled).toBe(true);
});

it("actualise un formulaire intact quand les couleurs sont relues", async () => {
  const { stored } = setup();
  await tick();
  stored.value = {
    ...stored.value,
    cardColorRules: [
      {
        id: "remote",
        name: "Distante",
        jql: "labels = run",
        color: "teal",
        kind: null,
        enabled: true,
      },
    ],
  };
  await expect.poll(() => document.querySelector("textarea")?.value).toBe("labels = run");
  expect(button("Appliquer").disabled).toBe(true);
  expect(document.body.textContent).not.toContain("Les couleurs ont changé dans Jira");
});
