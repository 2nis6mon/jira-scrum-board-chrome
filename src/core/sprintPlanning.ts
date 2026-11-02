import type { IssueQuery, JiraClient } from "../jira/client";
import type { GoalsClient } from "../jira/goals";
import type { JsonValue } from "../jira/json";
import { isDoneStatus, type JiraIssue, type JiraSprint } from "../jira/models";
import { SPRINT_PROPERTY_KEYS } from "../jira/writes";
import { type GoalsReader, loadAtlassianSprintGoals } from "./atlassianGoals";
import type { BoardConfiguration } from "./boardConfiguration";
import { changeAtlassianGoal } from "./boardMove";
import { type JiraWriter, linkToTextGoal, pinAtlassianGoals } from "./boardWrites";
import { CoreError, type PlanningRefusal } from "./reasons";
import {
  isVelocity,
  makeSprintGoal,
  makeSprintGoalDocument,
  parseSprintGoalText,
  prepareSprintGoalUpdate,
  readSprintGoalProperty,
  reconcileSprintGoals,
  type SprintGoal,
  type SprintGoalDocument,
  type SprintGoalUpdate,
  sameSprintGoalContent,
  stableGoalIds,
  updateSprintGoalProperty,
} from "./sprintGoals";

// Sprint Planning en direct (décision du 01/11/2026) : chaque geste écrit aussitôt dans Jira, seule
// source. Une fonction par intention (AD-2) : relecture qui conditionne l'écriture, une seule
// tentative par écriture, relecture de confirmation, arrêt au premier échec avec les étapes
// confirmées. Aucune création de sprint ni de Goal ; ni état, ni dates, ni nom de sprint.

export type { PlanningRefusal } from "./reasons";

export type PlanningReader = Pick<
  JiraClient,
  "sprint" | "sprints" | "sprintIssues" | "backlogIssues" | "sprintProperty"
>;
export type PlanningWriter = JiraWriter;
export type PlanningGoalLinks = Pick<GoalsClient, "setLink">;

/** Étape confirmée par une relecture de Jira. */
export type PlanningStep =
  | "goalText"
  | "goalProperty"
  | "issueAdded"
  | "issueLinked"
  /** Goals Atlassian : ancien lien retiré (E4), avant le nouveau (E3). */
  | "goalUnlinked"
  | "issueMoved"
  | "pinned"
  | "velocity";

export type PlanningOutcome =
  /** Tout ce qui a été écrit a été relu et confirmé. */
  | { readonly kind: "done"; readonly confirmed: readonly PlanningStep[] }
  /** Jira porte déjà ce qui est demandé : rien n'a été écrit. */
  | { readonly kind: "unchanged" }
  /** Rien n'a été écrit. */
  | { readonly kind: "refused"; readonly reason: PlanningRefusal }
  /** Arrêt après une écriture : `confirmed` liste ce que Jira a confirmé ; rien n'est rejoué. */
  | {
      readonly kind: "partial";
      readonly confirmed: readonly PlanningStep[];
      readonly error: unknown;
    };

/** Tickets d'un autre sprint du board. */
export interface PlanningSprintIssues {
  readonly sprint: JiraSprint;
  readonly issues: readonly JiraIssue[];
}

/** Lecture de Jira à l'entrée du planning et après chaque geste. */
export interface PlanningSnapshot {
  readonly boardId: number;
  readonly query: IssueQuery;
  /** Sprint en préparation. */
  readonly sprint: JiraSprint;
  readonly nativeGoalText: string;
  /** Propriété `sprintgoals.v1` telle que lue : base des contrôles de conflit. */
  readonly rawGoalProperty: JsonValue | null;
  /** Objectifs du texte, avec les identifiants stables de la propriété. */
  readonly goals: readonly SprintGoal[];
  readonly links: Readonly<Record<string, string>>;
  /** Liens et objectifs tels qu'écrits dans la propriété (bases de `linkToTextGoal`). */
  readonly storedLinks: Readonly<Record<string, string>>;
  readonly storedGoalIds: readonly string[];
  readonly velocity: number | null;
  readonly pinnedGoalIds: readonly string[];
  readonly sprintIssues: readonly JiraIssue[];
  readonly backlogIssues: readonly JiraIssue[];
  /** Autres sprints futurs du board, dans l'ordre de Jira. */
  readonly futureSprints: readonly PlanningSprintIssues[];
  /** Sprints actifs du board et leur reste à faire (tickets non terminés), en consultation. */
  readonly activeSprints: readonly PlanningSprintIssues[];
}

