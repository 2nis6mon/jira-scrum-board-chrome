import {
  type BoardConfiguration,
  type IssueTypeConfiguration,
  normalizeSwimlanes,
} from "../../src/core/boardConfiguration";
import { decodeIssue, decodeSprint, type JiraIssue, type JiraSprint } from "../../src/jira/models";

// Fabriques de données FICTIVES, calquées sur la forme des réponses Jira. Équivalent des
// formats Jira employés par les tests. Jamais importé par src/.

export function statusJson(id: string, name: string, category = "indeterminate") {
  return { id, name, statusCategory: { id: 4, key: category, name: "X" } };
}

export interface IssueOptions {
  summary?: string;
  statusId?: string;
  statusName?: string;
  category?: string;
  typeId?: string;
  typeName?: string;
  assigneeId?: string;
  assigneeName?: string;
  labels?: string[];
  priority?: string;
  points?: number;
  blockedBy?: string;
  parent?: string;
  /** Champs supplémentaires, fusionnés tels quels dans `fields`. */
  extraFields?: Record<string, unknown>;
  changelog?: unknown;
}

export function issueJson(key: string, options: IssueOptions = {}): Record<string, unknown> {
  const fields: Record<string, unknown> = {
    summary: options.summary ?? "Résumé",
    status: statusJson(
      options.statusId ?? "3",
      options.statusName ?? "In Progress",
      options.category ?? "indeterminate",
    ),
    issuetype: {
      id: options.typeId ?? "10001",
      name: options.typeName ?? "Story",
      subtask: false,
    },
    labels: options.labels ?? [],
  };
  if (options.assigneeId !== undefined) {
    fields.assignee = {
      accountId: options.assigneeId,
      displayName: options.assigneeName ?? "Alex Martin",
    };
  }
  if (options.priority !== undefined) fields.priority = { id: "1", name: options.priority };
  if (options.points !== undefined) fields.customfield_10016 = options.points;
  if (options.blockedBy !== undefined) {
    fields.issuelinks = [
      {
        type: { name: "Blocks", inward: "is blocked by", outward: "blocks" },
        inwardIssue: { key: options.blockedBy, fields: { status: statusJson("3", "Open") } },
      },
    ];
  }
  if (options.parent !== undefined) {
    fields.parent = { key: options.parent, fields: { summary: `Epic ${options.parent}` } };
  }
  Object.assign(fields, options.extraFields);

  const issue: Record<string, unknown> = { id: key, key, fields };
  if (options.changelog !== undefined) issue.changelog = options.changelog;
  return issue;
}

export function makeIssue(key: string, options: IssueOptions = {}): JiraIssue {
  return decodeIssue(issueJson(key, options));
}

export function makeSprint(activatedDate: string | null): JiraSprint {
  return decodeSprint({
    id: 42,
    name: "Sprint 42",
    state: "active",
    startDate: "2026-09-12T09:00:00.000+0200",
    activatedDate,
  });
}

export const STORY_TYPE: IssueTypeConfiguration = {
  id: "10001",
  name: "Story",
  iconUrl: null,
  category: "GOAL",
  countsAsBug: null,
};

export const SWIMLANE_TYPE: IssueTypeConfiguration = {
  id: "10004",
  name: "Anomalie Prod",
  iconUrl: null,
  category: "SWIMLANE",
  countsAsBug: null,
};

export function makeConfiguration(parts: Partial<BoardConfiguration> = {}): BoardConfiguration {
  const issueTypes = parts.issueTypes ?? [STORY_TYPE, SWIMLANE_TYPE];
  return {
    boardId: 1,
    boardName: "Board",
    boardType: "scrum",
    kanbanSubQuery: null,
    boardPinnedGoalIds: [],
    projectKeys: ["ABC"],
    siteOrigin: "https://acme.atlassian.net",
    estimationFieldId: "customfield_10016",
    estimationFieldName: "Story Points",
    goalsFieldId: null,
    flaggedFieldId: null,
    columns: [
      column("todo", "To Do", ["1"], 0),
      column("prog", "In Progress", ["3"], 1),
      { ...column("done", "Done", ["6"], 2), isDone: true },
    ],
    issueTypes,
    ticketSwimlanes: normalizeSwimlanes(issueTypes, []),
    blockedLabels: [],
    agingThresholdDays: 3,
    autoRefreshSeconds: null,
    dailyMinutes: 15,
    dailyStockLimit: 3,
    hiddenGoalIds: [],
    blockOrder: [],
    collapsedBlockIds: [],
    buildSectionLabel: "Build",
    goalSource: "sprintText",
    goalColorIndex: {},
    cardFields: [],
    cardColorRules: [],
    localPinnedGoalIds: {},
    teamBase: null,
    ...parts,
  };
}

export function column(id: string, name: string, statusIds: string[], position: number) {
  return { id, name, statusIds, position, hidden: false, wipLimit: null, isDone: false };
}
