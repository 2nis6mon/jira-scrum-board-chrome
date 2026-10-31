import type { JiraClient } from "../jira/client";
import { JiraError } from "../jira/errors";
import { isRecord, type JsonValue } from "../jira/json";
import type { JiraStatus, JiraTransition } from "../jira/models";
import { resolveTransition } from "../jira/transitionPlanner";
import type { JiraTransport } from "../jira/transport";
import type { RankChange } from "./dropPlan";
import { CoreError } from "./reasons";
import {
  goalColorName,
  makeSprintGoal,
  SPRINT_GOAL_DOCUMENT_VERSION,
  type SprintGoal,
  type SprintGoalDocument,
  sprintGoalTimestamp,
  updateSprintGoalProperty,
} from "./sprintGoals";

// Écritures du board, dans les catégories validées : transition, rang, rattachement à un
// objectif et épinglage de Goals (propriété du sprint). Chacune part UNE fois ; une lecture la précède quand elle
// sert à vérifier que Jira est toujours dans l'état affiché.

/** Lectures dont les écritures ont besoin. `JiraClient` les fournit. */
export type WriteReader = Pick<JiraClient, "issueStatus" | "transitions" | "sprintProperty">;
/** Seule porte d'écriture : l'inventaire fermé de `writes.ts`. */
export type JiraWriter = Pick<JiraTransport, "write">;

// ─── Transition ──────────────────────────────────────────────────────────────

export type MoveOutcome =
  /** Jira a confirmé la transition. */
  | { kind: "moved"; transition: JiraTransition }
  /** Le ticket est déjà dans un statut de la colonne visée : rien n'a été écrit. */
  | { kind: "alreadyThere" }
  /** Le ticket a changé de statut dans Jira depuis l'affichage : rien n'a été écrit. */
  | { kind: "conflict"; currentStatus: JiraStatus }
  /** La transition exige des champs que l'extension ne remplit pas : rien n'a été écrit. */
  | { kind: "requiresFields"; transition: JiraTransition; fields: string[] }
  /** Plusieurs statuts de destination possibles : rien n'a été écrit avant le choix. */
  | { kind: "choose"; available: JiraTransition[] }
  /** Jira ne propose aucune transition vers la destination. Rien n'a été écrit. */
  | { kind: "noTransition"; currentStatus: JiraStatus };

/**
 * Amène un ticket dans une colonne par une transition DIRECTE proposée par Jira.
 *
 * 1. Relecture du statut : si le ticket a changé dans Jira depuis l'affichage, on s'arrête.
 * 2. Lecture des transitions proposées depuis ce statut.
 * 3. Une seule écriture, jamais rejouée. Pas d'enchaînement de transitions à l'aveugle.
 */
export async function moveToColumn(
  reader: WriteReader,
  writer: JiraWriter,
  input: {
    issueKey: string;
    knownStatusId: string;
    targetStatusIds: readonly string[];
    transitionId?: string;
  },
): Promise<MoveOutcome> {
  const currentStatus = await reader.issueStatus(input.issueKey);
  if (currentStatus.id !== input.knownStatusId) return { kind: "conflict", currentStatus };

  const transitions = await reader.transitions(input.issueKey);
  // Une action retenue pendant le geste reste la seule autorisée, même si l'ordre Jira change.
  // Si elle disparaît ou change de destination, aucune autre transition ne prend sa place.
  const selected =
    input.transitionId === undefined
      ? transitions
      : transitions.filter(
          (transition) =>
            transition.id === input.transitionId &&
            transition.isAvailable !== false &&
            input.targetStatusIds.includes(transition.to.id),
        );
  if (input.transitionId !== undefined && selected.length === 0) {
    return { kind: "noTransition", currentStatus };
  }
  const resolution = resolveTransition(currentStatus.id, input.targetStatusIds, selected);
  switch (resolution.kind) {
    case "alreadyInTargetColumn":
      return { kind: "alreadyThere" };
    case "requiresFields":
      return {
        kind: "requiresFields",
        transition: resolution.transition,
        fields: resolution.fields,
      };
    case "choose":
      return { kind: "choose", available: resolution.available };
    case "unreachable":
      return resolution.available.length === 0
        ? { kind: "noTransition", currentStatus }
        : { kind: "choose", available: resolution.available };
    case "ready":
      await writer.write({
        kind: "issue.transition",
        issueKey: input.issueKey,
        transitionId: resolution.transition.id,
      });
      return { kind: "moved", transition: resolution.transition };
  }
}

