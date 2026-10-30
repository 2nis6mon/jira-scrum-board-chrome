import { useEffect, useRef, useState } from "preact/hooks";
import { GOAL_COLOR_NAMES } from "../../../core/boardPreferences";
import { filterAtlassianGoals } from "../../../core/filters";
import { pinnedGoalIdsIn } from "../../../core/pinnedGoals";
import { goalColorName, type SprintGoal } from "../../../core/sprintGoals";
import { type AtlassianGoal, goalDisplayName } from "../../../jira/models";
import { localize, t } from "../../i18n";
import type { BoardModel, PinEditor } from "../../model/BoardModel";
import { goalStatusLabel, plural } from "../format";
import { Icon } from "../Icon";
import { ColorMenu, SaveBar } from "./controls";

const sameIds = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((id, index) => id === b[index]);

const isChanged = (editor: PinEditor) => !sameIds(editor.selection, editor.base);

/** Couleurs des objectifs, dans l'ordre de la palette : `goal1` … `goal9`. */
const GOAL_COLORS = GOAL_COLOR_NAMES.map((name, index) => ({ id: goalColorName(index), name }));

/**
 * Objectifs du sprint (ou du board Kanban) : couleur, masquage et épinglage de chaque objectif,
 * puis les Goals du site pour en épingler d'autres.
 *
 * Deux rythmes d'enregistrement, dits à l'écran : couleur et masquage sont des réglages du board
 * partagés, écrits à chaque geste ; l'épinglage (Goals Atlassian seulement) se compose sur la page
 * et part en UNE écriture sur « Enregistrer dans Jira ». Le brouillon d'épinglage suit ce que Jira
 * porte tant qu'il n'est pas modifié.
 */
