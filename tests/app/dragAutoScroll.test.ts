// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DRAG_SCROLL_ATTRIBUTE,
  DRAG_SCROLL_MAX_STEP,
  type DragScrollClock,
  dragScrollStep,
  installDragAutoScroll,
} from "../../src/app/views/dragAutoScroll";

/** Conteneur de 400 × 800 px placé en (100, 0), dont le contenu déborde. */
const BOX = { top: 0, bottom: 800, left: 100, right: 500 };

describe("dragScrollStep", () => {
  it("ne défile pas au milieu du conteneur", () => {
    expect(dragScrollStep(300, 400, BOX)).toEqual({ x: 0, y: 0 });
    // Juste hors de la bande de 56 px.
    expect(dragScrollStep(300, 800 - 56, BOX)).toEqual({ x: 0, y: 0 });
    expect(dragScrollStep(100 + 56, 56, BOX)).toEqual({ x: 0, y: 0 });
  });

  it("défile vers le bord approché, plus vite près du bord", () => {
    const entering = dragScrollStep(300, 800 - 50, BOX).y;
    const closer = dragScrollStep(300, 800 - 10, BOX).y;
    expect(entering).toBeGreaterThan(0);
    expect(closer).toBeGreaterThan(entering);
    expect(dragScrollStep(300, 800, BOX).y).toBe(DRAG_SCROLL_MAX_STEP);
    expect(dragScrollStep(300, 10, BOX).y).toBe(-closer);
    expect(dragScrollStep(300, 0, BOX).y).toBe(-DRAG_SCROLL_MAX_STEP);
    expect(dragScrollStep(495, 400, BOX)).toEqual({ x: expect.any(Number), y: 0 });
    expect(dragScrollStep(495, 400, BOX).x).toBeGreaterThan(0);
    expect(dragScrollStep(105, 400, BOX).x).toBeLessThan(0);
  });

  it("garde le pas maximal au-delà du bord", () => {
    expect(dragScrollStep(300, 820, BOX).y).toBe(DRAG_SCROLL_MAX_STEP);
    expect(dragScrollStep(300, -20, BOX).y).toBe(-DRAG_SCROLL_MAX_STEP);
    expect(dragScrollStep(520, 400, BOX).x).toBe(DRAG_SCROLL_MAX_STEP);
  });

  it("réduit la bande au quart d'un petit conteneur", () => {
    // 100 px de haut : bande de 25 px.
    const small = { top: 0, bottom: 100, left: 0, right: 1000 };
    expect(dragScrollStep(500, 70, small).y).toBe(0);
    expect(dragScrollStep(500, 80, small).y).toBeGreaterThan(0);
    expect(dragScrollStep(500, 20, small).y).toBeLessThan(0);
    expect(dragScrollStep(500, 50, { top: 0, bottom: 0, left: 0, right: 0 })).toEqual({
      x: 0,
      y: 0,
    });
  });
});

