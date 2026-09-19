import { useEffect, useState } from "preact/hooks";
import type { BoardConfiguration } from "../../../core/boardConfiguration";
import { encodeTeamDocument, TEAM_FAMILIES, type TeamDocument } from "../../../core/teamSettings";
import { BOARD_PROPERTY_KEYS } from "../../../jira/writes";
import type { BoardModel, TeamStatus } from "../../model/BoardModel";
import { formatDay, formatTime } from "../format";

/**
 * Réglages d'équipe du board : partagés par une propriété du board dans Jira, publiés sur un geste
 * explicite (« Publier pour l'équipe »), reçus par chacun à sa prochaine actualisation.
 */
export function TeamSettings({
  board,
  configuration,
}: {
  board: BoardModel;
  configuration: BoardConfiguration;
}) {
  const [confirming, setConfirming] = useState(false);
  const status = board.teamStatus.value;
  const notice = board.teamNotice.value;
  const publishing = board.teamPublishing.value;
  if (!status) return null;
  const { state, published, update, localChanges } = status;
  const toPublish = published ? localChanges : TEAM_FAMILIES;
  const blocker = publishBlocker(status);

  return (
    <div class="settings-section">
      <section class="panel" aria-labelledby="team-title">
        <h2 id="team-title">Réglages d'équipe</h2>
        <p class="hint">
          Partagés avec toute l'équipe par une propriété du board dans Jira, lisible par quiconque
          voit le board. Ils ne sont écrits que quand vous cliquez « Publier pour l'équipe » ; les
          autres les reçoivent à leur prochaine actualisation du board.
        </p>

        <TeamState status={status} />

        {update && (
          <div class="notice notice-info team-update">
            <p>
              <strong>{publisher(update)} a publié une version plus récente</strong> ({when(update)}
              ), pas appliquée ici parce que vos réglages ont changé. Elle modifierait :
            </p>
            <ul>
              {status.updateChanges.map((family) => (
                <li key={family}>{family}</li>
              ))}
            </ul>
            <div class="row">
              <button type="button" onClick={() => void board.applyTeamSettings()}>
                Appliquer les réglages de l'équipe
              </button>
              <button type="button" onClick={() => void board.keepLocalSettings()}>
                Garder les miens
              </button>
            </div>
          </div>
        )}

        {notice && (
          <div
            class={`notice ${notice.tone === "success" ? "notice-info" : notice.tone === "warning" ? "notice-warning" : "notice-error"}`}
            role={notice.tone === "success" ? "status" : "alert"}
          >
            <p>
              <strong>{notice.text}</strong>
              {notice.suggestion && ` ${notice.suggestion}`}
            </p>
          </div>
        )}

        <div class="row">
          <button
            type="button"
            class="primary"
            disabled={publishing || blocker !== null}
            title={blocker ?? undefined}
            onClick={() => setConfirming(true)}
          >
            {publishing ? "Publication…" : "Publier pour l'équipe…"}
          </button>
          {published && localChanges.length > 0 && !update && (
            <button
              type="button"
              disabled={publishing}
              onClick={() => void board.applyTeamSettings()}
            >
              Revenir aux réglages de l'équipe
            </button>
          )}
          {blocker && <span class="hint">{blocker}</span>}
        </div>
        {state.kind === "unreadable" && <p class="settings-warning">{state.message}</p>}
      </section>

      <section class="panel" aria-labelledby="team-shared">
        <h2 id="team-shared">Ce qui est partagé</h2>
        <ul class="team-families">
          {TEAM_FAMILIES.map((family) => (
            <li key={family}>{family}</li>
          ))}
        </ul>
        <p class="hint">
          Restent propres à ce navigateur : swimlanes repliées, filtres, rafraîchissement
          automatique, largeur de la barre latérale, et Goals épinglés gardés localement.
        </p>
      </section>

      {published && (
        <section class="panel" aria-labelledby="team-content">
          <h2 id="team-content">Contenu publié dans Jira</h2>
          <p class="hint">
            Tel que relu dans Jira : propriété « {BOARD_PROPERTY_KEYS.teamSettings} » du board{" "}
            {configuration.boardId}.
          </p>
          <details>
            <summary>Afficher le document</summary>
            <pre class="report">{JSON.stringify(encodeTeamDocument(published), null, 2)}</pre>
          </details>
        </section>
      )}

      {confirming && (
        <PublishDialog
          families={toPublish}
          firstTime={!published}
          onConfirm={() => {
            setConfirming(false);
            void board.publishTeamSettings();
          }}
          onCancel={() => setConfirming(false)}
        />
      )}
    </div>
  );
}