// ─── Lecture ─────────────────────────────────────────────────────────────────

/** Lecture sans aucune écriture, même si le texte a changé dans Jira. */
export async function loadSprintPlanning(
  reader: PlanningReader,
  input: { boardId: number; sprintId: number; query: IssueQuery },
): Promise<PlanningSnapshot> {
  const [sprint, rawGoalProperty, sprintIssues, backlogIssues, boardSprints] = await Promise.all([
    reader.sprint(input.sprintId),
    reader.sprintProperty(input.sprintId, SPRINT_PROPERTY_KEYS.goals),
    reader.sprintIssues(input.boardId, input.sprintId, input.query),
    reader.backlogIssues(input.boardId, input.query),
    reader.sprints(input.boardId, ["active", "future"]),
  ]);
  if (sprint.id !== input.sprintId) throw new CoreError({ code: "planningOtherSprint" });
  const read = readSprintGoalProperty(rawGoalProperty);
  if (read.kind === "unreadable") throw new CoreError({ code: "planningUnreadableProperty" });
  const document = read.kind === "document" ? read.document : null;
  const reconciled = reconcileSprintGoals(sprint.goal, document, stableGoalIds(sprint.id));
  const others = boardSprints.filter(
    (candidate) => candidate.id !== sprint.id && candidate.state === "future",
  );
  const actives = boardSprints.filter((candidate) => candidate.state === "active");
  const issuesOf = (list: readonly JiraSprint[]) =>
    Promise.all(
      list.map(async (other) => ({
        sprint: other,
        issues: await reader.sprintIssues(input.boardId, other.id, input.query),
      })),
    );
  const [futureSprints, activeSprints] = await Promise.all([issuesOf(others), issuesOf(actives)]);
  return {
    boardId: input.boardId,
    query: input.query,
    sprint,
    nativeGoalText: sprint.goal ?? "",
    rawGoalProperty,
    goals: reconciled.goals.map(({ id, title, color, position }) =>
      makeSprintGoal({ id, title, color, position }),
    ),
    links: reconciled.links,
    storedLinks: { ...(document?.links ?? {}) },
    storedGoalIds: (document?.goals ?? []).map((goal) => goal.id),
    velocity: document?.velocity ?? null,
    pinnedGoalIds: [...(document?.atlassianGoalIds ?? [])],
    sprintIssues,
    backlogIssues,
    futureSprints,
    activeSprints: activeSprints.map(({ sprint: active, issues }) => ({
      sprint: active,
      issues: issues.filter((issue) => !isDoneStatus(issue.fields.status)),
    })),
  };
}

// ─── Déroulement commun ──────────────────────────────────────────────────────

/** Refus constaté par une relecture : rien n'est écrit à partir de là. */
class Refusal extends Error {
  constructor(readonly refusal: PlanningRefusal) {
    super(refusal.reason);
    this.name = "PlanningRefusal";
  }
}

function refuse(refusal: PlanningRefusal): never {
  throw new Refusal(refusal);
}

interface Run {
  readonly writer: JiraWriter;
  readonly goals: PlanningGoalLinks;
  readonly confirmed: PlanningStep[];
}

/**
 * Exécute une intention. Une écriture, REST ou lien Goal, compte dès son envoi : toute erreur
 * levée avant la première donne `refused`, après elle `partial`. Rien n'est jamais rejoué.
 */
