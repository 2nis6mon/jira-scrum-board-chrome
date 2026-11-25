import { useLayoutEffect, useRef, useState } from "preact/hooks";
import { t } from "../../i18n";
import type { ImageCache } from "../../model/ImageCache";
import type { PlanningIssue, PlanningViewModel } from "../../model/PlanningTypes";
import { ActionMenu, type MenuEntry } from "../ActionMenu";
import type { Point } from "../board/floatingMenu";
import { JiraIcon } from "../board/JiraIcon";
import { formatPoints, initials } from "../format";
import {
  PLANNING_DRAG_TYPE,
  PLANNING_SPRINT_DRAG_TYPE,
  placeKeys,
  removeKeys,
} from "./planningDrag";

/** Tickets déplacés par un geste sur la carte `key` : toute la sélection si elle en fait partie. */
function gestureKeys(planning: PlanningViewModel, key: string): string[] {
  const selection = planning.selection.value;
  return selection.has(key) && selection.size > 1 ? [...selection] : [key];
}

// ─── Filtres ─────────────────────────────────────────────────────────────────

/**
 * Place d'une carte : dans le sprint en préparation (sur un objectif ou sans), dans une source où
 * on peut la prendre (backlog, autre sprint futur), ou en consultation (reste à faire du sprint
 * actif, sous-tâche, ticket terminé).
 */
type CardPlace =
  | { readonly kind: "sprint"; readonly goalId: string | null }
  | { readonly kind: "source" }
  | { readonly kind: "readOnly" };

/** Ouverture du menu d'une carte : sous son bouton ⋯, au pointeur (clic droit) ou sous la carte. */
interface MenuRequest {
  /** Coin supérieur gauche du panneau, en pixels de la fenêtre. */
  readonly point: Point;
  /** Élément de la carte qui avait le focus, rendu à la fermeture ; à défaut, le bouton ⋯. */
  readonly returnFocus: HTMLElement | null;
}

/**
 * Élément de la carte qui a sa propre action (bouton ⋯, estimation, champ, menu) : son clic n'ouvre
 * pas la fiche. La clé, bouton d'accès au clavier, laisse la carte ouvrir la fiche.
 */
function ownControl(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest(
      "button:not(.planning-issue-link), input, select, textarea, a, summary, [role='menu']",
    ) !== null
  );
}

/** Catégories de statut d'Atlassian ; toute autre valeur reçoit la teinte neutre. */
const STATUS_CATEGORIES = new Set(["new", "indeterminate", "done"]);

