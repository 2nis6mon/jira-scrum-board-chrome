import { type BoardIssue, browseUrl, isOpenBug } from "../../../core/boardIssue";
import {
  type CardField,
  cardFieldId,
  cardFieldLabel,
  cardFieldValues,
} from "../../../core/cardFields";
import type { ImageCache } from "../../model/ImageCache";
import { formatPoints, initials, plural } from "../format";
import { JiraIcon } from "./JiraIcon";

interface Props {
  issue: BoardIssue;
  siteOrigin: string;
  images: ImageCache;
  cardFields: readonly CardField[];
  /** La colonne regroupe plusieurs statuts : on précise lequel. */
  showStatus: boolean;
  agingThresholdDays: number;
  /** Titre de l'objectif, montré quand le ticket n'est pas dans la swimlane de son objectif. */
  goalTitle: string | null;
  /** Une écriture est en cours sur ce ticket : il attend la réponse de Jira. */
  pending?: boolean;
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
  const aging =
    issue.daysInColumn !== null &&
    issue.daysInColumn >= props.agingThresholdDays &&
    fields.status.statusCategory?.key !== "done";

  return (
    <a
      class={`card${issue.isBlocked ? " card-blocked" : ""}${props.pending ? " card-pending" : ""}${props.dragging ? " card-dragging" : ""}`}
      href={browseUrl(props.siteOrigin, issue.issue.key)}
      target="_blank"
      rel="noopener noreferrer"
      data-issue-key={issue.issue.key}
      data-card-color={props.tint ?? undefined}
      draggable={props.onDragStart !== undefined && !props.pending}
      onDragStart={props.onDragStart}
      onDragEnd={props.onDragEnd}
      aria-busy={props.pending ? true : undefined}
    >
      {props.pending && <span class="card-pending-label">Envoi à Jira…</span>}
      <div class="card-top">
        <JiraIcon
          url={fields.issuetype.iconUrl}
          label={fields.issuetype.name}
          images={props.images}
        />
        <span class="card-key">{issue.issue.key}</span>
        {issue.isFlagged && (
          <span class="card-flag" role="img" aria-label="Drapeau Jira" title="Drapeau Jira">
            ⚑
          </span>
        )}
        <span class="card-spacer" />
        {fields.priority && (
          <JiraIcon
            url={fields.priority.iconUrl}
            label={fields.priority.name}
            images={props.images}
          />
        )}
      </div>

      <p class="card-summary">{fields.summary}</p>

      {fields.parent && (
        <p class="card-meta" title="Parent">
          <span class="card-meta-key">{fields.parent.key}</span>
          {fields.parent.summary && ` · ${fields.parent.summary}`}
        </p>
      )}
      {props.goalTitle && (
        <p class="card-meta" title="Objectif">
          Objectif · {props.goalTitle}
        </p>
      )}
      {props.cardFields.map((field) => {
        const values = cardFieldValues(field, fields);
        return values.length === 0 ? null : (
          <p key={cardFieldId(field)} class="card-meta">
            <span class="card-meta-key">{cardFieldLabel(field)}</span> {values.join(", ")}
          </p>
        );
      })}

      {(issue.isBlocked ||
        issue.linkedBugs.length > 0 ||
        issue.addedAfterSprintStart === true ||
        aging) && (
        <div class="card-badges">
          {issue.isBlocked && (
            <span class="badge badge-blocked" title={blockedDetail(issue)}>
              Bloqué
            </span>
          )}
          {issue.linkedBugs.length > 0 && (
            <span
              class={`badge ${openBugs.length > 0 ? "badge-bugs-open" : "badge-bugs-done"}`}
              title={issue.linkedBugs
                .map((bug) => `${bug.key}${bug.statusName ? ` — ${bug.statusName}` : ""}`)
                .join("\n")}
            >
              {openBugs.length > 0
                ? plural(openBugs.length, "bug ouvert", "bugs ouverts")
                : "Bugs terminés"}
            </span>
          )}
          {issue.addedAfterSprintStart === true && (
            <span class="badge badge-added" title="Ajouté au sprint après son démarrage">
              Ajouté
            </span>
          )}
          {aging && (
            <span class="badge badge-aging" title="Jours depuis le dernier changement de statut">
              {issue.daysInColumn} j
            </span>
          )}
        </div>
      )}

      <div class="card-bottom">
        {props.showStatus && <span class="card-status">{fields.status.name}</span>}
        <span class="card-spacer" />
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
    </a>
  );
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