async function runIntention(
  writer: JiraWriter,
  goals: PlanningGoalLinks,
  body: (run: Run) => Promise<void>,
): Promise<PlanningOutcome> {
  let sent = 0;
  const run: Run = {
    writer: {
      write: (write, options) => {
        sent += 1;
        return writer.write(write, options);
      },
    },
    goals: {
      setLink: async (kind, goalId, issueId) => {
        try {
          const outcome = await goals.setLink(kind, goalId, issueId);
          // Un refus explicite d'Atlassian n'a rien écrit.
          if (outcome.success) sent += 1;
          return outcome;
        } catch (error) {
          sent += 1;
          throw error;
        }
      },
    },
    confirmed: [],
  };
  try {
    await body(run);
  } catch (error) {
    if (sent === 0) {
      return {
        kind: "refused",
        reason: error instanceof Refusal ? error.refusal : { reason: "failed", error },
      };
    }
    return {
      kind: "partial",
      confirmed: [...run.confirmed],
      error:
        error instanceof Refusal
          ? new CoreError({ code: "planningRefused", refusal: error.refusal })
          : error,
    };
  }
  return run.confirmed.length > 0
    ? { kind: "done", confirmed: [...run.confirmed] }
    : { kind: "unchanged" };
}

const NO_GOAL_LINKS: PlanningGoalLinks = {
  setLink: () => Promise.reject(new Error("Aucun lien Goal attendu")),
};

async function futureSprint(reader: PlanningReader, sprintId: number): Promise<JiraSprint> {
  const sprint = await reader.sprint(sprintId);
  if (sprint.id !== sprintId || sprint.state !== "future") refuse({ reason: "notFuture" });
  return sprint;
}

async function confirmProperty(
  reader: PlanningReader,
  sprintId: number,
  value: JsonValue,
): Promise<void> {
  const read = await reader.sprintProperty(sprintId, SPRINT_PROPERTY_KEYS.goals);
  if (!sameSprintGoalContent(read, value))
    throw new CoreError({ code: "planningPropertyUnconfirmed" });
}

async function activeIssueKeys(
  reader: PlanningReader,
  boardId: number,
  query: IssueQuery,
  sprints?: readonly JiraSprint[],
): Promise<Set<string>> {
  const actives = (sprints ?? (await reader.sprints(boardId, ["active"]))).filter(
    (sprint) => sprint.state === "active",
  );
  const issues = await Promise.all(
    actives.map((sprint) => reader.sprintIssues(boardId, sprint.id, query)),
  );
  return new Set(issues.flat().map((issue) => issue.key));
}

// ─── Objectifs du texte du sprint ────────────────────────────────────────────

export interface TextGoalsInput {
  readonly sprintId: number;
  /** Texte natif affiché : s'il a changé dans Jira, rien n'est écrit. */
  readonly baseText: string;
  /** Propriété affichée : la zone modifiée est la liste `[id, titre]` de ses objectifs. */
  readonly baseProperty: JsonValue | null;
  /** Objectifs voulus, dans l'ordre : identifiant, titre et couleur. */
  readonly goals: readonly SprintGoal[];
  /** Liens ticket → objectif à ajouter (report après clôture). */
  readonly links?: Readonly<Record<string, string>>;
  readonly accountId: string | null;
  readonly now: Date;
}

/** Titres admis : une ligne, sans puce, non vides, distincts sans tenir compte de la casse. */
export function validPlanningGoals(goals: readonly SprintGoal[]): boolean {
  const ids = new Set<string>();
  const titles = new Set<string>();
  for (const goal of goals) {
    const title = goal.title.trim();
    const parsed = parseSprintGoalText(title);
    const folded = title.toLocaleLowerCase();
    if (
      !goal.id.trim() ||
      ids.has(goal.id) ||
      titles.has(folded) ||
      parsed.length !== 1 ||
      parsed[0] !== title
    )
      return false;
    ids.add(goal.id);
    titles.add(folded);
  }
  return true;
}

/**
 * Ajout, suppression, déplacement, renommage et report des objectifs texte : E8 (texte `goal`)
 * puis E5 (propriété), une fois chacun. Le texte relu doit être celui affiché ; la propriété est
 * préparée sur sa valeur relue avant E8, pour qu'aucun refus prévisible n'arrive après lui.
 */
