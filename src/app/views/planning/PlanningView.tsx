import type { ComponentChildren } from "preact";
import { useLayoutEffect, useRef, useState } from "preact/hooks";
import type { SprintGoal } from "../../../core/sprintGoals";
import { isDoneStatus } from "../../../jira/models";
import { language, localize, t } from "../../i18n";
import type { PlanningIssue, PlanningViewModel } from "../../model/PlanningTypes";
import { formatDay, formatPoints, plural } from "../format";
import { Icon } from "../Icon";
import { ErrorMessage } from "../Message";
import "../../styles/planning.css";

export const PLANNING_DRAG_TYPE = "application/x-sprint-goals-planning-issue";

/** Atelier local : les gestes de préparation ne publient jamais dans Jira. */
export function PlanningView({
  planning,
  sidebarCollapsed,
  onToggleSidebar,
  onBack,
}: {
  planning: PlanningViewModel;
  sidebarCollapsed: boolean;
  onToggleSidebar(): void;
  onBack(): void;
}) {
  const [search, setSearch] = useState("");
  const [source, setSource] = useState<"backlog" | "remaining">("backlog");
  const [newGoal, setNewGoal] = useState("");
  const [focusedGoal, setFocusedGoal] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"publish" | "discard" | null>(null);
  const goalInput = useRef<HTMLInputElement>(null);
  const draft = planning.draft.value;
  const busy = planning.loading.value || planning.publishing.value;
  const issues = planning.issues.value;
  const selected = new Set(draft?.selectedIssueKeys ?? []);
  const planned = issues.filter(
    (item) => selected.has(item.issue.key) && item.source !== "remaining",
  );
  const unavailableKeys = [...selected].filter(
    (key) => !issues.some((item) => item.issue.key === key && item.source !== "remaining"),
  );
  const backlog = issues.filter(
    (item) => item.source === "backlog" && !selected.has(item.issue.key),
  );
  const remaining = issues.filter((item) => item.source === "remaining");
  const query = search.trim().toLocaleLowerCase(language.value);
  const candidates = (source === "backlog" ? backlog : remaining).filter((item) =>
    `${item.issue.key} ${item.issue.fields.summary} ${item.issue.fields.issuetype.name} ${item.issue.fields.parent?.summary ?? ""}`
      .toLocaleLowerCase(language.value)
      .includes(query),
  );
  const sprint = planning.sprints.value.find((item) => item.id === planning.selectedSprintId.value);
  const goals = draft?.goals ?? [];
  const goalIds = new Set(goals.map((goal) => goal.id));
  const unassigned = planned.filter((item) => !goalIds.has(draft?.links[item.issue.key] ?? ""));
  const activeFocusedGoal = goals.some((goal) => goal.id === focusedGoal) ? focusedGoal : null;
  const shownGoals = activeFocusedGoal
    ? goals.filter((goal) => goal.id === activeFocusedGoal)
    : goals;
  const points = planned.reduce((total, item) => total + (item.estimate ?? 0), 0);
  const missingEstimates = planned.filter((item) => item.estimate === null).length;
  const capacity = draft?.capacity ?? null;
  const overCapacity = capacity !== null && points > capacity;

  useLayoutEffect(() => {
    setFocusedGoal(null);
    setDialog(null);
    setNewGoal("");
  }, [planning.selectedSprintId.value]);

  const assign = (key: string, goalId: string | null) => {
    if (busy || !draft || !issues.some((item) => item.issue.key === key && isAssignable(item)))
      return;
    planning.assignIssue(key, goalId);
  };

  return (
    <main class="planning-screen" aria-label="Sprint Planning" aria-busy={busy}>
      <header class="planning-header">
        <div class="planning-heading">
          <button
            type="button"
            class="icon-button"
            aria-label={
              sidebarCollapsed ? t("Afficher la barre latérale") : t("Masquer la barre latérale")
            }
            onClick={onToggleSidebar}
          >
            <Icon name="sidebar" size={18} />
          </button>
          <div>
            <span class="planning-eyebrow">{t("ATELIER PRODUIT")}</span>
            <h1>Sprint Planning</h1>
          </div>
        </div>
        <div class="planning-header-actions">
          <button type="button" disabled={busy} onClick={onBack}>
            <Icon name="arrowLeft" /> {t("Retour au board")}
          </button>
          <button
            type="button"
            disabled={!draft || busy}
            onClick={() => void planning.copySummary()}
          >
            {t("Copier la synthèse")}
          </button>
          <button
            type="button"
            class="primary"
            disabled={!planning.canPublish.value || busy}
            onClick={() => setDialog("publish")}
          >
            {t("Publier dans Jira")} <Icon name="chevronRight" />
          </button>
        </div>
      </header>

      <div class="planning-context">
        <label class="planning-sprint-picker">
          <span>{t("Sprint à préparer")}</span>
          <select
            aria-label={t("Sprint à préparer")}
            value={planning.selectedSprintId.value ?? ""}
            disabled={busy || planning.sprints.value.length === 0}
            onChange={(event) => void planning.selectSprint(Number(event.currentTarget.value))}
          >
            {planning.sprints.value.length === 0 && (
              <option value="">{t("Aucun sprint futur")}</option>
            )}
            {planning.sprints.value.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
                {item.state !== "future" && t(" — brouillon à réexaminer")}
              </option>
            ))}
          </select>
        </label>
        {sprint?.startDate && (
          <span class="planning-dates">
            {formatDay(sprint.startDate)}
            {sprint.endDate && ` → ${formatDay(sprint.endDate)}`}
          </span>
        )}
        <span
          class={`planning-draft-state${planning.dirty.value ? " planning-draft-changed" : ""}`}
          role="status"
        >
          <span aria-hidden="true" />
          {planning.publishing.value
            ? t("Publication en cours…")
            : planning.loading.value
              ? t("Lecture de Jira…")
              : planning.dirty.value
                ? t("Brouillon local")
                : t("Version Jira")}
        </span>
        <div class="planning-context-actions">
          <button
            type="button"
            disabled={busy}
            onClick={() => void planning.refresh()}
            title={t("Relire les tickets depuis Jira")}
          >
            <Icon name="refresh" /> {t("Actualiser")}
          </button>
          {draft && (planning.dirty.value || planning.validation.value) && (
            <button type="button" disabled={busy} onClick={() => setDialog("discard")}>
              {t("Repartir de Jira")}
            </button>
          )}
        </div>
      </div>

      {(planning.error.value || planning.notice.value || planning.validation.value) && (
        <div class="planning-messages" aria-live="polite">
          <ErrorMessage message={planning.error.value} />
          {planning.notice.value && <p>{localize(planning.notice.value)}</p>}
          {planning.validation.value && (
            <p class="planning-validation">{localize(planning.validation.value)}</p>
          )}
        </div>
      )}

      {!draft ? (
        <div class="planning-start">
          <span class="planning-start-icon">
            <Icon name="goal" size={28} />
          </span>
          <h2>
            {planning.loading.value
              ? t("Préparons votre prochain sprint")
              : t("Un sprint à construire ensemble")}
          </h2>
          <p>
            {planning.loading.value
              ? t("Lecture du backlog, du sprint futur et du reste à faire.")
              : t(
                  "Créez un sprint futur dans le backlog Jira, puis actualisez pour préparer ses objectifs et ses stories ici.",
                )}
          </p>
        </div>
      ) : (
        <>
          <section class="planning-summary" aria-label={t("Synthèse du sprint proposé")}>
            <div class="planning-metric">
              <strong>{goals.length}</strong>
              <span>
                {t(
                  new Intl.PluralRules(language.value).select(goals.length) === "one"
                    ? "objectif"
                    : "objectifs",
                )}
              </span>
            </div>
            <div class="planning-metric">
              <strong>{planned.length}</strong>
              <span>
                {t(
                  new Intl.PluralRules(language.value).select(planned.length) === "one"
                    ? "ticket prévu"
                    : "tickets prévus",
                )}
              </span>
            </div>
            <div class="planning-metric">
              <strong>{formatPoints(points)}</strong>
              <span>{localize(planning.estimationLabel)}</span>
            </div>
            <div
              class={`planning-estimate-note${missingEstimates > 0 ? " planning-attention" : ""}`}
            >
              <Icon name={missingEstimates > 0 ? "points" : "check"} size={16} />
              {planned.length === 0
                ? t("Ajoutez des tickets pour composer le sprint")
                : missingEstimates > 0
                  ? t("{p0} sans estimation", { p0: plural(missingEstimates, "ticket") })
                  : t("Tous les tickets prévus sont estimés")}
            </div>
            <label class="planning-capacity">
              <span>
                {t("Capacité cible")} <small>{t("facultative")}</small>
              </span>
              <input
                type="number"
                min="0"
                step="any"
                placeholder="—"
                aria-label={t("Capacité cible en {p0}", { p0: localize(planning.estimationLabel) })}
                value={capacity ?? ""}
                disabled={busy}
                onInput={(event) =>
                  planning.setCapacity(
                    event.currentTarget.value === "" ? null : event.currentTarget.valueAsNumber,
                  )
                }
              />
            </label>
            {capacity !== null && (
              <div
                class={`planning-capacity-progress${overCapacity ? " planning-capacity-over" : ""}`}
              >
                <progress
                  aria-label={t("Capacité utilisée")}
                  value={Math.min(points, capacity)}
                  max={capacity || 1}
                />
                <span>
                  {overCapacity
                    ? t("{p0} au-dessus de la cible", { p0: formatPoints(points - capacity) })
                    : t("{p0} disponibles", { p0: formatPoints(Math.max(0, capacity - points)) })}
                  {missingEstimates > 0 ? t(" · estimation partielle") : ""}
                </span>
              </div>
            )}
          </section>

          <div class="planning-stage">
            <aside class="planning-pool" aria-label={t("Tickets à examiner")}>
              <div class="planning-pool-heading">
                <span class="planning-step">01</span>
                <div>
                  <h2>{t("Explorer")}</h2>
                  <p>{t("Choisir ce qui sert vos objectifs.")}</p>
                </div>
              </div>
              <fieldset class="planning-source-tabs" aria-label={t("Source des tickets")}>
                <button
                  type="button"
                  aria-pressed={source === "backlog"}
                  onClick={() => setSource("backlog")}
                >
                  Backlog <span>{backlog.length}</span>
                </button>
                <button
                  type="button"
                  aria-pressed={source === "remaining"}
                  onClick={() => setSource("remaining")}
                >
                  {t("Reste à faire")} <span>{remaining.length}</span>
                </button>
              </fieldset>
              <label class="planning-search">
                <Icon name="search" size={16} />
                <input
                  type="search"
                  aria-label={t("Rechercher un ticket à planifier")}
                  placeholder={t("Rechercher une story, un epic…")}
                  value={search}
                  onInput={(event) => setSearch(event.currentTarget.value)}
                />
              </label>
              {source === "remaining" && (
                <p class="planning-pool-note">
                  {t(
                    "Tickets non terminés du sprint actif, à réexaminer avant la clôture. Leur présence ici ne les déplace pas.",
                  )}
                </p>
              )}
              <div class="planning-pool-list" aria-live="polite">
                {candidates.map((item) => (
                  <PlanningCard
                    key={item.issue.key}
                    item={item}
                    goals={goals}
                    goalId={null}
                    selected={false}
                    disabled={busy}
                    onAssign={assign}
                    onRemove={(key) => planning.removeIssue(key)}
                    onOpen={(key) => planning.openIssue(key)}
                  />
                ))}
                {candidates.length === 0 && (
                  <p class="planning-empty">
                    {query
                      ? t("Aucun ticket ne correspond à cette recherche.")
                      : source === "remaining"
                        ? t("Aucun reste à faire dans le sprint actif.")
                        : t("Tous les tickets disponibles sont déjà dans votre proposition.")}
                  </p>
                )}
              </div>
              <p class="planning-pool-footer">
                {t("Glissez un ticket vers un objectif ou utilisez « Affecter à ».")}
              </p>
            </aside>

            <section class="planning-canvas" aria-label={t("Proposition de sprint")}>
              <div class="planning-canvas-heading">
                <span class="planning-step">02</span>
                <div>
                  <h2>{t("Construire par objectifs")}</h2>
                  <p>
                    {t(
                      "Décrivez le résultat attendu, puis réunissez les stories qui le rendent possible.",
                    )}
                  </p>
                </div>
                {activeFocusedGoal && (
                  <button type="button" onClick={() => setFocusedGoal(null)}>
                    {t("Tous les objectifs")}
                  </button>
                )}
              </div>
              {unavailableKeys.length > 0 && (
                <div class="planning-unavailable">
                  <h3>{t("Tickets à vérifier")}</h3>
                  <p>
                    {t(
                      "Ces tickets ne sont plus disponibles dans le backlog ou le sprint choisi. Retirez-les de la proposition pour pouvoir publier.",
                    )}
                  </p>
                  {unavailableKeys.map((key) => (
                    <div key={key}>
                      <button type="button" onClick={() => planning.openIssue(key)}>
                        {key}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => planning.removeIssue(key)}
                        aria-label={t("Retirer {p0} de la proposition", { p0: key })}
                      >
                        {t("Retirer de la proposition")}
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {goals.length === 0 && (
                <div class="planning-first-goal">
                  <Icon name="goal" size={26} />
                  <h3>{t("Quel résultat voulez-vous obtenir ?")}</h3>
                  <p>{t("Commencez par un objectif concret. Les tickets viennent ensuite.")}</p>
                </div>
              )}
              <div class="planning-goal-grid">
                {shownGoals.map((goal) => {
                  const items = planned.filter((item) => draft.links[item.issue.key] === goal.id);
                  const index = goals.findIndex((item) => item.id === goal.id);
                  return (
                    <DropZone
                      key={goal.id}
                      goalId={goal.id}
                      disabled={busy}
                      onAssign={assign}
                      className="planning-goal"
                      label={t("Objectif {p0} : {p1}", { p0: index + 1, p1: goal.title })}
                      color={goal.color}
                    >
                      <div class="planning-goal-top">
                        <span class="planning-goal-label">
                          {t("OBJECTIF")} {String(index + 1).padStart(2, "0")}
                        </span>
                        <span>
                          {plural(items.length, "ticket")} ·{" "}
                          {formatPoints(items.reduce((sum, item) => sum + (item.estimate ?? 0), 0))}{" "}
                          {localize(planning.estimationLabel)}
                        </span>
                      </div>
                      <input
                        class="planning-goal-title"
                        type="text"
                        aria-label={t("Titre de l’objectif {p0}", { p0: index + 1 })}
                        title={goal.title}
                        placeholder={t("Un résultat concret pour vos utilisateurs")}
                        value={goal.title}
                        disabled={busy}
                        maxLength={500}
                        onInput={(event) => planning.renameGoal(goal.id, event.currentTarget.value)}
                      />
                      <div class="planning-goal-actions">
                        <button
                          type="button"
                          title={t("Se concentrer sur cet objectif")}
                          aria-label={t("Isoler l’objectif {p0}", { p0: index + 1 })}
                          aria-pressed={activeFocusedGoal === goal.id}
                          onClick={() =>
                            setFocusedGoal(activeFocusedGoal === goal.id ? null : goal.id)
                          }
                        >
                          <Icon name="eye" /> Focus
                        </button>
                        <span />
                        <button
                          type="button"
                          aria-label={t("Monter l’objectif {p0}", { p0: index + 1 })}
                          disabled={busy || index === 0}
                          onClick={() => planning.moveGoal(goal.id, -1)}
                        >
                          <Icon name="chevronUp" />
                        </button>
                        <button
                          type="button"
                          aria-label={t("Descendre l’objectif {p0}", { p0: index + 1 })}
                          disabled={busy || index === goals.length - 1}
                          onClick={() => planning.moveGoal(goal.id, 1)}
                        >
                          <Icon name="chevronDown" />
                        </button>
                        <button
                          type="button"
                          aria-label={t("Supprimer l’objectif {p0}", { p0: index + 1 })}
                          title={t("Retirer cet objectif ; ses tickets restent à organiser")}
                          disabled={busy}
                          onClick={() => {
                            planning.removeGoal(goal.id);
                            if (focusedGoal === goal.id) setFocusedGoal(null);
                          }}
                        >
                          <Icon name="trash" />
                        </button>
                      </div>
                      <div class="planning-goal-tickets">
                        {items.map((item) => (
                          <PlanningCard
                            key={item.issue.key}
                            item={item}
                            goals={goals}
                            goalId={goal.id}
                            selected
                            disabled={busy}
                            onAssign={assign}
                            onRemove={(key) => planning.removeIssue(key)}
                            onOpen={(key) => planning.openIssue(key)}
                          />
                        ))}
                        {items.length === 0 && (
                          <p class="planning-drop-hint">
                            {t("Déposez ici les stories qui contribuent à cet objectif.")}
                          </p>
                        )}
                      </div>
                    </DropZone>
                  );
                })}
              </div>

              {!activeFocusedGoal && (
                <form
                  class="planning-add-goal"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!busy && newGoal.trim()) {
                      planning.addGoal(newGoal.trim());
                      setNewGoal("");
                      goalInput.current?.focus();
                    }
                  }}
                >
                  <Icon name="plus" size={18} />
                  <input
                    ref={goalInput}
                    type="text"
                    aria-label={t("Nouvel objectif du sprint")}
                    placeholder={t("Ajouter un résultat attendu pour ce sprint…")}
                    value={newGoal}
                    maxLength={500}
                    disabled={busy}
                    onInput={(event) => setNewGoal(event.currentTarget.value)}
                  />
                  <button type="submit" disabled={busy || !newGoal.trim()}>
                    {t("Ajouter l’objectif")}
                  </button>
                </form>
              )}

              {!activeFocusedGoal && (
                <DropZone
                  goalId={null}
                  disabled={busy}
                  onAssign={assign}
                  className="planning-unassigned"
                  label={t("Tickets à organiser")}
                >
                  <div class="planning-unassigned-heading">
                    <h3>
                      {t("À organiser")} <span>{unassigned.length}</span>
                    </h3>
                    <p>{t("Dans le sprint proposé, encore sans objectif.")}</p>
                  </div>
                  <div class="planning-unassigned-list">
                    {unassigned.map((item) => (
                      <PlanningCard
                        key={item.issue.key}
                        item={item}
                        goals={goals}
                        goalId={null}
                        selected
                        disabled={busy}
                        onAssign={assign}
                        onRemove={(key) => planning.removeIssue(key)}
                        onOpen={(key) => planning.openIssue(key)}
                      />
                    ))}
                  </div>
                  {unassigned.length === 0 && (
                    <p class="planning-drop-hint">
                      {t("Un ticket à discuter ? Gardez-le ici avant de choisir son objectif.")}
                    </p>
                  )}
                </DropZone>
              )}
              <p class="planning-local-note">
                <Icon name="lock" />{" "}
                {t(
                  "Votre proposition reste un brouillon dans ce navigateur. Publiez quand l’équipe est prête.",
                )}
              </p>
            </section>
          </div>
        </>
      )}

      {dialog && draft && (
        <PlanningDialog
          busy={planning.publishing.value}
          title={
            dialog === "publish"
              ? t("Publier la proposition de sprint")
              : t("Abandonner le brouillon ?")
          }
          onClose={() => setDialog(null)}
        >
          {dialog === "publish" ? (
            <>
              <p>
                {t("Le sprint")} <strong>{sprint?.name}</strong>{" "}
                {t("recevra les objectifs ci-dessous et les rattachements de vos tickets.")}
              </p>
              <label class="planning-publication-label" htmlFor="planning-goal-preview">
                {t("Texte du sprint dans Jira · un objectif par ligne")}
              </label>
              <textarea
                id="planning-goal-preview"
                class="planning-goal-preview"
                readOnly
                value={draft.goals.map((goal) => goal.title.trim()).join("\n")}
                rows={Math.min(8, Math.max(3, draft.goals.length))}
              />
              <PublicationTickets planned={planned} />
              {unassigned.length > 0 && (
                <p class="planning-publication-note">
                  {t(
                    unassigned.length > 1
                      ? "{p0} resteront sans objectif."
                      : "{p0} restera sans objectif.",
                    { p0: plural(unassigned.length, "ticket") },
                  )}
                </p>
              )}
              <p class="planning-publication-note">
                {t(
                  "Le sprint restera futur. Le reste à faire du sprint actif ne sera pas déplacé.",
                )}
              </p>
              <ErrorMessage message={planning.error.value} />
              <div class="planning-dialog-actions">
                <button
                  type="button"
                  disabled={planning.publishing.value}
                  onClick={() => setDialog(null)}
                >
                  {t("Continuer la préparation")}
                </button>
                <button
                  type="button"
                  class="primary"
                  disabled={planning.publishing.value || !planning.canPublish.value}
                  onClick={async () => {
                    await planning.publish();
                    if (!planning.error.value) setDialog(null);
                  }}
                >
                  {planning.publishing.value
                    ? t("Publication en cours…")
                    : t("Confirmer la publication")}
                </button>
              </div>
            </>
          ) : (
            <>
              <p>
                {t(
                  "Les objectifs et choix de tickets non publiés seront remplacés par la version actuelle de Jira. La capacité cible sera également réinitialisée.",
                )}
              </p>
              <div class="planning-dialog-actions">
                <button type="button" onClick={() => setDialog(null)}>
                  {t("Garder le brouillon")}
                </button>
                <button
                  type="button"
                  class="danger"
                  onClick={async () => {
                    setDialog(null);
                    await planning.discardDraft();
                  }}
                >
                  {t("Reprendre depuis Jira")}
                </button>
              </div>
            </>
          )}
        </PlanningDialog>
      )}
    </main>
  );
}

