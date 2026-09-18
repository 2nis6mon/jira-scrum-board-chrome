// @vitest-environment happy-dom
import { render } from "preact";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "../../src/app/App";
import { AppModel } from "../../src/app/model/AppModel";
import { FakeJira } from "../support/fakeJira";
import { fakePlatform } from "../support/fakePlatform";

afterEach(() => {
  render(null, document.body);
});

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("App", () => {
  it("sans site connecté : formulaire de connexion, aucune donnée", async () => {
    const model = new AppModel(fakePlatform(new FakeJira()));
    await model.start();
    render(<App model={model} />, document.body);

    expect(document.querySelector(".app-version")?.textContent).toBe("9.9.9");
    expect(document.querySelector("h2")?.textContent).toBe("Connexion à Jira");
    expect(document.querySelector<HTMLButtonElement>("button.primary")?.disabled).toBe(true);
    expect(document.querySelectorAll(".probe")).toHaveLength(0);
  });

  it("affiche le refus d'un hôte non Atlassian", async () => {
    const platform = fakePlatform(new FakeJira());
    const model = new AppModel(platform);
    await model.start();
    render(<App model={model} />, document.body);

    await model.connect("jira.acme.example");
    await tick();

    expect(document.querySelector('[role="alert"]')?.textContent).toContain("jira.acme.example");
    expect(platform.requested).toEqual([]);
  });

  it("connecté : sondes, site dans l'en-tête, test d'écriture inaccessible sans sprint", async () => {
    const jira = new FakeJira().on("GET", "/rest/api/3/myself", { status: 401 });
    const model = new AppModel(fakePlatform(jira));
    await model.connect("acme.atlassian.net");
    render(<App model={model} />, document.body);
    await tick();

    expect(document.querySelector(".app-site")?.textContent).toContain("acme.atlassian.net");
    expect(document.querySelectorAll(".probe")).toHaveLength(3);
    expect(document.querySelector(".probe-failed .probe-code")?.textContent).toBe("401");
    expect(document.body.textContent).toContain("Ouvrir acme.atlassian.net");
    expect(document.body.textContent).not.toContain("Tester l'écriture sur ce sprint");
  });
});
