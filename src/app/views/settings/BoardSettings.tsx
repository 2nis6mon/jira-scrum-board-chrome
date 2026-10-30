import type { ComponentChildren, JSX } from "preact";
import { useState } from "preact/hooks";
import { parseBlockIdentifier } from "../../../core/boardBlocks";
import {
  type BoardConfiguration,
  computedSwimlaneName,
  DEFAULT_BUILD_LABEL,
  type IssueTypeConfiguration,
  MAX_DAILY_MINUTES,
  MAX_DAILY_STOCK,
  swimlaneName,
  type TicketSwimlane,
} from "../../../core/boardConfiguration";
import { laneKey } from "../../../core/boardLayout";
import {
  settingsLaneOrder,
  withSettingsLaneMoved,
  withSettingsLaneShifted,
} from "../../../core/boardPreferences";
import {
  AUTO_REFRESH_CHOICES,
  isTypeIn,
  type SettingResult,
  type TypeDestination,
  withAgingThreshold,
  withBuildLabel,
  withDailyMinutes,
  withDailyStockLimit,
  withDefaultBlockOrder,
  withSwimlaneHidden,
  withSwimlaneName,
  withTypeDestination,
} from "../../../core/boardSettings";
import { t } from "../../i18n";
import { sourceText } from "../../model/appMessage";
import type { BoardModel } from "../../model/BoardModel";
import { settingErrorMessage } from "../../model/coreText";
import type { ImageCache } from "../../model/ImageCache";
import { JiraIcon } from "../board/JiraIcon";
import { plural } from "../format";
import { Icon } from "../Icon";
import { CommitInput, Grip, Segmented, Stepper, Switch, useReorder } from "./controls";

/** Types de donnée des glissés de cet onglet : ils n'entrent nulle part ailleurs. */
const LANE_DRAG = "application/x-sprint-goals-settings-lane";
const TYPE_DRAG = "application/x-sprint-goals-settings-type";

/** Enregistre un réglage validé ; rend le message d'erreur s'il est refusé. */
type Commit = (change: (current: BoardConfiguration) => SettingResult) => string | null;
type Apply = (
  change: (current: BoardConfiguration) => BoardConfiguration,
  resync?: boolean,
) => void;

/**
 * Onglet Board : swimlanes et leurs types, dans leur ordre sur le board (les objectifs se
 * rangent sur le board lui-même), puis l'affichage et la daily.
 *
 * Tout s'enregistre aussitôt : un glissé dès qu'il est déposé, une case dès qu'elle change, un
 * champ texte quand on le valide (Entrée, ou sortie du champ). Ranger un type change la lecture
 * des tickets : le board est alors relu dans Jira (lecture seule).
 *
 * Chaque glissé a son équivalent sans souris : poignées aux flèches haut et bas, menu « Déplacer »
 * de chaque type, liste du premier type d'une nouvelle swimlane.
 */
