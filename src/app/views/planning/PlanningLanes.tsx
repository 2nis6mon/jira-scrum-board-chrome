import type { ComponentChildren } from "preact";
import { useLayoutEffect, useRef, useState } from "preact/hooks";
import type { SprintGoal } from "../../../core/sprintGoals";
import { goalDisplayName } from "../../../jira/models";
import { t } from "../../i18n";
import { planningCarryOverGoalMessage } from "../../model/coreText";
import type { ImageCache } from "../../model/ImageCache";
import type {
  PlanningIssue,
  PlanningLane,
  PlanningTypeLane,
  PlanningViewModel,
} from "../../model/PlanningTypes";
import { plural } from "../format";
import { GoalMarker } from "../GoalMarker";
import { Icon } from "../Icon";
import { LaneHeader } from "../LaneHeader";
import { ErrorMessage } from "../Message";
import { PlanningCard } from "./PlanningCard";
import { PLANNING_DRAG_TYPE, placeKeys, useDrop } from "./planningDrag";
import { text } from "./planningText";

export function LanesColumn({
  planning,
  images,
  sprintName,
}: {
  planning: PlanningViewModel;
  images: ImageCache;
  sprintName: string;
}) {
  const lanes = planning.lanes.value;
  const textMode = planning.goalMode.value === "text";
  return (
    <section
      class="planning-lanes"
      data-drag-scroll
      aria-label={t("{name} par objectifs", { name: sprintName })}
    >
      <CarryOverReportPanel planning={planning} />
      {lanes.map((lane, index) => (
        <GoalLane
          key={lane.goal.id}
          planning={planning}
          images={images}
          lane={lane}
          index={index}
          count={lanes.length}
        />
      ))}
      {lanes.some((lane) => lane.deliveredIncomplete) && (
        <p class="notice notice-warning planning-history-incomplete">
          {t("Lecture incomplète de ce qui a déjà été livré : il peut en manquer.")}
        </p>
      )}
      {textMode ? <AddGoal planning={planning} /> : <PinGoal planning={planning} />}
      <UnassignedLane planning={planning} images={images} />
      <p class="planning-live-note">
        <Icon name="check" />
        {t("Chaque geste est écrit aussitôt dans Jira, puis relu.")}
      </p>
    </section>
  );
}

/**
 * Compte rendu de la dernière clôture : chaque objectif du sprint clos, reporté ou non avec sa
 * raison. Il reste affiché jusqu'à sa fermeture ; la clôture suivante le remplace.
 */
function CarryOverReportPanel({ planning }: { planning: PlanningViewModel }) {
  const report = planning.carryOverReport.value;
  if (!report) return null;
  const heading = t("Clôture de {name}", { name: report.closedSprintName });
  return (
    <section class="planning-carry-over" aria-label={heading} aria-live="polite">
      <header class="planning-carry-over-head">
        <h3>{heading}</h3>
        <button
          type="button"
          class="icon-button"
          aria-label={t("Fermer le compte rendu")}
          title={t("Fermer le compte rendu")}
          onClick={() => planning.dismissCarryOverReport()}
        >
          <Icon name="close" />
        </button>
      </header>
      <p class="planning-carry-over-summary">{text(report.summary)}</p>
      {report.goals.length > 0 && (
        <ul class="planning-carry-over-goals">
          {report.goals.map((goal, index) => (
            <li
              // Deux objectifs peuvent porter le même titre dans des sources différentes.
              key={`${index}-${goal.title}`}
              data-carry-over-status={goal.status}
              class={
                goal.status === "carried" && report.written ? "planning-carry-over-carried" : ""
              }
            >
              <span class="planning-carry-over-title">{goal.title}</span>
              <span class="planning-carry-over-reason">
                {text(
                  planningCarryOverGoalMessage(
                    goal.status,
                    report.written,
                    report.targetSprintName,
                  ),
                )}
              </span>
              {goal.linkedKeys.length > 0 && (
                <small class="planning-carry-over-keys">{goal.linkedKeys.join(", ")}</small>
              )}
            </li>
          ))}
        </ul>
      )}
      {report.incomplete && (
        <p class="notice notice-warning planning-carry-over-incomplete">
          {t(
            "Lecture des Goals incomplète : un objectif non atteint peut manquer à ce compte rendu.",
          )}
        </p>
      )}
    </section>
  );
}