export function PlanningCard({
  planning,
  images,
  item,
  place,
  sectionKeys,
  compact = false,
}: {
  planning: PlanningViewModel;
  images: ImageCache;
  item: PlanningIssue;
  place: CardPlace;
  /** Clés de la section de la carte, dans l'ordre affiché (plage Maj+clic). */
  sectionKeys: readonly string[];
  compact?: boolean;
}) {
  const { issue, origin } = item;
  const selected = place.kind !== "readOnly" && planning.selection.value.has(issue.key);
  // Pendant la saisie de l'estimation, la carte ne se glisse pas : le champ garde la souris.
  const [estimating, setEstimating] = useState(false);
  const { fields } = issue;
  const readOnly = place.kind === "readOnly";
  const draggable = !readOnly && !planning.gesturesDisabled.value && !estimating;
  const points = planning.sprintLoad.value?.unit !== "tickets";
  const category = fields.status.statusCategory?.key;
  // Menu ouvert sur la carte, au point demandé (story 8.19).
  const [menu, setMenu] = useState<MenuRequest | null>(null);
  const menuButton = useRef<HTMLButtonElement>(null);

  /** Menu demandé sur la carte : le focus qu'elle avait lui sera rendu à la fermeture. */
  const requestMenu = (event: Event, point: Point) => {
    const card = event.currentTarget as HTMLElement;
    const focused = document.activeElement;
    setMenu({
      point,
      returnFocus: focused instanceof HTMLElement && card.contains(focused) ? focused : null,
    });
  };
  /** Referme le menu ; le focus revient à l'élément qui l'avait, sinon au bouton ⋯. */
  const closeMenu = () => {
    const target = menu?.returnFocus?.isConnected ? menu.returnFocus : menuButton.current;
    setMenu(null);
    target?.focus({ preventScroll: true });
  };

  return (
    <>
      <article
        class={`card planning-card${compact ? " planning-card-compact" : ""}${readOnly ? " planning-card-readonly" : ""}${origin ? " planning-card-arrived" : ""}${selected ? " card-selected planning-card-selected" : ""}`}
        data-planning-issue={issue.key}
        data-selected={selected ? "true" : undefined}
        draggable={draggable}
        onClick={(event) => {
          // Ctrl/Cmd+clic : ajoute ou retire ; Maj+clic : plage dans la même section (8.15). Une
          // carte en consultation ne se sélectionne pas.
          if (event.shiftKey || event.ctrlKey || event.metaKey) {
            event.preventDefault();
            if (readOnly) return;
            if (event.shiftKey) planning.extendSelection(issue.key, sectionKeys);
            else planning.toggleSelection(issue.key);
            return;
          }
          // Clic simple n'importe où sur la carte, clé comprise : fiche native, comme sur le board
          // (story 8.30). Boutons (⋯, estimation), champ et menu de la carte gardent leur action.
          if (event.button !== 0 || event.altKey || ownControl(event.target)) return;
          planning.openIssue(issue.key);
        }}
        // Clic du milieu : nouvel onglet, comme le lien d'une carte du board (story 8.30), sans le
        // défilement automatique que le bouton du milieu lance sous Windows.
        onMouseDown={(event) => {
          if (event.button === 1) event.preventDefault();
        }}
        onAuxClick={(event) => {
          if (event.button !== 1 || ownControl(event.target)) return;
          event.preventDefault();
          const url = planning.issueUrl(issue.key);
          if (url) window.open(url, "_blank", "noopener,noreferrer");
        }}
        onDragStart={(event) => {
          if (!draggable || !event.dataTransfer) {
            event.preventDefault();
            return;
          }
          // Une carte sélectionnée emmène toute la sélection ; seul un lot entièrement dans le
          // sprint en préparation peut en être retiré.
          const keys = gestureKeys(planning, issue.key);
          const sprintKeys = new Set(
            planning.snapshot.value?.sprintIssues.map((entry) => entry.key) ?? [],
          );
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData(PLANNING_DRAG_TYPE, keys.join(" "));
          if (keys.every((key) => sprintKeys.has(key)))
            event.dataTransfer.setData(PLANNING_SPRINT_DRAG_TYPE, keys.join(" "));
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
          {selected && <span class="visually-hidden">{t("Sélectionné")}</span>}
          <button
            type="button"
            class="card-key planning-issue-link"
            aria-label={t("Ouvrir {p0} dans Jira", { p0: issue.key })}
            title={t("Ouvrir {p0} dans Jira", { p0: issue.key })}
            // Clic, Entrée ou Espace : la carte ouvre la fiche, ou sélectionne avec une touche.
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
                <button
                  ref={menuButton}
                  type="button"
                  class="planning-card-menu"
                  aria-label={t("Actions sur {p0}", { p0: issue.key })}
                  title={t("Actions")}
                  aria-haspopup="menu"
                  aria-expanded={menu !== null}
                  onClick={(event) => {
                    // Ni sélection ni autre geste de la carte : le bouton ouvre ou referme le menu.
                    event.stopPropagation();
                    if (menu) {
                      closeMenu();
                      return;
                    }
                    const box = event.currentTarget.getBoundingClientRect();
                    setMenu({
                      point: { x: box.left, y: box.bottom },
                      returnFocus: event.currentTarget,
                    });
                  }}
                >
                  ⋯
                </button>
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
            {points &&
              (planning.canEstimate.value && !readOnly ? (
                <CardEstimate
                  planning={planning}
                  item={item}
                  editing={estimating}
                  onEditing={setEstimating}
                />
              ) : (
                <span
                  class={`card-points${item.estimate === null ? " planning-card-unestimated" : ""}`}
                  title={item.estimate === null ? t("Sans estimation") : t("Estimation Jira")}
                >
                  {item.estimate === null ? "?" : formatPoints(item.estimate)}
                </span>
              ))}
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
      {menu && !readOnly && (
        <PlanningCardMenu
          planning={planning}
          issueKey={issue.key}
          place={place}
          request={menu}
          onClose={closeMenu}
        />
      )}
    </>
  );
}

/**
 * Estimation modifiable sur la carte (story 8.17) : un clic sur la valeur (« ? » si vide) ouvre le
 * champ ; Entrée ou sa sortie écrivent une fois dans Jira (E11), Échap annule. Une valeur vide,
 * invalide ou inchangée n'écrit rien.
 */
function CardEstimate({
  planning,
  item,
  editing,
  onEditing,
}: {
  planning: PlanningViewModel;
  item: PlanningIssue;
  editing: boolean;
  onEditing(editing: boolean): void;
}) {
  const key = item.issue.key;
  const value = item.estimate;
  const input = useRef<HTMLInputElement>(null);
  // Une seule validation par ouverture : la sortie du champ juste après Entrée ne renvoie rien.
  const closed = useRef(false);

  useLayoutEffect(() => {
    if (!editing) return;
    closed.current = false;
    input.current?.focus();
    input.current?.select();
  }, [editing]);

  const close = () => {
    closed.current = true;
    onEditing(false);
  };
  const commit = (field: HTMLInputElement) => {
    if (closed.current) return;
    const raw = field.value.trim();
    const next = raw === "" || field.validity?.badInput ? null : Number(raw);
    close();
    if (next === null || !Number.isFinite(next) || next < 0 || next === value) return;
    void planning.estimateIssue(key, next);
  };

  if (!editing)
    return (
      <button
        type="button"
        class={`card-points planning-estimate${value === null ? " planning-card-unestimated" : ""}`}
        aria-label={t("Estimer {p0}", { p0: key })}
        title={
          value === null ? t("Sans estimation : cliquez pour estimer") : t("Modifier l'estimation")
        }
        disabled={planning.gesturesDisabled.value}
        onClick={(event) => {
          // Avec Ctrl, Cmd ou Maj, le clic sélectionne la carte.
          if (event.ctrlKey || event.metaKey || event.shiftKey) return;
          onEditing(true);
        }}
      >
        {value === null ? "?" : formatPoints(value)}
      </button>
    );
  return (
    <input
      ref={input}
      class="planning-estimate-input"
      type="number"
      min="0"
      max="10000"
      step="any"
      inputMode="decimal"
      aria-label={t("Estimation de {p0}", { p0: key })}
      defaultValue={value === null ? "" : String(value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commit(event.currentTarget);
        } else if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          close();
        }
      }}
      onBlur={(event) => commit(event.currentTarget)}
    />
  );
}