export function SprintGoalsPanel({ board, pinning }: { board: BoardModel; pinning: boolean }) {
  const snapshot = board.snapshot.value;
  const configuration = board.configuration.value;
  const storage = board.pinStorage.value;
  // Libellés « board » ou « sprint » selon le stockage résolu des Goals épinglés.
  const onBoard = storage.kind === "board";
  const canPin = pinning && board.canPinGoals.value;
  const editor = canPin ? board.pinEditor.value : null;
  const [search, setSearch] = useState("");
  const [saved, setSaved] = useState(false);
  const wasSaving = useRef(false);

  const sprintId = snapshot?.sprint?.id ?? null;
  const pinned = pinnedGoalIdsIn(storage, configuration, snapshot);
  const pinnedKey = JSON.stringify([pinned, snapshot?.localPinnedGoalIds ?? null]);

  // Brouillon d'épinglage ouvert d'office, et recalé sur Jira tant qu'il n'a pas été touché.
  useEffect(() => {
    if (!canPin || pinned === null) return;
    const current = board.pinEditor.value;
    const stale =
      current !== null &&
      !current.saving &&
      current.notice === null &&
      !isChanged(current) &&
      (current.sprintId !== sprintId ||
        !sameIds(current.base, pinned) ||
        current.fromLocal !== (snapshot?.localPinnedGoalIds != null));
    if (current === null || stale) board.openPinEditor();
  }, [board, canPin, sprintId, pinnedKey, board.pinEditor.value === null]);

  // Quitter l'onglet abandonne le brouillon (jamais pendant une écriture).
  useEffect(() => () => board.closePinEditor(), [board]);

  // « Enregistré » après une écriture confirmée, effacé dès la modification suivante.
  useEffect(() => {
    if (wasSaving.current && !editor?.saving && (editor === null || editor.notice === null)) {
      setSaved(true);
    }
    if (editor && isChanged(editor)) setSaved(false);
    wasSaving.current = editor?.saving ?? false;
  }, [editor]);

  // Objectifs du sprint : affichés dans l'ordre des swimlanes, puis les masqués.
  const goals = snapshot?.goals ?? [];
  const byGoalId = new Map(goals.map((goal) => [goal.id, goal]));
  const shown = board.laneOrder.value
    .filter((id) => id.startsWith("goal:"))
    .map((id) => byGoalId.get(id.slice("goal:".length)))
    .filter((goal): goal is SprintGoal => goal !== undefined);
  const hidden = board.hiddenGoals.value.filter((goal) => !shown.includes(goal));
  const ticketCount = (goalId: string) =>
    snapshot?.goalIssues.filter((issue) => issue.goalId === goalId).length ?? 0;

  const siteGoals = board.siteGoals.value;
  const loading = board.siteGoalsLoading.value;
  const bySiteId = new Map((siteGoals ?? []).map((goal) => [goal.id, goal]));
  const nameOf = (id: string) => {
    const goal = bySiteId.get(id);
    return goal ? goalDisplayName(goal) : (byGoalId.get(id)?.title ?? id);
  };
  // Épinglés dans le brouillon mais sans swimlane encore : ils l'auront après l'enregistrement.
  const pendingPins = (editor?.selection ?? []).filter((id) => !byGoalId.has(id));
  // Les Goals archivés restent hors de la liste, sauf s'ils sont épinglés : on doit pouvoir les
  // désépingler.
  const listed = (siteGoals ?? []).filter(
    (goal) => !goal.isArchived || (editor?.selection.includes(goal.id) ?? false),
  );
  const filtered = filterAtlassianGoals(search, listed);
  const changed = editor !== null && isChanged(editor);
  const pinChanges = editor
    ? editor.selection.filter((id) => !editor.base.includes(id)).length +
      editor.base.filter((id) => !editor.selection.includes(id)).length
    : 0;

  const pinTag = (id: string) => {
    if (!editor) return null;
    const before = editor.base.includes(id);
    const after = editor.selection.includes(id);
    if (after && !before) return t("épinglé · à enregistrer");
    if (before && !after) return t("désépinglé · à enregistrer");
    return null;
  };
  const pinButton = (id: string, title: string) => {
    if (!editor) return null;
    const on = editor.selection.includes(id);
    return (
      <button
        type="button"
        class={`settings-button settings-pin-toggle${on ? " is-on" : ""}`}
        aria-pressed={on}
        aria-label={`${on ? t("Désépingler") : t("Épingler")} ${title}`}
        title={
          on
            ? t("Désépingler : la swimlane disparaît sans ticket")
            : t("Épingler : garder la swimlane même sans ticket")
        }
        disabled={editor.saving}
        onClick={() => board.togglePinned(id)}
      >
        <Icon name="pin" size={14} />
        {on ? t("Épinglé") : t("Épingler")}
      </button>
    );
  };
  const goalRow = (goal: SprintGoal, isHidden: boolean) => {
    const tag = pinTag(goal.id);
    const count = ticketCount(goal.id);
    return (
      <li
        key={goal.id}
        class={`settings-goal${isHidden ? " is-hidden" : ""}`}
        data-goal-color={goal.color}
      >
        <span class="goal-ring" aria-hidden="true" />
        <span class="settings-goal-text">
          <span class="settings-goal-title">{goal.title}</span>
          <span class="settings-goal-meta">
            {goal.atlassianKey && <span class="settings-goal-key">{goal.atlassianKey}</span>}
            {plural(count, "ticket")}
            {isHidden && t(" · dans {v0}", { v0: configuration?.buildSectionLabel || "Build" })}
          </span>
        </span>
        {tag && <span class="settings-tag settings-tag-pending">{tag}</span>}
        {/* Les actions passent ensemble à la ligne quand la place manque. */}
        <span class="settings-goal-actions">
          <ColorMenu
            label={t("Couleur de « {v0} »", { v0: goal.title })}
            title={t("Couleur de l'objectif")}
            choices={GOAL_COLORS}
            selected={goal.color}
            swatch={(id) => <span class="settings-swatch" data-goal-color={id} />}
            onPick={(id) => {
              const index = GOAL_COLORS.findIndex((color) => color.id === id);
              if (index >= 0) void board.setGoalColor(goal.id, index);
            }}
          />
          <button
            type="button"
            class="settings-button"
            onClick={() => void board.setGoalHidden(goal.id, !isHidden)}
          >
            <Icon name={isHidden ? "eye" : "eyeOff"} size={14} />
            {isHidden ? t("Réafficher") : t("Masquer")}
          </button>
          {pinButton(goal.id, goal.title)}
        </span>
      </li>
    );
  };

  const scope = onBoard ? "board" : "sprint";
  const title = onBoard
    ? t("Objectifs du board « {v0} »", { v0: configuration?.boardName ?? "" })
    : snapshot?.sprint
      ? t("Objectifs du sprint « {v0} »", { v0: snapshot.sprint.name })
      : t("Objectifs du sprint");

  return (
    <>
      <div class="settings-columns" aria-busy={editor?.saving}>
        <section class="settings-card" aria-labelledby="settings-sprint-goals">
          <header class="settings-card-header">
            <div class="settings-card-title">
              <h2 id="settings-sprint-goals">{title}</h2>
              <p class="settings-help">
                {t(
                  "Couleur et masquage s'enregistrent aussitôt pour toute l'équipe ; un objectif garde sa couleur",
                )}{" "}
                {onBoard ? t("au fil du temps") : t("d'un sprint à l'autre")}
                {t(". Masqué, ses tickets passent dans")}{" "}
                {configuration?.buildSectionLabel || "Build"}{" "}
                {t("sans toucher à leur rattachement dans Jira. L'ordre se règle sur le board.")}
              </p>
            </div>
          </header>
          {pinning && !canPin && (
            <p class="settings-help">
              {onBoard
                ? t(
                    "Les objectifs ne sont pas encore disponibles : actualisez le board pour épingler des Goals.",
                  )
                : snapshot?.sprint
                  ? t(
                      "La propriété du sprint n'a pas pu être lue : actualisez le board pour épingler des Goals.",
                    )
                  : t("Aucun sprint actif : l'épinglage porte sur le sprint affiché.")}
            </p>
          )}
          {editor?.fromLocal && (
            <p class="notice notice-info">
              {t(
                "Cette sélection est gardée dans ce navigateur seulement : Jira avait refusé de l'enregistrer. « Enregistrer dans Jira » la partagera avec l'équipe si vos droits le permettent désormais.",
              )}
            </p>
          )}

          {shown.length + hidden.length + pendingPins.length === 0 ? (
            <p class="settings-empty">
              {board.goalsNotice.value ||
              board.goalsWarnings.value.length > 0 ||
              board.syncProblem.value
                ? t(
                    "La lecture des objectifs n'est pas complète. Actualisez le board pour les retrouver.",
                  )
                : t("Aucun objectif sur ce {v0}.", { v0: scope })}
            </p>
          ) : (
            <ul class="settings-goals">
              {shown.map((goal) => goalRow(goal, false))}
              {pendingPins.map((id) => (
                <li key={id} class="settings-goal settings-goal-pending">
                  <span class="goal-ring" aria-hidden="true" />
                  <span class="settings-goal-text">
                    <span class="settings-goal-title">{nameOf(id)}</span>
                    <span class="settings-goal-meta">
                      {t("aura sa swimlane après l'enregistrement")}
                    </span>
                  </span>
                  <span class="settings-tag settings-tag-pending">{pinTag(id)}</span>
                  {pinButton(id, nameOf(id))}
                </li>
              ))}
            </ul>
          )}
          {hidden.length > 0 && (
            <div class="settings-subgroup">
              <h3>
                {t("Masqués ·")} {hidden.length}
              </h3>
              <ul class="settings-goals">{hidden.map((goal) => goalRow(goal, true))}</ul>
            </div>
          )}
        </section>

        {editor && (
          <section class="settings-card settings-pin-card" aria-labelledby="pin-site-title">
            <header class="settings-card-header">
              <div class="settings-card-title">
                <h2 id="pin-site-title">{t("Épingler un Goal du site")}</h2>
                <p class="settings-help">
                  {onBoard
                    ? t(
                        "Un Goal épinglé garde sa swimlane même sans ticket ; l'épinglage est partagé pour ce board.",
                      )
                    : t(
                        "Un Goal épinglé garde sa swimlane même sans ticket, pour CE sprint seulement : l'épinglage part dans une propriété du sprint.",
                      )}
                </p>
              </div>
              <button
                type="button"
                class="icon-button settings-icon-button"
                aria-label={t("Recharger les Goals du site")}
                title={t("Recharger les Goals du site")}
                onClick={() => void board.loadSiteGoals()}
                disabled={loading || editor.saving}
              >
                <Icon name="refresh" size={16} />
              </button>
            </header>
            <label class="settings-search">
              <Icon name="search" size={15} />
              <input
                type="search"
                class="pin-search"
                aria-label={t("Filtrer les Goals")}
                placeholder={t("Nom, clé ou responsable")}
                value={search}
                onInput={(event) => setSearch(event.currentTarget.value)}
              />
            </label>
            {board.siteGoalsError.value && (
              <div class="notice notice-error" role="alert">
                <p>
                  <strong>
                    {t("Goals du site illisibles :")} {localize(board.siteGoalsError.value.text)}
                  </strong>
                  {board.siteGoalsError.value.suggestion &&
                    ` ${localize(board.siteGoalsError.value.suggestion)}`}
                </p>
              </div>
            )}
            {siteGoals === null ? (
              loading && <p class="settings-help">{t("Lecture des Goals du site…")}</p>
            ) : listed.length === 0 ? (
              <p class="settings-help">{t("Atlassian ne renvoie aucun Goal pour ce site.")}</p>
            ) : (
              <>
                {filtered.length === 0 ? (
                  <p class="settings-help">
                    {t("Aucun Goal ne correspond à «")} {search.trim()} {t("».")}
                  </p>
                ) : (
                  <ul class="pin-list">
                    {filtered.map((goal) => (
                      <GoalOption
                        key={goal.id}
                        goal={goal}
                        checked={editor.selection.includes(goal.id)}
                        disabled={editor.saving}
                        onToggle={() => board.togglePinned(goal.id)}
                      />
                    ))}
                  </ul>
                )}
                <p class="settings-help">
                  {plural(filtered.length, "Goal")} {t("sur")} {listed.length}
                  {t(". Filtrage local : aucune requête n'est envoyée pendant la frappe.")}
                </p>
              </>
            )}
          </section>
        )}
      </div>

      {editor?.notice && (
        <div class={`notice notice-${editor.notice.tone}`} role="alert">
          <p>
            <strong>{localize(editor.notice.text)}</strong>
            {editor.notice.suggestion && ` ${localize(editor.notice.suggestion)}`}
          </p>
          {editor.canKeepLocally && (
            <div class="row">
              <button type="button" onClick={() => void board.keepPinnedLocally()}>
                {t("Garder cette sélection dans ce navigateur")}
              </button>
            </div>
          )}
        </div>
      )}

      {editor && (
        <SaveBar
          changed={changed}
          message={
            changed
              ? t("Épinglage modifié · {v0} à enregistrer dans Jira", {
                  v0: plural(pinChanges, "Goal"),
                })
              : saved
                ? t("Épinglage enregistré dans Jira.")
                : t("Épinglage identique à celui de Jira.")
          }
          busy={editor.saving}
          cancelDisabled={editor.saving || (!changed && editor.notice === null)}
          onCancel={() => board.openPinEditor()}
          confirm={editor.saving ? t("Enregistrement…") : t("Enregistrer dans Jira")}
          confirmDisabled={!changed || editor.saving}
          onConfirm={() => void board.savePinnedGoals()}
        />
      )}
    </>
  );
}

function GoalOption(props: {
  goal: AtlassianGoal;
  checked: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  const { goal } = props;
  const details = [goal.key, goal.ownerName, goal.isArchived ? t("archivé") : null].filter(
    (part): part is string => part !== null,
  );
  const status = goal.statusLabel ? goalStatusLabel(goal.statusLabel) : null;
  return (
    <li>
      <label class={`pin-option${props.checked ? " is-checked" : ""}`}>
        <input
          type="checkbox"
          aria-label={[goalDisplayName(goal), ...details, ...(status ? [status] : [])].join(", ")}
          checked={props.checked}
          disabled={props.disabled}
          onChange={props.onToggle}
        />
        <span class="pin-option-text">
          <span class="pin-name">{goalDisplayName(goal)}</span>
          {details.length > 0 && <span class="pin-meta">{details.join(" · ")}</span>}
        </span>
        {status && <span class="goal-status">{status}</span>}
      </label>
    </li>
  );
}