function LaneCards({
  planning,
  images,
  issues,
  goalId,
  empty,
}: {
  planning: PlanningViewModel;
  images: ImageCache;
  issues: readonly PlanningIssue[];
  goalId: string | null;
  empty: ComponentChildren;
}) {
  return (
    <div class="lane-cell planning-lane-cell">
      {issues.map((item) => (
        <PlanningCard
          key={item.issue.key}
          planning={planning}
          images={images}
          item={item}
          place={{ kind: "sprint", goalId }}
          sectionKeys={issues.map((entry) => entry.issue.key)}
        />
      ))}
      {issues.length === 0 && <p class="planning-lane-hint">{empty}</p>}
    </div>
  );
}

/**
 * Sous-section de « Sans objectif » (story 8.40) : une swimlane par type, avec le même en-tête que
 * sur le board (chevron pour replier ou déplier ses tickets, nom, nombre, « Par défaut »).
 */
function TypeLane({
  planning,
  images,
  lane,
}: {
  planning: PlanningViewModel;
  images: ImageCache;
  lane: PlanningTypeLane;
}) {
  const id = lane.swimlaneId ?? "build";
  const points = planning.sprintLoad.value?.unit === "pts";
  const collapsed = planning.collapsedTypeLanes.value.has(id);
  return (
    <div
      class={`lane planning-type-lane${lane.swimlaneId === null ? "" : " lane-swimlane"}`}
      data-planning-type-lane={id}
    >
      <LaneHeader
        leading={
          <button
            type="button"
            class="lane-toggle"
            aria-expanded={!collapsed}
            aria-label={t(collapsed ? "Déplier {name}" : "Replier {name}", { name: lane.name })}
            title={collapsed ? t("Déplier") : t("Replier")}
            onClick={() => planning.toggleTypeLane(id)}
          >
            <span class="chevron" aria-hidden="true" />
          </button>
        }
        title={<span class="lane-title">{lane.name}</span>}
        count={plural(lane.issueCount, "ticket")}
        progress={{ name: lane.name, tallies: lane.progress, points }}
      >
        {lane.swimlaneId !== null && (
          <span
            class="lane-default-label"
            title={t(
              "Les tickets de ces types rejoignent leur objectif en priorité. Sans objectif visible, ils reviennent ici.",
            )}
          >
            {t("Par défaut")}
          </span>
        )}
      </LaneHeader>
      {!collapsed && (
        <LaneCards
          planning={planning}
          images={images}
          issues={lane.items}
          goalId={null}
          empty={null}
        />
      )}
    </div>
  );
}