function PublicationTickets({ planned }: { planned: readonly PlanningIssue[] }) {
  const additions = planned.filter((item) => item.source === "backlog");
  return (
    <div class="planning-publication-tickets">
      <h3>{t("{p0} à ajouter au sprint", { p0: plural(additions.length, "ticket") })}</h3>
      {additions.length > 0 ? (
        <ul>
          {additions.map((item) => (
            <li key={item.issue.key}>
              <strong>{item.issue.key}</strong> {item.issue.fields.summary}
            </li>
          ))}
        </ul>
      ) : (
        <p>{t("Les tickets de la proposition sont déjà dans ce sprint.")}</p>
      )}
    </div>
  );
}

function PlanningCard({
  item,
  goals,
  goalId,
  selected,
  disabled,
  onAssign,
  onRemove,
  onOpen,
}: {
  item: PlanningIssue;
  goals: readonly SprintGoal[];
  goalId: string | null;
  selected: boolean;
  disabled: boolean;
  onAssign(key: string, goalId: string | null): void;
  onRemove(key: string): void;
  onOpen(key: string): void;
}) {
  const { issue } = item;
  const remaining = item.source === "remaining";
  const assignable = isAssignable(item);
  return (
    <article
      class={`planning-card${remaining ? " planning-card-remaining" : ""}`}
      data-planning-issue={issue.key}
      draggable={!disabled && assignable}
      onDragStart={(event) => {
        if (disabled || !assignable || !event.dataTransfer) {
          event.preventDefault();
          return;
        }
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData(PLANNING_DRAG_TYPE, issue.key);
      }}
    >
      <div class="planning-card-meta">
        <button
          type="button"
          class="planning-issue-link"
          onClick={() => onOpen(issue.key)}
          aria-label={t("Ouvrir {p0} dans Jira", { p0: issue.key })}
        >
          {issue.key}
        </button>
        <span>{issue.fields.issuetype.name}</span>
        <span
          class={`planning-card-estimate${item.estimate === null ? " planning-card-unestimated" : ""}`}
          title={item.estimate === null ? t("Sans estimation") : t("Estimation Jira")}
        >
          {item.estimate === null ? "?" : formatPoints(item.estimate)}
        </span>
      </div>
      <p class="planning-card-title">{issue.fields.summary}</p>
      {issue.fields.parent?.summary && (
        <p class="planning-card-parent">
          <Icon name="parent" size={12} />
          {issue.fields.parent.summary}
        </p>
      )}
      <div class="planning-card-details">
        <span>{issue.fields.status.name}</span>
        {item.source === "sprint" && (
          <span class="planning-already-in">{t("Déjà dans le sprint")}</span>
        )}
        {remaining && <span>{item.sprintName ?? t("Sprint actif")}</span>}
        {!remaining && !assignable && (
          <span>
            {t("Consultation uniquement")}
            {issue.fields.issuetype.subtask === true ? t(" · sous-tâche") : t(" · terminé")}
          </span>
        )}
      </div>
      {(assignable || (selected && item.source === "backlog")) && (
        <div class="planning-card-actions">
          {assignable && (
            <select
              aria-label={t("Affecter {p0} à un objectif", { p0: issue.key })}
              value={selected ? (goalId ?? "") : "__pool"}
              disabled={disabled}
              onChange={(event) => {
                const value = event.currentTarget.value;
                if (value !== "__pool") onAssign(issue.key, value || null);
              }}
            >
              {!selected && (
                <option value="__pool" disabled>
                  {t("Affecter à…")}
                </option>
              )}
              <option value="">{t("À organiser")}</option>
              {goals.map((goal, index) => (
                <option key={goal.id} value={goal.id}>
                  {index + 1}. {goal.title || t("Objectif à nommer")}
                </option>
              ))}
            </select>
          )}
          {selected && item.source === "backlog" && (
            <button
              type="button"
              aria-label={t("Retirer {p0} de la proposition", { p0: issue.key })}
              title={t("Remettre dans le backlog")}
              disabled={disabled}
              onClick={() => onRemove(issue.key)}
            >
              <Icon name="close" size={13} />
            </button>
          )}
        </div>
      )}
    </article>
  );
}