export function writeTextGoals(
  reader: PlanningReader,
  writer: JiraWriter,
  input: TextGoalsInput,
): Promise<PlanningOutcome> {
  return runIntention(writer, NO_GOAL_LINKS, async (run) => {
    const sprint = await futureSprint(reader, input.sprintId);
    const currentText = sprint.goal ?? "";
    if (currentText !== input.baseText) refuse({ reason: "goalTextChanged" });
    if (!validPlanningGoals(input.goals)) refuse({ reason: "invalidGoals" });
    const goals = input.goals.map((goal, position) => ({
      ...goal,
      title: goal.title.trim(),
      position,
    }));
    let text = goalTextKeepingLines(
      currentText,
      goals.map((goal) => goal.title),
    );
    // Puces et espaces saisis directement dans Jira restent tels quels si les titres sont égaux.
    if (sameTitles(parseSprintGoalText(currentText), parseSprintGoalText(text))) text = currentText;

    const baseRead = readSprintGoalProperty(input.baseProperty);
    const baseZone = goalZone(baseRead.kind === "document" ? baseRead.document : null);
    const update: SprintGoalUpdate = {
      sprintId: input.sprintId,
      unchangedSince: (fresh) => goalZone(fresh) === baseZone,
      mutate: (fresh) => textGoalsDocument(fresh, goals, input.links ?? {}),
      accountId: input.accountId,
      now: input.now,
    };
    const raw = await reader.sprintProperty(input.sprintId, SPRINT_PROPERTY_KEYS.goals);
    if (prepareSprintGoalUpdate(raw, update).kind === "conflict")
      refuse({ reason: "goalsChanged" });

    if (text !== currentText) {
      await run.writer.write({ kind: "sprint.goal", sprintId: input.sprintId, goal: text });
      const read = await reader.sprint(input.sprintId);
      if ((read.goal ?? "") !== text) throw new CoreError({ code: "planningGoalTextUnconfirmed" });
      run.confirmed.push("goalText");
    }
    const outcome = await updateSprintGoalProperty(reader, run.writer, update);
    if (outcome.kind === "conflict") refuse({ reason: "goalsChanged" });
    if (outcome.kind === "written") {
      await confirmProperty(reader, input.sprintId, outcome.value);
      run.confirmed.push("goalProperty");
    }
  });
}

/** Zone protégée : identifiants et titres des objectifs de la propriété, dans l'ordre. */
function goalZone(document: SprintGoalDocument | null): string {
  return JSON.stringify(
    [...(document?.goals ?? [])]
      .sort((a, b) => a.position - b.position)
      .map((goal) => [goal.id, goal.title]),
  );
}

/**
 * Texte des objectifs : chaque titre inchangé reprend sa ligne d'origine dans Jira (puce, emoji,
 * numéro saisis par l'équipe) ; un titre nouveau ou renommé s'écrit tel quel.
 */
export function goalTextKeepingLines(currentText: string, titles: readonly string[]): string {
  const original = new Map<string, string[]>();
  for (const line of currentText.split(/\r\n|\r|\n|\p{Zl}|\p{Zp}/u)) {
    const [title] = parseSprintGoalText(line);
    if (title === undefined) continue;
    original.set(title, [...(original.get(title) ?? []), line.trimEnd()]);
  }
  return titles.map((title) => original.get(title)?.shift() ?? title).join("\n");
}

function sameTitles(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((title, index) => title === b[index]);
}

/**
 * Document à écrire : les objectifs voulus gardent les champs stockés de leur identifiant (couleur,
 * champs inconnus) avec leur nouveau titre et leur position ; les liens vers un objectif supprimé
 * sont retirés, les autres conservés ; `links` est ajouté. Goals épinglés et vélocité restent.
 */
