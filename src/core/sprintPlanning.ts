import type { IssueQuery, JiraClient } from "../jira/client";
import { isRecord, type JsonValue } from "../jira/json";
import { isDoneStatus, type JiraIssue, type JiraSprint } from "../jira/models";
import type { JiraTransport } from "../jira/transport";
import { buildWriteRequest, SPRINT_PROPERTY_KEYS } from "../jira/writes";
import {
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
  updateSprintGoalProperty,
} from "./sprintGoals";

export type PlanningReader = Pick<
  JiraClient,
  "sprint" | "sprints" | "sprintIssues" | "backlogIssues" | "sprintProperty"
>;
export type PlanningWriter = Pick<JiraTransport, "write">;

/** Photographie Jira servant de base au brouillon et à la détection des conflits. */
export interface PlanningSnapshot {
  readonly boardId: number;
  readonly query: IssueQuery;
  readonly sprint: JiraSprint;
  readonly nativeGoalText: string;
  readonly rawGoalProperty: JsonValue | null;
  readonly goals: readonly SprintGoal[];
  readonly links: Readonly<Record<string, string>>;
  readonly sprintIssues: readonly JiraIssue[];
  readonly backlogIssues: readonly JiraIssue[];
  /** RAF consultatif : ces tickets ne peuvent pas être déplacés par le planning. */
  readonly remainingIssues: readonly JiraIssue[];
}

export interface PlanningPublication {
  readonly snapshot: PlanningSnapshot;
  readonly goals: readonly SprintGoal[];
  readonly links: Readonly<Record<string, string>>;
  /** Tous les tickets retenus, y compris ceux déjà présents dans le sprint futur. */
  readonly selectedIssueKeys: readonly string[];
  readonly accountId: string | null;
  readonly now: Date;
}

export interface PlanningOutcome {
  readonly kind: "confirmed" | "partial" | "conflict";
  readonly message: string;
  readonly snapshot?: PlanningSnapshot;
}

/** Révision du contenu partagé, indépendante des identifiants locaux générés à la lecture. */
export function planningRevision(snapshot: PlanningSnapshot): string {
  return stableJson({
    nativeGoalText: snapshot.nativeGoalText,
    rawGoalProperty: snapshot.rawGoalProperty,
    issueKeys: snapshot.sprintIssues.map((issue) => issue.key).sort(),
  });
}

/** Lecture sans Goal Atlassian et sans aucune écriture, même si le texte a changé dans Jira. */
export async function loadSprintPlanning(
  reader: PlanningReader,
  input: { boardId: number; sprintId: number; query: IssueQuery },
): Promise<PlanningSnapshot> {
  const [sprint, rawGoalProperty, sprintIssues, backlogIssues, activeSprints] = await Promise.all([
    reader.sprint(input.sprintId),
    reader.sprintProperty(input.sprintId, SPRINT_PROPERTY_KEYS.goals),
    reader.sprintIssues(input.boardId, input.sprintId, input.query),
    reader.backlogIssues(input.boardId, input.query),
    reader.sprints(input.boardId, ["active"]),
  ]);
  if (sprint.id !== input.sprintId) throw new Error("Jira a renvoyé un autre sprint.");
  const read = readSprintGoalProperty(rawGoalProperty);
  if (read.kind === "unreadable") {
    throw new Error(
      "La propriété des objectifs du sprint est illisible ou utilise une version inconnue. Elle ne sera pas écrasée.",
    );
  }
  const reconciled = reconcileSprintGoals(
    sprint.goal,
    read.kind === "document" ? read.document : null,
  );
  const activeIssues = await Promise.all(
    activeSprints
      .filter((active) => active.state === "active")
      .map((active) => reader.sprintIssues(input.boardId, active.id, input.query)),
  );
  const seen = new Set<string>();
  const remainingIssues = activeIssues.flat().filter((issue) => {
    if (isDoneStatus(issue.fields.status) || seen.has(issue.key)) return false;
    seen.add(issue.key);
    return true;
  });
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
    sprintIssues,
    backlogIssues,
    remainingIssues,
  };
}

/**
 * Publication explicite vers un sprint futur. Ordre : texte → ajouts → rattachements.
 * Une réponse incertaine arrête la séquence, même si sa relecture confirme une partie.
 * Jira n'offre pas de transaction : les étapes confirmées restent visibles, sans rollback.
 */
