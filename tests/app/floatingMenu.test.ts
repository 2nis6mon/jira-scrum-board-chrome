// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { placeFloatingMenu } from "../../src/app/views/board/floatingMenu";

const VIEWPORT = { width: 1200, height: 800 };

afterEach(() => {
  document.body.replaceChildren();
});

/** Menu dont le bouton occupe `top`–`top + 24` et dont le panneau mesure `height` px. */
function menu(top: number, height: number) {
  const details = document.createElement("details");
  const summary = document.createElement("summary");
  const panel = document.createElement("div");
  panel.className = "menu-panel";
  details.append(summary, panel);
  document.body.append(details);
  summary.getBoundingClientRect = () =>
    ({ top, bottom: top + 24, left: 1150, right: 1176, width: 26, height: 24 }) as DOMRect;
  Object.defineProperty(panel, "offsetHeight", { value: height });
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
    expect(details.dataset.placed).toBe("");
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