// ─── Rang ────────────────────────────────────────────────────────────────────

/**
 * Écrit le rang du board. Jira répond 204, ou 207 quand il a refusé le classement ticket par
 * ticket : ce second cas passe par le chemin du succès HTTP, on relit donc le corps pour ne pas
 * présenter comme réussi un classement refusé.
 */
export async function rankIssue(
  writer: JiraWriter,
  issueKey: string,
  change: RankChange,
): Promise<void> {
  if (change.kind === "none") return;
  const response = await writer.write(
    change.kind === "before"
      ? { kind: "issue.rank", issueKey, before: change.issueKey }
      : { kind: "issue.rank", issueKey, after: change.issueKey },
  );
  const failures = rankFailures(response.body);
  if (failures !== null) {
    // Sans message de Jira, le refus est nommé par core ; l'application en produit le texte.
    if (failures.length === 0) throw new CoreError({ code: "rankRefused", issueKey });
    throw new JiraError({ kind: "badRequest", messages: failures, fieldErrors: {} });
  }
}

/**
 * Messages des tickets refusés dans une réponse 207 (`entries[].status >= 400`), `null` si rien
 * n'a été refusé. La documentation décrit `errors` comme un tableau de chaînes ; un objet de
 * chaînes est aussi lu, par prudence.
 */
export function rankFailures(body: JsonValue | null): string[] | null {
  if (!isRecord(body) || !Array.isArray(body.entries)) return null;
  const failed = body.entries.filter(
    (entry) => isRecord(entry) && typeof entry.status === "number" && entry.status >= 400,
  );
  if (failed.length === 0) return null;
  return failed.flatMap((entry) => {
    const errors = isRecord(entry) ? entry.errors : null;
    const values = Array.isArray(errors) ? errors : isRecord(errors) ? Object.values(errors) : [];
    return values.filter((message): message is string => typeof message === "string");
  });
}

// ─── Rattachement à un objectif du texte du sprint ───────────────────────────

export type LinkOutcome =
  /** Jira a confirmé l'écriture du lien. */
  | { kind: "linked" }
  /** Jira porte déjà exactement ce contenu : rien n'a été écrit. */
  | { kind: "unchanged" }
  /** Le lien du ticket a changé dans Jira depuis le chargement : rien n'a été écrit. */
  | { kind: "conflict"; current: string | null };

/**
 * Rattache (ou détache, `goalId` à `null`) un ticket à un objectif du TEXTE du sprint.
 *
 * Le lien est stocké dans la propriété d'entité du sprint. La propriété est relue juste avant
 * l'écriture et seule l'entrée du ticket change : les autres Goals et liens sont conservés. Le champ
 * « Objectif » du sprint, lui, n'est jamais touché. Avec plusieurs sprints du board, le lien peut
 * viser l'objectif d'un autre sprint (`linkableGoalIds`) : il reste écrit dans ce seul sprint.
 * Si le lien du ticket a changé dans Jira depuis le chargement (`knownGoalId`), rien n'est écrit.
 */
