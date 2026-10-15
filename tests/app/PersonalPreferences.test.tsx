// @vitest-environment happy-dom
import { render } from "preact";
import { afterEach, expect, it, vi } from "vitest";
import { AppModel } from "../../src/app/model/AppModel";
import { PersonalPreferences } from "../../src/app/views/settings/PersonalPreferences";
import { getLanguage } from "../../src/i18n/language";
import { FakeJira } from "../support/fakeJira";
import { fakePlatform } from "../support/fakePlatform";

afterEach(() => render(null, document.body));

function choose(language: string) {
  const choice = document.querySelector<HTMLInputElement>(`input[value="${language}"]`);
  if (!choice) throw new Error(`Langue ${language} absente`);
  choice.checked = true;
  choice.dispatchEvent(new Event("change", { bubbles: true }));
}

it("permet de choisir une langue personnelle sans droit Jira puis de suivre de nouveau Jira", async () => {
  const jira = new FakeJira();
  const platform = fakePlatform(jira);
  const model = new AppModel(platform, undefined, "fr_FR");
  await model.prepareLanguage();
  render(<PersonalPreferences model={model} />, document.body);
  expect(document.body.textContent).toContain("Langue de l'interface");

  choose("en");
  await expect.poll(() => document.body.textContent).toContain("Interface language");
  expect(getLanguage()).toBe("en");
  expect(platform.stored.get("language.v1")).toBe("en");
  expect(jira.requests).toHaveLength(0);

  choose("auto");
  await expect.poll(() => document.body.textContent).toContain("Langue de l'interface");
  expect(getLanguage()).toBe("fr");
  expect(jira.requests).toHaveLength(0);
});

it("signale un échec de sauvegarde dans la nouvelle langue tout en l'appliquant", async () => {
  const platform = fakePlatform(new FakeJira());
  const model = new AppModel(platform, undefined, "fr-FR");
  await model.prepareLanguage();
  vi.spyOn(platform.store, "set").mockRejectedValue(new Error("Stockage indisponible"));
  render(<PersonalPreferences model={model} />, document.body);
  choose("en");
  await expect
    .poll(() => document.querySelector('[role="alert"]')?.textContent)
    .toContain("language");
  expect(getLanguage()).toBe("en");
  expect(document.body.textContent).toContain("Interface language");
});
