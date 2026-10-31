// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { placeAtPoint, placeFloatingMenu } from "../../src/app/views/board/floatingMenu";

const VIEWPORT = { width: 1200, height: 800 };

afterEach(() => {
  document.body.replaceChildren();
});

/**
 * Menu dont le bouton occupe `top`–`top + 24` et dont le panneau mesure `height` px à l'écran.
 * `zoom` : zoom CSS effectif du panneau (mode présentation).
 */
function menu(top: number, height: number, zoom?: number) {
  const details = document.createElement("details");
  const summary = document.createElement("summary");
  const panel = document.createElement("div");
  panel.className = "menu-panel";
  details.append(summary, panel);
  document.body.append(details);
  summary.getBoundingClientRect = () =>
    ({ top, bottom: top + 24, left: 1150, right: 1176, width: 26, height: 24 }) as DOMRect;
  panel.getBoundingClientRect = () => ({ top: 0, bottom: height, height }) as DOMRect;
  if (zoom !== undefined) Object.defineProperty(panel, "currentCSSZoom", { value: zoom });
  details.open = true;
  return { details, panel };
}

const topOf = (panel: HTMLElement) => panel.style.getPropertyValue("--menu-top");

describe("menu d'une swimlane placé dans la fenêtre", () => {
  it("sous son bouton quand la place suffit, aligné sur son bord droit", () => {
    const { details, panel } = menu(100, 300);
    placeFloatingMenu(details, VIEWPORT);
    expect(topOf(panel)).toBe("128px");
    expect(panel.style.getPropertyValue("--menu-right")).toBe("24px");
    expect(panel.style.getPropertyValue("--menu-max-height")).toBe("784px");
    expect(details.dataset.placed).toBe("");
  });

  it("board agrandi (mode présentation) : positions ramenées au zoom du panneau", () => {
    // Mesures en pixels de la fenêtre ; une longueur CSS du panneau y vaut 1,25 px.
    const { details, panel } = menu(100, 300, 1.25);
    placeFloatingMenu(details, VIEWPORT);
    expect(topOf(panel)).toBe(`${Math.round(128 / 1.25)}px`);
    expect(panel.style.getPropertyValue("--menu-right")).toBe(`${Math.round(24 / 1.25)}px`);
    expect(panel.style.getPropertyValue("--menu-max-height")).toBe(`${Math.floor(784 / 1.25)}px`);

    // Au-dessus faute de place : la hauteur mesurée à l'écran compte, zoom compris.
    const high = menu(600, 300, 1.25);
    placeFloatingMenu(high.details, VIEWPORT);
    expect(topOf(high.panel)).toBe(`${Math.round(296 / 1.25)}px`);
  });

  it("au-dessus quand la place manque en dessous (dernière swimlane, board court)", () => {
    const { details, panel } = menu(600, 300);
    placeFloatingMenu(details, VIEWPORT);
    expect(topOf(panel)).toBe("296px");
  });

  it("jamais hors de la fenêtre, même trop haut pour les deux côtés", () => {
    const { details, panel } = menu(500, 790);
    placeFloatingMenu(details, VIEWPORT);
    expect(topOf(panel)).toBe("8px");
  });

  it("se referme si la page défile, pas si l'on fait défiler le menu lui-même", () => {
    const { details, panel } = menu(100, 300);
    placeFloatingMenu(details, VIEWPORT);
    panel.dispatchEvent(new Event("scroll"));
    expect(details.open).toBe(true);
    document.body.dispatchEvent(new Event("scroll"));
    expect(details.open).toBe(false);
  });

  it("fermé : plus placé, et plus d'écoute du défilement", () => {
    const { details } = menu(100, 300);
    placeFloatingMenu(details, VIEWPORT);
    details.open = false;
    placeFloatingMenu(details, VIEWPORT);
    expect(details.dataset.placed).toBeUndefined();
    details.open = true;
    window.dispatchEvent(new Event("resize"));
    expect(details.open).toBe(true);
  });
});

/** Panneau du menu d'une carte, de `width` × `height` px à l'écran. */
function cardPanel(width: number, height: number, zoom?: number) {
  const panel = document.createElement("div");
  document.body.append(panel);
  panel.getBoundingClientRect = () => ({ top: 0, left: 0, width, height }) as DOMRect;
  if (zoom !== undefined) Object.defineProperty(panel, "currentCSSZoom", { value: zoom });
  return panel;
}

const at = (panel: HTMLElement) => [
  panel.style.getPropertyValue("--menu-left"),
  panel.style.getPropertyValue("--menu-top"),
];

describe("menu d'une carte placé au point demandé", () => {
  it("coin supérieur gauche au pointeur quand la place suffit", () => {
    const panel = cardPanel(240, 200);
    placeAtPoint(panel, { x: 300, y: 100 }, VIEWPORT);
    expect(at(panel)).toEqual(["300px", "100px"]);
    expect(panel.style.getPropertyValue("--menu-max-height")).toBe("784px");
    expect(panel.dataset.placed).toBe("");
  });

  it("à gauche du point près du bord droit, au-dessus près du bas", () => {
    const panel = cardPanel(240, 200);
    placeAtPoint(panel, { x: 1100, y: 700 }, VIEWPORT);
    expect(at(panel)).toEqual(["860px", "500px"]);
  });

  it("jamais hors de la fenêtre", () => {
    const panel = cardPanel(240, 790);
    placeAtPoint(panel, { x: 2, y: 400 }, VIEWPORT);
    expect(at(panel)).toEqual(["8px", "8px"]);
  });

  it("présentation : positions ramenées au zoom du panneau", () => {
    const panel = cardPanel(240, 200, 1.25);
    placeAtPoint(panel, { x: 300, y: 100 }, VIEWPORT);
    expect(at(panel)).toEqual([`${Math.round(300 / 1.25)}px`, `${Math.round(100 / 1.25)}px`]);
    expect(panel.style.getPropertyValue("--menu-max-height")).toBe(`${Math.floor(784 / 1.25)}px`);
  });
});