function GoalLane({
  planning,
  images,
  lane,
  index,
  count,
}: {
  planning: PlanningViewModel;
  images: ImageCache;
  lane: PlanningLane;
  index: number;
  count: number;
}) {
  const { goal } = lane;
  const disabled = planning.gesturesDisabled.value;
  const textMode = planning.goalMode.value === "text";
  const points = planning.sprintLoad.value?.unit === "pts";
  // Objectif atteint : tous ses tickets sont dans la dernière colonne du board.
  const completed = lane.issueCount > 0 && lane.progress.done.count === lane.issueCount;
  const drop = useDrop({
    type: PLANNING_DRAG_TYPE,
    disabled,
    onDrop: (keys) => void placeKeys(planning, keys, goal.id),
  });
  return (
    <section
      class={`lane planning-lane${drop.over ? " planning-drop-active" : ""}`}
      data-goal-color={goal.color}
      data-planning-goal={goal.id}
      aria-label={t("Objectif {p0} : {p1}", { p0: index + 1, p1: goal.title })}
      {...drop.handlers}
    >
      <LaneHeader
        completed={completed}
        title={
          <>
            <GoalMarker completed={completed} />
            {textMode ? (
              <GoalTitle
                goal={goal}
                index={index}
                disabled={disabled}
                onRename={(title) =>
                  planning
                    .renameGoal(goal.id, title)
                    .then(
                      () =>
                        planning.snapshot.peek()?.goals.find((current) => current.id === goal.id)
                          ?.title ?? null,
                    )
                }
              />
            ) : (
              <span class="lane-title planning-goal-name">{goal.title}</span>
            )}
          </>
        }
        count={plural(lane.issueCount, "ticket")}
        progress={{ name: goal.title, tallies: lane.progress, points, delivered: lane.delivered }}
      >
        <span class="planning-lane-actions">
          {textMode ? (
            <>
              <button
                type="button"
                class="icon-button"
                aria-label={t("Monter l’objectif {p0}", { p0: index + 1 })}
                title={t("Monter")}
                disabled={disabled || index === 0}
                onClick={() => void planning.moveGoal(goal.id, -1)}
              >
                <Icon name="chevronUp" />
              </button>
              <button
                type="button"
                class="icon-button"
                aria-label={t("Descendre l’objectif {p0}", { p0: index + 1 })}
                title={t("Descendre")}
                disabled={disabled || index === count - 1}
                onClick={() => void planning.moveGoal(goal.id, 1)}
              >
                <Icon name="chevronDown" />
              </button>
              <button
                type="button"
                class="icon-button"
                aria-label={t("Supprimer l’objectif {p0}", { p0: index + 1 })}
                title={t(
                  "Supprimer l'objectif ; ses tickets restent dans le sprint, sans objectif",
                )}
                disabled={disabled}
                onClick={() => void planning.removeGoal(goal.id)}
              >
                <Icon name="trash" />
              </button>
            </>
          ) : (
            // Un Goal affiché seulement parce que des tickets s'y rattachent n'est pas épinglé :
            // rien à retirer.
            planning.snapshot.value?.pinnedGoalIds.includes(goal.id) && (
              <button
                type="button"
                class="icon-button"
                aria-label={t("Retirer l'épinglage de {name}", { name: goal.title })}
                title={t("Retirer l'épinglage du sprint ; le Goal reste dans Atlassian")}
                disabled={disabled}
                onClick={() => void planning.unpinGoal(goal.id)}
              >
                <Icon name="close" />
              </button>
            )
          )}
        </span>
      </LaneHeader>
      <LaneCards
        planning={planning}
        images={images}
        issues={lane.issues}
        goalId={goal.id}
        empty={
          lane.issueCount > 0
            ? t("Aucun ticket ne correspond à la recherche ou aux filtres.")
            : t(
                "Déposez ici les tickets qui rendent ce résultat possible : ils rejoignent le sprint.",
              )
        }
      />
    </section>
  );
}

/**
 * Titre modifiable sur place : écrit dans Jira quand il est validé (Entrée ou sortie du champ),
 * Échap rend le titre de Jira. Un titre vide ou inchangé n'écrit rien.
 */
function GoalTitle({
  goal,
  index,
  disabled,
  onRename,
}: {
  goal: SprintGoal;
  index: number;
  disabled: boolean;
  /** Écrit le titre puis rend celui relu dans Jira (`null` : objectif disparu). */
  onRename(title: string): Promise<string | null>;
}) {
  const [value, setValue] = useState(goal.title);
  // Dernier titre envoyé : la sortie du champ juste après Entrée ne le renvoie pas.
  const sent = useRef<string | null>(null);

  useLayoutEffect(() => {
    setValue(goal.title);
    sent.current = null;
  }, [goal.title]);

  const restore = (input: HTMLInputElement) => {
    input.value = goal.title;
    setValue(goal.title);
  };
  const commit = (input: HTMLInputElement) => {
    const title = input.value.trim();
    if (!title) {
      restore(input);
      return;
    }
    if (title === goal.title || title === sent.current) return;
    sent.current = title;
    void onRename(title).then((jiraTitle) => {
      // Refus ou échec relu sans changement dans Jira : le champ rend le titre de Jira et le
      // même titre peut être renvoyé.
      if (jiraTitle === null || jiraTitle === title || sent.current !== title) return;
      sent.current = null;
      input.value = jiraTitle;
      setValue(jiraTitle);
    });
  };

  return (
    <input
      class="lane-title planning-goal-title"
      type="text"
      aria-label={t("Titre de l’objectif {p0}", { p0: index + 1 })}
      title={goal.title}
      value={value}
      maxLength={500}
      disabled={disabled}
      onInput={(event) => setValue(event.currentTarget.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commit(event.currentTarget);
        } else if (event.key === "Escape") {
          event.preventDefault();
          restore(event.currentTarget);
        }
      }}
      onBlur={(event) => commit(event.currentTarget)}
    />
  );
}

