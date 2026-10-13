// @vitest-environment happy-dom
import { render } from "preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LoadDiagnostics } from "../../src/app/model/LoadDiagnostics";
import { LoadDiagnosticsView } from "../../src/app/views/LoadDiagnosticsView";
import { FakeJira } from "../support/fakeJira";
import { fakePlatform } from "../support/fakePlatform";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const text = () => document.body.textContent ?? "";
const modal = () => document.querySelector<HTMLElement>('[role="dialog"]');
function button(label: string) {
  const result = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (element) =>
      element.textContent?.trim() === label || element.getAttribute("aria-label") === label,
  );
  if (!result) throw new Error(`Bouton attendu : ${label}`);
  return result;
}

function setup() {
  const platform = fakePlatform(new FakeJira());
  let time = 0;
  const diagnostics = new LoadDiagnostics(platform, () => time);
  const advance = (ms: number) => {
    time += ms;
  };
  return { diagnostics, platform, advance };
}

async function open(diagnostics: LoadDiagnostics) {
  render(<LoadDiagnosticsView diagnostics={diagnostics} />, document.body);
  await tick();
  const trigger = button("Voir les détails");
  trigger.focus();
  trigger.click();
  await tick();
  return trigger;
}

afterEach(() => {
  render(null, document.body);
  vi.useRealTimers();
});

