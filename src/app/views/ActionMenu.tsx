import { type ComponentChildren, Fragment } from "preact";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { inCorridor, type Point, placeAtPoint, placeBeside } from "./board/floatingMenu";

// Menu flottant d'une carte, commun au Sprint Board et au Sprint Planning (story 8.19) : même
// placement, mêmes sous-menus au survol et au clavier, même fermeture. Chaque écran fournit ses
// actions ; le menu n'écrit rien lui-même.

/** Arrêt du pointeur sur une ligne à sous-menu avant de l'ouvrir. */
const OPEN_DELAY = 150;
/** Au plus tard après que le pointeur a quitté la ligne et la liste, celle-ci se referme. */
const CLOSE_DELAY = 300;

export type MenuEntry =
  | {
      readonly kind: "action";
      readonly id: string;
      readonly label: ComponentChildren;
      /** Action indisponible : désactivée, sa raison affichée et lue avec elle. */
      readonly reason?: string | null;
      /** Choix actuel (objectif du ticket) : marqué et désactivé. */
      readonly current?: boolean;
      /** Couleur d'objectif : pastille à gauche du nom. */
      readonly color?: string;
      onSelect(): void;
    }
  | {
      readonly kind: "submenu";
      readonly id: string;
      readonly label: string;
      readonly reason?: string | null;
      readonly entries: readonly MenuEntry[];
    }
  | { readonly kind: "separator"; readonly id: string }
  | { readonly kind: "heading"; readonly id: string; readonly label: string };

/**
 * Menu de l'extension sur une carte, placé au point demandé. Fermé par Échap, Tab, un clic
 * ailleurs, le défilement, le redimensionnement ou une action ; `onClose` rend le focus. Un
 * sous-menu s'ouvre par un arrêt du pointeur sur sa ligne (sans prendre le focus), par un clic ou au
 * clavier (focus sur son premier élément) ; il se referme quand le pointeur quitte la ligne et la
 * liste, sauf s'il se dirige vers elle.
 */
