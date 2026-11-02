import type { ComponentChildren } from "preact";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import type { SprintGoal } from "../../../core/sprintGoals";
import { goalDisplayName, isDoneStatus, type JiraSprint } from "../../../jira/models";
import { language, localize, t } from "../../i18n";
import { type AppMessage, renderMessage } from "../../model/appMessage";
import {
  planningCarryOverGoalMessage,
  QUICK_FILTER_HELP,
  QUICK_FILTER_LABEL,
} from "../../model/coreText";
import type { ImageCache } from "../../model/ImageCache";
import type {
  PlanningIssue,
  PlanningLane,
  PlanningLoad,
  PlanningSection,
  PlanningTally,
  PlanningViewModel,
} from "../../model/PlanningTypes";
import { FilterMenu } from "../board/FilterMenu";
import { type Point, placeDetailsAtPoint, placeFloatingMenu } from "../board/floatingMenu";
import { JiraIcon } from "../board/JiraIcon";
import { formatDay, formatPoints, initials, plural, pluralWord, toggled } from "../format";
import { Icon } from "../Icon";
import { ErrorMessage } from "../Message";
import "../../styles/planning.css";

/** Ticket glissé dans le planning : sa clé. */
export const PLANNING_DRAG_TYPE = "application/x-sprint-goals-planning-issue";
/** Ticket glissé depuis le sprint en préparation : seul lui peut en être retiré. */
export const PLANNING_SPRINT_DRAG_TYPE = "application/x-sprint-goals-planning-sprint-issue";

/**
 * Sprint Planning en direct, dans la grammaire de la page du sprint : chaque geste écrit aussitôt
 * dans Jira par le modèle, puis relit le sprint. La vue n'affecte aucun signal.
 */
export function PlanningView({
  planning,
  images,
  sidebarCollapsed,
  onToggleSidebar,
  onBack,
}: {
  planning: PlanningViewModel;
  /** Icônes Jira (type, priorité) du board, téléchargées une fois avec la session. */
  images: ImageCache;
  sidebarCollapsed: boolean;
  onToggleSidebar(): void;
  onBack(): void;
}) {
  const snapshot = planning.snapshot.value;
  const busy = planning.loading.value || planning.busy.value;
  const search = useRef<HTMLInputElement>(null);
  const filterBar = useRef<HTMLDivElement>(null);

  // `toggle` ne remonte pas : la barre le capte pour garder chaque menu de filtre à l'écran.
  useEffect(() => {
    const bar = filterBar.current;
    if (!bar) return;
    const onToggle = (event: Event) => {
      if (event.target instanceof HTMLDetailsElement) keepFilterPanelInView(event.target);
    };
    bar.addEventListener("toggle", onToggle, true);
    return () => bar.removeEventListener("toggle", onToggle, true);
  }, []);

  // « / » place le curseur dans la recherche, hors d'un champ de saisie ou d'une fenêtre ouverte.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.defaultPrevented) return;
      if (event.altKey || event.ctrlKey || event.metaKey || isTyping(event.target)) return;
      if (document.querySelector('[role="dialog"], dialog[open]')) return;
      event.preventDefault();
      search.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <main class="planning-screen" aria-label="Sprint Planning" aria-busy={busy}>
      <PlanningHeader
        planning={planning}
        sidebarCollapsed={sidebarCollapsed}
        onToggleSidebar={onToggleSidebar}
        onBack={onBack}
      />
      <div ref={filterBar} class="filter-bar planning-filter-bar">
        <label class="filter-search">
          <Icon name="search" />
          <input
            ref={search}
            type="search"
            aria-label={t("Rechercher un ticket à planifier")}
            placeholder={t("Clé, résumé, personne, type, label…")}
            value={planning.search.value}
            onInput={(event) => planning.setSearch(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape" && event.currentTarget.value !== "") {
                event.preventDefault();
                planning.setSearch("");
              }
            }}
          />
          <kbd title={t("Raccourci")}>/</kbd>
        </label>
        <PlanningFilters planning={planning} />
      </div>
      <PlanningMessages planning={planning} />
      {snapshot ? (
        <div class="planning-body">
          <SourcesColumn planning={planning} images={images} />
          <LanesColumn planning={planning} images={images} sprintName={snapshot.sprint.name} />
        </div>
      ) : (
        <div class="board-empty planning-empty">
          <Icon name="goal" size={26} />
          {planning.loading.value ? (
            <p>{t("Lecture de Jira…")}</p>
          ) : planning.noEditableSprint.value ? (
            <>
              <h2>{t("Aucun sprint futur que vous pouvez modifier")}</h2>
              <p>
                {t(
                  "Jira demande le droit « Gérer les sprints » sur les projets du board de chaque sprint. Demandez-le à un administrateur, puis actualisez.",
                )}
              </p>
            </>
          ) : (
            planning.sprints.value.length === 0 && (
              <>
                <h2>{t("Aucun sprint futur")}</h2>
                <p>
                  {t(
                    "Créez un sprint futur dans le backlog Jira, puis actualisez pour préparer ses objectifs et ses stories ici.",
                  )}
                </p>
              </>
            )
          )}
        </div>
      )}
    </main>
  );
}