export async function linkToTextGoal(
  reader: Pick<WriteReader, "sprintProperty">,
  writer: JiraWriter,
  input: {
    sprintId: number;
    issueKey: string;
    goalId: string | null;
    /**
     * Lien du ticket lu dans la propriété de ce sprint au chargement (`null` : aucun).
     * `undefined` : base inconnue (propriété non lue), le lien est fusionné sans contrôle.
     */
    knownGoalId?: string | null;
    /**
     * Identifiants des objectifs lus dans la propriété de ce sprint au chargement. `undefined` :
     * propriété non lue, aucun objectif de Jira n'est retiré faute de base.
     */
    knownGoalIds?: readonly string[];
    /** Objectifs de ce sprint, tels que réconciliés à la dernière synchronisation. */
    goals: readonly SprintGoal[];
    /** Objectifs des autres sprints réunis sur le board, auxquels le ticket peut aussi se rattacher. */
    linkableGoalIds?: readonly string[];
    accountId: string | null;
    now: Date;
  },
): Promise<LinkOutcome> {
  const linkable = new Set([
    ...input.goals.map((goal) => goal.id),
    ...(input.linkableGoalIds ?? []),
  ]);
  if (input.goalId !== null && !linkable.has(input.goalId)) {
    throw new CoreError({ code: "goalGone" });
  }
  const linkOf = (document: SprintGoalDocument | null) => document?.links[input.issueKey] ?? null;
  // Seul le lien de ce ticket est modifié : les autres liens sont fusionnés sur Jira frais.
  const outcome = await updateSprintGoalProperty(reader, writer, {
    sprintId: input.sprintId,
    unchangedSince: (fresh) =>
      input.knownGoalId === undefined || linkOf(fresh) === input.knownGoalId,
    mutate: (fresh) => withTextGoalLink(fresh, input),
    accountId: input.accountId,
    now: input.now,
  });
  switch (outcome.kind) {
    case "conflict":
      return { kind: "conflict", current: linkOf(outcome.fresh) };
    case "unchanged":
      return { kind: "unchanged" };
    case "written":
      return { kind: "linked" };
  }
}

/**
 * Document à écrire : le document relu dans Jira, avec le seul lien du ticket modifié.
 *
 * - Les objectifs affichés (`goals`) gardent leurs champs de Jira (identifiant stable, couleur,
 *   champs inconnus) avec le titre et la position du board ; ceux que le board vient de
 *   réconcilier depuis le texte du sprint sont ajoutés.
 * - Un objectif de Jira que le board n'affiche pas et qui figurait déjà dans la propriété au
 *   chargement (`knownGoalIds`) a été écarté par la réconciliation (retiré ou renommé dans le
 *   texte) : il est retiré, avec ses liens.
 * - Un objectif apparu dans Jira depuis le chargement (collègue, publication du planning) est
 *   conservé (champs inconnus compris) avec ses liens, après ceux du board dans l'ordre de Jira,
 *   renuméroté à leur suite. Sans base (`knownGoalIds` inconnu), aucun objectif de Jira n'est
 *   retiré.
 *
 * La couleur écrite est celle déjà présente dans Jira, à défaut la couleur par défaut de sa
 * position — jamais la couleur choisie localement, qui reste un réglage de ce navigateur.
 */
export function withTextGoalLink(
  fresh: SprintGoalDocument | null,
  input: {
    issueKey: string;
    goalId: string | null;
    goals: readonly SprintGoal[];
    knownGoalIds?: readonly string[];
    linkableGoalIds?: readonly string[];
    accountId: string | null;
    now: Date;
  },
): SprintGoalDocument {
  const freshGoals = fresh?.goals ?? [];
  const storedById = new Map(freshGoals.map((goal) => [goal.id, goal]));
  const shown = [...input.goals]
    .sort((a, b) => a.position - b.position)
    .map((goal) => {
      const stored = storedById.get(goal.id);
      return stored
        ? { ...stored, title: goal.title, position: goal.position }
        : makeSprintGoal({
            id: goal.id,
            title: goal.title,
            position: goal.position,
            color: goalColorName(goal.position),
          });
    });
  const shownIds = new Set(shown.map((goal) => goal.id));
  const known = input.knownGoalIds ? new Set(input.knownGoalIds) : null;
  // Objectifs ajoutés dans Jira depuis le chargement : conservés tels quels, dans l'ordre de Jira.
  const added = freshGoals
    .filter((goal) => !shownIds.has(goal.id) && !(known?.has(goal.id) ?? false))
    .sort((a, b) => a.position - b.position)
    // Numérotés à la suite de ceux du board : deux objectifs ne partagent jamais une position.
    .map((goal, index) => ({ ...goal, position: shown.length + index }));
  const goals = [...shown, ...added];

  const validIds = new Set([...goals.map((goal) => goal.id), ...(input.linkableGoalIds ?? [])]);
  const links: Record<string, string> = {};
  for (const [issueKey, goalId] of Object.entries(fresh?.links ?? {})) {
    // Un lien vers un objectif écarté des sprints réunis ne mène plus nulle part.
    if (validIds.has(goalId)) links[issueKey] = goalId;
  }
  if (input.goalId === null) delete links[input.issueKey];
  else links[input.issueKey] = input.goalId;

  return {
    version: fresh?.version ?? SPRINT_GOAL_DOCUMENT_VERSION,
    goals,
    links,
    atlassianGoalIds: [...(fresh?.atlassianGoalIds ?? [])],
    updatedAt: sprintGoalTimestamp(input.now),
    updatedBy: input.accountId,
  };
}

