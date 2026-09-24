import { flaggedFieldId, goalsFieldId, type JiraClient } from "../jira/client";
import { JiraError } from "../jira/errors";
import type { JiraIssue, JiraIssueType, JiraSprint, JiraUser } from "../jira/models";
import { parseBoardUrl } from "../jira/site";
import { SPRINT_PROPERTY_KEYS } from "../jira/writes";
import {
  type BoardConfiguration,
  buildConfiguration,
  displayedCardFields,
  type GoalSource,
  mergeConfiguration,
} from "./boardConfiguration";
import { assembleBoardIssues, type BoardIssue, type BoardSnapshot } from "./boardIssue";
import { cardFieldJiraId } from "./cardFields";
import {
  assignGoalColors,
  decodeSprintGoalDocument,
  goalColorName,
  reconcileSprintGoals,
  type SprintGoal,
  type SprintGoalDocument,
} from "./sprintGoals";

/** Lectures Jira dont la synchronisation a besoin. `JiraClient` les fournit toutes. */
export type BoardReader = Pick<
  JiraClient,
  | "site"
  | "boardStructure"
  | "statuses"
  | "fields"
  | "sprints"
  | "sprintIssues"
  | "boardIssues"
  | "sprintProperty"
>;

// ─── Détection du board ──────────────────────────────────────────────────────

export type BoardSetupProblem =
  | { kind: "unrecognizedUrl" }
  | { kind: "siteMismatch"; expected: string; found: string };

export class BoardSetupError extends Error {
  readonly problem: BoardSetupProblem;

  constructor(problem: BoardSetupProblem) {
    super(
      problem.kind === "unrecognizedUrl"
        ? "Cette adresse ne désigne pas un board Jira."
        : `Ce board appartient à ${problem.found}, pas à ${problem.expected}.`,
    );
    this.name = "BoardSetupError";
    this.problem = problem;
  }

  get suggestion(): string {
    return this.problem.kind === "unrecognizedUrl"
      ? "Collez l'adresse complète de votre board, par exemple https://societe.atlassian.net/jira/software/c/projects/ABC/boards/123"
      : "L'extension n'a accès qu'au site auquel vous êtes connecté.";
  }
}

/**
 * Analyse l'URL du board puis lit sa structure dans Jira : colonnes, statuts, types, champ
 * d'estimation, champ Goals, champ du drapeau. Si ce board est déjà enregistré, ses réglages
 * locaux sont conservés.
 */
export async function detectBoard(
  reader: BoardReader,
  urlText: string,
  existing: BoardConfiguration | null,
): Promise<BoardConfiguration> {
  const parsed = parseBoardUrl(urlText);
  if (!parsed) throw new BoardSetupError({ kind: "unrecognizedUrl" });
  if (parsed.site.origin !== reader.site.origin) {
    throw new BoardSetupError({
      kind: "siteMismatch",
      expected: reader.site.host,
      found: parsed.site.host,
    });
  }
  return refreshBoardStructure(reader, parsed.boardId, existing);
}

/** Relit colonnes, statuts, types et champs depuis Jira, en gardant les réglages locaux. */
export async function refreshBoardStructure(
  reader: BoardReader,
  boardId: number,
  existing: BoardConfiguration | null,
): Promise<BoardConfiguration> {
  const board = await reader.boardStructure(boardId);

  // Statuts et champs servent à qualifier les colonnes et à repérer les champs : leur absence
  // dégrade la configuration sans empêcher le board de s'afficher.
  const statuses = await reader.statuses().catch(() => []);
  const allFields = await reader.fields().catch(() => []);
  const issueTypes = await discoverIssueTypes(reader, boardId);

  const fresh = buildConfiguration({
    board,
    siteOrigin: reader.site.origin,
    statuses,
    issueTypes,
    estimationFieldName:
      allFields.find((field) => field.id === board.estimationFieldId)?.name ?? null,
    goalsFieldId: goalsFieldId(allFields),
    flaggedFieldId: flaggedFieldId(allFields),
  });
  return mergeConfiguration(fresh, existing);
}

