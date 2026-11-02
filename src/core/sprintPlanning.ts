import type { IssueQuery, JiraClient } from "../jira/client";
import type { GoalsClient } from "../jira/goals";
import type { JsonValue } from "../jira/json";
import { isDoneStatus, type JiraIssue, type JiraSprint } from "../jira/models";
import { isEstimateValue, SPRINT_PROPERTY_KEYS } from "../jira/writes";
import { type GoalsReader, loadAtlassianSprintGoals } from "./atlassianGoals";
import type { BoardConfiguration, ColumnConfiguration } from "./boardConfiguration";
import { changeAtlassianGoal } from "./boardMove";
import {
  type JiraWriter,
  linkToTextGoal,
  pinAtlassianGoals,
  rankIssue,
  withTextGoalLink,
} from "./boardWrites";
import { columnStates } from "./columnState";
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
export type EstimateReader = Pick<JiraClient, "issueEstimation">;
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
  | "velocity"
  /** Estimation du ticket écrite (E11) puis relue. */
  | "estimate"
  /** Rang du ticket dans le sprint en préparation écrit (E2) puis relu (story 8.19). */
  | "ranked";

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
  /** Backlog du board sans les tickets de la dernière colonne ni sans colonne, comme dans Jira. */
  readonly backlogIssues: readonly JiraIssue[];
  /** Autres sprints futurs du board, dans l'ordre de Jira, mêmes tickets que le backlog. */
  readonly futureSprints: readonly PlanningSprintIssues[];
  /**
   * Sprints actifs du board et leur reste à faire (statut dans une colonne visible autre que la
   * dernière), en consultation.
   */
  readonly activeSprints: readonly PlanningSprintIssues[];
  /** Sprints actifs que l'utilisateur peut modifier (ou indécidables) : proposés à la clôture. */
  readonly closableSprintIds: readonly number[];
}

// ─── Lecture ─────────────────────────────────────────────────────────────────

