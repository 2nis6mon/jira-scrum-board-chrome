import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { t } from "../../i18n";
import type { BoardModel, CardMenuBlocked, CardMenuState, RankEdge } from "../../model/BoardModel";
import { placeAtPoint } from "./floatingMenu";

/**
 * Menu de l'extension sur une carte (clic droit, Maj+F10, touche Menu). Son état d'ouverture
 * appartient au board ; la vue ne garde que la sous-liste dépliée. Fermé par Échap, Tab, un clic
 * ailleurs, le défilement, le redimensionnement ou une action : le focus revient à la carte.
 */
export function CardMenu(props: { board: BoardModel }) {
  const menu = props.board.cardMenu.value;
  // Une ouverture nouvelle (même carte rouverte) repart de la première liste.
  return menu ? (
    <CardMenuPanel key={`${menu.issueKey}@${menu.x},${menu.y}`} {...props} menu={menu} />
  ) : null;
}

function CardMenuPanel(props: { board: BoardModel; menu: CardMenuState }) {
  const { board, menu } = props;
  const panel = useRef<HTMLDivElement>(null);
  const [goalsOpen, setGoalsOpen] = useState(false);
  const options = board.cardMenuOptions(menu.issueKey);
  const send = options?.sendToGoal;
  const blocked = send?.blocked ?? null;
  const issueKey = menu.issueKey;

  const close = () => {
    board.closeCardMenu();
    // Sans redéfiler jusqu'à la carte : un menu fermé par défilement laisse la page où elle est.
    cardElement(issueKey)?.focus({ preventScroll: true });
  };

  // Placé avant d'être montré, et replacé quand la liste des objectifs se déplie ou se replie.
  useLayoutEffect(() => {
    if (panel.current) placeAtPoint(panel.current, menu);
  }, [menu, goalsOpen]);

  // À l'ouverture, focus sur le premier élément actif.
  useLayoutEffect(() => {
    if (panel.current) focusItem(items(panel.current));
  }, [menu]);

  // La sous-liste dépliée prend le focus sur son premier objectif.
  useEffect(() => {
    const list = goalsOpen ? panel.current?.querySelector<HTMLElement>(".card-menu-goals") : null;
    if (list) focusItem(items(list));
  }, [goalsOpen]);

  // La carte n'est plus affichée (étape de daily, relecture) : le menu n'a plus d'objet.
  useEffect(() => {
    if (!cardElement(issueKey)) board.closeCardMenu();
  });

  useEffect(() => {
    const controller = new AbortController();
    const outside = (event: Event) => {
      if (event.target instanceof Node && panel.current?.contains(event.target)) return;
      close();
    };
    const capture = { capture: true, signal: controller.signal };
    document.addEventListener("pointerdown", outside, capture);
    window.addEventListener("scroll", outside, capture);
    window.addEventListener("resize", close, { signal: controller.signal });
    return () => controller.abort();
  }, [issueKey]);

  if (!send) return null;

  const openGoals = () => {
    if (blocked !== null) return;
    setGoalsOpen(true);
  };

  const choose = (goalId: string | null) => {
    close();
    void board
      .sendToGoal(issueKey, goalId)
      .finally(() => {
        // La carte a pu changer de swimlane : elle retrouve le focus si personne ne l'a pris.
        if (document.activeElement === document.body)
          cardElement(issueKey)?.focus({ preventScroll: true });
      })
      // L'échec est déjà dit par l'avis d'écriture et le repère de la carte.
      .catch(() => {});
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const root = panel.current;
    const current = document.activeElement;
    if (!root || !(current instanceof HTMLElement)) return;
    const level = current.closest<HTMLElement>("[role='menu']") ?? root;
    const list = items(level);
    const index = list.indexOf(current);
    const inGoals = level !== root;
    switch (event.key) {
      case "Escape":
      case "Tab":
        event.preventDefault();
        close();
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
        if (current.getAttribute("aria-haspopup") === "menu") openGoals();
        break;
      case "ArrowLeft":
        // Au premier niveau, rien à faire, mais la touche ne va pas à la daily (étape précédente).
        if (!inGoals) break;
        setGoalsOpen(false);
        root.querySelector<HTMLElement>("[aria-haspopup='menu']")?.focus();
        break;
      case "Enter":
      case " ":
        if (current.getAttribute("aria-disabled") !== "true") current.click();
        break;
      default:
        return;
    }
    // Les touches du menu ne vont ni à la page (défilement) ni à la daily (étapes).
    event.preventDefault();
    event.stopPropagation();
  };

  const rank = (edge: RankEdge) => {
    close();
    void board
      .rankToEdge(issueKey, edge)
      .finally(() => {
        if (document.activeElement === document.body)
          cardElement(issueKey)?.focus({ preventScroll: true });
      })
      // L'échec est déjà dit par l'avis d'écriture et le repère de la carte.
      .catch(() => {});
  };

  const rankItem = (edge: RankEdge, label: string) => {
    const reason = (edge === "top" ? options?.top : options?.bottom)?.blocked ?? null;
    const id = `card-menu-reason-${edge}-${issueKey}`;
    return (
      <button
        type="button"
        role="menuitem"
        class="card-menu-item"
        aria-disabled={reason !== null || undefined}
        aria-describedby={reason ? id : undefined}
        tabIndex={-1}
        onClick={() => {
          if (reason === null) rank(edge);
        }}
      >
        {label}
        {reason && (
          <span class="card-menu-reason" id={id}>
            {reasonText(reason)}
          </span>
        )}
      </button>
    );
  };

  const reasonId = `card-menu-reason-${issueKey}`;
  return (
    <div
      ref={panel}
      class="card-menu"
      role="menu"
      tabIndex={-1}
      aria-label={t("Actions sur {key}", { key: issueKey })}
      onKeyDown={onKeyDown}
      onContextMenu={(event) => event.preventDefault()}
    >
      <button
        type="button"
        role="menuitem"
        class="card-menu-item card-menu-parent"
        aria-haspopup="menu"
        aria-expanded={goalsOpen}
        aria-disabled={blocked !== null || undefined}
        aria-describedby={blocked ? reasonId : undefined}
        tabIndex={-1}
        onClick={() => (goalsOpen ? setGoalsOpen(false) : openGoals())}
      >
        {t("Envoyer vers un goal")}
        <span class="card-menu-arrow" aria-hidden="true">
          ›
        </span>
        {blocked && (
          <span class="card-menu-reason" id={reasonId}>
            {reasonText(blocked)}
          </span>
        )}
      </button>
      {goalsOpen && blocked === null && (
        <div class="card-menu-goals" role="menu" aria-label={t("Envoyer vers un goal")}>
          {send.goals.map((goal) => (
            <button
              key={goal.id}
              type="button"
              role="menuitem"
              class="card-menu-item"
              tabIndex={-1}
              onClick={() => choose(goal.id)}
            >
              {goal.sprintName && <span class="lane-sprint">{goal.sprintName} · </span>}
              {goal.title}
            </button>
          ))}
          {send.canDetach && (
            <>
              {send.goals.length > 0 && <hr class="menu-separator" />}
              <button
                type="button"
                role="menuitem"
                class="card-menu-item"
                tabIndex={-1}
                onClick={() => choose(null)}
              >
                {t("Retirer du goal")}
              </button>
            </>
          )}
        </div>
      )}
      {rankItem("top", t("Mettre en top priorité"))}
      {rankItem("bottom", t("Mettre en basse priorité"))}
    </div>
  );
}

function reasonText(reason: CardMenuBlocked): string {
  switch (reason) {
    case "writing":
      return t("Une écriture est en cours");
    case "noGoal":
      return t("Aucun objectif où l'envoyer");
    case "first":
      return t("Déjà en tête de sa swimlane");
    case "last":
      return t("Déjà en fin de sa swimlane");
    case "subtaskAlone":
      return t("Aucune autre sous-tâche de son parent dans cette swimlane");
  }
}

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

/** La carte du ticket sur le board, pour lui rendre le focus. */
function cardElement(issueKey: string): HTMLElement | null {
  for (const card of document.querySelectorAll<HTMLElement>(".card[data-issue-key]")) {
    if (card.dataset.issueKey === issueKey) return card;
  }
  return null;
}