export function BoardSettings({
  board,
  configuration,
}: {
  board: BoardModel;
  configuration: BoardConfiguration;
}) {
  const snapshot = board.snapshot.value;
  const goals = snapshot?.goals ?? [];
  const set: Apply = (change, resync = false) => void board.applySettings(change, { resync });
  const commit: Commit = (change) => {
    const preview = change(configuration);
    if (!preview.ok) return sourceText(settingErrorMessage(preview.error));
    // Appliqué à la configuration la plus récente : deux saisies rapprochées s'additionnent.
    set((current) => {
      const latest = change(current);
      return latest.ok ? latest.configuration : current;
    });
    return null;
  };

  // Un type déposé là où il est déjà ne change rien : ni écriture ni relecture.
  const moveType = (typeId: string, destination: TypeDestination) => {
    if (isTypeIn(configuration, typeId, destination)) return;
    set((current) => withTypeDestination(current, typeId, destination), true);
  };

  // Tickets par swimlane, filtres ignorés ; inconnus tant que le board n'a pas été lu.
  const counts = new Map<string, number>();
  for (const issue of [...(snapshot?.goalIssues ?? []), ...(snapshot?.swimlaneIssues ?? [])]) {
    const key = laneKey(configuration, issue);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const count = (id: string) =>
    snapshot ? (
      <span class="settings-lane-count">{plural(counts.get(id) ?? 0, "ticket")}</span>
    ) : null;

  // Glissé d'une swimlane dans la liste.
  const lanes = settingsLaneOrder(configuration);
  const reorder = useReorder(LANE_DRAG, lanes, (id, before) =>
    set((current) => withSettingsLaneMoved(current, goals, id, before)),
  );
  const shiftLane = (id: string, offset: -1 | 1) =>
    set((current) => withSettingsLaneShifted(current, goals, id, offset));

  // Glissé d'un type vers un groupe : `zone` est le groupe survolé.
  const [draggedType, setDraggedType] = useState<string | null>(null);
  const [zone, setZone] = useState<string | null>(null);
  const endTypeDrag = () => {
    setDraggedType(null);
    setZone(null);
  };
  const typeZone = (zoneId: string, destination: TypeDestination) => ({
    onDragOver: (event: DragEvent) => {
      if (draggedType === null || !event.dataTransfer?.types.includes(TYPE_DRAG)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      if (zone !== zoneId) setZone(zoneId);
    },
    onDragLeave: (event: DragEvent) => {
      const next = event.relatedTarget;
      if (next instanceof Node && (event.currentTarget as Node).contains(next)) return;
      if (zone === zoneId) setZone(null);
    },
    onDrop: (event: DragEvent) => {
      if (draggedType === null || !event.dataTransfer?.types.includes(TYPE_DRAG)) return;
      event.preventDefault();
      const typeId = event.dataTransfer.getData(TYPE_DRAG);
      endTypeDrag();
      if (typeId === draggedType) {
        moveType(typeId, destination);
        if (destination.kind === "newSwimlane") setDraft(null);
      }
    },
  });
  const typeDrag = (type: IssueTypeConfiguration) => ({
    dragging: draggedType === type.id,
    onDragStart: (event: DragEvent) => {
      if (!event.dataTransfer) return;
      event.dataTransfer.setData(TYPE_DRAG, type.id);
      event.dataTransfer.effectAllowed = "move";
      setDraggedType(type.id);
    },
    onDragEnd: endTypeDrag,
  });

  // Nouvelle swimlane en préparation : un nom, puis un premier type (glissé ou choisi).
  const [draft, setDraft] = useState<string | null>(null);
  const openDraft = () => {
    setDraft((current) => current ?? "");
    requestAnimationFrame(() => document.getElementById("settings-new-swimlane")?.focus());
  };

  const chip = (type: IssueTypeConfiguration) => (
    <TypeChip
      key={type.id}
      type={type}
      configuration={configuration}
      images={board.images}
      onMove={(destination) => moveType(type.id, destination)}
      {...typeDrag(type)}
    />
  );
  const typesOf = (swimlane: TicketSwimlane) =>
    swimlane.typeIds.flatMap((id) => {
      const type = configuration.issueTypes.find((candidate) => candidate.id === id);
      return type ? [type] : [];
    });
  const byCategory = (category: IssueTypeConfiguration["category"]) =>
    configuration.issueTypes.filter((type) => type.category === category);
  const buildLabel = configuration.buildSectionLabel || DEFAULT_BUILD_LABEL;
  const dropSlot = (zoneId: string) =>
    zone === zoneId && (
      <li class="settings-drop-slot" aria-hidden="true">
        {t("Déposer ici")}
      </li>
    );

  return (
    <>
      <section class="settings-card settings-lanes-card" aria-labelledby="settings-lanes">
        <header class="settings-card-header">
          <div class="settings-card-title">
            <h2 id="settings-lanes">{t("Swimlanes")}</h2>
            <p class="settings-help">{t("Les objectifs sont prioritaires sur les swimlanes.")}</p>
          </div>
          <button
            type="button"
            class="icon-button settings-icon-button"
            aria-label={t("Relire colonnes et types depuis Jira")}
            title={t("Relire colonnes et types depuis Jira")}
            disabled={board.setupBusy.value}
            onClick={() => void board.refreshStructure()}
          >
            <Icon name="refresh" size={16} />
          </button>
          <button
            type="button"
            class="settings-button"
            disabled={configuration.blockOrder.length === 0}
            title={t("Objectifs dans leur ordre d'arrivée, puis {v0} et les swimlanes par type", {
              v0: buildLabel,
            })}
            onClick={() => set(withDefaultBlockOrder)}
          >
            <Icon name="reset" size={14} />
            {t("Réinitialiser l'ordre")}
          </button>
          <button type="button" class="settings-button primary" onClick={openDraft}>
            <Icon name="plus" size={14} />
            {t("Nouvelle swimlane")}
          </button>
        </header>

        <ol class="settings-lanes">
          {lanes.map((id) => {
            const block = parseBlockIdentifier(id);
            const rowProps = {
              "data-reorder-row": true,
              "data-drop": reorder.marker(id),
            };
            if (block?.kind === "build") {
              const types = typeZone("goal", { kind: "goal" });
              const defaultTypes = byCategory("GOAL");
              return (
                <li
                  key={id}
                  class={[
                    "settings-lane settings-lane-build",
                    reorder.dragged === id ? "is-dragging" : "",
                    zone === "goal" ? "is-type-target" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  {...rowProps}
                  onDragOver={(event) => {
                    reorder.over(id)(event);
                    types.onDragOver(event);
                  }}
                  onDragLeave={types.onDragLeave}
                  onDrop={(event) => {
                    reorder.drop(event);
                    types.onDrop(event);
                  }}
                >
                  <div class="settings-lane-head">
                    <Grip
                      label={t("Déplacer la swimlane {v0}", { v0: buildLabel })}
                      onMove={(offset) => shiftLane(id, offset)}
                      onDragStart={reorder.start(id)}
                      onDragEnd={reorder.end}
                    />
                    <span class="settings-lane-icon settings-lane-icon-build" aria-hidden="true">
                      <Icon name="build" size={15} />
                    </span>
                    <span class="settings-lane-field">
                      <label class="settings-caption" for="settings-build-label">
                        {t("Nom de la swimlane par défaut")}
                      </label>
                      <CommitInput
                        id="settings-build-label"
                        class="settings-lane-name"
                        value={configuration.buildSectionLabel}
                        placeholder={DEFAULT_BUILD_LABEL}
                        onCommit={(raw) => {
                          set((current) => withBuildLabel(current, raw));
                          return null;
                        }}
                      />
                    </span>
                    {count(id)}
                    <span class="settings-badge settings-badge-default">{t("Default")}</span>
                  </div>
                  <ul class="settings-chips" aria-label={t("Types Default")}>
                    {defaultTypes.map(chip)}
                    {defaultTypes.length === 0 && zone !== "goal" && (
                      <li class="settings-chips-empty">{t("Aucun type.")}</li>
                    )}
                    {dropSlot("goal")}
                  </ul>
                </li>
              );
            }
            const swimlane =
              block?.kind === "swimlane"
                ? configuration.ticketSwimlanes.find((item) => item.id === block.swimlaneId)
                : undefined;
            if (!swimlane) return null;
            const name = swimlaneName(configuration, swimlane);
            const zoneId = `swimlane:${swimlane.id}`;
            const types = typeZone(zoneId, { kind: "swimlane", swimlaneId: swimlane.id });
            return (
              <li
                key={id}
                class={[
                  "settings-lane settings-lane-swimlane",
                  swimlane.hidden ? "is-hidden" : "",
                  reorder.dragged === id ? "is-dragging" : "",
                  zone === zoneId ? "is-type-target" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                {...rowProps}
                onDragOver={(event) => {
                  reorder.over(id)(event);
                  types.onDragOver(event);
                }}
                onDragLeave={types.onDragLeave}
                onDrop={(event) => {
                  reorder.drop(event);
                  types.onDrop(event);
                }}
              >
                <div class="settings-lane-head">
                  <Grip
                    label={t("Déplacer la swimlane {v0}", { v0: name })}
                    onMove={(offset) => shiftLane(id, offset)}
                    onDragStart={reorder.start(id)}
                    onDragEnd={reorder.end}
                  />
                  <span class="settings-lane-icon" aria-hidden="true">
                    <Icon name="kanban" size={15} />
                  </span>
                  <span class="settings-lane-field">
                    <CommitInput
                      class="settings-lane-name"
                      label={t("Nom de la swimlane {v0}", { v0: name })}
                      value={swimlane.name}
                      placeholder={computedSwimlaneName(configuration, swimlane)}
                      onCommit={(raw) => {
                        set((current) => withSwimlaneName(current, swimlane.id, raw));
                        return null;
                      }}
                    />
                  </span>
                  {count(id)}
                  {swimlane.hidden && <span class="settings-badge">{t("Masquée")}</span>}
                  <Switch
                    checked={!swimlane.hidden}
                    label={t("Afficher la swimlane {v0}", { v0: name })}
                    text={t("Affichée")}
                    onChange={(checked) =>
                      set((current) => withSwimlaneHidden(current, swimlane.id, !checked))
                    }
                  />
                </div>
                <ul
                  class="settings-chips"
                  aria-label={t("Types de la swimlane {v0}", { v0: name })}
                >
                  {typesOf(swimlane).map(chip)}
                  {dropSlot(zoneId)}
                </ul>
              </li>
            );
          })}
          {draft !== null && (
            <li
              class={`settings-lane settings-lane-draft${zone === "draft" ? " is-type-target" : ""}`}
              {...typeZone("draft", { kind: "newSwimlane", name: draft })}
            >
              <div class="settings-lane-head">
                <span class="settings-lane-icon" aria-hidden="true">
                  <Icon name="kanban" size={15} />
                </span>
                <span class="settings-lane-field">
                  <label class="settings-caption" for="settings-new-swimlane">
                    {t("Nom de la nouvelle swimlane")}
                  </label>
                  <input
                    id="settings-new-swimlane"
                    type="text"
                    class="settings-lane-name"
                    placeholder={t("ex. Support")}
                    value={draft}
                    onInput={(event) => setDraft(event.currentTarget.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") setDraft(null);
                    }}
                  />
                </span>
                <button type="button" class="settings-button" onClick={() => setDraft(null)}>
                  {t("Annuler")}
                </button>
              </div>
              <div class="settings-draft-drop">
                <span>{t("Glissez un premier type ici, ou choisissez-le :")}</span>
                <select
                  aria-label={t("Premier type de la nouvelle swimlane")}
                  value=""
                  onChange={(event) => {
                    const typeId = event.currentTarget.value;
                    if (!typeId) return;
                    moveType(typeId, { kind: "newSwimlane", name: draft });
                    setDraft(null);
                  }}
                >
                  <option value="">{t("Choisir un type…")}</option>
                  {configuration.issueTypes.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.name}
                    </option>
                  ))}
                </select>
              </div>
              <p class="settings-lane-help">
                {t(
                  "La swimlane est créée avec son premier type ; elle disparaît avec son dernier.",
                )}
              </p>
            </li>
          )}
        </ol>

        <div
          class={`settings-new-lane${zone === "new" ? " is-type-target" : ""}`}
          {...typeZone("new", { kind: "newSwimlane" })}
        >
          <button type="button" class="settings-new-lane-button" onClick={openDraft}>
            <Icon name="plus" size={15} />
            <span>
              <strong>{t("Nouvelle swimlane")}</strong> {t(": cliquez, ou déposez un type ici")}
            </span>
          </button>
        </div>
        <TypeGroup
          title={t("Ignorés")}
          icon="eyeOff"
          help={t("Toujours exclus du board.")}
          types={byCategory("IGNORED")}
          target={zone === "ignored"}
          zone={typeZone("ignored", { kind: "ignored" })}
          chip={chip}
          slot={dropSlot("ignored")}
        />
      </section>

      <section class="settings-card" aria-labelledby="settings-display">
        <header class="settings-card-header">
          <div class="settings-card-title">
            <h2 id="settings-display">{t("Affichage et daily")}</h2>
            <p class="settings-help">{t("Enregistrés dès qu'ils sont modifiés.")}</p>
          </div>
        </header>
        <div class="settings-tiles">
          <Stepper
            id="settings-aging"
            label={t("Seuil « vieillissant »")}
            value={configuration.agingThresholdDays}
            min={1}
            max={365}
            unit={t("jours")}
            help={t("Sans changement de statut : la carte le signale.")}
            onCommit={(raw) => commit((current) => withAgingThreshold(current, raw))}
          />
          <Stepper
            id="settings-daily"
            label={t("Durée de la daily")}
            value={configuration.dailyMinutes}
            min={1}
            max={MAX_DAILY_MINUTES}
            unit={t("minutes")}
            help={t("Minuteur du mode Daily.")}
            onCommit={(raw) => commit((current) => withDailyMinutes(current, raw))}
          />
          <Stepper
            id="settings-daily-stock"
            label={t("Stock en daily")}
            value={configuration.dailyStockLimit}
            min={1}
            max={MAX_DAILY_STOCK}
            unit={t("cartes")}
            help={t("Dans la première colonne de chaque swimlane, avant « + N autres ».")}
            onCommit={(raw) => commit((current) => withDailyStockLimit(current, raw))}
          />
          <div class="settings-tile">
            <span class="settings-tile-label">
              {t("Rafraîchissement automatique")}
              <span class="settings-badge settings-badge-personal">{t("Personnel")}</span>
            </span>
            <Segmented
              label={t("Rafraîchissement automatique")}
              name="settings-auto-refresh"
              value={String(configuration.autoRefreshSeconds ?? "")}
              choices={AUTO_REFRESH_CHOICES.map((seconds) => ({
                id: seconds === null ? "" : String(seconds),
                label: seconds === null ? t("Désactivé") : `${seconds / 60} min`,
              }))}
              onChange={(value) =>
                set((current) => ({
                  ...current,
                  autoRefreshSeconds: value === "" ? null : Number(value),
                }))
              }
            />
            <span class="settings-help">
              {t("Gardé dans ce navigateur. Lecture seule : relit Jira, n'écrit rien.")}
            </span>
          </div>
        </div>
      </section>
    </>
  );
}

/** Types exclus du board ; la zone reçoit aussi les types glissés. */
function TypeGroup(props: {
  title: string;
  icon: "build" | "eyeOff";
  help: string;
  types: readonly IssueTypeConfiguration[];
  target: boolean;
  zone: {
    onDragOver: (event: DragEvent) => void;
    onDragLeave: (event: DragEvent) => void;
    onDrop: (event: DragEvent) => void;
  };
  chip: (type: IssueTypeConfiguration) => JSX.Element;
  slot: ComponentChildren;
}) {
  return (
    <div class={`settings-type-group${props.target ? " is-type-target" : ""}`} {...props.zone}>
      <h3>
        <Icon name={props.icon} size={15} />
        {props.title}
        <span class="settings-type-count">{plural(props.types.length, "type")}</span>
      </h3>
      <p class="settings-help">{props.help}</p>
      <ul class="settings-chips" aria-label={t("Types {v0}", { v0: props.title.toLowerCase() })}>
        {props.types.map(props.chip)}
        {props.types.length === 0 && !props.target && (
          <li class="settings-chips-empty">{t("Aucun type.")}</li>
        )}
        {props.slot}
      </ul>
    </div>
  );
}

/** Type de ticket : glissé d'un groupe à l'autre, ou déplacé par son menu. */
function TypeChip(props: {
  type: IssueTypeConfiguration;
  configuration: BoardConfiguration;
  images: ImageCache;
  dragging: boolean;
  onDragStart: (event: DragEvent) => void;
  onDragEnd: () => void;
  onMove: (destination: TypeDestination) => void;
}) {
  const { type, configuration } = props;
  const destinations: { label: string; destination: TypeDestination }[] = [
    {
      label: t("Default"),
      destination: { kind: "goal" },
    },
    ...configuration.ticketSwimlanes.map((swimlane) => ({
      label: swimlaneName(configuration, swimlane),
      destination: { kind: "swimlane", swimlaneId: swimlane.id } as const,
    })),
    { label: t("Nouvelle swimlane"), destination: { kind: "newSwimlane" } },
    { label: t("Ignorés"), destination: { kind: "ignored" } },
  ];
  return (
    <li
      class={`settings-chip${props.dragging ? " is-dragging" : ""}`}
      data-type-id={type.id}
      draggable
      title={t("Glisser pour choisir la swimlane par défaut de ce type")}
      onDragStart={props.onDragStart}
      onDragEnd={props.onDragEnd}
    >
      <span class="settings-grip-dots settings-chip-grip" aria-hidden="true" />
      <span aria-hidden="true">
        <JiraIcon url={type.iconUrl} label={type.name} images={props.images} />
      </span>
      <span class="settings-chip-name">{type.name}</span>
      <details class="menu settings-chip-menu" name="settings-chip-menu">
        <summary aria-label={t("Déplacer {v0}", { v0: type.name })} title={t("Déplacer vers…")}>
          <Icon name="chevronDown" size={12} />
        </summary>
        <div class="menu-panel">
          <p class="menu-section">{t("Classement sans objectif")}</p>
          {destinations.map(({ label, destination }) => {
            const current = isTypeIn(configuration, type.id, destination);
            return (
              <button
                key={
                  destination.kind === "swimlane"
                    ? `swimlane:${destination.swimlaneId}`
                    : destination.kind
                }
                type="button"
                aria-current={current ? "true" : undefined}
                disabled={current}
                onClick={(event) => {
                  event.currentTarget.closest("details")?.removeAttribute("open");
                  props.onMove(destination);
                }}
              >
                <span class="settings-menu-check">
                  {current && <Icon name="check" size={13} />}
                </span>
                {label}
              </button>
            );
          })}
        </div>
      </details>
    </li>
  );
}
