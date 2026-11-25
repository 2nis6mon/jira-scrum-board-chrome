import { useLayoutEffect, useRef, useState } from "preact/hooks";
import type { JiraSprint } from "../../../jira/models";
import { t } from "../../i18n";
import type { PlanningLoad, PlanningViewModel } from "../../model/PlanningTypes";
import { placeFloatingMenu } from "../board/floatingMenu";
import { formatDay, formatPoints, plural, pluralWord } from "../format";
import { FullscreenButton, useFullscreen } from "../fullscreen";
import { Icon } from "../Icon";
import { StackedBar } from "../LaneHeader";
import { ErrorMessage } from "../Message";
import { text } from "./planningText";

export function PlanningHeader({
  planning,
  sidebarCollapsed,
  onToggleSidebar,
}: {
  planning: PlanningViewModel;
  sidebarCollapsed: boolean;
  onToggleSidebar(): void;
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
  // Clôturer et Démarrer s'alternent : un sprint actif se clôture, sans sprint actif on démarre.
  const hasActiveSprint = planning.activeSprints.value.length > 0;
  const fullscreen = useFullscreen();
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
          {/* Le titre est aussi le sélecteur : le menu natif le recouvre, sans doublon du nom. */}
          <div class={`sprint-picker${sprints.length > 0 ? " sprint-picker-active" : ""}`}>
            <h2>{sprint?.name ?? "Sprint Planning"}</h2>
            {sprints.length > 0 && (
              <>
                <Icon name="chevronDown" size={16} />
                <select
                  class="planning-sprint-select"
                  aria-label={t("Sprint à préparer")}
                  title={t("Sprint à préparer")}
                  value={planning.selectedSprintId.value ?? ""}
                  disabled={busy}
                  onChange={(event) =>
                    void planning.selectSprint(Number(event.currentTarget.value))
                  }
                >
                  {sprints.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </>
            )}
          </div>
          {sprint?.state === "future" && <span class="sprint-future">{t("futur")}</span>}
        </div>
        <SprintDates sprint={sprint} />
      </div>

      {snapshot && (
        <div class="sprint-metrics">
          <VelocityField planning={planning} />
          <SprintLoad load={planning.sprintLoad.value} />
          <UnmappedNote count={planning.unmappedCount.value} />
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
        <FullscreenButton fullscreen={fullscreen} />
        {single && (
          <button
            type="button"
            class="primary planning-sprint-action planning-close-sprint"
            disabled={disabled}
            title={t("Ouvre la fenêtre de Jira ; vous seul la remplissez et la validez.")}
            onClick={() => planning.closeActiveSprint(single.id)}
          >
            <Icon name="check" size={15} />
            {t("Clôturer {name}", { name: single.name })}
          </button>
        )}
        {actives.length > 1 && (
          <CloseSprintMenu planning={planning} sprints={actives} disabled={disabled} />
        )}
        {snapshot && !hasActiveSprint && (
          <span class="planning-start">
            <button
              type="button"
              class="primary planning-sprint-action planning-start-sprint"
              disabled={disabled || startReason !== null}
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
        class="planning-sprint-action planning-close-sprint"
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

/**
 * Tickets du sprint en préparation dont le statut n'est dans aucune colonne visible : ni affichés ni
 * comptés, comme sur le board ; l'avis le dit, avec le même texte.
 */
function UnmappedNote({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span class="counter planning-unmapped">
      {t(
        count === 1
          ? "{issues} du {scope} a un statut qui n'appartient à aucune colonne visible du board : non affiché, comme dans Jira."
          : "{issues} du {scope} ont un statut qui n'appartient à aucune colonne visible du board : non affichés, comme dans Jira.",
        { issues: plural(count, "ticket"), scope: "sprint" },
      )}
    </span>
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
        <StackedBar
          max={1}
          label={t("Charge du sprint comparée à la vélocité de l'équipe")}
          segments={[
            {
              tone: over ? "over" : "inProgress",
              value: Math.min(1, load.total / velocity),
              label: `${Math.round((load.total / velocity) * 100)} %`,
            },
          ]}
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

export function PlanningMessages({ planning }: { planning: PlanningViewModel }) {
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