function textGoalsDocument(
  fresh: SprintGoalDocument | null,
  goals: readonly SprintGoal[],
  added: Readonly<Record<string, string>>,
): SprintGoalDocument {
  const stored = fresh ?? makeSprintGoalDocument();
  const byId = new Map(stored.goals.map((goal) => [goal.id, goal]));
  const next = goals.map((goal, position) => {
    const previous = byId.get(goal.id);
    return previous
      ? { ...previous, title: goal.title, position }
      : makeSprintGoal({ id: goal.id, title: goal.title, color: goal.color, position });
  });
  const kept = new Set(next.map((goal) => goal.id));
  const removed = new Set(stored.goals.map((goal) => goal.id).filter((id) => !kept.has(id)));
  const links: Record<string, string> = {};
  for (const [key, id] of Object.entries(stored.links)) if (!removed.has(id)) links[key] = id;
  for (const [key, id] of Object.entries(added)) if (kept.has(id)) links[key] = id;
  return { ...stored, goals: next, links };
}

// ─── Tickets ─────────────────────────────────────────────────────────────────

export type PlanningTarget =
  /** Aucun lien à écrire. */
  | null
  /** Objectif du texte (`goalId` à `null` : « Sans objectif »). */
  | {
      readonly kind: "text";
      readonly goalId: string | null;
      /** Lien du ticket lu dans la propriété du sprint en préparation (`null` : aucun). */
      readonly knownGoalId: string | null;
      readonly knownGoalIds: readonly string[];
      readonly goals: readonly SprintGoal[];
    }
  /** Goal Atlassian (`goalId` à `null` : « Sans objectif »). */
  | {
      readonly kind: "atlassian";
      readonly goalId: string | null;
      readonly previousGoalId: string | null;
    };

/**
 * Pose un ticket sur un objectif du sprint en préparation. Hors du sprint, il y est d'abord ajouté
 * (E9, depuis le backlog ou un autre sprint futur), jamais depuis un sprint actif ; puis rattaché
 * (E5 en texte, E4/E3 en Goals). Déjà dans le sprint, seul son lien change.
 */
export function placePlanningIssue(
  reader: PlanningReader,
  writer: JiraWriter,
  goals: PlanningGoalLinks,
  input: {
    boardId: number;
    sprintId: number;
    query: IssueQuery;
    issue: JiraIssue;
    target: PlanningTarget;
    accountId: string | null;
    now: Date;
  },
): Promise<PlanningOutcome> {
  return runIntention(writer, goals, async (run) => {
    const { issue, sprintId } = input;
    const key = issue.key;
    await futureSprint(reader, sprintId);
    const inSprint = (await reader.sprintIssues(input.boardId, sprintId, input.query)).some(
      (candidate) => candidate.key === key,
    );
    if (!inSprint) {
      if (issue.fields.issuetype.subtask === true || isDoneStatus(issue.fields.status))
        refuse({ reason: "issueUnavailable", issueKey: key });
      if ((await activeIssueKeys(reader, input.boardId, input.query)).has(key))
        refuse({ reason: "issueInActiveSprint", issueKey: key });
      await run.writer.write({ kind: "sprint.issues.add", sprintId, issueKeys: [key] });
      const read = await reader.sprintIssues(input.boardId, sprintId, input.query);
      if (!read.some((candidate) => candidate.key === key))
        throw new CoreError({ code: "planningIssueUnconfirmed", issueKey: key });
      run.confirmed.push("issueAdded");
    }
    const target = input.target;
    if (target === null) return;
    if (target.kind === "text") {
      const outcome = await linkToTextGoal(reader, run.writer, {
        sprintId,
        issueKey: key,
        goalId: target.goalId,
        knownGoalId: target.knownGoalId,
        knownGoalIds: target.knownGoalIds,
        goals: target.goals,
        accountId: input.accountId,
        now: input.now,
      });
      if (outcome.kind === "conflict") refuse({ reason: "linkChanged", issueKey: key });
      if (outcome.kind === "linked") {
        const raw = await reader.sprintProperty(sprintId, SPRINT_PROPERTY_KEYS.goals);
        const read = readSprintGoalProperty(raw);
        const link = read.kind === "document" ? (read.document.links[key] ?? null) : null;
        if (link !== target.goalId) throw new CoreError({ code: "planningPropertyUnconfirmed" });
        run.confirmed.push("issueLinked");
      }
      return;
    }
    const outcome = await changeAtlassianGoal(run.goals, {
      issueId: issue.id,
      previousGoalId: target.previousGoalId,
      goalId: target.goalId,
    });
    switch (outcome.kind) {
      case "unchanged":
        return;
      case "linked":
      case "unlinked":
        run.confirmed.push("issueLinked");
        return;
      case "unlinkRefused":
        throw new CoreError({ code: "planningGoalLinkRefused", messages: outcome.messages });
      case "linkRefused":
        // E4 confirmé puis E3 refusé : le ticket est désormais sans Goal.
        if (outcome.detached) run.confirmed.push("goalUnlinked");
        throw new CoreError({ code: "planningGoalLinkRefused", messages: outcome.messages });
      case "failed":
        if (outcome.detached) run.confirmed.push("goalUnlinked");
        throw outcome.error;
    }
  });
}