// ─── Épinglage de Goals Atlassian au sprint ──────────────────────────────────

export type PinOutcome =
  /** Jira a confirmé l'enregistrement de la nouvelle sélection. */
  | { kind: "pinned"; goalIds: string[] }
  /** Jira porte déjà exactement cette sélection : rien n'a été écrit. */
  | { kind: "unchanged" }
  /** La sélection a changé dans Jira depuis son affichage : rien n'a été écrit. */
  | { kind: "conflict"; current: string[] };

/**
 * Épingle des Goals Atlassian au sprint, pour les afficher même sans ticket rattaché. Jira n'a
 * aucune relation native entre un sprint et un Goal : la sélection est enregistrée dans la
 * propriété d'entité du sprint. Le champ « Objectif » du sprint n'est jamais touché.
 * - si la relecture de la propriété échoue, RIEN n'est écrit ;
 * - si la sélection relue n'est plus celle que l'utilisateur avait sous les yeux (`shownGoalIds`),
 *   rien n'est écrit : quelqu'un l'a modifiée entre-temps, on la relit plutôt que de l'écraser.
 * Seul `atlassianGoalIds` change : objectifs, liens du mode texte et clés inconnues sont gardés.
 */
export async function pinAtlassianGoals(
  reader: Pick<WriteReader, "sprintProperty">,
  writer: JiraWriter,
  input: {
    sprintId: number;
    /** Sélection lue dans Jira quand l'utilisateur a commencé à la modifier. */
    shownGoalIds: readonly string[];
    goalIds: readonly string[];
    accountId: string | null;
    now: Date;
  },
): Promise<PinOutcome> {
  const goalIds = normalizedGoalIds(input.goalIds);
  const shown = normalizedGoalIds(input.shownGoalIds);
  const pinnedOf = (document: SprintGoalDocument | null) => [...(document?.atlassianGoalIds ?? [])];
  const outcome = await updateSprintGoalProperty(reader, writer, {
    sprintId: input.sprintId,
    unchangedSince: (fresh) => sameIds(pinnedOf(fresh), shown),
    mutate: (fresh) => withPinnedGoals(fresh, { ...input, goalIds }),
    accountId: input.accountId,
    now: input.now,
  });
  switch (outcome.kind) {
    case "conflict":
      return { kind: "conflict", current: pinnedOf(outcome.fresh) };
    case "unchanged":
      return { kind: "unchanged" };
    case "written":
      return { kind: "pinned", goalIds };
  }
}

/** Document à écrire : celui lu dans Jira, avec la seule sélection de Goals remplacée. */
export function withPinnedGoals(
  fresh: SprintGoalDocument | null,
  input: { goalIds: readonly string[]; accountId: string | null; now: Date },
): SprintGoalDocument {
  return {
    version: fresh?.version ?? SPRINT_GOAL_DOCUMENT_VERSION,
    goals: [...(fresh?.goals ?? [])],
    links: { ...(fresh?.links ?? {}) },
    atlassianGoalIds: normalizedGoalIds(input.goalIds),
    updatedAt: sprintGoalTimestamp(input.now),
    updatedBy: input.accountId,
  };
}

/** Identifiants non vides, sans doublon, dans l'ordre choisi (il fixe l'ordre des swimlanes). */
function normalizedGoalIds(ids: readonly string[]): string[] {
  return [...new Set(ids.map((id) => id.trim()).filter((id) => id !== ""))];
}

function sameIds(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}
