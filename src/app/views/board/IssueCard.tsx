import {
  type BoardIssue,
  browseUrl,
  type Subtask,
  type SubtaskProgress,
  subtaskProgress,
} from "../../../core/boardIssue";
import { type CardField, cardFieldId, cardFieldValues } from "../../../core/cardFields";
import type { ColumnStates } from "../../../core/columnState";
import type { ParentColor } from "../../../core/parentColors";
import { localize, t } from "../../i18n";
import { cardFieldLabel } from "../../model/coreText";
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
  /** États des colonnes du board : seule règle pour dire qu'un ticket ou une sous-tâche est fini. */
  columnStates: ColumnStates;
  /** Une écriture est en cours sur ce ticket : il attend la réponse de Jira. */
  pending?: boolean;
  feedback?: "warning" | undefined;
  /** Couleur de fond donnée par une règle de couleur (nom de la palette). */
  tint?: string | null;
  /** Carte de la famille survolée (une story et ses sous-tâches) : entourée de rouge, éclairée. */
  highlighted?: boolean;
  onHoverChange?: (hovering: boolean) => void;
  dragging?: boolean;
  onDragStart?: (event: DragEvent) => void;
  onDragEnd?: () => void;
  /**
   * Menu de l'extension demandé sur la carte : clic droit (au pointeur), Maj+F10 ou touche Menu
   * (sous la carte). Le menu du navigateur n'apparaît pas sur une carte qui en a un.
   */
  onContextMenu?: (point: { x: number; y: number }) => void;
  /** Carte sélectionnée au Ctrl/Cmd+clic ou au Maj+clic (story 8.30). */
  selected?: boolean;
  /**
   * Ctrl/Cmd+clic (`range` faux) ou Maj+clic (`range` vrai) : sélection, sans ouvrir d'onglet.
   * Sans lui, ces clics restent ceux du navigateur.
   */
  onSelect?: (range: boolean) => void;
}

/**
 * Carte d'un ticket, lien vers sa page Jira. Dans Jira, un clic simple ouvre la fiche native
 * (`integration/embedded.ts`), le clic du milieu un nouvel onglet ; Ctrl/Cmd+clic et Maj+clic
 * sélectionnent (story 8.30).
 */