/** Types de tickets réellement présents sur le board. Seuls le type et le statut sont lus. */
async function discoverIssueTypes(reader: BoardReader, boardId: number): Promise<JiraIssueType[]> {
  const issues = await reader.boardIssues(boardId, null, {
    estimationFieldId: null,
    includeChangelog: false,
    onlyFields: ["issuetype", "status"],
  });
  const seen = new Map<string, JiraIssueType>();
  for (const issue of issues) seen.set(issue.fields.issuetype.id, issue.fields.issuetype);
  return [...seen.values()];
}

// ─── Photographie du sprint ──────────────────────────────────────────────────

/**
 * Lecture des objectifs en mode « Goals Atlassian » (API GraphQL). Fournie à part : elle ne
 * dépend pas du REST, et son échec déclenche un repli explicite sur le texte du sprint.
 */
export interface AtlassianGoalsLoader {
  load(input: {
    pinnedGoalIds: readonly string[];
    issues: readonly JiraIssue[];
    configuration: BoardConfiguration;
  }): Promise<{ goals: SprintGoal[]; links: Record<string, string>; warnings?: readonly string[] }>;
}

export interface SyncResult {
  readonly snapshot: BoardSnapshot;
  /** Propriété d'entité du sprint de référence, telle que lue dans Jira. */
  readonly document: SprintGoalDocument | null;
  /**
   * Pourquoi les Goals Atlassian n'ont pas pu être lus, quand le board s'est rabattu sur le
   * texte du sprint. `null` si tout s'est passé comme configuré.
   */
  readonly goalsIssue: string | null;
  /** Lectures partielles des Goals Atlassian : le board s'affiche, il y manque quelque chose. */
  readonly goalsWarnings: readonly string[];
  /** Couleurs des objectifs à mémoriser localement (jamais écrites dans Jira). */
  readonly goalColorIndex: Record<string, number>;
}

/**
 * Lit dans Jira tout ce que le board affiche : sprints actifs, leurs tickets, les objectifs.
 * Aucune écriture. Jira est la source de vérité : rien n'est complété ni estimé localement.
 */