/** Lecture sans aucune écriture, même si le texte a changé dans Jira. */
export async function loadSprintPlanning(
  reader: PlanningReader,
  input: {
    boardId: number;
    sprintId: number;
    query: IssueQuery;
    /** Colonnes du board : seule règle d'état d'un ticket (story 8.20). */
    columns: readonly ColumnConfiguration[];
    /**
     * Sprints proposables parmi les autres sprints futurs et les sprints actifs (droits de
     * l'utilisateur). Un sprint futur refusé n'est pas lu ; un sprint actif refusé reste en
     * consultation sans être proposé à la clôture. Sans lui, tous sont proposés.
     */
    proposable?: (sprints: readonly JiraSprint[]) => Promise<ReadonlySet<number>>;
  },
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
  const futures = boardSprints.filter(
    (candidate) => candidate.id !== sprint.id && candidate.state === "future",
  );
  const actives = boardSprints.filter((candidate) => candidate.state === "active");
  const proposable = input.proposable
    ? await input.proposable([...futures, ...actives])
    : new Set(boardSprints.map((candidate) => candidate.id));
  const others = futures.filter((candidate) => proposable.has(candidate.id));
  const issuesOf = (list: readonly JiraSprint[]) =>
    Promise.all(
      list.map(async (other) => ({
        sprint: other,
        issues: await reader.sprintIssues(input.boardId, other.id, input.query),
      })),
    );
  const [futureSprints, activeSprints] = await Promise.all([issuesOf(others), issuesOf(actives)]);
  const states = columnStates(input.columns);
  // Colonne « Où sont les tickets » (backlog, autres sprints futurs, reste à faire actif) : comme
  // le backlog Jira, seulement les statuts d'une colonne visible autre que la dernière (stories
  // 8.20, 8.22). Le sprint en préparation garde tous ses tickets.
  const remaining = (issue: JiraIssue) => {
    const state = states.ofStatus(issue.fields.status?.id);
    return state !== null && state !== "done";
  };
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
    backlogIssues: backlogIssues.filter(remaining),
    futureSprints: futureSprints.map(({ sprint: other, issues }) => ({
      sprint: other,
      issues: issues.filter(remaining),
    })),
    activeSprints: activeSprints.map(({ sprint: active, issues }) => ({
      sprint: active,
      issues: issues.filter(remaining),
    })),
    closableSprintIds: actives.map((active) => active.id).filter((id) => proposable.has(id)),
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

// ─── Lots de tickets (story 8.15) ────────────────────────────────────────────

/** Limite documentée de E9 et E10 : 50 tickets par écriture. */
export const PLANNING_BATCH_LIMIT = 50;

/**
 * Résultat d'un geste sur un lot : `confirmedKeys`, tickets dont tout le geste a été relu dans
 * Jira ; `remainingKeys`, ceux qui restent à refaire (rien n'est jamais rejoué).
 */
export interface PlanningBatchOutcome {
  readonly outcome: PlanningOutcome;
  readonly confirmedKeys: readonly string[];
  readonly remainingKeys: readonly string[];
}

export type PlanningBatchTarget =
  /** Objectif du texte (`goalId` à `null` : « Sans objectif »). */
  | {
      readonly kind: "text";
      readonly goalId: string | null;
      /** Lien de chaque ticket lu dans la propriété du sprint en préparation (`null` : aucun). */
      readonly knownGoalIds: Readonly<Record<string, string | null>>;
      readonly storedGoalIds: readonly string[];
      readonly goals: readonly SprintGoal[];
    }
  /** Goal Atlassian (`goalId` à `null` : « Sans objectif »). */
  | {
      readonly kind: "atlassian";
      readonly goalId: string | null;
      /** Goal actuel de chaque ticket (`null` : aucun). */
      readonly previousGoalIds: Readonly<Record<string, string | null>>;
    };

function batchOutcome(
  keys: readonly string[],
  outcome: PlanningOutcome,
  done: ReadonlySet<string>,
): PlanningBatchOutcome {
  return {
    outcome,
    confirmedKeys: keys.filter((key) => done.has(key)),
    remainingKeys: keys.filter((key) => !done.has(key)),
  };
}

/**
 * Pose un lot de tickets sur un objectif du sprint en préparation : ceux qui n'y sont pas encore
 * y sont ajoutés par UNE écriture E9 (backlog ou autres sprints futurs, jamais un sprint actif),
 * puis le lot est rattaché par UNE écriture E5 en texte, ou par un lien E3 par ticket (après E4 si
 * besoin) en Goals Atlassian. Plus de 50 tickets : refus avant toute écriture. Arrêt au premier
 * échec ; rien n'est rejoué.
 */
export async function placePlanningIssues(
  reader: PlanningReader,
  writer: JiraWriter,
  goals: PlanningGoalLinks,
  input: {
    boardId: number;
    sprintId: number;
    query: IssueQuery;
    issues: readonly JiraIssue[];
    target: PlanningBatchTarget;
    accountId: string | null;
    now: Date;
  },
): Promise<PlanningBatchOutcome> {
  const keys = [...new Set(input.issues.map((issue) => issue.key))];
  const added = new Set<string>();
  const linked = new Set<string>();
  const outcome = await runIntention(writer, goals, async (run) => {
    if (keys.length > PLANNING_BATCH_LIMIT) refuse({ reason: "batchTooLarge", count: keys.length });
    const { sprintId, target } = input;
    await futureSprint(reader, sprintId);
    const before = new Set(
      (await reader.sprintIssues(input.boardId, sprintId, input.query)).map((issue) => issue.key),
    );
    for (const key of keys) if (before.has(key)) added.add(key);
    const toAdd = input.issues.filter((issue) => !before.has(issue.key));
    const unavailable = toAdd.find(
      (issue) => issue.fields.issuetype.subtask === true || isDoneStatus(issue.fields.status),
    );
    if (unavailable) refuse({ reason: "issueUnavailable", issueKey: unavailable.key });
    if (toAdd.length > 0) {
      const active = await activeIssueKeys(reader, input.boardId, input.query);
      const inActive = toAdd.find((issue) => active.has(issue.key));
      if (inActive) refuse({ reason: "issueInActiveSprint", issueKey: inActive.key });
    }

    // Liens à écrire : contrôlés avant E9 pour qu'aucun refus prévisible n'arrive après lui.
    const toLink = keys.filter((key) => {
      const current =
        target.kind === "text" ? target.knownGoalIds[key] : target.previousGoalIds[key];
      return (current ?? null) !== target.goalId;
    });
    for (const key of keys) if (!toLink.includes(key)) linked.add(key);
    if (target.kind === "text" && toLink.length > 0) {
      const raw = await reader.sprintProperty(sprintId, SPRINT_PROPERTY_KEYS.goals);
      const prepared = prepareSprintGoalUpdate(
        raw,
        textBatchUpdate(sprintId, toLink, target, input),
      );
      if (prepared.kind === "conflict")
        refuse({ reason: "linkChanged", issueKey: changedLinkKey(prepared.fresh, toLink, target) });
    }

    if (toAdd.length > 0) {
      await run.writer.write({
        kind: "sprint.issues.add",
        sprintId,
        issueKeys: toAdd.map((issue) => issue.key),
      });
      const read = new Set(
        (await reader.sprintIssues(input.boardId, sprintId, input.query)).map((issue) => issue.key),
      );
      for (const issue of toAdd) if (read.has(issue.key)) added.add(issue.key);
      const missing = toAdd.find((issue) => !read.has(issue.key));
      if (missing) throw new CoreError({ code: "planningIssueUnconfirmed", issueKey: missing.key });
      run.confirmed.push("issueAdded");
    }
    if (toLink.length === 0) return;

    if (target.kind === "text") {
      const result = await updateSprintGoalProperty(
        reader,
        run.writer,
        textBatchUpdate(sprintId, toLink, target, input),
      );
      if (result.kind === "conflict")
        refuse({ reason: "linkChanged", issueKey: changedLinkKey(result.fresh, toLink, target) });
      if (result.kind === "written") {
        const read = readSprintGoalProperty(
          await reader.sprintProperty(sprintId, SPRINT_PROPERTY_KEYS.goals),
        );
        const links = read.kind === "document" ? read.document.links : {};
        if (toLink.some((key) => (links[key] ?? null) !== target.goalId))
          throw new CoreError({ code: "planningPropertyUnconfirmed" });
        run.confirmed.push("issueLinked");
      }
      for (const key of toLink) linked.add(key);
      return;
    }

    // Goals Atlassian : un lien par ticket, dans l'ordre du lot ; arrêt au premier échec.
    const step = (name: PlanningStep) => {
      if (!run.confirmed.includes(name)) run.confirmed.push(name);
    };
    for (const key of toLink) {
      const issue = input.issues.find((candidate) => candidate.key === key);
      if (!issue) continue;
      const result = await changeAtlassianGoal(run.goals, {
        issueId: issue.id,
        previousGoalId: target.previousGoalIds[key] ?? null,
        goalId: target.goalId,
      });
      switch (result.kind) {
        case "unchanged":
          linked.add(key);
          continue;
        case "linked":
        case "unlinked":
          linked.add(key);
          step("issueLinked");
          continue;
        case "unlinkRefused":
          throw new CoreError({ code: "planningGoalLinkRefused", messages: result.messages });
        case "linkRefused":
          if (result.detached) step("goalUnlinked");
          throw new CoreError({ code: "planningGoalLinkRefused", messages: result.messages });
        case "failed":
          if (result.detached) step("goalUnlinked");
          throw result.error;
      }
    }
  });
  const done = new Set(keys.filter((key) => added.has(key) && linked.has(key)));
  return batchOutcome(keys, outcome, outcome.kind === "refused" ? new Set() : done);
}

/** Premier ticket du lot dont le lien relu n'est plus celui affiché. */
function changedLinkKey(
  fresh: SprintGoalDocument | null,
  keys: readonly string[],
  target: Extract<PlanningBatchTarget, { kind: "text" }>,
): string {
  const changed = keys.find(
    (key) => (fresh?.links[key] ?? null) !== (target.knownGoalIds[key] ?? null),
  );
  return changed ?? keys[0] ?? "";
}

/** Mise à jour de la propriété pour un lot : seuls les liens de ses tickets changent. */
function textBatchUpdate(
  sprintId: number,
  keys: readonly string[],
  target: Extract<PlanningBatchTarget, { kind: "text" }>,
  input: { accountId: string | null; now: Date },
): SprintGoalUpdate {
  const linkOf = (document: SprintGoalDocument | null, key: string) => document?.links[key] ?? null;
  return {
    sprintId,
    unchangedSince: (fresh) =>
      keys.every((key) => linkOf(fresh, key) === (target.knownGoalIds[key] ?? null)),
    mutate: (fresh) => {
      let document = fresh;
      for (const key of keys) {
        document = withTextGoalLink(document, {
          issueKey: key,
          goalId: target.goalId,
          goals: target.goals,
          knownGoalIds: target.storedGoalIds,
          accountId: input.accountId,
          now: input.now,
        });
      }
      return document ?? makeSprintGoalDocument();
    },
    accountId: input.accountId,
    now: input.now,
  };
}

/**
 * Retire un lot de tickets du sprint en préparation : UNE écriture E10 vers le backlog, ou UNE E9
 * vers un autre sprint futur du board. Tous doivent être dans le sprint en préparation et hors d'un
 * sprint actif ; plus de 50 : refus avant toute écriture.
 */
export async function removePlanningIssues(
  reader: PlanningReader,
  writer: JiraWriter,
  input: {
    boardId: number;
    sprintId: number;
    query: IssueQuery;
    issueKeys: readonly string[];
    destination: PlanningDestination;
  },
): Promise<PlanningBatchOutcome> {
  const keys = [...new Set(input.issueKeys)];
  const moved = new Set<string>();
  const outcome = await runIntention(writer, NO_GOAL_LINKS, async (run) => {
    if (keys.length > PLANNING_BATCH_LIMIT) refuse({ reason: "batchTooLarge", count: keys.length });
    const { boardId, sprintId, destination } = input;
    await futureSprint(reader, sprintId);
    const inSprint = new Set(
      (await reader.sprintIssues(boardId, sprintId, input.query)).map((issue) => issue.key),
    );
    const absent = keys.find((key) => !inSprint.has(key));
    if (absent) refuse({ reason: "issueNotInSprint", issueKey: absent });
    const boardSprints = await reader.sprints(boardId, ["active", "future"]);
    const active = await activeIssueKeys(reader, boardId, input.query, boardSprints);
    const inActive = keys.find((key) => active.has(key));
    if (inActive) refuse({ reason: "issueInActiveSprint", issueKey: inActive });
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
        ? { kind: "backlog.issues.move", issueKeys: keys }
        : { kind: "sprint.issues.add", sprintId: destination.sprintId, issueKeys: keys },
    );
    const [left, arrived] = await Promise.all([
      reader.sprintIssues(boardId, sprintId, input.query),
      destination.kind === "sprint"
        ? reader.sprintIssues(boardId, destination.sprintId, input.query)
        : Promise.resolve(null),
    ]);
    const stillThere = new Set(left.map((issue) => issue.key));
    const there = arrived === null ? null : new Set(arrived.map((issue) => issue.key));
    for (const key of keys)
      if (!stillThere.has(key) && (there === null || there.has(key))) moved.add(key);
    const missing = keys.find((key) => !moved.has(key));
    if (missing) throw new CoreError({ code: "planningIssueUnconfirmed", issueKey: missing });
    run.confirmed.push("issueMoved");
  });
  return batchOutcome(keys, outcome, outcome.kind === "refused" ? new Set() : moved);
}