function TeamState({ status }: { status: TeamStatus }) {
  const { state, published, update, localChanges } = status;
  if (state.kind === "unknown") return <p class="hint">Lecture des réglages d'équipe dans Jira…</p>;
  if (state.kind === "unreadable") return <p class="team-state">Réglages d'équipe illisibles.</p>;
  if (!published) {
    return (
      <p class="team-state">
        Aucun réglage d'équipe n'est encore publié pour ce board. Publiez les vôtres pour que
        l'équipe les partage.
      </p>
    );
  }
  return (
    <div class="team-state">
      <p>
        Publiés par <strong>{publisher(published)}</strong>, {when(published)}.
      </p>
      {!update && localChanges.length === 0 && <p>Ce navigateur est à jour avec l'équipe.</p>}
      {!update && localChanges.length > 0 && (
        <>
          <p>Modifiés dans ce navigateur, pas encore publiés :</p>
          <ul>
            {localChanges.map((family) => (
              <li key={family}>{family}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/** Pourquoi la publication n'est pas proposée ; `null` si elle l'est. */
function publishBlocker(status: TeamStatus): string | null {
  const { state, published, update, localChanges } = status;
  if (state.kind === "unknown") return "Lecture des réglages d'équipe en cours.";
  if (state.kind === "unreadable") return "Réglages d'équipe illisibles : rien ne sera écrasé.";
  if (update) return "Appliquez ou gardez d'abord la version de l'équipe.";
  if (published && localChanges.length === 0) return "Rien de nouveau à publier.";
  return null;
}

function PublishDialog(props: {
  families: readonly string[];
  firstTime: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { onCancel } = props;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);
  return (
    <div class="dialog-backdrop">
      <div class="dialog panel" role="dialog" aria-modal="true" aria-labelledby="publish-title">
        <h2 id="publish-title">Publier les réglages d'équipe ?</h2>
        <p class="hint">
          {props.firstTime
            ? "Première publication pour ce board : tous vos réglages d'équipe seront partagés."
            : "Seront partagés, tels qu'ils sont dans ce navigateur :"}
        </p>
        <ul class="team-families">
          {props.families.map((family) => (
            <li key={family}>{family}</li>
          ))}
        </ul>
        <p class="hint">
          Écrits dans Jira, dans une propriété du board lisible par quiconque voit le board. Chacun
          les reçoit à sa prochaine actualisation ; celui qui a changé ses propres réglages choisit
          de les appliquer ou non. Il faut pouvoir modifier le board dans Jira pour publier.
        </p>
        <div class="row">
          <button type="button" class="primary grow" onClick={props.onConfirm}>
            Publier pour l'équipe
          </button>
          <button type="button" onClick={onCancel}>
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
}

export function publisher(document: TeamDocument): string {
  return document.publishedBy.displayName ?? "Quelqu'un de l'équipe";
}

/** « le 19 sept. à 08:14 » ; la date brute si elle est illisible. */
export function when(document: TeamDocument): string {
  const date = new Date(document.publishedAt);
  return Number.isNaN(date.getTime())
    ? document.publishedAt
    : `le ${formatDay(date)} à ${formatTime(date)}`;
}