export type PlanningDestination =
  | { readonly kind: "backlog" }
  | { readonly kind: "sprint"; readonly sprintId: number };

/**
 * Retire un ticket du sprint en préparation : vers le backlog (E10) ou un autre sprint futur du
 * board (E9). Jamais depuis un sprint actif, même si le ticket y est aussi.
 */
export function removePlanningIssue(
  reader: PlanningReader,
  writer: JiraWriter,
  input: {
    boardId: number;
    sprintId: number;
    query: IssueQuery;
    issueKey: string;
    destination: PlanningDestination;
  },
): Promise<PlanningOutcome> {
  return runIntention(writer, NO_GOAL_LINKS, async (run) => {
    const { boardId, sprintId, issueKey, destination } = input;
    await futureSprint(reader, sprintId);
    const issues = await reader.sprintIssues(boardId, sprintId, input.query);
    if (!issues.some((issue) => issue.key === issueKey))
      refuse({ reason: "issueNotInSprint", issueKey });
    const boardSprints = await reader.sprints(boardId, ["active", "future"]);
    if ((await activeIssueKeys(reader, boardId, input.query, boardSprints)).has(issueKey))
      refuse({ reason: "issueInActiveSprint", issueKey });
    if (
      destination.kind === "sprint" &&
      (destination.sprintId === sprintId ||
        !boardSprints.some(
          (sprint) => sprint.id === destination.sprintId && sprint.state === "future",
        ))
    )
      refuse({ reason: "notFuture" });
    await run.writer.write(
      destination.kind === "backlog"
        ? { kind: "backlog.issues.move", issueKeys: [issueKey] }
        : { kind: "sprint.issues.add", sprintId: destination.sprintId, issueKeys: [issueKey] },
    );
    const [left, arrived] = await Promise.all([
      reader.sprintIssues(boardId, sprintId, input.query),
      destination.kind === "sprint"
        ? reader.sprintIssues(boardId, destination.sprintId, input.query)
        : Promise.resolve(null),
    ]);
    if (
      left.some((issue) => issue.key === issueKey) ||
      (arrived !== null && !arrived.some((issue) => issue.key === issueKey))
    )
      throw new CoreError({ code: "planningIssueUnconfirmed", issueKey });
    run.confirmed.push("issueMoved");
  });
}

// ─── Vélocité et Goals épinglés ──────────────────────────────────────────────

/** Vélocité de l'équipe (E5) : refusée si elle a changé dans Jira depuis son affichage. */
export function savePlanningVelocity(
  reader: PlanningReader,
  writer: JiraWriter,
  input: {
    sprintId: number;
    base: number | null;
    velocity: number | null;
    accountId: string | null;
    now: Date;
  },
): Promise<PlanningOutcome> {
  return runIntention(writer, NO_GOAL_LINKS, async (run) => {
    if (input.velocity !== null && !isVelocity(input.velocity))
      refuse({ reason: "invalidVelocity" });
    await futureSprint(reader, input.sprintId);
    const outcome = await updateSprintGoalProperty(reader, run.writer, {
      sprintId: input.sprintId,
      unchangedSince: (fresh) => (fresh?.velocity ?? null) === input.base,
      mutate: (fresh) => ({ ...(fresh ?? makeSprintGoalDocument()), velocity: input.velocity }),
      accountId: input.accountId,
      now: input.now,
    });
    if (outcome.kind === "conflict") refuse({ reason: "velocityChanged" });
    if (outcome.kind === "written") {
      await confirmProperty(reader, input.sprintId, outcome.value);
      run.confirmed.push("velocity");
    }
  });
}

