/**
 * Menu « ⋯ » d'une swimlane. La zone du board défile horizontalement : tout ce qui dépasse de ses
 * bords est rogné, et un menu ouvert sur une des dernières swimlanes (board court, swimlanes
 * repliées) était coupé. Le panneau est donc placé par rapport à la fenêtre (position fixe) :
 * sous son bouton, ou au-dessus s'il n'y a pas la place en dessous. Il se referme si la page ou
 * le board défile, ou si la fenêtre change de taille, puisqu'il ne suivrait pas son bouton.
 *
 * En mode présentation, le board est agrandi par `zoom` : les mesures (`getBoundingClientRect`) sont
 * en pixels de la fenêtre, mais une longueur posée sur le panneau y est multipliée par le zoom. Les
 * positions sont donc divisées par le zoom effectif du panneau.
 */

const MARGIN = 8;
const GAP = 4;

const closers = new WeakMap<HTMLDetailsElement, AbortController>();

export interface Viewport {
  readonly width: number;
  readonly height: number;
}

/** À appeler à chaque ouverture ou fermeture du menu (événement `toggle`). */
export function placeFloatingMenu(
  details: HTMLDetailsElement,
  viewport: Viewport = { width: window.innerWidth, height: window.innerHeight },
): void {
  closers.get(details)?.abort();
  closers.delete(details);
  delete details.dataset.placed;
  const panel = details.querySelector<HTMLElement>(".menu-panel");
  // Rouvert par son bouton après un clic droit : il retrouve sa place sous le bouton.
  if (panel) delete panel.dataset.atPoint;
  if (!details.open) return;
  const summary = details.querySelector("summary");
  if (!summary || !panel) return;

  // Tout en pixels de la fenêtre, puis ramené aux longueurs CSS du panneau.
  const zoom = cssZoom(panel);
  const box = summary.getBoundingClientRect();
  const height = panel.getBoundingClientRect().height;
  const below = viewport.height - box.bottom - GAP - MARGIN;
  const above = box.top - GAP - MARGIN;
  const top =
    below >= height || below >= above ? box.bottom + GAP : Math.max(MARGIN, box.top - GAP - height);
  panel.style.setProperty("--menu-top", `${Math.round(top / zoom)}px`);
  panel.style.setProperty("--menu-right", `${Math.round((viewport.width - box.right) / zoom)}px`);
  panel.style.setProperty(
    "--menu-max-height",
    `${Math.floor((viewport.height - 2 * MARGIN) / zoom)}px`,
  );
  details.dataset.placed = "";
  closeOnMove(details, panel);
}

/**
 * Menu `<details>` ouvert au pointeur (clic droit) ou sous sa carte (clavier) plutôt que sous son
 * bouton : le panneau, marqué `data-at-point`, est placé par `placeAtPoint` et se referme comme
 * au-dessus si la page défile ou si la fenêtre change de taille.
 */
export function placeDetailsAtPoint(
  details: HTMLDetailsElement,
  point: Point,
  viewport: Viewport = { width: window.innerWidth, height: window.innerHeight },
): void {
  closers.get(details)?.abort();
  closers.delete(details);
  delete details.dataset.placed;
  const panel = details.querySelector<HTMLElement>(".menu-panel");
  if (!details.open || !panel) return;
  // Ancré à gauche et mesuré au coin de la fenêtre : une place précédente ne le rétrécit pas.
  panel.dataset.atPoint = "";
  panel.style.setProperty("--menu-left", "0px");
  panel.style.setProperty("--menu-top", "0px");
  placeAtPoint(panel, point, viewport);
  details.dataset.placed = "";
  closeOnMove(details, panel);
}

/** Referme le menu si la page ou le board défile, ou si la fenêtre change de taille. */
function closeOnMove(details: HTMLDetailsElement, panel: HTMLElement): void {
  const controller = new AbortController();
  closers.set(details, controller);
  const close = (event: Event) => {
    // Faire défiler le menu lui-même (fenêtre très basse) ne le ferme pas.
    if (event.target instanceof Node && panel.contains(event.target)) return;
    details.open = false;
  };
  window.addEventListener("scroll", close, { capture: true, signal: controller.signal });
  window.addEventListener("resize", close, { signal: controller.signal });
}

/** Zoom CSS effectif d'un élément (mode présentation) ; 1 si le navigateur ne le donne pas. */
function cssZoom(element: Element): number {
  const zoom = (element as Element & { currentCSSZoom?: unknown }).currentCSSZoom;
  return typeof zoom === "number" && Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
}