// ─── Estimation pendant la séance (story 8.17) ───────────────────────────────

/**
 * Champ d'estimation modifiable depuis le planning : un champ personnalisé (story points). Le temps
 * estimé (`timeoriginalestimate`, en secondes et en durées) reste à la fiche native.
 */
export function canEstimateWith(fieldId: string | null): fieldId is string {
  return fieldId !== null && /^customfield_\d+$/.test(fieldId);
}

/**
 * Estime un ticket (E11) dans le champ du board. L'estimation relue doit être celle affichée
 * (`base`) et son champ celui du board ; sinon rien n'est écrit. Une valeur égale n'écrit rien.
 * Une seule écriture, relue pour confirmer.
 */
export function estimatePlanningIssue(
  reader: EstimateReader,
  writer: JiraWriter,
  input: {
    boardId: number;
    issueKey: string;
    fieldId: string | null;
    base: number | null;
    value: number;
  },
): Promise<PlanningOutcome> {
  return runIntention(writer, NO_GOAL_LINKS, async (run) => {
    const { boardId, issueKey, value } = input;
    if (!canEstimateWith(input.fieldId)) refuse({ reason: "estimateUnavailable", issueKey });
    if (!isEstimateValue(value)) refuse({ reason: "invalidEstimate" });
    const current = await reader.issueEstimation(issueKey, boardId);
    if (current.fieldId !== null && current.fieldId !== input.fieldId)
      refuse({ reason: "estimateUnavailable", issueKey });
    if (current.value !== input.base) refuse({ reason: "estimateChanged", issueKey });
    if (current.value === value) return;
    await run.writer.write({ kind: "issue.estimation", issueKey, boardId, value });
    const read = await reader.issueEstimation(issueKey, boardId);
    if (read.value !== value)
      throw new CoreError({ code: "planningEstimateUnconfirmed", issueKey });
    run.confirmed.push("estimate");
  });
}