export async function loadSnapshot(input: {
  reader: BoardReader;
  configuration: BoardConfiguration;
  currentUser: JiraUser | null;
  goalsLoader: AtlassianGoalsLoader | null;
  now?: Date;
}): Promise<SyncResult> {
  const { reader, configuration } = input;
  const now = input.now ?? new Date();

  // Le board montre les sprints ACTIFS, tous ensemble. Aucun autre sprint n'est consultable.
  const candidateSprints = (await reader.sprints(configuration.boardId, ["active"]))
    .filter((sprint) => sprint.state === "active")
    .sort((a, b) => (a.startDate?.getTime() ?? 0) - (b.startDate?.getTime() ?? 0));

  if (candidateSprints.length === 0) {
    return {
      snapshot: emptySnapshot(now, input.currentUser),
      document: null,
      goalsIssue: null,
      goalsWarnings: [],
      goalColorIndex: { ...configuration.goalColorIndex },
    };
  }

  const extraFieldIds = [
    configuration.goalsFieldId,
    configuration.flaggedFieldId,
    ...displayedCardFields(configuration).map(cardFieldJiraId),
  ].filter((id): id is string => id !== null);

  // Tickets du sprint RETENUS PAR LE FILTRE DU BOARD, comme sur le board Jira : un sprint peut
  // mêler les tickets de plusieurs boards (sprint partagé, ou sprint d'un autre board qui contient
  // un de nos tickets). Un sprint actif sans aucun ticket du board n'est pas affiché ; si aucun
  // n'en a, le premier reste (sprint qui vient de démarrer, vide).
  const read: { sprint: JiraSprint; issues: JiraIssue[] }[] = [];
  for (const candidate of candidateSprints) {
    read.push({
      sprint: candidate,
      issues: await reader.sprintIssues(configuration.boardId, candidate.id, {
        estimationFieldId: configuration.estimationFieldId,
        includeChangelog: true,
        extraFieldIds,
      }),
    });
  }
  const withIssues = read.filter((entry) => entry.issues.length > 0);
  const shown = withIssues.length > 0 ? withIssues : read.slice(0, 1);
  const activeSprints = shown.map((entry) => entry.sprint);
  // Premier sprint affiché : celui dont la propriété porte l'épinglage des Goals.
  const sprint = activeSprints[0] as JiraSprint;

  // Un ticket peut appartenir à plusieurs sprints : on garde sa première apparition, et avec
  // elle le sprint qui date son entrée de périmètre.
  const seenKeys = new Set<string>();
  const issuesBySprint = shown.map((entry) => ({
    sprint: entry.sprint,
    issues: entry.issues.filter((issue) => {
      if (seenKeys.has(issue.key)) return false;
      seenKeys.add(issue.key);
      return true;
    }),
  }));
  const sprintIssues = issuesBySprint.flatMap((entry) => entry.issues);

  // Propriété d'entité du sprint : épinglage des Goals, et liens du mode texte.
  let document: SprintGoalDocument | null = null;
  let goalsReadOnly = false;
  let pinnedGoalIds: readonly string[] | null = null;
  try {
    const value = await reader.sprintProperty(sprint.id, SPRINT_PROPERTY_KEYS.goals);
    document = value === null ? null : decodeSprintGoalDocument(value);
    pinnedGoalIds = document?.atlassianGoalIds ?? [];
  } catch (error) {
    if (!(error instanceof JiraError)) throw error;
    if (error.info.kind === "forbidden") goalsReadOnly = true;
  }

  let goals: SprintGoal[];
  let links: Record<string, string>;
  let goalsIssue: string | null = null;
  let goalsOrigin: GoalSource = "sprintText";
  let goalsWarnings: readonly string[] = [];

  // La sélection enregistrée dans Jira fait foi ; à défaut, celle gardée dans ce navigateur quand
  // Jira a refusé de l'enregistrer (même règle que le Mac).
  const localPins = configuration.localPinnedGoalIds[String(sprint.id)] ?? [];
  const localPinnedGoalIds =
    (pinnedGoalIds ?? []).length === 0 && localPins.length > 0 ? [...localPins] : null;

  if (configuration.goalSource === "atlassianGoals" && input.goalsLoader) {
    try {
      const resolved = await input.goalsLoader.load({
        pinnedGoalIds: localPinnedGoalIds ?? document?.atlassianGoalIds ?? [],
        issues: sprintIssues,
        configuration,
      });
      goals = resolved.goals;
      links = resolved.links;
      goalsWarnings = resolved.warnings ?? [];
      goalsOrigin = "atlassianGoals";
    } catch (error) {
      // Repli explicite sur le champ texte, sans masquer la cause.
      goalsIssue = describeGoalsFailure(error);
      ({ goals, links } = reconcileSprintGoals(sprint.goal, document));
    }
  } else {
    if (configuration.goalSource === "atlassianGoals") {
      goalsIssue = "Lecture des Goals Atlassian indisponible.";
    }
    ({ goals, links } = reconcileSprintGoals(sprint.goal, document));
  }

  const types = new Map(configuration.issueTypes.map((type) => [type.id, type.category]));
  const categoryOf = (issue: JiraIssue) => types.get(issue.fields.issuetype.id) ?? "SCRUM";

  // Sous-tâches : elles gardent leur carte, mais suivent leur story. Sans Goal propre, elles prennent
  // celui de leur parent ; et quand leur parent est sur le board, elles vont dans le même bloc que
  // lui (Scrum ou Kanban). La story et ses sous-tâches restent ainsi dans la même swimlane.
  const families = subtaskFamilies(sprintIssues, links);
  const scrumLinks = { ...links, ...families.inheritedLinks };
  const blockOf = (issue: JiraIssue) => categoryOf(families.parentOf.get(issue.key) ?? issue);

  // Chaque ticket est daté par rapport à SON sprint, pas par rapport au premier : « ajouté en
  // cours de sprint » reste juste avec plusieurs sprints actifs.
  const scrumIssues: BoardIssue[] = [];
  const kanbanIssues: BoardIssue[] = [];
  for (const entry of issuesBySprint) {
    scrumIssues.push(
      ...assembleBoardIssues({
        issues: entry.issues.filter((issue) => blockOf(issue) === "SCRUM"),
        configuration,
        columns: configuration.scrumColumns,
        links: scrumLinks,
        sprint: entry.sprint,
        subtaskIssues: families.subtaskIssues,
        now,
      }),
    );
    kanbanIssues.push(
      ...assembleBoardIssues({
        issues: entry.issues.filter((issue) => blockOf(issue) === "KANBAN"),
        configuration,
        columns: configuration.kanbanColumns,
        links: {},
        sprint: entry.sprint,
        subtaskIssues: families.subtaskIssues,
        now,
      }),
    );
  }

  // Couleurs des objectifs : locales, stables d'un sprint à l'autre.
  const goalColorIndex = assignGoalColors(
    goals.map((goal) => goal.id),
    configuration.goalColorIndex,
  );
  const coloredGoals = goals.map((goal) => ({
    ...goal,
    color: goalColorName(goalColorIndex[goal.id] ?? 0),
  }));

  return {
    snapshot: {
      sprint,
      activeSprints,
      goals: coloredGoals,
      goalsOrigin,
      scrumIssues,
      kanbanIssues,
      syncedAt: now,
      currentUser: input.currentUser,
      goalsReadOnly,
      pinnedGoalIds,
      localPinnedGoalIds: goalsOrigin === "atlassianGoals" ? localPinnedGoalIds : null,
    },
    document,
    goalsIssue,
    goalsWarnings,
    goalColorIndex,
  };
}

