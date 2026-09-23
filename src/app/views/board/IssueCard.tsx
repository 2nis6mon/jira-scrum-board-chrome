import {
  type BoardIssue,
  browseUrl,
  isOpenBug,
  isSubtaskDone,
  type Subtask,
  type SubtaskProgress,
  subtaskProgress,
} from "../../../core/boardIssue";
import {
  type CardField,
  cardFieldId,
  cardFieldLabel,
  cardFieldValues,
} from "../../../core/cardFields";
import type { ParentColor } from "../../../core/parentColors";
import type { ImageCache } from "../../model/ImageCache";
import { formatPoints, initials, plural } from "../format";
import { Icon } from "../Icon";
import { JiraIcon } from "./JiraIcon";

interface Props {
  issue: BoardIssue;
  siteOrigin: string;
  images: ImageCache;
  cardFields: readonly CardField[];
  /** Couleur du badge du parent, commune à tous ses tickets. */
  parentColor: ParentColor | null;
  agingThresholdDays: number;
  /** Titre de l'objectif, montré quand le ticket n'est pas dans la swimlane de son objectif. */
  goalTitle: string | null;
  /** Dernière colonne visible du bloc du ticket : c'est là qu'un ticket est terminé sur le board. */
  lastColumnId: string | null;
  /** Une écriture est en cours sur ce ticket : il attend la réponse de Jira. */
  pending?: boolean;
  feedback?: "warning" | undefined;
  /** Couleur de fond donnée par une règle de couleur (nom de la palette). */
  tint?: string | null;
  dragging?: boolean;
  onDragStart?: (event: DragEvent) => void;
  onDragEnd?: () => void;
}

