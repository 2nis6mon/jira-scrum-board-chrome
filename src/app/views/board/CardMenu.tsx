import { useEffect } from "preact/hooks";
import { t } from "../../i18n";
import type { BoardModel, CardMenuBlocked, CardMenuState, RankEdge } from "../../model/BoardModel";
import { ActionMenu, type MenuEntry } from "../ActionMenu";

/**
 * Menu de l'extension sur une carte du board (clic droit, Maj+F10, touche Menu), dessiné par le
 * menu commun au board et au planning (story 8.19). Son état d'ouverture appartient au board :
 * « Envoyer vers un goal › » (pastille de couleur de chaque objectif), « Retirer du goal », puis
 * top et basse priorité. Une action referme le menu et rend le focus à la carte.
 */
export function CardMenu(props: { board: BoardModel }) {
  const menu = props.board.cardMenu.value;
  // Une ouverture nouvelle (même carte rouverte) repart de la première liste.
  return menu ? (
    <BoardCardMenu key={`${menu.issueKey}@${menu.x},${menu.y}`} {...props} menu={menu} />
  ) : null;
}

function BoardCardMenu({ board, menu }: { board: BoardModel; menu: CardMenuState }) {
  const issueKey = menu.issueKey;
  const options = board.cardMenuOptions(issueKey);

  // La carte n'est plus affichée (étape de daily, relecture) : le menu n'a plus d'objet.
  useEffect(() => {
    if (!cardElement(issueKey)) board.closeCardMenu();
  });

  if (!options) return null;
  const send = options.sendToGoal;

  const close = () => {
    board.closeCardMenu();
    // Sans redéfiler jusqu'à la carte : un menu fermé par défilement laisse la page où elle est.
    cardElement(issueKey)?.focus({ preventScroll: true });
  };

  // La carte a pu changer de swimlane : elle retrouve le focus si personne ne l'a pris. L'échec est
  // déjà dit par l'avis d'écriture et le repère de la carte.
  const after = (gesture: Promise<void>) =>
    void gesture
      .finally(() => {
        if (document.activeElement === document.body)
          cardElement(issueKey)?.focus({ preventScroll: true });
      })
      .catch(() => {});

  const goals: MenuEntry[] = send.goals.map((goal) => ({
    kind: "action",
    id: goal.id,
    color: goal.color,
    label: (
      <>
        {goal.sprintName && <span class="lane-sprint">{goal.sprintName} · </span>}
        {goal.title}
      </>
    ),
    onSelect: () => after(board.sendToGoal(issueKey, goal.id)),
  }));
  if (send.canDetach) {
    if (goals.length > 0) goals.push({ kind: "separator", id: "detach-separator" });
    goals.push({
      kind: "action",
      id: "detach",
      label: t("Retirer du goal"),
      onSelect: () => after(board.sendToGoal(issueKey, null)),
    });
  }

  const rank = (edge: RankEdge, label: string): MenuEntry => {
    const reason = (edge === "top" ? options.top : options.bottom).blocked;
    return {
      kind: "action",
      id: `rank-${edge}`,
      label,
      reason: reason === null ? null : reasonText(reason),
      onSelect: () => after(board.rankToEdge(issueKey, edge)),
    };
  };

  return (
    <ActionMenu
      label={t("Actions sur {key}", { key: issueKey })}
      point={menu}
      onClose={close}
      entries={[
        {
          kind: "submenu",
          id: "goals",
          label: t("Envoyer vers un goal"),
          reason: send.blocked === null ? null : reasonText(send.blocked),
          entries: goals,
        },
        rank("top", t("Mettre en top priorité")),
        rank("bottom", t("Mettre en basse priorité")),
      ]}
    />
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

/** La carte du ticket sur le board, pour lui rendre le focus. */
function cardElement(issueKey: string): HTMLElement | null {
  for (const card of document.querySelectorAll<HTMLElement>(".card[data-issue-key]")) {
    if (card.dataset.issueKey === issueKey) return card;
  }
  return null;
}