/**
 * Familles des sous-tâches du sprint. `parentOf` : parent de chaque sous-tâche quand il est un ticket
 * du sprint. `inheritedLinks` : Goal du parent pour chaque sous-tâche qui n'en a pas en propre.
 * `subtaskIssues` : les sous-tâches du sprint, par clé, pour l'avancement affiché sur leur parent.
 */
export function subtaskFamilies(
  sprintIssues: readonly JiraIssue[],
  links: Readonly<Record<string, string>>,
): {
  parentOf: ReadonlyMap<string, JiraIssue>;
  subtaskIssues: ReadonlyMap<string, JiraIssue>;
  inheritedLinks: Record<string, string>;
} {
  const isSubtask = (issue: JiraIssue) => issue.fields.issuetype.subtask === true;
  const parents = new Map(
    sprintIssues.filter((issue) => !isSubtask(issue)).map((issue) => [issue.key, issue]),
  );
  const parentOf = new Map<string, JiraIssue>();
  const subtaskIssues = new Map<string, JiraIssue>();
  const inheritedLinks: Record<string, string> = {};
  for (const issue of sprintIssues) {
    const parentKey = issue.fields.parent?.key;
    if (!isSubtask(issue) || parentKey === undefined) continue;
    subtaskIssues.set(issue.key, issue);
    const parent = parents.get(parentKey);
    if (parent) parentOf.set(issue.key, parent);
    // Un rattachement propre à la sous-tâche l'emporte toujours sur celui de son parent.
    if (links[issue.key] === undefined && links[parentKey] !== undefined)
      inheritedLinks[issue.key] = links[parentKey];
  }
  return { parentOf, subtaskIssues, inheritedLinks };
}

function emptySnapshot(now: Date, currentUser: JiraUser | null): BoardSnapshot {
  return {
    sprint: null,
    activeSprints: [],
    goals: [],
    goalsOrigin: "sprintText",
    scrumIssues: [],
    kanbanIssues: [],
    syncedAt: now,
    currentUser,
    goalsReadOnly: false,
    pinnedGoalIds: null,
    localPinnedGoalIds: null,
  };
}

/** Cause d'un échec de lecture des Goals, dite dans les termes de ce qui s'est passé. */
export function describeGoalsFailure(error: unknown): string {
  if (
    error instanceof JiraError &&
    error.info.kind === "forbidden" &&
    /cors/i.test(error.info.bodyExcerpt)
  ) {
    return "la passerelle GraphQL d'Atlassian refuse l'origine des requêtes de l'extension (« Invalid CORS request »). Administration → Diagnostic essaie les variantes de l'en-tête Origin et retient celle qui passe.";
  }
  return error instanceof Error ? error.message : String(error);
}
