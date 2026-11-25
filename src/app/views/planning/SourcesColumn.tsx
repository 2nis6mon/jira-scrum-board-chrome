import { useState } from "preact/hooks";
import { isDoneStatus } from "../../../jira/models";
import { t } from "../../i18n";
import type { ImageCache } from "../../model/ImageCache";
import type { PlanningIssue, PlanningSection, PlanningViewModel } from "../../model/PlanningTypes";
import { plural } from "../format";
import { Icon } from "../Icon";
import { PlanningCard } from "./PlanningCard";
import { PLANNING_SPRINT_DRAG_TYPE, removeKeys, sectionId, useDrop } from "./planningDrag";

/**
 * Autres sprints futurs et backlog, d'où les tickets rejoignent le sprint en préparation ; le sprint
 * actif n'y figure pas (story 8.31). Un ticket du sprint en préparation déposé sur la colonne
 * retourne au backlog ; sur un sprint futur, il y va.
 */
export function SourcesColumn({
  planning,
  images,
}: {
  planning: PlanningViewModel;
  images: ImageCache;
}) {
  const disabled = planning.gesturesDisabled.value;
  const [folded, setFolded] = useState<ReadonlySet<string>>(new Set());
  const drop = useDrop({
    type: PLANNING_SPRINT_DRAG_TYPE,
    disabled,
    onDrop: (keys) => void removeKeys(planning, keys, { kind: "backlog" }),
  });
  const toggle = (id: string) => {
    const next = new Set(folded);
    if (!next.delete(id)) next.add(id);
    setFolded(next);
  };
  return (
    <aside
      class={`planning-sources${drop.over ? " planning-drop-active" : ""}`}
      aria-label={t("Où sont les tickets")}
      data-planning-drop="backlog"
      data-drag-scroll
      {...drop.handlers}
    >
      <h2 class="planning-sources-title">{t("Où sont les tickets")}</h2>
      {planning.sections.value.map((section) => (
        <SourceSection
          key={sectionId(section)}
          planning={planning}
          images={images}
          section={section}
          folded={folded.has(sectionId(section))}
          onToggle={() => toggle(sectionId(section))}
        />
      ))}
      <p class="planning-sources-hint">
        {t("Déposez ici un ticket du sprint en préparation pour le renvoyer au backlog.")}
      </p>
    </aside>
  );
}

function SourceSection({
  planning,
  images,
  section,
  folded,
  onToggle,
}: {
  planning: PlanningViewModel;
  images: ImageCache;
  section: PlanningSection;
  folded: boolean;
  onToggle(): void;
}) {
  const disabled = planning.gesturesDisabled.value;
  const id = sectionId(section);
  const name = section.kind === "backlog" ? "Backlog" : section.sprint.name;
  const drop = useDrop({
    type: PLANNING_SPRINT_DRAG_TYPE,
    // Le backlog est la colonne entière.
    disabled: disabled || section.kind !== "sprint",
    onDrop: (keys) => {
      if (section.kind === "sprint")
        void removeKeys(planning, keys, { kind: "sprint", sprintId: section.sprint.id });
    },
  });
  return (
    <section
      class={`planning-source planning-source-${section.kind}${drop.over ? " planning-drop-active" : ""}`}
      data-planning-section={id}
      aria-label={name}
      {...drop.handlers}
    >
      <button
        type="button"
        class="planning-source-head"
        aria-expanded={!folded}
        aria-controls={`planning-source-${id}`}
        onClick={onToggle}
      >
        <Icon name="chevronDown" size={13} />
        <span class="planning-source-name">{name}</span>
        {section.kind === "sprint" && (
          <span class="planning-state planning-state-future">{t("futur")}</span>
        )}
        <span class="planning-source-meta">{plural(section.issues.length, "ticket")}</span>
      </button>
      {!folded && (
        <div class="planning-source-body" id={`planning-source-${id}`}>
          {section.issues.map((item) => (
            <PlanningCard
              key={item.issue.key}
              planning={planning}
              images={images}
              item={item}
              place={canJoinSprint(item) ? { kind: "source" } : { kind: "readOnly" }}
              sectionKeys={section.issues.map((entry) => entry.issue.key)}
              compact
            />
          ))}
          {section.issues.length === 0 && (
            <p class="planning-source-empty">
              {planning.activeFilterCount.value > 0
                ? t("Aucun ticket ne correspond à la recherche ou aux filtres.")
                : t("Aucun ticket.")}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

/** Jira refuse d'ajouter au sprint une sous-tâche ou un ticket terminé : consultation. */
function canJoinSprint(item: PlanningIssue): boolean {
  return item.issue.fields.issuetype.subtask !== true && !isDoneStatus(item.issue.fields.status);
}

// ─── Swimlanes du sprint en préparation ──────────────────────────────────────