export async function publishSprintPlanning(
  reader: PlanningReader,
  writer: PlanningWriter,
  input: PlanningPublication,
): Promise<PlanningOutcome> {
  const { snapshot } = input;
  const load = () =>
    loadSprintPlanning(reader, {
      boardId: snapshot.boardId,
      sprintId: snapshot.sprint.id,
      query: snapshot.query,
    });
  let current: PlanningSnapshot;
  try {
    current = await load();
  } catch (error) {
    return { kind: "conflict", message: `Publication suspendue : ${messageOf(error)}` };
  }
  if (current.sprint.state !== "future") {
    return {
      kind: "conflict",
      message: "Ce sprint n’est plus futur. Rien n’a été écrit.",
      snapshot: current,
    };
  }
  if (
    current.nativeGoalText !== snapshot.nativeGoalText ||
    !sameJson(current.rawGoalProperty, snapshot.rawGoalProperty) ||
    !sameKeys(current.sprintIssues, snapshot.sprintIssues)
  ) {
    return {
      kind: "conflict",
      message:
        "Le sprint a changé dans Jira. Rechargez ses données avant de publier ; votre brouillon est conservé.",
      snapshot: current,
    };
  }
  // Zone modifiée : le document entier, qui doit être resté celui de la photographie.
  const baseProperty = current.rawGoalProperty;
  const propertyUpdate: SprintGoalUpdate = {
    sprintId: snapshot.sprint.id,
    unchangedSince: (_fresh, raw) => sameJson(raw, baseProperty),
    mutate: (fresh) => planningDocument(fresh, input),
    accountId: input.accountId,
    now: input.now,
  };
  let goalText: string;
  let additions: string[];
  try {
    goalText = validateGoals(input.goals);
    // Un ajout de ticket ne reformate pas les puces ou espaces saisis directement dans Jira.
    if (sameJson(parseSprintGoalText(current.nativeGoalText), parseSprintGoalText(goalText))) {
      goalText = current.nativeGoalText;
    }
    const selected = new Set(input.selectedIssueKeys);
    if (selected.size !== input.selectedIssueKeys.length)
      throw new Error("La sélection contient des doublons.");
    const existing = new Set(current.sprintIssues.map((issue) => issue.key));
    if ([...existing].some((key) => !selected.has(key))) {
      throw new Error("Les tickets déjà présents dans le sprint doivent être conservés.");
    }
    const available = new Map(current.backlogIssues.map((issue) => [issue.key, issue]));
    const activeKeys = new Set(current.remainingIssues.map((issue) => issue.key));
    additions = input.selectedIssueKeys.filter((key) => !existing.has(key));
    for (const key of additions) {
      const issue = available.get(key);
      if (
        !issue ||
        activeKeys.has(key) ||
        isDoneStatus(issue.fields.status) ||
        issue.fields.issuetype.subtask === true
      ) {
        throw new Error(
          `${key} n’est plus un ticket du backlog disponible. Les tickets actifs et sous-tâches ne sont pas déplacés.`,
        );
      }
    }
    // Refus des valeurs invalides et de la taille avant la première écriture métier.
    prepareSprintGoalUpdate(current.rawGoalProperty, propertyUpdate);
    for (let index = 0; index < additions.length; index += 50) {
      buildWriteRequest({
        kind: "sprint.issues.add",
        sprintId: snapshot.sprint.id,
        issueKeys: additions.slice(index, index + 50),
      });
    }
  } catch (error) {
    return {
      kind: "conflict",
      message: `${messageOf(error)} Rien n’a été écrit.`,
      snapshot: current,
    };
  }

  const confirmed: string[] = [];
  try {
    if (goalText !== current.nativeGoalText) {
      await ensureFuture(reader, snapshot.sprint.id, current.nativeGoalText);
      await writer.write({ kind: "sprint.goal", sprintId: snapshot.sprint.id, goal: goalText });
      const read = await reader.sprint(snapshot.sprint.id);
      if ((read.goal ?? "") !== goalText)
        throw new Error("Le texte des objectifs n’a pas été confirmé par Jira.");
      confirmed.push("texte des objectifs");
    }
    for (let index = 0; index < additions.length; index += 50) {
      await ensureFuture(reader, snapshot.sprint.id, goalText);
      const batch = additions.slice(index, index + 50);
      // Le sprint actif peut évoluer pendant l’atelier : ne jamais en retirer un ticket.
      const freshBacklog = new Set(
        (await reader.backlogIssues(snapshot.boardId, snapshot.query))
          .filter(
            (issue) =>
              !isDoneStatus(issue.fields.status) && issue.fields.issuetype.subtask !== true,
          )
          .map((issue) => issue.key),
      );
      const activeSprints = await reader.sprints(snapshot.boardId, ["active"]);
      const activeIssues = await Promise.all(
        activeSprints
          .filter((sprint) => sprint.state === "active")
          .map((sprint) => reader.sprintIssues(snapshot.boardId, sprint.id, snapshot.query)),
      );
      const activeKeys = new Set(activeIssues.flat().map((issue) => issue.key));
      if (batch.some((key) => !freshBacklog.has(key) || activeKeys.has(key))) {
        throw new Error("Un ticket retenu a quitté le backlog pendant la publication.");
      }
      await writer.write({
        kind: "sprint.issues.add",
        sprintId: snapshot.sprint.id,
        issueKeys: batch,
      });
      const read = new Set(
        (await reader.sprintIssues(snapshot.boardId, snapshot.sprint.id, snapshot.query)).map(
          (issue) => issue.key,
        ),
      );
      if (batch.some((key) => !read.has(key)))
        throw new Error("Jira n’a pas confirmé tous les ajouts au sprint.");
      confirmed.push(`${batch.length} ticket(s) ajouté(s)`);
    }
    await ensureFuture(reader, snapshot.sprint.id, goalText);
    const update = await updateSprintGoalProperty(reader, writer, propertyUpdate);
    if (update.kind === "conflict") {
      throw new Error("Les rattachements ont été modifiés par un collègue pendant la publication.");
    }
    const property = update.value;
    if (update.kind === "written") {
      const read = await reader.sprintProperty(snapshot.sprint.id, SPRINT_PROPERTY_KEYS.goals);
      if (!sameJson(read, property))
        throw new Error("Les rattachements n’ont pas été confirmés par Jira.");
      confirmed.push("rattachements aux objectifs");
    }
    const final = await load();
    if (
      final.sprint.state !== "future" ||
      final.sprint.id !== snapshot.sprint.id ||
      final.nativeGoalText !== goalText ||
      !sameSprintGoalContent(final.rawGoalProperty, property) ||
      input.selectedIssueKeys.some((key) => !final.sprintIssues.some((issue) => issue.key === key))
    ) {
      throw new Error("Le sprint a changé pendant la vérification finale.");
    }
    return {
      kind: "confirmed",
      message: "Planning publié et vérifié dans Jira. Le sprint reste à démarrer dans Jira.",
      snapshot: final,
    };
  } catch (error) {
    let refreshed: PlanningSnapshot | undefined;
    try {
      refreshed = await load();
    } catch {
      /* La relecture peut aussi échouer : rien n’est rejoué. */
    }
    return {
      kind: "partial",
      message: `${confirmed.length ? `Étapes confirmées : ${confirmed.join(", ")}. ` : "Publication non confirmée. "}${messageOf(error)} Aucune écriture n’a été rejouée. Vérifiez Jira avant de reprendre ; votre brouillon est conservé.`,
      ...(refreshed ? { snapshot: refreshed } : {}),
    };
  }
}