describe("diagnostic du chargement : interface", () => {
  it("reste discret, n'ouvre rien automatiquement et suit les phases actives", async () => {
    const { diagnostics } = setup();
    diagnostics.begin("opening");
    let complete = () => {};
    const pending = diagnostics.measure(
      "issues",
      () =>
        new Promise<void>((resolve) => {
          complete = resolve;
        }),
    );
    render(<LoadDiagnosticsView diagnostics={diagnostics} />, document.body);
    await tick();
    expect(modal()).toBeNull();
    expect(text()).toContain("Ouverture");
    expect(text()).toContain("Tickets");
    button("Voir les détails").click();
    await tick();
    expect(modal()?.textContent).toContain("état provisoire");
    expect(modal()?.textContent).toContain("leurs durées ne s’additionnent pas");
    complete();
    await pending;
    diagnostics.finish();
    await tick();
    expect(text()).toContain("Lecture terminée");
    expect(text()).not.toContain("état provisoire");
  });

  it("actualise le temps pendant une attente sans réponse Jira", async () => {
    vi.useFakeTimers();
    const { diagnostics, advance } = setup();
    diagnostics.begin("refresh");
    render(<LoadDiagnosticsView diagnostics={diagnostics} />, document.body);
    advance(2_000);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(text()).toContain("Actualisation · 2,0 s");
  });

  it("retient le focus, ferme par Échap et restaure le déclencheur", async () => {
    const { diagnostics } = setup();
    diagnostics.begin("opening");
    const trigger = await open(diagnostics);
    const close = button("Fermer le diagnostic du chargement");
    const copy = button("Copier le rapport");
    expect(document.activeElement).toBe(close);
    close.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true }),
    );
    expect(document.activeElement).toBe(copy);
    copy.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }),
    );
    expect(document.activeElement).toBe(close);
    close.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
    );
    await tick();
    expect(modal()).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("ferme par la croix et par le fond sans arrêter la mesure", async () => {
    const { diagnostics } = setup();
    diagnostics.begin("opening");
    await open(diagnostics);
    button("Fermer le diagnostic du chargement").click();
    await tick();
    expect(modal()).toBeNull();
    button("Voir les détails").click();
    await tick();
    button("Fermer en dehors du diagnostic").click();
    await tick();
    expect(modal()).toBeNull();
    expect(diagnostics.current.value?.status).toBe("loading");
  });

  it("copie le rapport choisi et laisse un texte sélectionnable si le presse-papiers refuse", async () => {
    const { diagnostics, platform } = setup();
    diagnostics.begin("opening");
    diagnostics.finish();
    await open(diagnostics);
    button("Copier le rapport").click();
    await tick();
    expect(platform.copied).toEqual([diagnostics.report()]);
    expect(text()).toContain("Rapport copié.");
    platform.copyText = async () => {
      throw new Error("Presse-papiers refusé");
    };
    button("Copier le rapport").click();
    await tick();
    expect(text()).toContain("Copie impossible");
    expect(text()).not.toContain("Rapport copié.");
    expect(document.querySelector<HTMLTextAreaElement>(".load-diagnostics-report")?.value).toBe(
      diagnostics.report(),
    );
  });

  it("sépare les données prêtes, le board affiché et la synchronisation terminée", async () => {
    const { diagnostics, advance } = setup();
    const id = diagnostics.begin("opening");
    advance(600);
    diagnostics.markDataReady();
    advance(200);
    diagnostics.markVisible(id);
    advance(1_200);
    diagnostics.finish();
    await open(diagnostics);
    expect(document.querySelector(".load-diagnostics-launcher")?.textContent).toContain(
      "Chargé en 0,8 s",
    );
    expect(
      [...document.querySelectorAll(".load-diagnostics-metrics dd")].map(
        (element) => element.textContent,
      ),
    ).toEqual(["0,6 s", "0,8 s", "2,0 s"]);
  });

  it("détaille à la demande les tentatives HTTP et l'attente sans additionner leurs temps", async () => {
    const { diagnostics, advance } = setup();
    diagnostics.begin("opening");
    const read = diagnostics.observeTransport("graphql");
    const first = read?.attempt(1);
    advance(300);
    first?.finish({ status: 429, error: "rateLimited" });
    const wait = read?.wait(1_000);
    advance(1_000);
    wait?.finish();
    const second = read?.attempt(2);
    advance(500);
    second?.finish({ status: 200, error: null });
    diagnostics.finish();
    await open(diagnostics);
    expect(document.querySelectorAll(".load-diagnostics-span")).toHaveLength(0);
    const requests = [...document.querySelectorAll<HTMLDetailsElement>("details")].find((element) =>
      element.querySelector("summary")?.textContent?.includes("Requêtes et attentes"),
    );
    if (!requests) throw new Error("Détail des requêtes attendu");
    requests.open = true;
    requests.dispatchEvent(new Event("toggle"));
    await tick();
    expect(requests.querySelectorAll(".load-diagnostics-span")).toHaveLength(3);
    expect(requests.textContent).toContain("HTTP 429");
    expect(requests.textContent).toContain("tentative 2");
    expect(requests.textContent).toContain("Attente prévue : 1,0 s");
    expect(document.querySelector(".load-diagnostics-launcher")?.textContent).toContain("1,8 s");
  });

  it("consulte l'historique sans doubler le courant et efface les anciens rapports", async () => {
    const { diagnostics, platform, advance } = setup();
    diagnostics.begin("opening");
    advance(1_000);
    diagnostics.finish();
    const first = diagnostics.current.value;
    if (!first) throw new Error("Premier diagnostic attendu");
    diagnostics.begin("refresh");
    advance(2_000);
    diagnostics.finish();
    await open(diagnostics);
    const select = document.querySelector<HTMLSelectElement>("#load-diagnostics-run");
    if (!select) throw new Error("Historique attendu");
    expect(select.options).toHaveLength(2);
    expect(select.options[0]?.textContent).toContain("Actualisation");
    select.value = first.id;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    await tick();
    button("Copier le rapport").click();
    await tick();
    expect(platform.copied[0]).toBe(diagnostics.report(first));
    button("Effacer l’historique").click();
    await tick();
    expect(diagnostics.history.value).toEqual([]);
    expect(select.options).toHaveLength(1);
    expect(select.options[0]?.textContent).toContain("Actualisation");
  });

  it("n'annonce jamais un board chargé après erreur ou interruption", async () => {
    const { diagnostics } = setup();
    diagnostics.begin("opening");
    diagnostics.finish("error");
    await open(diagnostics);
    expect(text()).toContain("Chargement en erreur");
    expect(text()).toContain("Mesure incomplète");
    expect(document.querySelector(".load-diagnostics-launcher")?.textContent).not.toContain(
      "Chargé en",
    );
    diagnostics.begin("refresh");
    diagnostics.finish("cancelled");
    await tick();
    expect(text()).toContain("Chargement interrompu");
  });

  it("signale un effacement refusé par le stockage local", async () => {
    const { diagnostics, platform } = setup();
    diagnostics.begin("opening");
    diagnostics.finish();
    platform.store.remove = async () => {
      throw new Error("Stockage indisponible");
    };
    await open(diagnostics);
    button("Effacer l’historique").click();
    await expect.poll(() => text()).toContain("L’historique n’a pas pu être effacé");
  });

  it("se masque pour la présentation ou la daily et ne rouvre pas la popin au retour", async () => {
    const { diagnostics } = setup();
    diagnostics.begin("opening");
    await open(diagnostics);
    render(<LoadDiagnosticsView diagnostics={diagnostics} hidden />, document.body);
    await tick();
    expect(document.querySelector(".load-diagnostics-launcher")).toBeNull();
    expect(modal()).toBeNull();
    render(<LoadDiagnosticsView diagnostics={diagnostics} />, document.body);
    await tick();
    expect(modal()).toBeNull();
    expect(document.querySelector(".load-diagnostics-launcher")).not.toBeNull();
  });
});