// ─── Top et basse priorité (story 8.19) ──────────────────────────────────────

/**
 * Met un ticket du sprint en préparation en tête (`top`, avant `reference`) ou en fin (`bottom`,
 * après `reference`) de la swimlane de son objectif : `reference` est le premier (ou le dernier)
 * autre ticket de cette swimlane à l'affichage. Sprint et ordre relus avant l'écriture : le ticket ou
 * la référence sorti du sprint, rien n'est écrit ; déjà à sa place, rien non plus. Une seule écriture
 * de rang (E2, réponse 207 lue), puis l'ordre est relu.
 */
export function rankPlanningIssue(
  reader: PlanningReader,
  writer: JiraWriter,
  input: {
    boardId: number;
    sprintId: number;
    query: IssueQuery;
    issueKey: string;
    edge: "top" | "bottom";
    reference: string;
  },
): Promise<PlanningOutcome> {
  return runIntention(writer, NO_GOAL_LINKS, async (run) => {
    const { boardId, sprintId, issueKey, reference } = input;
    const order = async () =>
      (await reader.sprintIssues(boardId, sprintId, input.query)).map((issue) => issue.key);
    const placed = (keys: readonly string[]) => {
      const at = keys.indexOf(issueKey);
      const ref = keys.indexOf(reference);
      return input.edge === "top" ? at < ref : at > ref;
    };
    await futureSprint(reader, sprintId);
    const before = await order();
    if (!before.includes(issueKey)) refuse({ reason: "issueNotInSprint", issueKey });
    if (reference === issueKey || !before.includes(reference))
      refuse({ reason: "rankChanged", issueKey });
    if (placed(before)) return;
    await rankIssue(
      run.writer,
      issueKey,
      input.edge === "top"
        ? { kind: "before", issueKey: reference }
        : { kind: "after", issueKey: reference },
    );
    const after = await order();
    if (!after.includes(reference) || !placed(after))
      throw new CoreError({ code: "planningIssueUnconfirmed", issueKey });
    run.confirmed.push("ranked");
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
 * Sort d'un objectif du sprint clos : `carried`, non atteint et reporté (ou à reporter si
 * l'écriture échoue) ; `noIssue`, aucun ticket du sprint clos rattaché ; `allDone`, tous ses
 * tickets dans la dernière colonne ; `alreadyThere`, non atteint mais déjà dans la cible (même
 * titre sans casse, ou Goal déjà épinglé).
 */
export type CarryOverGoalStatus = "carried" | "noIssue" | "allDone" | "alreadyThere";

export interface CarryOverGoalReport {
  readonly title: string;
  readonly status: CarryOverGoalStatus;
  /** Tickets du sprint clos rattachés à l'objectif. */
  readonly linkedKeys: readonly string[];
}

/** Compte rendu du report, objectif par objectif du sprint clos. */
export interface CarryOverReport {
  readonly goals: readonly CarryOverGoalReport[];
  /** Goals Atlassian lus en partie : un objectif non atteint peut manquer. */
  readonly incomplete: boolean;
}

export interface CarryOverResult {
  readonly outcome: PlanningOutcome;
  /** `null` : refus avant la lecture des objectifs (sprint non clos, lecture impossible). */
  readonly report: CarryOverReport | null;
}

/**
 * Objectif non atteint : au moins un ticket rattaché, et pas tous dans la dernière colonne. Un
 * objectif sans ticket est atteint au sens de cette règle.
 */
function progress(
  keys: readonly string[],
  issues: ReadonlyMap<string, JiraIssue>,
  isDone: (issue: JiraIssue) => boolean,
): { linkedKeys: string[]; state: "noIssue" | "allDone" | "unmet" } {
  const linked = keys.map((key) => issues.get(key)).filter((issue) => issue !== undefined);
  const linkedKeys = linked.map((issue) => issue.key);
  if (linked.length === 0) return { linkedKeys, state: "noIssue" };
  return { linkedKeys, state: linked.every(isDone) ? "allDone" : "unmet" };
}

type CarryOverPlan =
  | { kind: "text"; input: TextGoalsInput }
  | { kind: "pin"; shownGoalIds: string[]; goalIds: string[] }
  | null;

/**
 * Reporte dans le sprint en préparation les objectifs non atteints d'un sprint relu clos. Texte :
 * objectifs absents ajoutés (même identifiant, même couleur) avec les liens de leurs tickets
 * arrivés dans la cible et non terminés, par `writeTextGoals`. Goals : épinglage des Goals
 * manquants. Idempotent : titres déjà présents et Goals déjà épinglés sont ignorés ; un ticket
 * envoyé ailleurs par la fenêtre native est respecté. Rend aussi le compte rendu par objectif.
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
): Promise<CarryOverResult> {
  let prepared: { plan: CarryOverPlan; report: CarryOverReport };
  try {
    prepared = await prepareCarryOver(reader, input);
  } catch (error) {
    return {
      outcome: {
        kind: "refused",
        reason: error instanceof Refusal ? error.refusal : { reason: "failed", error },
      },
      report: null,
    };
  }
  const { plan, report } = prepared;
  if (plan === null) return { outcome: { kind: "unchanged" }, report };
  const outcome =
    plan.kind === "text"
      ? await writeTextGoals(reader, writer, plan.input)
      : await pinPlanningGoals(reader, writer, {
          sprintId: input.targetSprintId,
          shownGoalIds: plan.shownGoalIds,
          goalIds: plan.goalIds,
          accountId: input.accountId,
          now: input.now,
        });
  return { outcome, report };
}

async function prepareCarryOver(
  reader: PlanningReader,
  input: Parameters<typeof carryOverGoals>[2],
): Promise<{ plan: CarryOverPlan; report: CarryOverReport }> {
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
  const goalsReport: CarryOverGoalReport[] = [];

  if (input.mode.kind === "atlassian") {
    const loaded = await loadAtlassianSprintGoals({
      reader: input.mode.goals,
      pinnedGoalIds: closedDocument?.atlassianGoalIds ?? [],
      issues: closedIssues,
      configuration: input.mode.configuration,
    });
    const shown = [...(targetDocument?.atlassianGoalIds ?? [])];
    const missing: string[] = [];
    for (const goal of loaded.goals) {
      const { linkedKeys, state } = progress(keysOf(loaded.links, goal.id), byKey, input.isDone);
      let status: CarryOverGoalStatus = state === "unmet" ? "carried" : state;
      if (status === "carried") {
        if (shown.includes(goal.id) || missing.includes(goal.id)) status = "alreadyThere";
        else missing.push(goal.id);
      }
      goalsReport.push({ title: goal.title, status, linkedKeys });
    }
    const report = { goals: goalsReport, incomplete: loaded.warnings.length > 0 };
    return {
      plan:
        missing.length === 0
          ? null
          : { kind: "pin", shownGoalIds: shown, goalIds: [...shown, ...missing] },
      report,
    };
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
    const { linkedKeys, state } = progress(keys, byKey, input.isDone);
    if (state !== "unmet") {
      goalsReport.push({ title: goal.title, status: state, linkedKeys });
      continue;
    }
    const folded = goal.title.toLocaleLowerCase();
    let destination = goals.find((candidate) => candidate.title.toLocaleLowerCase() === folded);
    // Déjà dans la cible : reporté quand même si ce report y rattache au moins un ticket.
    let carried = !destination;
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
      carried = true;
    }
    goalsReport.push({
      title: goal.title,
      status: carried ? "carried" : "alreadyThere",
      linkedKeys,
    });
  }
  const report = { goals: goalsReport, incomplete: false };
  if (!changed) return { plan: null, report };
  return {
    plan: {
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
    },
    report,
  };
}
