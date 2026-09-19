/**
 * Menu « ⋯ » d'une swimlane. La zone du board défile horizontalement : tout ce qui dépasse de ses
 * bords est rogné, et un menu ouvert sur une des dernières swimlanes (board court, swimlanes
 * repliées) était coupé. Le panneau est donc placé par rapport à la fenêtre (position fixe) :
 * sous son bouton, ou au-dessus s'il n'y a pas la place en dessous. Il se referme si la page ou
 * le board défile, ou si la fenêtre change de taille, puisqu'il ne suivrait pas son bouton.
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
  if (!details.open) return;
  const summary = details.querySelector("summary");
  const panel = details.querySelector<HTMLElement>(".menu-panel");
  if (!summary || !panel) return;

  const box = summary.getBoundingClientRect();
  const height = panel.offsetHeight;
  const below = viewport.height - box.bottom - GAP - MARGIN;
  const above = box.top - GAP - MARGIN;
  const top =
    below >= height || below >= above ? box.bottom + GAP : Math.max(MARGIN, box.top - GAP - height);
  panel.style.setProperty("--menu-top", `${Math.round(top)}px`);
  panel.style.setProperty("--menu-right", `${Math.round(viewport.width - box.right)}px`);
  details.dataset.placed = "";

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
