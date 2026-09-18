// @vitest-environment happy-dom
import { render } from "preact";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "../../src/app/App";

afterEach(() => {
  document.body.replaceChildren();
});

describe("App, sans site Jira connecté", () => {
  it("affiche la version et l'état déconnecté", () => {
    render(<App version="9.9.9" />, document.body);

    expect(document.querySelector(".app-version")?.textContent).toBe("9.9.9");
    expect(document.querySelector("h2")?.textContent).toBe("Aucun site Jira connecté");
  });

  it("n'affiche aucune donnée de board", () => {
    render(<App version="9.9.9" />, document.body);

    expect(document.querySelectorAll("[data-issue-key]")).toHaveLength(0);
    expect(document.body.textContent).not.toMatch(/[A-Z][A-Z0-9]+-\d+/);
  });
});