/** Carte d'un ticket. Un clic ouvre le ticket dans Jira, dans un nouvel onglet. */
export function IssueCard(props: Props) {
  const { issue } = props;
  const fields = issue.issue.fields;
  const openBugs = issue.linkedBugs.filter(isOpenBug);
  const subtasks = subtaskProgress(issue, props.lastColumnId);
  const openInLastColumn = subtasks?.openInLastColumn ?? [];
  const aging =
    issue.daysInColumn !== null &&
    issue.daysInColumn >= props.agingThresholdDays &&
    fields.status.statusCategory?.key !== "done";
  // Champs choisis dans les réglages : un badge par valeur, le nom du champ en info-bulle.
  const tags = props.cardFields.flatMap((field) =>
    cardFieldValues(field, fields).map((value, index) => ({
      id: `${cardFieldId(field)}:${index}`,
      label: cardFieldLabel(field),
      value,
    })),
  );

  return (
    <a
      class={`card${issue.isBlocked ? " card-blocked" : ""}${props.pending ? " card-pending" : ""}${props.dragging ? " card-dragging" : ""}`}
      href={browseUrl(props.siteOrigin, issue.issue.key)}
      target="_blank"
      rel="noopener noreferrer"
      data-move-feedback={props.feedback}
      data-issue-key={issue.issue.key}
      data-card-color={props.tint ?? undefined}
      draggable={props.onDragStart !== undefined && !props.pending}
      onDragStart={props.onDragStart}
      onDragEnd={props.onDragEnd}
      aria-busy={props.pending ? true : undefined}
    >
      {props.pending && <span class="card-pending-label">Déplacement en cours…</span>}
      {props.feedback && (
        <span class="card-move-label" role="status">
          Déplacement à vérifier
        </span>
      )}
      <div class="card-top">
        <JiraIcon
          url={fields.issuetype.iconUrl}
          label={fields.issuetype.name}
          images={props.images}
        />
        <span class="card-key" title={issue.issue.key}>
          {issue.issue.key}
        </span>
        {(issue.isFlagged || fields.priority) && (
          <span class="card-marks">
            {issue.isFlagged && <FlagIcon />}
            {fields.priority && (
              <JiraIcon
                url={fields.priority.iconUrl}
                label={fields.priority.name}
                images={props.images}
              />
            )}
          </span>
        )}
      </div>

      <p class="card-summary" title={fields.summary}>
        {fields.summary}
      </p>

      {props.goalTitle && (
        <p class="card-meta" title="Objectif">
          Objectif · {props.goalTitle}
        </p>
      )}

      {(fields.parent || tags.length > 0) && (
        <div class="card-badges">
          {fields.parent && (
            <span
              class={`badge badge-parent${props.parentColor?.tone === "deep" ? " badge-parent-deep" : ""}`}
              style={{ "--parent-hue": String(props.parentColor?.hue ?? PARENT_FALLBACK_HUE) }}
              title={`Parent ${fields.parent.key}${fields.parent.summary ? ` — ${fields.parent.summary}` : ""}`}
            >
              {fields.parent.summary ?? fields.parent.key}
            </span>
          )}
          {tags.map((tag) => (
            <span key={tag.id} class="badge badge-field" title={`${tag.label} : ${tag.value}`}>
              {tag.value}
            </span>
          ))}
        </div>
      )}

      {subtasks && <SubtaskBar subtasks={issue.subtasks} progress={subtasks} />}

      {/* Dernière ligne : les alertes, compactes (icône, détail au survol), puis points et assigné. */}
      <div class="card-bottom">
        <div class="card-alerts">
          {openInLastColumn.length > 0 && (
            <span
              class="badge badge-subtasks-open"
              role="img"
              aria-label={`Terminé sur le board, ${plural(openInLastColumn.length, "sous-tâche encore ouverte", "sous-tâches encore ouvertes")}`}
              title={[
                `Ticket dans la dernière colonne, mais ${plural(openInLastColumn.length, "sous-tâche encore ouverte", "sous-tâches encore ouvertes")} :`,
                ...openInLastColumn.map(subtaskLine),
              ].join("\n")}
            >
              <Icon name="subtasks" size={13} />
              {openInLastColumn.length}
            </span>
          )}
          {issue.isBlocked && (
            <span
              class="badge badge-blocked"
              role="img"
              aria-label="Bloqué"
              title={blockedTitle(issue)}
            >
              <Icon name="blocked" size={13} />
            </span>
          )}
          {issue.linkedBugs.length > 0 && (
            <span
              class={`badge ${openBugs.length > 0 ? "badge-bugs-open" : "badge-bugs-done"}`}
              role="img"
              aria-label={
                openBugs.length > 0
                  ? plural(openBugs.length, "bug ouvert", "bugs ouverts")
                  : "Bugs liés terminés"
              }
              title={[
                openBugs.length > 0
                  ? plural(openBugs.length, "bug ouvert", "bugs ouverts")
                  : "Bugs liés terminés",
                ...issue.linkedBugs.map(
                  (bug) => `${bug.key}${bug.statusName ? ` — ${bug.statusName}` : ""}`,
                ),
              ].join("\n")}
            >
              <Icon name="bug" size={13} />
              {openBugs.length > 0 ? openBugs.length : issue.linkedBugs.length}
            </span>
          )}
          {issue.addedAfterSprintStart === true && (
            <span
              class="badge badge-added"
              role="img"
              aria-label="Ajouté en cours de sprint"
              title="Ajouté au sprint après son démarrage"
            >
              <Icon name="added" size={13} />
            </span>
          )}
          {aging && (
            <span
              class="badge badge-aging"
              title={`${plural(issue.daysInColumn ?? 0, "jour")} sans changement de statut`}
            >
              <Icon name="clock" size={12} />
              {issue.daysInColumn} j
            </span>
          )}
        </div>
        {/* Points et assigné restent ensemble, à droite, sur la ligne. */}
        <div class="card-owner">
          {issue.estimate !== null && (
            <span class="card-points" title="Story points">
              {formatPoints(issue.estimate)}
            </span>
          )}
          {fields.assignee ? (
            <span
              class="avatar"
              role="img"
              title={fields.assignee.displayName}
              aria-label={fields.assignee.displayName}
            >
              {initials(fields.assignee.displayName)}
            </span>
          ) : (
            <span
              class="avatar avatar-empty"
              role="img"
              title="Non assigné"
              aria-label="Non assigné"
            />
          )}
        </div>
      </div>
    </a>
  );
}