export function ActionMenu({
  label,
  point,
  entries,
  onClose,
}: {
  label: string;
  point: Point;
  entries: readonly MenuEntry[];
  onClose(): void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const rows = useRef(new Map<string, HTMLButtonElement>());
  const subList = useRef<HTMLDivElement>(null);
  // Sous-menu ouvert ; « hover » : le focus reste où il est, « focus » : il va à la liste.
  const [open, setOpen] = useState<{ id: string; mode: "hover" | "focus" } | null>(null);
  const timers = useRef<{ open: number | undefined; close: number | undefined; closeAt: number }>({
    open: undefined,
    close: undefined,
    closeAt: 0,
  });
  // Point où le pointeur a quitté la ligne : sommet de la zone de tolérance vers la liste.
  const exit = useRef<Point | null>(null);
  const openId = open?.id ?? null;
  const row = () => (openId === null ? null : (rows.current.get(openId) ?? null));

  // Placé avant d'être montré ; focus sur le premier élément actif.
  useLayoutEffect(() => {
    if (!panel.current) return;
    placeAtPoint(panel.current, point);
    focusItem(items(panel.current));
  }, [point.x, point.y]);

  useLayoutEffect(() => {
    const line = row();
    if (openId !== null && subList.current && panel.current && line)
      placeBeside(subList.current, panel.current, line);
  }, [openId]);

  useEffect(() => {
    if (open?.mode === "focus" && subList.current) focusItem(items(subList.current));
  }, [open]);

  const cancelOpen = () => {
    clearTimeout(timers.current.open);
    timers.current.open = undefined;
  };
  const cancelClose = () => {
    clearTimeout(timers.current.close);
    timers.current.close = undefined;
  };
  const closeSub = () => {
    cancelClose();
    exit.current = null;
    // Le focus ne disparaît pas avec la liste : il revient à sa ligne.
    const focused = document.activeElement;
    if (focused instanceof Node && subList.current?.contains(focused)) row()?.focus();
    setOpen(null);
  };
  // Fermeture dans `delay` ms. Hors de la zone de tolérance, une suite de mouvements ne la repousse
  // pas (`extend` faux) : sinon le pointeur qui bouge sur une autre action garderait la liste.
  const closeWithin = (delay: number, extend: boolean) => {
    const at = Date.now() + delay;
    if (timers.current.close !== undefined && !extend && timers.current.closeAt <= at) return;
    clearTimeout(timers.current.close);
    timers.current.closeAt = at;
    timers.current.close = window.setTimeout(() => {
      timers.current.close = undefined;
      closeSub();
    }, delay);
  };

  useEffect(
    () => () => {
      clearTimeout(timers.current.open);
      clearTimeout(timers.current.close);
    },
    [],
  );

  // Liste ouverte : un mouvement du pointeur hors de la ligne et de la liste annonce sa fermeture,
  // repoussée seulement tant qu'il se dirige vers elle.
  useEffect(() => {
    if (openId === null) return;
    const controller = new AbortController();
    const move = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      const list = subList.current;
      const line = row();
      if (!list || !line) return;
      const target = event.target;
      if (target instanceof Node && (line.contains(target) || list.contains(target))) {
        cancelClose();
        return;
      }
      // Liste ouverte au clavier ou au clic, pointeur pas encore passé par la ligne ou revenu de
      // la liste : un mouvement ailleurs ne la ferme pas.
      if (exit.current === null) return;
      const at = { x: event.clientX, y: event.clientY };
      const toward = inCorridor(exit.current, at, list.getBoundingClientRect());
      // Le sommet suit le pointeur tant qu'il se rapproche : un va-et-vient sort vite de la zone.
      if (toward) exit.current = at;
      closeWithin(CLOSE_DELAY, toward);
    };
    document.addEventListener("pointermove", move, { signal: controller.signal });
    return () => controller.abort();
  }, [openId]);

  // Fermeture par un clic ailleurs, un défilement ou un redimensionnement, écoutée dès l'ouverture
  // (avant tout rendu suivant) ; toujours avec le dernier `onClose` reçu.
  const latestClose = useRef(onClose);
  latestClose.current = onClose;
  useLayoutEffect(() => {
    const controller = new AbortController();
    const close = () => latestClose.current();
    const outside = (event: Event) => {
      if (event.target instanceof Node && panel.current?.contains(event.target)) return;
      close();
    };
    const capture = { capture: true, signal: controller.signal };
    document.addEventListener("pointerdown", outside, capture);
    window.addEventListener("scroll", outside, capture);
    window.addEventListener("resize", close, { signal: controller.signal });
    return () => controller.abort();
  }, []);

  const openSub = (entry: SubmenuEntry, withFocus: boolean) => {
    if (entry.reason) return;
    cancelOpen();
    cancelClose();
    if (withFocus) exit.current = null;
    if (withFocus && openId === entry.id && subList.current) focusItem(items(subList.current));
    setOpen((current) =>
      withFocus
        ? { id: entry.id, mode: "focus" }
        : current?.id === entry.id
          ? current
          : { id: entry.id, mode: "hover" },
    );
  };

  const hoverRow = (entry: SubmenuEntry, event: PointerEvent) => {
    if (event.pointerType === "touch") return;
    cancelClose();
    if (openId === entry.id || entry.reason) return;
    cancelOpen();
    timers.current.open = window.setTimeout(() => {
      timers.current.open = undefined;
      openSub(entry, false);
    }, OPEN_DELAY);
  };

  // Le toucher déclenche aussi `pointerleave` (après le doigt levé, au défilement) : ignoré.
  const leaveRow = (entry: SubmenuEntry, event: PointerEvent) => {
    if (event.pointerType === "touch") return;
    cancelOpen();
    exit.current = { x: event.clientX, y: event.clientY };
    if (openId === entry.id && !subList.current?.contains(event.relatedTarget as Node | null))
      closeWithin(CLOSE_DELAY, false);
  };

  const enterSub = (event: PointerEvent) => {
    if (event.pointerType === "touch") return;
    cancelClose();
    exit.current = null;
  };

  const leaveSub = (event: PointerEvent) => {
    if (event.pointerType === "touch") return;
    if (row()?.contains(event.relatedTarget as Node | null)) return;
    closeWithin(CLOSE_DELAY, false);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const root = panel.current;
    const current = document.activeElement;
    if (!root || !(current instanceof HTMLElement)) return;
    const level = current.closest<HTMLElement>("[role='menu']") ?? root;
    const list = items(level);
    const index = list.indexOf(current);
    const inSub = level !== root;
    switch (event.key) {
      case "Escape":
      case "Tab":
        onClose();
        break;
      case "ArrowDown":
        list[(index + 1) % list.length]?.focus();
        break;
      case "ArrowUp":
        list[(index - 1 + list.length) % list.length]?.focus();
        break;
      case "Home":
        list[0]?.focus();
        break;
      case "End":
        list.at(-1)?.focus();
        break;
      case "ArrowRight":
        if (current.getAttribute("aria-haspopup") === "menu") current.click();
        break;
      case "ArrowLeft":
        // Au premier niveau, rien à faire, mais la touche ne va pas à l'écran (étape de daily).
        if (inSub) closeSub();
        break;
      case "Enter":
      case " ":
        if (current.getAttribute("aria-disabled") !== "true") current.click();
        break;
      default:
        return;
    }
    // Les touches du menu ne vont ni à la page (défilement) ni à l'écran (étapes, sélection).
    event.preventDefault();
    event.stopPropagation();
  };

  const choose = (entry: ActionEntry) => {
    if (entry.reason || entry.current) return;
    onClose();
    entry.onSelect();
  };

  const renderEntries = (list: readonly MenuEntry[], level: string) =>
    list.map((entry) => {
      const reasonId =
        entry.kind === "action" || entry.kind === "submenu" ? `${level}-${entry.id}` : "";
      switch (entry.kind) {
        case "separator":
          return <hr key={entry.id} class="menu-separator" />;
        case "heading":
          return (
            <p key={entry.id} class="card-menu-heading">
              {entry.label}
            </p>
          );
        case "action":
          return (
            <button
              key={entry.id}
              type="button"
              role="menuitem"
              class="card-menu-item"
              data-goal-color={entry.color}
              aria-current={entry.current ? "true" : undefined}
              aria-disabled={entry.reason || entry.current ? true : undefined}
              aria-describedby={entry.reason ? reasonId : undefined}
              tabIndex={-1}
              onClick={() => choose(entry)}
            >
              {entry.color !== undefined && <span class="menu-goal-dot" aria-hidden="true" />}
              {entry.label}
              {entry.reason && (
                <span class="card-menu-reason" id={reasonId}>
                  {entry.reason}
                </span>
              )}
            </button>
          );
        default: {
          // Sous-menu : seule autre sorte d'entrée.

          const expanded = openId === entry.id;
          return (
            <Fragment key={entry.id}>
              <button
                ref={(element) => {
                  if (element) rows.current.set(entry.id, element);
                  else rows.current.delete(entry.id);
                }}
                type="button"
                role="menuitem"
                class="card-menu-item card-menu-parent"
                aria-haspopup="menu"
                aria-expanded={expanded}
                aria-disabled={entry.reason ? true : undefined}
                aria-describedby={entry.reason ? reasonId : undefined}
                tabIndex={-1}
                // Un clic ouvre toujours : survolée puis cliquée, la liste ne se referme pas.
                onClick={() => openSub(entry, true)}
                onPointerEnter={(event) => hoverRow(entry, event)}
                onPointerLeave={(event) => leaveRow(entry, event)}
              >
                {entry.label}
                <span class="card-menu-arrow" aria-hidden="true">
                  ›
                </span>
                {entry.reason && (
                  <span class="card-menu-reason" id={reasonId}>
                    {entry.reason}
                  </span>
                )}
              </button>
              {expanded && !entry.reason && (
                <div
                  ref={subList}
                  class="card-menu-goals"
                  role="menu"
                  aria-label={entry.label}
                  onPointerEnter={enterSub}
                  onPointerLeave={leaveSub}
                >
                  {renderEntries(entry.entries, `${level}-${entry.id}`)}
                </div>
              )}
            </Fragment>
          );
        }
      }
    });

  return (
    <div
      ref={panel}
      class="card-menu"
      role="menu"
      tabIndex={-1}
      aria-label={label}
      onKeyDown={onKeyDown}
      onContextMenu={(event) => event.preventDefault()}
    >
      {renderEntries(entries, "card-menu-reason")}
    </div>
  );
}

type ActionEntry = Extract<MenuEntry, { kind: "action" }>;
type SubmenuEntry = Extract<MenuEntry, { kind: "submenu" }>;

/** Éléments du niveau de menu donné, sans ceux d'une sous-liste. */
function items(level: HTMLElement): HTMLElement[] {
  return [...level.querySelectorAll<HTMLElement>("[role='menuitem']")].filter(
    (item) => item.parentElement?.closest("[role='menu']") === level,
  );
}

/** Focus sur le premier élément actif, ou le premier s'ils sont tous désactivés. */
function focusItem(list: readonly HTMLElement[]): void {
  const active = list.find((item) => item.getAttribute("aria-disabled") !== "true");
  (active ?? list[0])?.focus();
}