describe("installDragAutoScroll", () => {
  let time = 0;
  let nextHandle = 0;
  let frames = new Map<number, () => void>();
  const clock: DragScrollClock = {
    now: () => time,
    requestFrame: (callback) => {
      nextHandle += 1;
      frames.set(nextHandle, callback);
      return nextHandle;
    },
    cancelFrame: (handle) => frames.delete(handle),
  };
  let uninstall: () => void = () => {};

  /** Joue `count` images de 16 ms. */
  function runFrames(count: number) {
    for (let index = 0; index < count; index += 1) {
      time += 16;
      const pending = [...frames.values()];
      frames = new Map();
      for (const callback of pending) callback();
    }
  }

  /** Conteneur défilant dont la position est suivie par `scrollTop`. */
  function scroller(box: typeof BOX): HTMLElement {
    const element = document.createElement("div");
    element.setAttribute(DRAG_SCROLL_ATTRIBUTE, "");
    const child = document.createElement("div");
    element.append(child);
    document.body.append(element);
    element.getBoundingClientRect = () => ({ ...box, width: 0, height: 0 }) as DOMRect;
    let top = 0;
    let left = 0;
    Object.defineProperty(element, "scrollTop", {
      get: () => top,
      set: (value: number) => {
        top = Math.max(0, value);
      },
    });
    Object.defineProperty(element, "scrollLeft", {
      get: () => left,
      set: (value: number) => {
        left = Math.max(0, value);
      },
    });
    return element;
  }

  function fire(type: string, target: Element, x = 300, y = 790, related: Element | null = null) {
    target.dispatchEvent(
      new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
        relatedTarget: related,
      }),
    );
  }

  beforeEach(() => {
    time = 0;
    frames = new Map();
    uninstall = installDragAutoScroll(window, clock);
  });

  afterEach(() => {
    uninstall();
    document.body.replaceChildren();
  });

  it("défile vers le bas dans la bande basse, même si la zone arrête la propagation", () => {
    const board = scroller(BOX);
    const zone = board.firstElementChild as HTMLElement;
    zone.addEventListener("dragover", (event) => event.stopPropagation());
    fire("dragover", zone);
    runFrames(5);
    expect(board.scrollTop).toBeGreaterThan(0);
  });

  it("défile vers le haut dans la bande haute, jusqu'au haut du contenu", () => {
    const board = scroller(BOX);
    board.scrollTop = 40;
    fire("dragover", board, 300, 5);
    runFrames(1);
    expect(board.scrollTop).toBeLessThan(40);
    expect(board.scrollTop).toBeGreaterThan(0);
    runFrames(5);
    expect(board.scrollTop).toBe(0);
  });

  it("défile en largeur près du bord droit, sans défiler en hauteur", () => {
    const board = scroller(BOX);
    fire("dragover", board, 495, 400);
    runFrames(5);
    expect(board.scrollLeft).toBeGreaterThan(0);
    expect(board.scrollTop).toBe(0);
  });

  it("ne défile pas au milieu ni hors glisser", () => {
    const board = scroller(BOX);
    fire("dragover", board, 300, 400);
    runFrames(5);
    expect(board.scrollTop).toBe(0);
    fire("mousemove", board, 300, 790);
    fire("pointermove", board, 300, 790);
    runFrames(5);
    expect(board.scrollTop).toBe(0);
  });

  it("s'arrête au dépôt, à l'abandon et à la sortie de la vue", () => {
    const board = scroller(BOX);
    for (const end of ["drop", "dragend", "dragleave"]) {
      fire("dragover", board);
      runFrames(2);
      const reached = board.scrollTop;
      expect(reached).toBeGreaterThan(0);
      fire(end, board);
      runFrames(5);
      expect(board.scrollTop, end).toBe(reached);
    }
  });

  it("continue quand le pointeur passe d'un élément à l'autre dans la vue", () => {
    const board = scroller(BOX);
    fire("dragover", board);
    runFrames(2);
    const reached = board.scrollTop;
    fire("dragleave", board, 300, 790, board.firstElementChild);
    runFrames(2);
    expect(board.scrollTop).toBeGreaterThan(reached);
  });

  it("s'arrête après 1 s sans dragover, mais pas tant qu'ils arrivent", () => {
    const board = scroller(BOX);
    fire("dragover", board);
    // Pointeur immobile : un dragover toutes les 350 ms environ.
    for (let round = 0; round < 4; round += 1) {
      runFrames(22);
      fire("dragover", board);
    }
    const moving = board.scrollTop;
    runFrames(2);
    expect(board.scrollTop).toBeGreaterThan(moving);
    runFrames(70);
    const stopped = board.scrollTop;
    runFrames(10);
    expect(board.scrollTop).toBe(stopped);
  });

  it("ne fait défiler que la zone survolée", () => {
    const lanes = scroller(BOX);
    const sources = scroller({ top: 0, bottom: 800, left: 0, right: 100 });
    fire("dragover", lanes);
    runFrames(5);
    expect(lanes.scrollTop).toBeGreaterThan(0);
    expect(sources.scrollTop).toBe(0);
  });

  it("ne réagit plus après la désinstallation", () => {
    const board = scroller(BOX);
    uninstall();
    fire("dragover", board);
    runFrames(5);
    expect(board.scrollTop).toBe(0);
  });
});