/** Ordre des segments : terminées, en cours, puis à faire ; la barre se remplit de gauche à droite. */
const SEGMENT_ORDER: Record<string, number> = { done: 0, indeterminate: 1, new: 2 };

/**
 * Avancement des sous-tâches, repliées dans la carte : un segment par sous-tâche, coloré selon son
 * statut, et « terminées / total ». Le détail s'affiche au survol, comme les autres alertes.
 */
function SubtaskBar(props: { subtasks: readonly Subtask[]; progress: SubtaskProgress }) {
  const { progress } = props;
  const segments = [...props.subtasks].sort(
    (a, b) =>
      (SEGMENT_ORDER[a.statusCategoryKey ?? ""] ?? 3) -
      (SEGMENT_ORDER[b.statusCategoryKey ?? ""] ?? 3),
  );
  const headline = progress.allDoneBeforeLastColumn
    ? "Toutes les sous-tâches sont terminées : le ticket peut avancer."
    : `Sous-tâches : ${progress.done} sur ${progress.total} terminées.`;
  return (
    <div
      class={`card-subtasks${progress.allDoneBeforeLastColumn ? " card-subtasks-ready" : ""}`}
      role="img"
      aria-label={headline}
      title={[headline, ...props.subtasks.map(subtaskLine)].join("\n")}
    >
      <span class="subtask-bar" aria-hidden="true">
        {segments.map((subtask) => (
          <i key={subtask.key} data-status={subtask.statusCategoryKey ?? "unknown"} />
        ))}
      </span>
      <span class="subtask-count">
        {progress.allDoneBeforeLastColumn && <Icon name="check" size={12} />}
        {progress.done}/{progress.total}
      </span>
    </div>
  );
}

/** Une ligne de sous-tâche pour une info-bulle : coche, clé, résumé, statut, assigné. */
function subtaskLine(subtask: Subtask): string {
  const parts = [`${isSubtaskDone(subtask) ? "✓" : "○"} ${subtask.key}`];
  if (subtask.summary) parts.push(`— ${subtask.summary}`);
  if (subtask.statusName) parts.push(`(${subtask.statusName})`);
  if (subtask.assignee) parts.push(`· ${subtask.assignee.displayName}`);
  return parts.join(" ");
}

/** Teinte d'un parent dont la couleur n'a pas été calculée (ne devrait pas arriver). */
const PARENT_FALLBACK_HUE = 212;

/** Drapeau Jira (« Flagged »), à côté de la priorité. Dessiné ici : pas de ressource externe. */
function FlagIcon() {
  return (
    <svg class="card-flag" viewBox="0 0 16 16" role="img" aria-label="Drapeau Jira">
      <title>Drapeau Jira</title>
      <path d="M3.5 1.5v13" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
      <path d="M4.2 2h9.3l-2.4 3.6 2.4 3.6H4.2z" fill="currentColor" />
    </svg>
  );
}

/** Info-bulle de la pastille « bloqué » : ce qui bloque, lien par lien et label par label. */
function blockedTitle(issue: BoardIssue): string {
  return ["Bloqué", blockedDetail(issue)].filter((line) => line !== "").join("\n");
}

function blockedDetail(issue: BoardIssue): string {
  const lines = issue.blockers.map((blocker) => {
    const parts = [blocker.key];
    if (blocker.summary) parts.push(blocker.summary);
    if (blocker.statusName) parts.push(`(${blocker.statusName})`);
    return `Bloqué par ${parts.join(" ")}`;
  });
  for (const label of issue.blockedByLabels) lines.push(`Label « ${label} »`);
  return lines.join("\n");
}