export function IssueCard(props: Props) {
  const { issue } = props;
  const fields = issue.issue.fields;
  const subtasks = subtaskProgress(issue, props.columnStates);
  const openInLastColumn = subtasks?.openInLastColumn ?? [];
  const aging =
    issue.daysInColumn !== null &&
    issue.daysInColumn >= props.agingThresholdDays &&
    props.columnStates.ofColumn(issue.columnId) !== "done";
  // Champs choisis dans les réglages : un badge par valeur, le nom du champ en info-bulle.
  const tags = props.cardFields.flatMap((field) =>
    cardFieldValues(field, fields).map((value, index) => ({
      id: `${cardFieldId(field)}:${index}`,
      label: field.kind === "custom" ? cardFieldLabel(field) : localize(cardFieldLabel(field)),
      value,
    })),
  );

  return (
    <a
      class={`card${issue.isBlocked ? " card-blocked" : ""}${props.pending ? " card-pending" : ""}${props.dragging ? " card-dragging" : ""}${props.highlighted ? " card-family" : ""}${props.selected ? " card-selected" : ""}`}
      href={browseUrl(props.siteOrigin, issue.issue.key)}
      target="_blank"
      rel="noopener noreferrer"
      data-move-feedback={props.feedback}
      data-issue-key={issue.issue.key}
      data-selected={props.selected ? "true" : undefined}
      data-card-color={props.tint ?? undefined}
      draggable={props.onDragStart !== undefined && !props.pending}
      onDragStart={props.onDragStart}
      onDragEnd={props.onDragEnd}
      onClick={
        props.onSelect &&
        ((event) => {
          if (event.button !== 0 || !(event.ctrlKey || event.metaKey || event.shiftKey)) return;
          // Ni onglet ni fenêtre : la carte entre dans la sélection ou en sort.
          event.preventDefault();
          props.onSelect?.(event.shiftKey);
        })
      }
      onMouseEnter={() => props.onHoverChange?.(true)}
      onMouseLeave={() => props.onHoverChange?.(false)}
      onContextMenu={
        props.onContextMenu &&
        ((event) => {
          event.preventDefault();
          // Bouton droit, Ctrl+clic macOS, appui long ou stylet : au pointeur. Un menu demandé au
          // clavier arrive sans bouton droit ni position : il s'ouvre sous la carte.
          const pointer = event.button === 2 || event.clientX !== 0 || event.clientY !== 0;
          props.onContextMenu?.(
            pointer ? { x: event.clientX, y: event.clientY } : belowCard(event),
          );
        })
      }
      onKeyDown={
        props.onContextMenu &&
        ((event) => {
          if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return;
          event.preventDefault();
          props.onContextMenu?.(belowCard(event));
        })
      }
      aria-busy={props.pending ? true : undefined}
    >
      {props.selected && <span class="visually-hidden">{t("Sélectionné")}</span>}
      {props.pending && <span class="card-pending-label">{t("Déplacement en cours…")}</span>}
      {props.feedback && (
        <span class="card-move-label" role="status">
          {t("Déplacement à vérifier")}
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
        <p class="card-meta" title={t("Objectif")}>
          {t("Objectif · {name}", { name: props.goalTitle })}
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

      {subtasks && <SubtaskBar progress={subtasks} />}

      {/* Dernière ligne : les alertes, compactes (icône, détail au survol), puis points et assigné. */}
      <div class="card-bottom">
        <div class="card-alerts">
          {openInLastColumn.length > 0 && (
            <span
              class="badge badge-subtasks-open"
              role="img"
              aria-label={t("Terminé sur le board, {subtasks}", {
                subtasks: plural(
                  openInLastColumn.length,
                  "sous-tâche encore ouverte",
                  "sous-tâches encore ouvertes",
                ),
              })}
              title={[
                t("Ticket dans la dernière colonne, mais {subtasks} :", {
                  subtasks: plural(
                    openInLastColumn.length,
                    "sous-tâche encore ouverte",
                    "sous-tâches encore ouvertes",
                  ),
                }),
                ...openInLastColumn.map((subtask) => subtaskLine(subtask, false)),
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
              aria-label={t("Bloqué")}
              title={blockedTitle(issue)}
            >
              <Icon name="blocked" size={13} />
            </span>
          )}
          {issue.addedAfterSprintStart === true && (
            <span
              class="badge badge-added"
              role="img"
              aria-label={t("Ajouté en cours de sprint")}
              title={t("Ajouté au sprint après son démarrage")}
            >
              <Icon name="added" size={13} />
            </span>
          )}
          {aging && (
            <span
              class="badge badge-aging"
              title={t("{duration} sans changement de statut", {
                duration: plural(issue.daysInColumn ?? 0, "jour"),
              })}
            >
              <Icon name="clock" size={12} />
              {t("{count} j", { count: issue.daysInColumn ?? 0 })}
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
              title={t("Non assigné")}
              aria-label={t("Non assigné")}
            />
          )}
        </div>
      </div>
    </a>
  );
}

/** Point d'ouverture d'un menu demandé au clavier : sous le coin gauche de la carte. */
function belowCard(event: Event): { x: number; y: number } {
  const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
  return { x: box.left, y: box.bottom };
}

/**
 * Avancement des sous-tâches, repliées dans la carte : un segment par sous-tâche, coloré selon sa
 * colonne (terminées, en cours, puis à faire), et « terminées / total ». Le détail s'affiche au
 * survol, comme les autres alertes. Une sous-tâche sans colonne visible n'est pas comptée.
 */
function SubtaskBar({ progress }: { progress: SubtaskProgress }) {
  const headline = progress.allDoneBeforeLastColumn
    ? t("Toutes les sous-tâches sont terminées : le ticket peut avancer.")
    : t("Sous-tâches : {done} sur {total} terminées.", {
        done: progress.done,
        total: progress.total,
      });
  return (
    <div
      class={`card-subtasks${progress.allDoneBeforeLastColumn ? " card-subtasks-ready" : ""}`}
      role="img"
      aria-label={headline}
      title={[
        headline,
        ...progress.segments.map(({ subtask, state }) => subtaskLine(subtask, state === "done")),
      ].join("\n")}
    >
      <span class="subtask-bar" aria-hidden="true">
        {progress.segments.map(({ subtask, state }) => (
          <i key={subtask.key} data-state={state} />
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
function subtaskLine(subtask: Subtask, done: boolean): string {
  const parts = [`${done ? "✓" : "○"} ${subtask.key}`];
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
    <svg class="card-flag" viewBox="0 0 16 16" role="img" aria-label={t("Drapeau Jira")}>
      <title>{t("Drapeau Jira")}</title>
      <path d="M3.5 1.5v13" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
      <path d="M4.2 2h9.3l-2.4 3.6 2.4 3.6H4.2z" fill="currentColor" />
    </svg>
  );
}

/** Info-bulle de la pastille « bloqué » : ce qui bloque, lien par lien. */
function blockedTitle(issue: BoardIssue): string {
  return [t("Bloqué"), blockedDetail(issue)].filter((line) => line !== "").join("\n");
}

function blockedDetail(issue: BoardIssue): string {
  const lines = issue.blockers.map((blocker) => {
    const parts = [blocker.key];
    if (blocker.summary) parts.push(blocker.summary);
    if (blocker.statusName) parts.push(`(${blocker.statusName})`);
    return t("Bloqué par {issue}", { issue: parts.join(" ") });
  });
  return lines.join("\n");
}