// ─── Filtres ─────────────────────────────────────────────────────────────────

/**
 * Filtres de la page du sprint, mêmes composants et mêmes règles : « Bloqués », filtres rapides
 * du board Jira, puis Personne, Type, Parent, Statut et Label. Ils s'appliquent au sprint en
 * préparation et à « Où sont les tickets » ; totaux et charge les ignorent.
 */
function PlanningFilters({ planning }: { planning: PlanningViewModel }) {
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
    snapshot.sprintIssues.length +
    snapshot.backlogIssues.length +
    [...snapshot.futureSprints, ...snapshot.activeSprints].reduce(
      (sum, { issues }) => sum + issues.length,
      0,
    );
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

/** Texte d'un avis du modèle dans la langue affichée. */
function text(message: AppMessage): string {
  return renderMessage(message, language.value);
}

/** Écart minimal entre un menu de filtre ouvert et le bord de la fenêtre. */
const PANEL_MARGIN = 8;

/**
 * Menu de filtre ouvert près du bord droit d'une fenêtre étroite : son panneau, aligné sur le
 * bouton, est décalé vers la gauche pour rester à l'écran.
 */
function keepFilterPanelInView(details: HTMLDetailsElement): void {
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

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

// ─── En-tête ─────────────────────────────────────────────────────────────────

function PlanningHeader({
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
  const snapshot = planning.snapshot.value;
  const sprints = planning.sprints.value;
  const sprint =
    snapshot?.sprint ??
    sprints.find((candidate) => candidate.id === planning.selectedSprintId.value) ??
    null;
  const busy = planning.loading.value || planning.busy.value;
  const disabled = planning.gesturesDisabled.value;
  // Seuls les sprints actifs que l'utilisateur peut modifier sont proposés à la clôture.
  const actives = planning.closableSprints.value;
  const single = actives.length === 1 ? actives[0] : undefined;
  const startReason = planning.startDisabledReason.value;
  // Clôture demandée : jusqu'à la fin de sa vérification, même pendant le report qui écrit.
  const status = planning.loading.value
    ? t("Lecture de Jira…")
    : planning.pendingClosure.value
      ? t("Clôture en cours dans Jira…")
      : planning.busy.value
        ? t("Écriture dans Jira…")
        : null;
  const sidebarLabel = sidebarCollapsed
    ? t("Afficher la barre latérale")
    : t("Masquer la barre latérale");

  return (
    <header class="sprint-header planning-header">
      <button
        type="button"
        class="icon-button sidebar-toggle"
        aria-label={sidebarLabel}
        title={sidebarLabel}
        onClick={onToggleSidebar}
      >
        <Icon name="sidebar" size={17} />
      </button>
      <div class="sprint-title">
        <div class="sprint-name">
          <h2>{sprint?.name ?? "Sprint Planning"}</h2>
          {sprint?.state === "future" && <span class="sprint-future">{t("futur")}</span>}
        </div>
        <SprintDates sprint={sprint} />
      </div>
      {sprints.length > 0 && (
        <select
          class="planning-sprint-select"
          aria-label={t("Sprint à préparer")}
          title={t("Sprint à préparer")}
          value={planning.selectedSprintId.value ?? ""}
          disabled={busy}
          onChange={(event) => void planning.selectSprint(Number(event.currentTarget.value))}
        >
          {sprints.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      )}

      {snapshot && (
        <div class="sprint-metrics">
          <VelocityField planning={planning} />
          <SprintLoad load={planning.sprintLoad.value} />
        </div>
      )}

      <div class="sprint-actions">
        {status && (
          <span class="sync-status" aria-live="polite">
            {status}
          </span>
        )}
        <button
          type="button"
          class={`icon-button${busy ? " icon-button-busy" : ""}`}
          aria-label={t("Actualiser")}
          title={t("Relire les tickets depuis Jira")}
          disabled={busy}
          onClick={() => void planning.refresh()}
        >
          <Icon name="refresh" size={17} />
        </button>
        <button
          type="button"
          class="icon-button"
          aria-label={t("Retour au board")}
          title={t("Retour au board")}
          onClick={onBack}
        >
          <Icon name="arrowLeft" size={17} />
        </button>
        {single && (
          <button
            type="button"
            class="planning-close-sprint"
            disabled={disabled}
            title={t("Ouvre la fenêtre de Jira ; vous seul la remplissez et la validez.")}
            onClick={() => planning.closeActiveSprint(single.id)}
          >
            {t("Clôturer {name}", { name: single.name })}
          </button>
        )}
        {actives.length > 1 && (
          <CloseSprintMenu planning={planning} sprints={actives} disabled={disabled} />
        )}
        {snapshot && (
          <span class="planning-start">
            <button
              type="button"
              class="primary planning-start-sprint"
              disabled={disabled || startReason !== null}
              aria-describedby={startReason ? "planning-start-reason" : undefined}
              title={
                startReason
                  ? text(startReason)
                  : t("Ouvre la fenêtre de Jira ; vous seul la remplissez et la validez.")
              }
              onClick={() => planning.startSprint()}
            >
              <Icon name="play" size={15} />
              {t("Démarrer {name}", { name: snapshot.sprint.name })}
            </button>
            {startReason && (
              <small id="planning-start-reason" class="planning-start-reason">
                {text(startReason)}
              </small>
            )}
          </span>
        )}
      </div>
    </header>
  );
}

/**
 * Plusieurs sprints actifs : « Clôturer un sprint » ouvre la liste de leurs noms ; chacun ouvre
 * la fenêtre native de clôture de ce sprint. Échap referme le menu et rend le focus à son bouton.
 */
function CloseSprintMenu({
  planning,
  sprints,
  disabled,
}: {
  planning: PlanningViewModel;
  sprints: readonly JiraSprint[];
  disabled: boolean;
}) {
  const details = useRef<HTMLDetailsElement>(null);
  return (
    <details
      ref={details}
      class="menu lane-menu planning-close-menu"
      onToggle={(event) => {
        const menu = event.currentTarget;
        // Gestes impossibles (geste ou clôture en cours) : le menu ne reste pas ouvert.
        if (disabled && menu.open) menu.open = false;
        placeFloatingMenu(menu);
      }}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !details.current?.open) return;
        event.preventDefault();
        event.stopPropagation();
        details.current.open = false;
        details.current.querySelector("summary")?.focus();
      }}
    >
      <summary
        class="planning-close-sprint"
        aria-disabled={disabled ? "true" : undefined}
        title={t("Ouvre la fenêtre de Jira ; vous seul la remplissez et la validez.")}
      >
        {t("Clôturer un sprint")}
        <Icon name="chevronDown" size={13} />
      </summary>
      <div class="menu-panel">
        <p class="menu-section">{t("Sprints actifs du board")}</p>
        {sprints.map((sprint) => (
          <button
            key={sprint.id}
            type="button"
            data-close-sprint={sprint.id}
            disabled={disabled}
            onClick={() => {
              if (details.current) details.current.open = false;
              planning.closeActiveSprint(sprint.id);
            }}
          >
            {sprint.name}
          </button>
        ))}
      </div>
    </details>
  );
}

function SprintDates({ sprint }: { sprint: JiraSprint | null }) {
  if (!sprint?.startDate && !sprint?.endDate) return null;
  return (
    <span class="sprint-dates">
      {sprint.startDate && formatDay(sprint.startDate)}
      {sprint.endDate && ` → ${formatDay(sprint.endDate)}`}
    </span>
  );
}

function velocityText(velocity: number | null): string {
  return velocity === null ? "" : String(velocity);
}

/**
 * Vélocité partagée : écrite quand le champ est validé (Entrée ou sortie), jamais à la frappe.
 * Échap rend la valeur de Jira ; une valeur inchangée n'écrit rien.
 */
function VelocityField({ planning }: { planning: PlanningViewModel }) {
  const velocity = planning.snapshot.value?.velocity ?? null;
  const unit = planning.sprintLoad.value?.unit ?? "pts";
  const [value, setValue] = useState(velocityText(velocity));
  // Dernière valeur envoyée : la sortie du champ juste après Entrée ne la renvoie pas.
  const sent = useRef<string | null>(null);

  // Avant l'affichage : une relecture remplace la saisie sans effacer une frappe qui suit.
  useLayoutEffect(() => {
    setValue(velocityText(velocity));
    sent.current = null;
  }, [velocity]);

  const restore = (input: HTMLInputElement) => {
    input.value = velocityText(velocity);
    setValue(velocityText(velocity));
  };
  const commit = (input: HTMLInputElement) => {
    const raw = input.value.trim();
    if (input.validity?.badInput) {
      restore(input);
      return;
    }
    const next = raw === "" ? null : Number(raw);
    if (next !== null && !Number.isFinite(next)) {
      restore(input);
      return;
    }
    if (next === velocity || raw === sent.current) return;
    sent.current = raw;
    void planning.saveVelocity(next).then(() => {
      // Refus ou échec relu sans changement dans Jira : le champ rend la valeur de Jira et la
      // même saisie peut être renvoyée.
      const current = planning.snapshot.peek()?.velocity ?? null;
      if (current === next || sent.current !== raw) return;
      sent.current = null;
      input.value = velocityText(current);
      setValue(velocityText(current));
    });
  };

  return (
    <label
      class="planning-velocity"
      title={t("Partagée avec l'équipe dans les données du sprint, écrite quand vous validez.")}
    >
      <span>{t("Vélocité de l'équipe")}</span>
      <input
        type="number"
        min="0"
        step="any"
        inputMode="decimal"
        placeholder="—"
        value={value}
        disabled={planning.gesturesDisabled.value}
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
      <small>{unit === "pts" ? "pts" : pluralWord(2, "ticket")}</small>
    </label>
  );
}

/** Charge du sprint en préparation comparée à la vélocité, dans la grammaire de l'avancement. */
function SprintLoad({ load }: { load: PlanningLoad | null }) {
  if (!load) return null;
  const unit = load.unit === "pts" ? "pts" : pluralWord(load.total, "ticket");
  const velocity = load.velocity;
  const over = velocity !== null && load.total > velocity;
  return (
    <div
      class={`sprint-progress planning-load${over ? " planning-load-over" : ""}`}
      title={t("Charge du sprint comparée à la vélocité de l'équipe")}
    >
      <strong>
        {formatPoints(load.total)}
        {velocity !== null && ` / ${formatPoints(velocity)}`} {unit}
      </strong>
      {velocity !== null && velocity > 0 && (
        <progress
          max={1}
          value={Math.min(1, load.total / velocity)}
          aria-label={t("Charge du sprint comparée à la vélocité de l'équipe")}
        />
      )}
      <span class="sprint-percent">
        {velocity === null
          ? t("vélocité non renseignée")
          : velocity > 0
            ? `${Math.round((load.total / velocity) * 100)} %`
            : ""}
      </span>
      {load.unestimated > 0 && (
        <span class="counter planning-unestimated">
          {t("{p0} sans estimation", { p0: plural(load.unestimated, "ticket") })}
        </span>
      )}
    </div>
  );
}

function PlanningMessages({ planning }: { planning: PlanningViewModel }) {
  const notice = planning.notice.value;
  const warning = planning.goalsWarning.value;
  const error = planning.error.value;
  if (!notice && !warning && !error) return null;
  return (
    <div class="planning-messages" aria-live="polite">
      <ErrorMessage message={error} />
      {notice && <p class="notice notice-info planning-notice">{text(notice)}</p>}
      {warning && <p class="notice notice-warning planning-goals-warning">{text(warning)}</p>}
    </div>
  );
}

// ─── Glisser-déposer ─────────────────────────────────────────────────────────

/** Zone de dépôt d'un ticket glissé portant `type` ; `over` pendant le survol. */
function useDrop(options: { type: string; disabled: boolean; onDrop(key: string): void }) {
  const [over, setOver] = useState(false);
  const accepts = (transfer: DataTransfer | null) =>
    !options.disabled && Boolean(transfer?.types.includes(options.type));
  return {
    over: over && !options.disabled,
    handlers: {
      onDragOver: (event: DragEvent) => {
        if (!accepts(event.dataTransfer)) return;
        event.preventDefault();
        event.stopPropagation();
        if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
        setOver(true);
      },
      onDragLeave: (event: DragEvent) => {
        const current = event.currentTarget;
        if (
          !(event.relatedTarget instanceof Node) ||
          !(current instanceof Node) ||
          !current.contains(event.relatedTarget)
        )
          setOver(false);
      },
      onDrop: (event: DragEvent) => {
        setOver(false);
        if (!accepts(event.dataTransfer)) return;
        event.preventDefault();
        event.stopPropagation();
        const key = event.dataTransfer?.getData(options.type);
        if (key) options.onDrop(key);
      },
    },
  };
}

// ─── Colonne « Où sont les tickets » ─────────────────────────────────────────

function sectionId(section: PlanningSection): string {
  return section.kind === "backlog" ? "backlog" : `${section.kind}-${section.sprint.id}`;
}

/**
 * Autres sprints futurs, backlog et reste à faire du sprint actif (consultation). Un ticket du
 * sprint en préparation déposé sur la colonne retourne au backlog ; sur un sprint futur, il y va.
 */
function SourcesColumn({ planning, images }: { planning: PlanningViewModel; images: ImageCache }) {
  const disabled = planning.gesturesDisabled.value;
  const [folded, setFolded] = useState<ReadonlySet<string>>(new Set());
  const drop = useDrop({
    type: PLANNING_SPRINT_DRAG_TYPE,
    disabled,
    onDrop: (key) => void planning.removeIssue(key, { kind: "backlog" }),
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
    // Le reste à faire du sprint actif ne reçoit rien ; le backlog est la colonne entière.
    disabled: disabled || section.kind !== "sprint",
    onDrop: (key) => {
      if (section.kind === "sprint")
        void planning.removeIssue(key, { kind: "sprint", sprintId: section.sprint.id });
    },
  });
  const readOnlySection = section.kind === "active";
  return (
    <section
      class={`planning-source planning-source-${section.kind}${drop.over ? " planning-drop-active" : ""}`}
      data-planning-section={id}
      aria-label={name}
      {...drop.handlers}
      // Un dépôt sur le reste à faire du sprint actif n'est pas un retour au backlog.
      {...(readOnlySection && {
        onDragOver: (event: DragEvent) => event.stopPropagation(),
        onDrop: (event: DragEvent) => event.stopPropagation(),
      })}
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
        {section.kind === "active" && (
          <span class="planning-state planning-state-active">{t("actif")}</span>
        )}
        <span class="planning-source-meta">{plural(section.issues.length, "ticket")}</span>
      </button>
      {!folded && (
        <div class="planning-source-body" id={`planning-source-${id}`}>
          {readOnlySection && (
            <p class="planning-source-note">
              {t(
                "Reste à faire du sprint actif, en consultation : la fenêtre de clôture de Jira décide où il va.",
              )}
            </p>
          )}
          {section.issues.map((item) => (
            <PlanningCard
              key={item.issue.key}
              planning={planning}
              images={images}
              item={item}
              place={
                readOnlySection || !canJoinSprint(item) ? { kind: "readOnly" } : { kind: "source" }
              }
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

function LanesColumn({
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
    <section class="planning-lanes" aria-label={t("{name} par objectifs", { name: sprintName })}>
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
        />
      ))}
      {issues.length === 0 && <p class="planning-lane-hint">{empty}</p>}
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
  const drop = useDrop({
    type: PLANNING_DRAG_TYPE,
    disabled,
    onDrop: (key) => void planning.placeIssue(key, goal.id),
  });
  return (
    <section
      class={`lane planning-lane${drop.over ? " planning-drop-active" : ""}`}
      data-goal-color={goal.color}
      data-planning-goal={goal.id}
      aria-label={t("Objectif {p0} : {p1}", { p0: index + 1, p1: goal.title })}
      {...drop.handlers}
    >
      <header class="lane-header">
        <span class="goal-ring" aria-hidden="true" />
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
        <span class="lane-count">
          {plural(lane.issueCount, "ticket")}
          {points && ` · ${formatPoints(lane.points)} pts`}
        </span>
        <LaneProgress lane={lane} points={points} />
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
      </header>
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

/** « 3 tickets · 5 pts », ou le seul nombre de tickets sans champ d'estimation. */
function tallyText(tally: PlanningTally, points: boolean): string {
  const tickets = plural(tally.count, "ticket");
  return points ? `${tickets} · ${formatPoints(tally.points)} pts` : tickets;
}

const PROGRESS_PARTS = [
  { category: "todo", status: "new", label: "À faire : {p0}" },
  { category: "inProgress", status: "indeterminate", label: "En cours : {p0}" },
  { category: "done", status: "done", label: "Terminé : {p0}" },
] as const;

/**
 * Avancement d'un objectif dans la grammaire de la page du sprint : « n/N terminés » et sa barre,
 * puis la répartition à faire, en cours, terminé (tickets et points) ; à part, ce qui a déjà été
 * livré avant ce sprint, jamais compté dans la charge.
 */
function LaneProgress({ lane, points }: { lane: PlanningLane; points: boolean }) {
  const { progress, delivered } = lane;
  const total = lane.issueCount;
  return (
    <>
      {total > 0 && (
        <span class="lane-progress planning-lane-progress">
          <span>
            {t("{done}/{total} terminés", { done: progress.done.count, total })}
            {points && ` · ${formatPoints(progress.done.points)}/${formatPoints(lane.points)} pts`}
          </span>
          <progress
            max={1}
            value={progress.done.count / total}
            aria-label={t("Avancement de {name}", { name: lane.goal.title })}
          />
          <span class="planning-progress-parts">
            {PROGRESS_PARTS.map((part) => {
              const tally = progress[part.category];
              const label = t(part.label, { p0: tallyText(tally, points) });
              return (
                <span
                  key={part.category}
                  class="planning-progress-part"
                  data-status-category={part.status}
                  title={label}
                >
                  <span aria-hidden="true">
                    {points ? formatPoints(tally.points) : tally.count}
                  </span>
                  <span class="visually-hidden">{label}</span>
                </span>
              );
            })}
          </span>
        </span>
      )}
      {delivered && (
        <span
          class="planning-lane-delivered"
          title={t("Tickets terminés avant ce sprint, hors de sa charge")}
        >
          <Icon name="check" size={13} />
          {t("Déjà livré : {p0}", { p0: tallyText(delivered, points) })}
        </span>
      )}
    </>
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
  const drop = useDrop({
    type: PLANNING_DRAG_TYPE,
    disabled: planning.gesturesDisabled.value,
    onDrop: (key) => void planning.placeIssue(key, null),
  });
  return (
    <section
      class={`lane planning-lane planning-unassigned${drop.over ? " planning-drop-active" : ""}`}
      data-planning-goal="unassigned"
      aria-label={t("Sans objectif")}
      {...drop.handlers}
    >
      <header class="lane-header">
        <span class="lane-title">{t("Sans objectif")}</span>
        <span class="lane-count">{plural(issues.length, "ticket")}</span>
        <span class="planning-lane-sub">{t("Dans le sprint, rattachés à aucun objectif")}</span>
      </header>
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
    </section>
  );
}

// ─── Cartes ──────────────────────────────────────────────────────────────────

/**
 * Place d'une carte : dans le sprint en préparation (sur un objectif ou sans), dans une source où
 * on peut la prendre (backlog, autre sprint futur), ou en consultation (reste à faire du sprint
 * actif, sous-tâche, ticket terminé).
 */
type CardPlace =
  | { readonly kind: "sprint"; readonly goalId: string | null }
  | { readonly kind: "source" }
  | { readonly kind: "readOnly" };

/** Ouverture du menu d'une carte ailleurs que sous son bouton ⋯ : clic droit ou clavier. */
interface MenuRequest {
  /** Coin supérieur gauche du panneau, en pixels de la fenêtre. */
  readonly point: Point;
  /** Élément de la carte qui avait le focus, rendu à la fermeture ; à défaut, le bouton ⋯. */
  readonly returnFocus: HTMLElement | null;
}

interface CardMenuHandle {
  openAt(request: MenuRequest): void;
}

/** Catégories de statut d'Atlassian ; toute autre valeur reçoit la teinte neutre. */
const STATUS_CATEGORIES = new Set(["new", "indeterminate", "done"]);

function PlanningCard({
  planning,
  images,
  item,
  place,
  compact = false,
}: {
  planning: PlanningViewModel;
  images: ImageCache;
  item: PlanningIssue;
  place: CardPlace;
  compact?: boolean;
}) {
  const { issue, origin } = item;
  const { fields } = issue;
  const readOnly = place.kind === "readOnly";
  const draggable = !readOnly && !planning.gesturesDisabled.value;
  const points = planning.sprintLoad.value?.unit !== "tickets";
  const menu = useRef<CardMenuHandle | null>(null);
  const category = fields.status.statusCategory?.key;

  /** Menu demandé sur la carte : le focus qu'elle avait lui sera rendu à la fermeture. */
  const requestMenu = (event: Event, point: Point) => {
    const card = event.currentTarget as HTMLElement;
    const focused = document.activeElement;
    menu.current?.openAt({
      point,
      returnFocus: focused instanceof HTMLElement && card.contains(focused) ? focused : null,
    });
  };

  return (
    <article
      class={`card planning-card${compact ? " planning-card-compact" : ""}${readOnly ? " planning-card-readonly" : ""}${origin ? " planning-card-arrived" : ""}`}
      data-planning-issue={issue.key}
      draggable={draggable}
      onDragStart={(event) => {
        if (!draggable || !event.dataTransfer) {
          event.preventDefault();
          return;
        }
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData(PLANNING_DRAG_TYPE, issue.key);
        if (place.kind === "sprint")
          event.dataTransfer.setData(PLANNING_SPRINT_DRAG_TYPE, issue.key);
      }}
      // En consultation, aucun menu de l'extension : celui du navigateur reste.
      onContextMenu={
        readOnly
          ? undefined
          : (event) => {
              event.preventDefault();
              // Dans le menu déjà ouvert (⋯ compris) : ni second menu, ni menu du navigateur
              // par-dessus. La touche Menu envoie aussi `contextmenu` au relâchement.
              if (inOpenMenu(event.target)) return;
              // Bouton droit, Ctrl+clic macOS, appui long ou stylet : au pointeur. Un menu demandé
              // au clavier arrive sans bouton droit ni position : il s'ouvre sous la carte.
              const pointer = event.button === 2 || event.clientX !== 0 || event.clientY !== 0;
              requestMenu(
                event,
                pointer ? { x: event.clientX, y: event.clientY } : belowCard(event),
              );
            }
      }
      onKeyDown={
        readOnly
          ? undefined
          : (event) => {
              if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return;
              event.preventDefault();
              if (inOpenMenu(event.target)) return;
              requestMenu(event, belowCard(event));
            }
      }
    >
      <div class="card-top">
        <JiraIcon url={fields.issuetype.iconUrl} label={fields.issuetype.name} images={images} />
        <button
          type="button"
          class="card-key planning-issue-link"
          aria-label={t("Ouvrir {p0} dans Jira", { p0: issue.key })}
          title={t("Ouvrir {p0} dans Jira", { p0: issue.key })}
          onClick={() => planning.openIssue(issue.key)}
        >
          {issue.key}
        </button>
        {(fields.priority || !readOnly) && (
          <span class="card-marks">
            {fields.priority && (
              <JiraIcon
                url={fields.priority.iconUrl}
                label={fields.priority.name}
                images={images}
              />
            )}
            {!readOnly && (
              <CardMenu planning={planning} issueKey={issue.key} place={place} handle={menu} />
            )}
          </span>
        )}
      </div>
      <p class="card-summary planning-card-title">{fields.summary}</p>
      {(fields.parent || origin) && (
        <div class="card-badges">
          {fields.parent && (
            <span
              class="badge badge-field planning-card-parent"
              title={fields.parent.summary ?? ""}
            >
              {fields.parent.summary ?? fields.parent.key}
            </span>
          )}
          {origin && (
            <span class="badge badge-added planning-origin">
              {origin.kind === "backlog"
                ? t("Vient du backlog")
                : t("Vient de {name}", { name: origin.sprintName })}
            </span>
          )}
        </div>
      )}
      <div class="card-bottom">
        <span class="card-alerts">
          <span
            class="planning-status"
            data-status-category={
              category && STATUS_CATEGORIES.has(category) ? category : "unknown"
            }
            title={t("Statut Jira : {name}", { name: fields.status.name })}
          >
            {fields.status.name}
          </span>
        </span>
        <span class="card-owner">
          {points && (
            <span
              class={`card-points${item.estimate === null ? " planning-card-unestimated" : ""}`}
              title={item.estimate === null ? t("Sans estimation") : t("Estimation Jira")}
            >
              {item.estimate === null ? "?" : formatPoints(item.estimate)}
            </span>
          )}
          {fields.assignee ? (
            <span class="avatar" title={fields.assignee.displayName}>
              {initials(fields.assignee.displayName)}
            </span>
          ) : (
            <span class="avatar avatar-empty" title={t("Non assigné")} />
          )}
        </span>
      </div>
    </article>
  );
}

/** Point d'ouverture d'un menu demandé au clavier : sous le coin gauche de la carte. */
function belowCard(event: Event): Point {
  const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
  return { x: box.left, y: box.bottom };
}

function inOpenMenu(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest("details[open]") !== null;
}

/**
 * Menu ⋯ d'une carte. Dans le sprint en préparation : objectifs, « Sans objectif », retour au
 * backlog ou vers un autre sprint futur. Ailleurs : poser le ticket sur un objectif, ce qui
 * l'ajoute au sprint. Échap le referme et rend le focus à son bouton.
 *
 * La carte peut aussi l'ouvrir au point d'un clic droit, ou sous elle au clavier (`handle`) : le
 * focus va alors à la première entrée active, puis revient, à la fermeture, à l'élément de la
 * carte qui l'avait.
 */
function CardMenu({
  planning,
  issueKey,
  place,
  handle,
}: {
  planning: PlanningViewModel;
  issueKey: string;
  place: CardPlace;
  handle: { current: CardMenuHandle | null };
}) {
  const details = useRef<HTMLDetailsElement>(null);
  // Ouverture en cours au point demandé ; `null` quand le menu s'ouvre sous son bouton.
  const atPoint = useRef<MenuRequest | null>(null);
  const disabled = planning.gesturesDisabled.value;
  const inSprint = place.kind === "sprint";
  const current = place.kind === "sprint" ? place.goalId : undefined;
  const others = planning.snapshot.value?.futureSprints.map((entry) => entry.sprint) ?? [];

  handle.current = {
    openAt(request) {
      const menu = details.current;
      if (!menu) return;
      atPoint.current = request;
      menu.open = true;
      // Placé tout de suite : l'événement `toggle` arrive plus tard, ou pas du tout si le menu
      // était déjà ouvert par son bouton.
      placeDetailsAtPoint(menu, request.point);
      const first = menu.querySelector<HTMLElement>(".menu-panel button:not(:disabled)");
      // Sans défilement : un ⋯ à demi caché ferait défiler la colonne, ce qui referme le menu.
      (first ?? menu.querySelector("summary"))?.focus({ preventScroll: true });
    },
  };

  /** Referme le menu et rend le focus à l'élément qui l'avait. */
  const close = () => {
    const menu = details.current;
    if (!menu) return;
    const target = atPoint.current?.returnFocus ?? menu.querySelector("summary");
    atPoint.current = null;
    menu.open = false;
    if (target?.isConnected) target.focus();
  };
  const act = (action: () => Promise<void>) => {
    close();
    void action();
  };
  return (
    <details
      ref={details}
      class="menu lane-menu planning-card-menu"
      onToggle={(event) => {
        const menu = event.currentTarget;
        const request = atPoint.current;
        if (!menu.open) {
          placeFloatingMenu(menu);
          atPoint.current = null;
          // Refermé autrement (défilement, clic sur ⋯) : le focus, perdu ou resté sur une entrée
          // cachée, revient à l'élément qui l'avait, sinon au ⋯.
          const focused = document.activeElement;
          const panel = menu.querySelector(".menu-panel");
          const target = request?.returnFocus?.isConnected
            ? request.returnFocus
            : menu.querySelector("summary");
          if (!focused || focused === document.body || panel?.contains(focused))
            target?.focus({ preventScroll: true });
        } else if (request) {
          // Déjà placé par `openAt` : le replacer ferait perdre son focus à l'entrée choisie.
          if (!("placed" in menu.dataset)) placeDetailsAtPoint(menu, request.point);
        } else {
          placeFloatingMenu(menu);
        }
      }}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !details.current?.open) return;
        event.preventDefault();
        event.stopPropagation();
        close();
      }}
    >
      <summary aria-label={t("Actions sur {p0}", { p0: issueKey })} title={t("Actions")}>
        ⋯
      </summary>
      <div class="menu-panel">
        <p class="menu-section">{inSprint ? t("Objectif") : t("Ajouter au sprint")}</p>
        {planning.lanes.value.map((lane) => (
          <button
            key={lane.goal.id}
            type="button"
            class="planning-menu-goal"
            data-goal-color={lane.goal.color}
            aria-current={current === lane.goal.id ? "true" : undefined}
            disabled={disabled || current === lane.goal.id}
            onClick={() => act(() => planning.placeIssue(issueKey, lane.goal.id))}
          >
            <span class="goal-ring" aria-hidden="true" />
            {lane.goal.title}
          </button>
        ))}
        <button
          type="button"
          aria-current={current === null ? "true" : undefined}
          disabled={disabled || current === null}
          onClick={() => act(() => planning.placeIssue(issueKey, null))}
        >
          {t("Sans objectif")}
        </button>
        {inSprint && (
          <>
            <hr class="menu-separator" />
            <button
              type="button"
              disabled={disabled}
              onClick={() => act(() => planning.removeIssue(issueKey, { kind: "backlog" }))}
            >
              {t("Renvoyer au backlog")}
            </button>
            {others.map((sprint) => (
              <button
                key={sprint.id}
                type="button"
                disabled={disabled}
                onClick={() =>
                  act(() => planning.removeIssue(issueKey, { kind: "sprint", sprintId: sprint.id }))
                }
              >
                {t("Vers {name}", { name: sprint.name })}
              </button>
            ))}
          </>
        )}
      </div>
    </details>
  );
}
