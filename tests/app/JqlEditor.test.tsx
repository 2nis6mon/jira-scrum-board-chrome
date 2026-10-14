// @vitest-environment happy-dom
import { render } from "preact";
import { useState } from "preact/hooks";
import { afterEach, expect, it, vi } from "vitest";
import type { JqlService, JqlSuggestion, JqlValidation } from "../../src/app/services/JqlService";
import { JqlEditor } from "../../src/app/views/settings/JqlEditor";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const valid = (text: string): JqlValidation => ({
  text,
  status: "valid",
  errors: [],
  warnings: [],
});
afterEach(() => render(null, document.body));
function setup(service: Pick<JqlService, "validate" | "suggest">) {
  const validation = vi.fn();
  const preview = vi.fn();
  function Wrapper() {
    const [value, setValue] = useState("");
    return (
      <JqlEditor
        service={service}
        value={value}
        label="JQL test"
        onInput={setValue}
        onValidation={validation}
        onPreview={preview}
      />
    );
  }
  render(<Wrapper />, document.body);
  const input = document.querySelector("textarea");
  if (!input) throw new Error("champ absent");
  return {
    input,
    validation,
    preview,
    type: (value: string) => {
      input.value = value;
      input.setSelectionRange(value.length, value.length);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    },
  };
}

it("n'accepte pas la réponse de validation d'un texte remplacé pendant la requête", async () => {
  let finish: (result: JqlValidation) => void = () => {};
  const service = {
    validate: vi.fn((text: string) =>
      text === "ancien"
        ? new Promise<JqlValidation>((resolve) => {
            finish = resolve;
          })
        : Promise.resolve(valid(text)),
    ),
    suggest: vi.fn(async () => []),
  };
  const { type, validation } = setup(service);
  await tick();
  type("ancien");
  await expect
    .poll(() => service.validate.mock.calls.some(([text]) => text === "ancien"))
    .toBe(true);
  type("nouveau");
  await tick();
  finish(valid("ancien"));
  await tick();
  expect(validation.mock.calls.some(([result]) => result.text === "ancien")).toBe(false);
  await expect.poll(() => validation.mock.calls.at(-1)?.[0].text).toBe("nouveau");
  expect(document.body.textContent).toContain("JQL valide");
});

it("ignore les suggestions dépassées et insère au clavier sans interpréter du HTML", async () => {
  let finish: (result: JqlSuggestion[]) => void = () => {};
  const service = {
    validate: vi.fn(async (text: string) => valid(text)),
    suggest: vi.fn((text: string) =>
      text === "ancien"
        ? new Promise<JqlSuggestion[]>((resolve) => {
            finish = resolve;
          })
        : Promise.resolve([
            {
              label: "<b>Labels</b>",
              value: "labels ",
              from: 0,
              to: text.length,
              kind: "field" as const,
            },
          ]),
    ),
  };
  const { input, type } = setup(service);
  await tick();
  input.focus();
  type("ancien");
  await expect
    .poll(() => service.suggest.mock.calls.some(([text]) => text === "ancien"))
    .toBe(true);
  type("lab");
  await tick();
  await expect
    .poll(() => document.querySelector('[role="option"]')?.textContent)
    .toContain("<b>Labels</b>");
  finish([{ label: "ancienne suggestion", value: "ancien", from: 0, to: 6, kind: "field" }]);
  await tick();
  expect(document.body.textContent).not.toContain("ancienne suggestion");
  expect(document.querySelector(".jql-suggestions b")).toBeNull();
  input.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
  );
  await tick();
  expect(input.value).toBe("labels ");
  expect(document.querySelector('[role="listbox"]')).toBeNull();
});

it("prévisualise uniquement le texte confirmé valide et affiche une indisponibilité sans le perdre", async () => {
  const service = {
    validate: vi.fn(
      async (text: string): Promise<JqlValidation> => ({
        text,
        status: "unavailable",
        errors: ["Jira indisponible"],
        warnings: [],
      }),
    ),
    suggest: vi.fn(async () => []),
  };
  const { input, type, preview } = setup(service);
  await tick();
  type("labels = run");
  await tick();
  document.querySelector<HTMLButtonElement>(".jql-verify")?.click();
  await expect.poll(() => document.body.textContent).toContain("Non vérifié : Jira indisponible");
  expect(input.value).toBe("labels = run");
  expect(preview).not.toHaveBeenCalled();
  service.validate.mockImplementation(async (text) => valid(text));
  document.querySelector<HTMLButtonElement>(".jql-verify")?.click();
  await expect.poll(() => preview.mock.calls.length).toBe(1);
});