/**
 * Menu d'une carte, ouvert au pointeur (clic droit) ou sous la carte (clavier) : son coin
 * supérieur gauche au point donné, ramené dans la fenêtre s'il en déborderait — à gauche du point
 * faute de place à droite, au-dessus faute de place en dessous. Même conversion qu'au-dessus pour
 * le zoom de la présentation.
 */
export function placeAtPoint(
  panel: HTMLElement,
  point: { readonly x: number; readonly y: number },
  viewport: Viewport = { width: window.innerWidth, height: window.innerHeight },
): void {
  const zoom = cssZoom(panel);
  const box = panel.getBoundingClientRect();
  const fitsRight = point.x + box.width <= viewport.width - MARGIN;
  const fitsBelow = point.y + box.height <= viewport.height - MARGIN;
  const left = clamp(
    fitsRight ? point.x : point.x - box.width,
    MARGIN,
    viewport.width - MARGIN - box.width,
  );
  const top = clamp(
    fitsBelow ? point.y : point.y - box.height,
    MARGIN,
    viewport.height - MARGIN - box.height,
  );
  panel.style.setProperty("--menu-left", `${Math.round(left / zoom)}px`);
  panel.style.setProperty("--menu-top", `${Math.round(top / zoom)}px`);
  panel.style.setProperty(
    "--menu-max-height",
    `${Math.floor((viewport.height - 2 * MARGIN) / zoom)}px`,
  );
  panel.dataset.placed = "";
}

/** Écart entre un menu et son sous-menu. */
const SUBMENU_GAP = 2;

/**
 * Sous-menu d'un menu de carte, à côté de lui : à droite, sa première ligne alignée sur la ligne
 * qui l'ouvre ; à gauche faute de place à droite ; remonté s'il déborderait en bas. Même
 * conversion qu'au-dessus pour le zoom de la présentation.
 */
export function placeBeside(
  panel: HTMLElement,
  menu: Element,
  row: Element,
  viewport: Viewport = { width: window.innerWidth, height: window.innerHeight },
): void {
  const zoom = cssZoom(panel);
  // Mesuré au coin de la fenêtre, où toute la largeur est disponible : mesuré près du bord droit,
  // il serait rétréci, puis s'élargirait une fois placé à gauche, par-dessus le menu.
  panel.style.setProperty("--menu-left", "0px");
  panel.style.setProperty("--menu-top", "0px");
  const box = panel.getBoundingClientRect();
  const parent = menu.getBoundingClientRect();
  // Marge intérieure et bord du sous-menu, mesurés : sa première ligne face à celle qui l'ouvre.
  const first = panel.querySelector("[role='menuitem']");
  const inset = first ? first.getBoundingClientRect().top - box.top : 0;
  const fitsRight = parent.right + SUBMENU_GAP + box.width <= viewport.width - MARGIN;
  const left = fitsRight
    ? parent.right + SUBMENU_GAP
    : Math.max(MARGIN, parent.left - SUBMENU_GAP - box.width);
  const top = clamp(
    row.getBoundingClientRect().top - inset,
    MARGIN,
    viewport.height - MARGIN - box.height,
  );
  panel.style.setProperty("--menu-left", `${Math.round(left / zoom)}px`);
  panel.style.setProperty("--menu-top", `${Math.round(top / zoom)}px`);
  panel.style.setProperty(
    "--menu-max-height",
    `${Math.floor((viewport.height - 2 * MARGIN) / zoom)}px`,
  );
  panel.dataset.side = fitsRight ? "right" : "left";
  panel.dataset.placed = "";
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

/**
 * Le pointeur se dirige-t-il vers le sous-menu ? Vrai s'il est dans le triangle formé par le point
 * où il a quitté la ligne (`apex`) et les deux coins du bord du sous-menu tourné vers ce point.
 */
export function inCorridor(
  apex: Point,
  point: Point,
  box: {
    readonly left: number;
    readonly right: number;
    readonly top: number;
    readonly bottom: number;
  },
): boolean {
  const x = apex.x <= box.left ? box.left : box.right;
  const corners: readonly [Point, Point, Point] = [apex, { x, y: box.top }, { x, y: box.bottom }];
  const side = (p: Point, q: Point) =>
    (point.x - q.x) * (p.y - q.y) - (p.x - q.x) * (point.y - q.y);
  const [a, b, c] = corners;
  const d1 = side(a, b);
  const d2 = side(b, c);
  const d3 = side(c, a);
  const negative = d1 < 0 || d2 < 0 || d3 < 0;
  const positive = d1 > 0 || d2 > 0 || d3 > 0;
  return !(negative && positive);
}

/** `value` dans `[min, max]` ; `min` l'emporte si l'intervalle est vide (menu trop grand). */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}