/**
 * Épingle (ou retire) des Goals Atlassian existants sur le sprint en préparation (E5), par le
 * résolveur unique de la sélection. Aucun Goal n'est créé.
 */
export function pinPlanningGoals(
  reader: PlanningReader,
  writer: JiraWriter,
  input: {
    sprintId: number;
    shownGoalIds: readonly string[];
    goalIds: readonly string[];
    accountId: string | null;
    now: Date;
  },
): Promise<PlanningOutcome> {
  return runIntention(writer, NO_GOAL_LINKS, async (run) => {
    await futureSprint(reader, input.sprintId);
    const outcome = await pinAtlassianGoals(reader, run.writer, input);
    if (outcome.kind === "conflict") refuse({ reason: "goalsChanged" });
    if (outcome.kind === "pinned") {
      const raw = await reader.sprintProperty(input.sprintId, SPRINT_PROPERTY_KEYS.goals);
      const read = readSprintGoalProperty(raw);
      const pinned = read.kind === "document" ? read.document.atlassianGoalIds : [];
      if (!sameTitles(pinned, outcome.goalIds))
        throw new CoreError({ code: "planningPropertyUnconfirmed" });
      run.confirmed.push("pinned");
    }
  });
}

// ─── Report après clôture ────────────────────────────────────────────────────

export type CarryOverMode =
  | { readonly kind: "text" }
  | {
      readonly kind: "atlassian";
      readonly goals: GoalsReader;
      readonly configuration: BoardConfiguration;
    };

/**
 * Objectif non atteint : au moins un ticket rattaché, et pas tous dans la dernière colonne. Un
 * objectif sans ticket est atteint au sens de cette règle.
 */
function unmet(
  keys: readonly string[],
  issues: ReadonlyMap<string, JiraIssue>,
  isDone: (issue: JiraIssue) => boolean,
): boolean {
  const linked = keys.map((key) => issues.get(key)).filter((issue) => issue !== undefined);
  return linked.length > 0 && !linked.every(isDone);
}

/**
 * Reporte dans le sprint en préparation les objectifs non atteints d'un sprint relu clos. Texte :
 * objectifs absents ajoutés (même identifiant, même couleur) avec les liens de leurs tickets
 * arrivés dans la cible et non terminés, par `writeTextGoals`. Goals : épinglage des Goals
 * manquants. Idempotent : titres déjà présents et Goals déjà épinglés sont ignorés ; un ticket
 * envoyé ailleurs par la fenêtre native est respecté.
 */
export async function carryOverGoals(
  reader: PlanningReader,
  writer: JiraWriter,
  input: {
    boardId: number;
    closedSprintId: number;
    targetSprintId: number;
    query: IssueQuery;
    isDone: (issue: JiraIssue) => boolean;
    mode: CarryOverMode;
    accountId: string | null;
    now: Date;
  },
): Promise<PlanningOutcome> {
  let prepared:
    | { kind: "text"; input: TextGoalsInput }
    | { kind: "pin"; shownGoalIds: string[]; goalIds: string[] }
    | null;
  try {
    prepared = await prepareCarryOver(reader, input);
  } catch (error) {
    return {
      kind: "refused",
      reason: error instanceof Refusal ? error.refusal : { reason: "failed", error },
    };
  }
  if (prepared === null) return { kind: "unchanged" };
  if (prepared.kind === "text") return writeTextGoals(reader, writer, prepared.input);
  return pinPlanningGoals(reader, writer, {
    sprintId: input.targetSprintId,
    shownGoalIds: prepared.shownGoalIds,
    goalIds: prepared.goalIds,
    accountId: input.accountId,
    now: input.now,
  });
}

