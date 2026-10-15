// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  platform: vi.fn(() => ({})),
  target: vi.fn(),
  construct: vi.fn(),
  start: vi.fn(async () => {}),
  language: vi.fn(async () => {}),
  render: vi.fn(),
  links: vi.fn(),
}));

vi.mock("preact", () => ({ render: mocks.render }));
vi.mock("../../src/app/App", () => ({ App: () => null }));
vi.mock("../../src/app/platform/chrome", () => ({ chromePlatform: mocks.platform }));
vi.mock("../../src/app/model/AppModel", () => ({
  AppModel: class {
    start = mocks.start;
    prepareLanguage = mocks.language;
    constructor(...args: unknown[]) {
      mocks.construct(...args);
    }
  },
}));
vi.mock("../../src/integration/embedded", () => ({
  embeddedBoardTarget: mocks.target,
  installEmbeddedLinks: mocks.links,
}));

const SITE = "https://acme.atlassian.net";
const BOARD = `${SITE}/jira/software/c/projects/ABC/boards/7?sprintGoals=1`;
let originalParent: PropertyDescriptor | undefined;

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  document.body.replaceChildren();
  const app = document.createElement("div");
  app.id = "app";
  document.body.append(app);
  originalParent = Object.getOwnPropertyDescriptor(window, "parent");
});

afterEach(() => {
  if (originalParent) Object.defineProperty(window, "parent", originalParent);
});

describe("point d'entrée réservé à une page Jira vérifiée", () => {
  it("refuse board.html ouvert seul avant tout accès Chrome, modèle ou affichage de l'app", async () => {
    Object.defineProperty(window, "parent", { configurable: true, value: window });
    await import("../../src/app/main");
    expect(document.body.textContent).toContain("Use Sprint Goals inside Jira");
    expect(mocks.platform).not.toHaveBeenCalled();
    expect(mocks.target).not.toHaveBeenCalled();
    expect(mocks.construct).not.toHaveBeenCalled();
    expect(mocks.start).not.toHaveBeenCalled();
    expect(mocks.render).not.toHaveBeenCalled();
  });

  it("ne construit pas de modèle dans une iframe refusée", async () => {
    Object.defineProperty(window, "parent", { configurable: true, value: {} });
    mocks.target.mockResolvedValue(null);
    await import("../../src/app/main");
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain("Use Sprint Goals inside Jira"),
    );
    expect(mocks.construct).not.toHaveBeenCalled();
    expect(mocks.start).not.toHaveBeenCalled();
    expect(mocks.render).not.toHaveBeenCalled();
  });

  it("refuse également l'iframe si la vérification de permission échoue", async () => {
    Object.defineProperty(window, "parent", { configurable: true, value: {} });
    mocks.target.mockRejectedValue(new Error("Chrome indisponible"));
    await import("../../src/app/main");
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain("Use Sprint Goals inside Jira"),
    );
    expect(mocks.construct).not.toHaveBeenCalled();
    expect(mocks.render).not.toHaveBeenCalled();
  });

  it("ne construit et ne démarre le modèle qu'après validation de la page Jira hôte", async () => {
    Object.defineProperty(window, "parent", { configurable: true, value: {} });
    let verified: ((target: unknown) => void) | undefined;
    mocks.target.mockImplementation(
      () =>
        new Promise((resolve) => {
          verified = resolve;
        }),
    );
    await import("../../src/app/main");
    expect(mocks.construct).not.toHaveBeenCalled();
    expect(mocks.start).not.toHaveBeenCalled();
    verified?.({ origin: SITE, permissionPattern: `${SITE}/*`, address: BOARD });
    await vi.waitFor(() => expect(mocks.start).toHaveBeenCalledWith(BOARD, expect.any(Number)));
    expect(mocks.construct).toHaveBeenCalledWith({}, BOARD, null);
    expect(mocks.language).toHaveBeenCalledOnce();
    expect(mocks.render).toHaveBeenCalledOnce();
    expect(mocks.links).toHaveBeenCalledWith(expect.anything(), SITE, BOARD);
  });
});