/** Point d'ouverture d'un menu demandé au clavier : sous le coin gauche de la carte. */
function belowCard(event: Event): Point {
  const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
  return { x: box.left, y: box.bottom };
}

function inOpenMenu(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest("details[open], .card-menu") !== null;
}

/**
 * Menu d'une carte, dessiné par le menu commun au board et au planning (story 8.19). Dans le
 * sprint en préparation : « Envoyer vers un goal › » (objectifs avec leur pastille, « Sans
 * objectif »), « Retirer du sprint › » (backlog, autres sprints futurs), puis top et basse
 * priorité (ticket seul). Ailleurs : « Ajouter au sprint › », qui pose le ticket sur un objectif.
 * Une carte sélectionnée applique le choix à toute la sélection (8.15). Échap le referme et rend le
 * focus à l'élément qui l'avait.
 */
function PlanningCardMenu({
  planning,
  issueKey,
  place,
  request,
  onClose,
}: {
  planning: PlanningViewModel;
  issueKey: string;
  place: CardPlace;
  request: MenuRequest;
  onClose(): void;
}) {
  const disabled = planning.gesturesDisabled.value;
  const busy = disabled ? t("Une écriture est en cours") : null;
  const keys = gestureKeys(planning, issueKey);
  const many = keys.length > 1;
  const sprintKeys = new Set(planning.snapshot.value?.sprintIssues.map((entry) => entry.key) ?? []);
  // Un lot ne quitte le sprint en préparation que s'il y est tout entier.
  const inSprint = many ? keys.every((key) => sprintKeys.has(key)) : place.kind === "sprint";
  const current = !many && place.kind === "sprint" ? place.goalId : undefined;
  const others = planning.snapshot.value?.futureSprints.map((entry) => entry.sprint) ?? [];

  const goals: MenuEntry[] = [
    ...planning.lanes.value.map(
      (lane): MenuEntry => ({
        kind: "action",
        id: lane.goal.id,
        color: lane.goal.color,
        label: lane.goal.title,
        current: current === lane.goal.id,
        onSelect: () => void placeKeys(planning, keys, lane.goal.id),
      }),
    ),
    { kind: "separator", id: "unassigned-separator" },
    {
      kind: "action",
      id: "unassigned",
      label: t("Sans objectif"),
      current: current === null,
      onSelect: () => void placeKeys(planning, keys, null),
    },
  ];
  const entries: MenuEntry[] = [];
  if (many)
    entries.push({
      kind: "heading",
      id: "batch",
      label: t("{count} tickets sélectionnés", { count: keys.length }),
    });
  entries.push({
    kind: "submenu",
    id: "goals",
    label:
      inSprint || (many && keys.some((key) => sprintKeys.has(key)))
        ? t("Envoyer vers un goal")
        : t("Ajouter au sprint"),
    reason: busy,
    entries: goals,
  });
  if (inSprint)
    entries.push({
      kind: "submenu",
      id: "sprints",
      label: t("Retirer du sprint"),
      reason: busy,
      entries: [
        {
          kind: "action",
          id: "backlog",
          label: t("Renvoyer au backlog"),
          onSelect: () => void removeKeys(planning, keys, { kind: "backlog" }),
        },
        ...others.map(
          (sprint): MenuEntry => ({
            kind: "action",
            id: `sprint-${sprint.id}`,
            label: t("Vers {name}", { name: sprint.name }),
            onSelect: () =>
              void removeKeys(planning, keys, { kind: "sprint", sprintId: sprint.id }),
          }),
        ),
      ],
    });
  // Top et basse priorité : un ticket seul du sprint en préparation, dans sa swimlane.
  const rank = many ? null : planning.rankOptions(issueKey);
  if (rank) {
    const rankEntry = (edge: "top" | "bottom", label: string): MenuEntry => {
      const blocked = rank[edge];
      return {
        kind: "action",
        id: `rank-${edge}`,
        label,
        reason: blocked === null ? null : rankReason(blocked),
        onSelect: () => void planning.rankIssue(issueKey, edge),
      };
    };
    entries.push(
      { kind: "separator", id: "rank-separator" },
      rankEntry("top", t("Mettre en top priorité")),
      rankEntry("bottom", t("Mettre en basse priorité")),
    );
  }
  return (
    <ActionMenu
      label={t("Actions sur {p0}", { p0: issueKey })}
      point={request.point}
      entries={entries}
      onClose={onClose}
    />
  );
}

function rankReason(reason: "writing" | "first" | "last"): string {
  switch (reason) {
    case "writing":
      return t("Une écriture est en cours");
    case "first":
      return t("Déjà en tête de sa swimlane");
    case "last":
      return t("Déjà en fin de sa swimlane");
  }
}