async function prepareCarryOver(
  reader: PlanningReader,
  input: Parameters<typeof carryOverGoals>[2],
): Promise<
  | { kind: "text"; input: TextGoalsInput }
  | { kind: "pin"; shownGoalIds: string[]; goalIds: string[] }
  | null
> {
  const closed = await reader.sprint(input.closedSprintId);
  if (closed.id !== input.closedSprintId || closed.state !== "closed")
    refuse({ reason: "sprintNotClosed" });
  const target = await futureSprint(reader, input.targetSprintId);
  const [closedIssues, closedRaw, targetRaw, targetIssues] = await Promise.all([
    reader.sprintIssues(input.boardId, closed.id, input.query),
    reader.sprintProperty(closed.id, SPRINT_PROPERTY_KEYS.goals),
    reader.sprintProperty(target.id, SPRINT_PROPERTY_KEYS.goals),
    reader.sprintIssues(input.boardId, target.id, input.query),
  ]);
  const closedRead = readSprintGoalProperty(closedRaw);
  const targetRead = readSprintGoalProperty(targetRaw);
  if (closedRead.kind === "unreadable" || targetRead.kind === "unreadable")
    throw new CoreError({ code: "planningUnreadableProperty" });
  const closedDocument = closedRead.kind === "document" ? closedRead.document : null;
  const targetDocument = targetRead.kind === "document" ? targetRead.document : null;
  const byKey = new Map(closedIssues.map((issue) => [issue.key, issue]));
  const keysOf = (links: Readonly<Record<string, string>>, goalId: string) =>
    Object.entries(links)
      .filter(([, id]) => id === goalId)
      .map(([key]) => key);

  if (input.mode.kind === "atlassian") {
    const loaded = await loadAtlassianSprintGoals({
      reader: input.mode.goals,
      pinnedGoalIds: closedDocument?.atlassianGoalIds ?? [],
      issues: closedIssues,
      configuration: input.mode.configuration,
    });
    const shown = [...(targetDocument?.atlassianGoalIds ?? [])];
    const missing = loaded.goals
      .filter((goal) => unmet(keysOf(loaded.links, goal.id), byKey, input.isDone))
      .map((goal) => goal.id)
      .filter((id) => !shown.includes(id));
    return missing.length === 0
      ? null
      : { kind: "pin", shownGoalIds: shown, goalIds: [...shown, ...missing] };
  }

  const closedGoals = reconcileSprintGoals(closed.goal, closedDocument, stableGoalIds(closed.id));
  const targetGoals = reconcileSprintGoals(target.goal, targetDocument, stableGoalIds(target.id));
  const goals: SprintGoal[] = targetGoals.goals.map((goal) =>
    makeSprintGoal({ id: goal.id, title: goal.title, color: goal.color, position: goal.position }),
  );
  const arrived = new Map(targetIssues.map((issue) => [issue.key, issue]));
  const links: Record<string, string> = {};
  let changed = false;
  for (const goal of closedGoals.goals) {
    const keys = keysOf(closedGoals.links, goal.id);
    if (!unmet(keys, byKey, input.isDone)) continue;
    const folded = goal.title.toLocaleLowerCase();
    let destination = goals.find((candidate) => candidate.title.toLocaleLowerCase() === folded);
    if (!destination) {
      destination = makeSprintGoal({
        id: goals.some((candidate) => candidate.id === goal.id)
          ? `${goal.id}-${target.id}`
          : goal.id,
        title: goal.title,
        color: goal.color,
        position: goals.length,
      });
      goals.push(destination);
      changed = true;
    }
    for (const key of keys) {
      const issue = arrived.get(key);
      // Ticket envoyé ailleurs, terminé ou déjà rattaché à un objectif de la cible : respecté.
      if (!issue || input.isDone(issue) || targetGoals.links[key] !== undefined) continue;
      links[key] = destination.id;
      changed = true;
    }
  }
  if (!changed) return null;
  return {
    kind: "text",
    input: {
      sprintId: target.id,
      baseText: target.goal ?? "",
      baseProperty: targetRaw,
      goals,
      links,
      accountId: input.accountId,
      now: input.now,
    },
  };
}