async function ensureFuture(
  reader: PlanningReader,
  sprintId: number,
  goalText: string,
): Promise<void> {
  const sprint = await reader.sprint(sprintId);
  if (sprint.id !== sprintId || sprint.state !== "future" || (sprint.goal ?? "") !== goalText) {
    throw new Error("Le sprint ou ses objectifs ont changé pendant la publication.");
  }
}

function validateGoals(goals: readonly SprintGoal[]): string {
  const ids = new Set<string>();
  for (const goal of goals) {
    const titles = parseSprintGoalText(goal.title);
    if (
      !goal.id.trim() ||
      ids.has(goal.id) ||
      goal.atlassianGoalId !== null ||
      titles.length !== 1 ||
      titles[0] !== goal.title.trim()
    ) {
      throw new Error(
        "Chaque objectif doit avoir un titre non vide sur une ligne, sans préfixe de liste.",
      );
    }
    ids.add(goal.id);
  }
  return goals.map((goal) => goal.title.trim()).join("\n");
}

/** Mutation pure de la publication : objectifs du brouillon et liens des tickets retenus. */
function planningDocument(
  fresh: SprintGoalDocument | null,
  input: PlanningPublication,
): SprintGoalDocument {
  const stored = fresh ?? makeSprintGoalDocument();
  const ids = new Set(input.goals.map((goal) => goal.id));
  const selected = new Set(input.selectedIssueKeys);
  const links: Record<string, string> = {};
  for (const [key, id] of Object.entries(stored.links)) {
    if (ids.has(id) && !selected.has(key)) links[key] = id;
  }
  for (const [key, id] of Object.entries(input.links)) {
    if (!selected.has(key) || !ids.has(id))
      throw new Error("Un rattachement ne correspond plus à la sélection ou aux objectifs.");
    links[key] = id;
  }
  // Les attributs natifs connus cèdent la place au texte ; les extensions de format restent.
  return {
    ...stored,
    goals: input.goals.map((goal, position) => ({ ...goal, title: goal.title.trim(), position })),
    links,
  };
}

function sameKeys(a: readonly JiraIssue[], b: readonly JiraIssue[]): boolean {
  return sameJson(a.map((issue) => issue.key).sort(), b.map((issue) => issue.key).sort());
}

function sameJson(a: unknown, b: unknown): boolean {
  return stableJson(a) === stableJson(b);
}

function stableJson(input: unknown): string {
  const normalize = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(normalize);
    if (isRecord(value))
      return Object.fromEntries(
        Object.keys(value)
          .sort()
          .map((key) => [key, normalize(value[key])]),
      );
    return value;
  };
  return JSON.stringify(normalize(input));
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "La vérification Jira a échoué.";
}
