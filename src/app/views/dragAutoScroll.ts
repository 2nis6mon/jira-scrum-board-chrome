/**
 * Défilement pendant le glisser-déposer natif : quand le pointeur entre dans la bande au bord d'un
 * conteneur marqué `data-drag-scroll` (board, colonnes du planning), ce conteneur défile vers ce
 * bord, d'autant plus vite que le pointeur s'en approche. Le glisser lui-même n'est pas touché :
 * aucun `preventDefault`, aucune donnée ni `dropEffect` modifiés.
 */

/** Attribut qui désigne un conteneur à faire défiler pendant un glisser. */
export const DRAG_SCROLL_ATTRIBUTE = "data-drag-scroll";

/** Largeur maximale de la bande sensible, en px. */
export const DRAG_SCROLL_BAND = 56;
/** Pas maximal, en px par image, atteint au bord du conteneur et au-delà. */
export const DRAG_SCROLL_MAX_STEP = 18;
/** Sans `dragover` depuis ce délai, le défilement s'arrête (glisser interrompu sans `dragend`). */
export const DRAG_SCROLL_IDLE_MS = 1000;

/** Rectangle visible du conteneur, en coordonnées de la fenêtre. */
export interface DragScrollBox {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/**
 * Pas de défilement pour un pointeur en (`x`, `y`) : négatif vers le haut ou la gauche, positif vers
 * le bas ou la droite, 0 hors des bandes. Bande = min(56 px, taille / 4) ; pas =
 * ceil(18 × (bande − distance au bord) / bande).
 */
export function dragScrollStep(x: number, y: number, box: DragScrollBox): { x: number; y: number } {
  return {
    x: axisStep(x, box.left, box.right),
    y: axisStep(y, box.top, box.bottom),
  };
}

function axisStep(position: number, start: number, end: number): number {
  const band = Math.min(DRAG_SCROLL_BAND, (end - start) / 4);
  if (band <= 0) return 0;
  const speed = (distance: number) =>
    Math.ceil((DRAG_SCROLL_MAX_STEP * (band - Math.max(0, distance))) / band);
  if (position - start < band) return -speed(position - start);
  if (end - position < band) return speed(end - position);
  return 0;
}

/** Horloge et images, remplaçables dans les tests. */
export interface DragScrollClock {
  now(): number;
  requestFrame(callback: () => void): number;
  cancelFrame(handle: number): void;
}

/**
 * Installe le défilement sur `target` (la fenêtre de la vue). `dragover` est écouté en capture :
 * une zone de dépôt qui arrête sa propagation n'empêche donc pas le défilement. Arrêt au dépôt, à
 * l'abandon (`dragend`), à la sortie de la vue ou après 1 s sans `dragover`. Renvoie la fonction de
 * désinstallation.
 */
export function installDragAutoScroll(
  target: Window,
  clock: DragScrollClock = {
    now: () => performance.now(),
    requestFrame: (callback) => target.requestAnimationFrame(callback),
    cancelFrame: (handle) => target.cancelAnimationFrame(handle),
  },
): () => void {
  let container: HTMLElement | null = null;
  let pointer = { x: 0, y: 0 };
  let lastDragOver = 0;
  let frame: number | null = null;

  const stop = () => {
    container = null;
    if (frame !== null) clock.cancelFrame(frame);
    frame = null;
  };

  const tick = () => {
    frame = null;
    if (!container?.isConnected || clock.now() - lastDragOver > DRAG_SCROLL_IDLE_MS) {
      stop();
      return;
    }
    const step = dragScrollStep(pointer.x, pointer.y, container.getBoundingClientRect());
    // Hors des bandes, la boucle s'arrête ; le prochain `dragover` la relance au besoin.
    if (step.x === 0 && step.y === 0) return;
    if (step.y !== 0) container.scrollTop += step.y;
    if (step.x !== 0) container.scrollLeft += step.x;
    frame = clock.requestFrame(tick);
  };

  const onDragOver = (event: DragEvent) => {
    const element = event.target instanceof Element ? event.target : null;
    container = element?.closest<HTMLElement>(`[${DRAG_SCROLL_ATTRIBUTE}]`) ?? null;
    if (!container) {
      stop();
      return;
    }
    pointer = { x: event.clientX, y: event.clientY };
    lastDragOver = clock.now();
    if (frame === null) frame = clock.requestFrame(tick);
  };

  // Un `dragleave` sans élément d'arrivée : le pointeur a quitté la vue.
  const onDragLeave = (event: DragEvent) => {
    if (event.relatedTarget === null) stop();
  };

  target.addEventListener("dragover", onDragOver, true);
  target.addEventListener("dragleave", onDragLeave, true);
  target.addEventListener("drop", stop, true);
  target.addEventListener("dragend", stop, true);
  return () => {
    stop();
    target.removeEventListener("dragover", onDragOver, true);
    target.removeEventListener("dragleave", onDragLeave, true);
    target.removeEventListener("drop", stop, true);
    target.removeEventListener("dragend", stop, true);
  };
}
