import { useEffect, useRef } from "preact/hooks";
import { t } from "../../i18n";
import type { ImageCache } from "../../model/ImageCache";
import type { PlanningViewModel } from "../../model/PlanningTypes";
import { Icon } from "../Icon";
import { isTyping, SelectionChip, useEscapeClearsSelection } from "../SelectionChip";
import "../../styles/planning.css";
import { keepFilterPanelInView, PlanningFilters } from "./PlanningFilters";
import { PlanningHeader, PlanningMessages } from "./PlanningHeader";
import { LanesColumn } from "./PlanningLanes";
import { SourcesColumn } from "./SourcesColumn";

export { PLANNING_DRAG_TYPE, PLANNING_SPRINT_DRAG_TYPE } from "./planningDrag";

/**
 * Sprint Planning en direct, dans la grammaire de la page du sprint : chaque geste écrit aussitôt
 * dans Jira par le modèle, puis relit le sprint. La vue n'affecte aucun signal.
 */
export function PlanningView({
  planning,
  images,
  sidebarCollapsed,
  onToggleSidebar,
}: {
  planning: PlanningViewModel;
  /** Icônes Jira (type, priorité) du board, téléchargées une fois avec la session. */
  images: ImageCache;
  sidebarCollapsed: boolean;
  onToggleSidebar(): void;
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

  useEscapeClearsSelection(
    () => planning.selection.peek().size > 0,
    () => planning.clearSelection(),
  );

  return (
    <main class="planning-screen" aria-label="Sprint Planning" aria-busy={busy}>
      <PlanningHeader
        planning={planning}
        sidebarCollapsed={sidebarCollapsed}
        onToggleSidebar={onToggleSidebar}
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
        <SelectionChip
          count={planning.selection.value.size}
          hint={t("Glissez-les ou ouvrez le menu de l'une d'elles ; Échap vide la sélection.")}
          className="planning-selection"
          onClear={() => planning.clearSelection()}
        />
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

// ─── Sélection ───────────────────────────────────────────────────────────────
