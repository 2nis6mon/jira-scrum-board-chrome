import { localize, t } from "../../i18n";
import { QUICK_FILTER_HELP, QUICK_FILTER_LABEL } from "../../model/coreText";
import type { PlanningViewModel } from "../../model/PlanningTypes";
import { FilterMenu } from "../board/FilterMenu";
import { plural, toggled } from "../format";
import { Icon } from "../Icon";

/**
 * Filtres de la page du sprint, mêmes composants et mêmes règles : « Bloqués », filtres rapides
 * du board Jira, puis Personne, Type, Parent, Statut et Label. Ils s'appliquent au sprint en
 * préparation et à « Où sont les tickets » ; totaux et charge les ignorent.
 */
export function PlanningFilters({ planning }: { planning: PlanningViewModel }) {
  const options = planning.filterOptions.value;
  if (!options) return null;
  const filters = planning.filters.value;
  const set = planning.setFilters.bind(planning);
  const count = planning.activeFilterCount.value;
  return (
    <>
      <span class="filter-separator" aria-hidden="true" />
      <button
        type="button"
        class="chip chip-blocked"
        aria-pressed={filters.quickFilters.has("blocked")}
        title={localize(QUICK_FILTER_HELP.blocked)}
        onClick={() => planning.toggleBlocked()}
      >
        <Icon name="blocked" />
        {localize(QUICK_FILTER_LABEL.blocked)}
      </button>
      <PlanningJiraQuickFilters planning={planning} />
      <span class="filter-separator" aria-hidden="true" />
      <FilterMenu
        label={t("Personne")}
        icon="person"
        options={options.assignees}
        selected={filters.assigneeIds}
        onToggle={(value) => set({ ...filters, assigneeIds: toggled(filters.assigneeIds, value) })}
        extra={{
          label: t("Non assigné"),
          count: options.unassignedCount,
          checked: filters.includeUnassigned,
          onToggle: () => set({ ...filters, includeUnassigned: !filters.includeUnassigned }),
        }}
      />
      <FilterMenu
        label="Type"
        icon="type"
        options={options.issueTypes}
        selected={filters.issueTypeIds}
        onToggle={(value) =>
          set({ ...filters, issueTypeIds: toggled(filters.issueTypeIds, value) })
        }
      />
      <FilterMenu
        label="Parent"
        icon="parent"
        options={options.parents}
        searchable
        selected={filters.parentKeys}
        onToggle={(value) => set({ ...filters, parentKeys: toggled(filters.parentKeys, value) })}
        extra={{
          label: t("Sans parent"),
          count: options.withoutParentCount,
          checked: filters.includeWithoutParent,
          onToggle: () => set({ ...filters, includeWithoutParent: !filters.includeWithoutParent }),
        }}
      />
      <FilterMenu
        label={t("Statut")}
        icon="status"
        options={options.statuses}
        selected={filters.statusIds}
        onToggle={(value) => set({ ...filters, statusIds: toggled(filters.statusIds, value) })}
      />
      <FilterMenu
        label="Label"
        icon="label"
        options={options.labels}
        selected={filters.labels}
        onToggle={(value) => set({ ...filters, labels: toggled(filters.labels, value) })}
      />
      {count > 0 && (
        <>
          <span class="filter-result">{filterResult(planning)}</span>
          <button type="button" class="filter-reset" onClick={() => planning.resetFilters()}>
            <Icon name="reset" />
            {t("Réinitialiser ({count})", { count })}
          </button>
        </>
      )}
    </>
  );
}

/**
 * « visibles / total » comme sur la page du sprint : cartes du sprint en préparation et des sources
 * retenues par la recherche et les filtres, sur toutes celles du planning.
 */
function filterResult(planning: PlanningViewModel): string {
  const snapshot = planning.snapshot.value;
  if (!snapshot) return "";
  const total =
    planning.sprintIssueCount.value +
    snapshot.backlogIssues.length +
    snapshot.futureSprints.reduce((sum, { issues }) => sum + issues.length, 0);
  const visible =
    planning.lanes.value.reduce((sum, lane) => sum + lane.issues.length, 0) +
    planning.unassigned.value.length +
    planning.sections.value.reduce((sum, section) => sum + section.issues.length, 0);
  return `${visible} / ${plural(total, t("ticket"))}`;
}

/**
 * Filtres rapides définis sur le board Jira, évalués par Jira sur le périmètre du planning ;
 * plusieurs filtres actifs se combinent, comme dans Jira.
 */
function PlanningJiraQuickFilters({ planning }: { planning: PlanningViewModel }) {
  const quickFilters = planning.jiraQuickFilters.value;
  if (quickFilters.length === 0) return null;
  const active = planning.filters.value.jiraQuickFilterIds;
  const applying = planning.applyingQuickFilters.value;
  return (
    <>
      <span class="filter-separator" aria-hidden="true" />
      <fieldset class="jira-quick-filters" aria-busy={applying}>
        <legend class="visually-hidden">{t("Filtres rapides Jira")}</legend>
        <span class="jira-quick-filters-icon" title={t("Filtres rapides du board Jira")}>
          <Icon name="jiraFilters" />
        </span>
        {quickFilters.map((quick) => (
          <button
            key={quick.id}
            type="button"
            class="chip chip-jira"
            aria-pressed={active.has(quick.id)}
            title={[quick.description, t("JQL évalué par Jira : {jql}", { jql: quick.jql })]
              .filter((line) => line !== null && line !== "")
              .join("\n")}
            disabled={applying}
            onClick={() => void planning.toggleJiraQuickFilter(quick.id)}
          >
            {quick.name}
          </button>
        ))}
        {applying && (
          <span class="jira-quick-filters-busy" aria-live="polite">
            {t("Jira filtre…")}
          </span>
        )}
      </fieldset>
    </>
  );
}

/** Écart minimal entre un menu de filtre ouvert et le bord de la fenêtre. */
const PANEL_MARGIN = 8;

/**
 * Menu de filtre ouvert près du bord droit d'une fenêtre étroite : son panneau, aligné sur le
 * bouton, est décalé vers la gauche pour rester à l'écran.
 */
export function keepFilterPanelInView(details: HTMLDetailsElement): void {
  const panel = details.querySelector<HTMLElement>(".filter-menu-panel");
  if (!panel) return;
  panel.style.removeProperty("left");
  if (!details.open) return;
  const box = panel.getBoundingClientRect();
  const overflow = box.right - (window.innerWidth - PANEL_MARGIN);
  if (overflow <= 0) return;
  const shift = Math.min(overflow, Math.max(0, box.left - PANEL_MARGIN));
  panel.style.left = `${-shift}px`;
}

// ─── En-tête ─────────────────────────────────────────────────────────────────