function isAssignable(item: PlanningIssue): boolean {
  return (
    item.source !== "remaining" &&
    !(
      item.source === "backlog" &&
      (item.issue.fields.issuetype.subtask === true || isDoneStatus(item.issue.fields.status))
    )
  );
}

function DropZone({
  goalId,
  disabled,
  onAssign,
  className,
  label,
  color,
  children,
}: {
  goalId: string | null;
  disabled: boolean;
  onAssign(key: string, goalId: string | null): void;
  className: string;
  label: string;
  color?: string;
  children: ComponentChildren;
}) {
  const [over, setOver] = useState(false);
  const accepts = (transfer: DataTransfer | null) =>
    !disabled && Boolean(transfer?.types.includes(PLANNING_DRAG_TYPE));
  return (
    <section
      class={`${className}${over ? " planning-drop-active" : ""}`}
      data-planning-goal={goalId ?? "unassigned"}
      data-goal-color={color}
      aria-label={label}
      onDragOver={(event) => {
        if (accepts(event.dataTransfer)) {
          event.preventDefault();
          if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
          setOver(true);
        }
      }}
      onDragLeave={(event) => {
        if (
          !(event.relatedTarget instanceof Node) ||
          !event.currentTarget.contains(event.relatedTarget)
        )
          setOver(false);
      }}
      onDrop={(event) => {
        setOver(false);
        if (!accepts(event.dataTransfer)) return;
        event.preventDefault();
        event.stopPropagation();
        const key = event.dataTransfer?.getData(PLANNING_DRAG_TYPE);
        if (key) onAssign(key, goalId);
      }}
    >
      {children}
    </section>
  );
}