/** Objectifs texte : la ligne « Ajouter l'objectif » ferme la liste. */
function AddGoal({ planning }: { planning: PlanningViewModel }) {
  const [title, setTitle] = useState("");
  const disabled = planning.gesturesDisabled.value;
  return (
    <form
      class="planning-add-goal"
      onSubmit={async (event) => {
        event.preventDefault();
        const trimmed = title.trim();
        if (disabled || !trimmed) return;
        await planning.addGoal(trimmed);
        // Refusé (texte changé dans Jira, titre en double) : la saisie reste, à reprendre.
        if (planning.lanes.value.some((lane) => lane.goal.title === trimmed)) setTitle("");
      }}
    >
      <Icon name="plus" size={16} />
      <input
        type="text"
        aria-label={t("Nouvel objectif du sprint")}
        placeholder={t("Nouvel objectif : le résultat attendu à la fin du sprint")}
        value={title}
        maxLength={500}
        disabled={disabled}
        onInput={(event) => setTitle(event.currentTarget.value)}
      />
      <button type="submit" disabled={disabled || !title.trim()}>
        {t("Ajouter l’objectif")}
      </button>
    </form>
  );
}

/** Goals Atlassian : recherche par nom des Goals existants, puis épinglage. Aucune création. */
function PinGoal({ planning }: { planning: PlanningViewModel }) {
  const [query, setQuery] = useState("");
  const disabled = planning.gesturesDisabled.value;
  const search = planning.goalSearch.value;
  return (
    <div class="planning-pin-goal">
      <label class="planning-add-goal">
        <Icon name="search" size={16} />
        <input
          type="search"
          aria-label={t("Chercher un Goal à épingler")}
          placeholder={t("Chercher un Goal Atlassian par son nom…")}
          value={query}
          onInput={(event) => {
            setQuery(event.currentTarget.value);
            void planning.searchGoals(event.currentTarget.value);
          }}
          onFocus={() => {
            if (!search) void planning.searchGoals(query);
          }}
        />
      </label>
      {search?.loading && <p class="planning-pin-status">{t("Recherche des Goals…")}</p>}
      <ErrorMessage message={search?.error ?? null} />
      {search && !search.loading && !search.error && (
        <ul class="planning-pin-results" aria-label={t("Goals à épingler")}>
          {search.results.map((goal) => (
            <li key={goal.id}>
              <button
                type="button"
                disabled={disabled}
                aria-label={t("Épingler {name}", { name: goalDisplayName(goal) })}
                onClick={() => void planning.pinGoal(goal.id)}
              >
                <Icon name="pin" />
                <span>{goalDisplayName(goal)}</span>
                {goal.key && <small>{goal.key}</small>}
              </button>
            </li>
          ))}
          {search.results.length === 0 && (
            <li class="planning-pin-status">{t("Aucun Goal ne correspond à cette recherche.")}</li>
          )}
        </ul>
      )}
      <p class="planning-pin-note">
        {t("Les Goals se créent dans Atlassian ; le planning épingle les Goals existants.")}
      </p>
    </div>
  );
}

function UnassignedLane({ planning, images }: { planning: PlanningViewModel; images: ImageCache }) {
  const issues = planning.unassigned.value;
  // Sous-sections par swimlane de type (story 8.40), comme les swimlanes du board.
  const typeLanes = planning.unassignedLanes.value;
  const drop = useDrop({
    type: PLANNING_DRAG_TYPE,
    disabled: planning.gesturesDisabled.value,
    onDrop: (keys) => void placeKeys(planning, keys, null),
  });
  return (
    <section
      class={`lane planning-lane planning-unassigned${drop.over ? " planning-drop-active" : ""}`}
      data-planning-goal="unassigned"
      aria-label={t("Sans objectif")}
      {...drop.handlers}
    >
      {typeLanes.length === 0 ? (
        <LaneCards
          planning={planning}
          images={images}
          issues={issues}
          goalId={null}
          empty={
            planning.activeFilterCount.value > 0
              ? t("Aucun ticket ne correspond à la recherche ou aux filtres.")
              : t("Tous les tickets du sprint servent un objectif.")
          }
        />
      ) : (
        typeLanes.map((lane) => (
          <TypeLane
            key={lane.swimlaneId ?? "build"}
            planning={planning}
            images={images}
            lane={lane}
          />
        ))
      )}
    </section>
  );
}

// ─── Cartes ──────────────────────────────────────────────────────────────────