function PlanningDialog({
  title,
  busy,
  onClose,
  children,
}: {
  title: string;
  busy: boolean;
  onClose(): void;
  children: ComponentChildren;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useLayoutEffect(() => {
    const previous = document.activeElement;
    close.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (!busyRef.current) closeRef.current();
      }
      if (event.key !== "Tab") return;
      const elements = [
        ...(dialog.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), textarea, input:not(:disabled), select:not(:disabled), [tabindex="0"]',
        ) ?? []),
      ];
      const first = elements[0];
      const last = elements.at(-1);
      if (
        event.shiftKey &&
        (document.activeElement === first || !dialog.current?.contains(document.activeElement))
      ) {
        event.preventDefault();
        last?.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last || !dialog.current?.contains(document.activeElement))
      ) {
        event.preventDefault();
        first?.focus();
      }
    };
    const focus = (event: FocusEvent) => {
      if (event.target instanceof Node && !dialog.current?.contains(event.target)) {
        if (busyRef.current) dialog.current?.focus();
        else close.current?.focus();
      }
    };
    document.addEventListener("keydown", keydown, true);
    document.addEventListener("focusin", focus);
    return () => {
      document.removeEventListener("keydown", keydown, true);
      document.removeEventListener("focusin", focus);
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);
  return (
    <div class="planning-dialog-backdrop">
      <div
        ref={dialog}
        class="planning-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="planning-dialog-title"
        aria-busy={busy}
        tabIndex={-1}
      >
        <header>
          <h2 id="planning-dialog-title">{title}</h2>
          <button
            ref={close}
            type="button"
            aria-label={t("Fermer la confirmation")}
            disabled={busy}
            onClick={onClose}
          >
            <Icon name="close" size={18} />
          </button>
        </header>
        <div class="planning-dialog-body">{children}</div>
      </div>
    </div>
  );
}
