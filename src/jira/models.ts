import { JiraError } from "./errors";
import { isRecord, type JsonValue } from "./json";

// Modèles Jira et leur décodage.
//
// Le décodage est tolérant : un champ facultatif absent ou mal formé
// devient `null` ou une liste vide ; seuls les champs sans lesquels un ticket n'a pas de
// sens (identifiant, clé, statut, type) font échouer le décodage. Aucune valeur n'est inventée.

// ─── Utilisateur ─────────────────────────────────────────────────────────────

export interface JiraUser {
  readonly accountId: string | null;
  readonly displayName: string;
  readonly avatarUrls: Readonly<Record<string, string>>;
}

/** Avatar 48x48 si disponible, sinon la plus grande taille proposée. */
export function avatarUrl(user: JiraUser): string | null {
  const urls = user.avatarUrls;
  return urls["48x48"] ?? urls["32x32"] ?? urls["24x24"] ?? Object.values(urls)[0] ?? null;
}

export function userInitials(user: JiraUser): string {
  return user.displayName
    .split(" ")
    .filter((part) => part !== "")
    .slice(0, 2)
    .map((part) => [...part][0] ?? "")
    .join("")
    .toUpperCase();
}

// ─── Statuts ─────────────────────────────────────────────────────────────────

export interface JiraStatusCategory {
  readonly id: number;
  /** `new` | `indeterminate` | `done` — vocabulaire Atlassian. */
  readonly key: string;
  readonly name: string;
}

export interface JiraStatus {
  readonly id: string;
  readonly name: string;
  readonly statusCategory: JiraStatusCategory | null;
}

export function isDoneStatus(status: JiraStatus | null): boolean {
  return status?.statusCategory?.key === "done";
}

// ─── Type, priorité, composant, version ──────────────────────────────────────

export interface JiraIssueType {
  readonly id: string;
  readonly name: string;
  readonly iconUrl: string | null;
  readonly subtask: boolean | null;
}

export interface JiraPriority {
  readonly id: string;
  readonly name: string;
  readonly iconUrl: string | null;
}

export interface JiraComponent {
  readonly id: string;
  readonly name: string;
}

/** Version d'un projet (`fixVersions`, `versions`). */
export interface JiraVersion {
  readonly id: string | null;
  readonly name: string;
}

// ─── Liens entre tickets (source native de l'information « bloqué ») ─────────

export interface JiraIssueLinkType {
  readonly name: string;
  readonly inward: string;
  readonly outward: string;
}

export interface JiraLinkedIssueRef {
  readonly key: string;
  readonly summary: string | null;
  readonly status: JiraStatus | null;
  /** Type du ticket lié, tel que Jira l'inclut dans `issuelinks` et `subtasks`. */
  readonly issuetype: JiraIssueType | null;
}

export interface JiraIssueLink {
  readonly type: JiraIssueLinkType;
  readonly inwardIssue: JiraLinkedIssueRef | null;
  readonly outwardIssue: JiraLinkedIssueRef | null;
}

/**
 * Vrai si ce lien signifie « ce ticket est bloqué par un autre ».
 * Formulation native Atlassian : `type.inward == "is blocked by"`.
 */
export function indicatesBlocked(link: JiraIssueLink): boolean {
  const blocker = link.inwardIssue;
  if (!blocker) return false;
  const phrase = link.type.inward.toLowerCase();
  if (!phrase.includes("blocked by") && !phrase.includes("bloqué par")) return false;
  // Un bloqueur déjà terminé ne bloque plus.
  return !isDoneStatus(blocker.status);
}

// ─── Historique ──────────────────────────────────────────────────────────────

export interface JiraChangelogItem {
  readonly field: string;
  readonly fromString: string | null;
  readonly toString: string | null;
}

export interface JiraChangelogHistory {
  readonly created: Date | null;
  readonly items: readonly JiraChangelogItem[];
}

export interface JiraChangelog {
  readonly histories: readonly JiraChangelogHistory[];
}

/**
 * Date du dernier changement de statut, ou `null` si l'historique n'en contient aucun.
 * Sert à calculer l'âge dans la colonne — jamais estimé autrement.
 */
export function lastStatusChange(changelog: JiraChangelog): Date | null {
  let latest: Date | null = null;
  for (const history of changelog.histories) {
    if (!history.created) continue;
    if (!history.items.some((item) => item.field.toLowerCase() === "status")) continue;
    if (latest === null || history.created > latest) latest = history.created;
  }
  return latest;
}

/** Place d'un ticket dans un sprint, lue dans l'historique de son champ « Sprint ». */
export interface SprintScope {
  /**
   * Le ticket était-il dans le sprint à son démarrage ? `null` : impossible à dire (ni changement
   * du champ Sprint, ni date de création).
   */
  readonly inSprintAtStart: boolean | null;
  /** Dernière entrée dans le sprint (ou création, faute d'entrée notée) ; `null` si inconnue. */
  readonly enteredAt: Date | null;
}

/**
 * Le ticket était-il dans le sprint au moment où celui-ci a démarré ? On rejoue l'historique du
 * champ « Sprint » : le dernier changement avant le démarrage donne l'état à ce moment ; sans
 * changement avant, l'ancienne valeur du premier changement d'après ; sans aucun changement, la
 * date de création (créé avant le démarrage : il y était). Un ticket mis dans le sprint pendant le
 * planning, retiré, puis remis après le démarrage, compte donc comme ajouté ; un ticket présent au
 * démarrage, sorti puis revenu, non. Jira note les sprints par leur NOM, séparés par des virgules.
 */
export function sprintScope(input: {
  changelog: JiraChangelog;
  sprintName: string;
  startedAt: Date;
  created: Date | null;
}): SprintScope {
  const target = input.sprintName.trim();
  if (target === "") return { inSprintAtStart: null, enteredAt: null };
  // `target` n'est jamais vide : une liste absente ne peut donc pas le contenir.
  const lists = (list: string | null): boolean =>
    (list ?? "")
      .split(",")
      .map((name) => name.trim())
      .includes(target);

  const changes = input.changelog.histories
    .flatMap((history) => {
      const item = history.items.find((candidate) => candidate.field.toLowerCase() === "sprint");
      return history.created && item ? [{ at: history.created, item }] : [];
    })
    .sort((a, b) => a.at.getTime() - b.at.getTime());

  const before = changes.filter((change) => change.at <= input.startedAt);
  const after = changes.filter((change) => change.at > input.startedAt);
  const lastBefore = before.at(-1);
  const firstAfter = after[0];
  const inSprintAtStart = lastBefore
    ? lists(lastBefore.item.toString)
    : firstAfter
      ? lists(firstAfter.item.fromString)
      : input.created === null
        ? null
        : input.created <= input.startedAt;

  const entries = changes.filter(
    (change) => lists(change.item.toString) && !lists(change.item.fromString),
  );
  const enteredAt =
    entries.at(-1)?.at ?? (changes.length === 0 || !inSprintAtStart ? input.created : null);
  return { inSprintAtStart, enteredAt };
}

// ─── Ticket ──────────────────────────────────────────────────────────────────

export interface JiraIssueFields {
  readonly summary: string;
  readonly status: JiraStatus;
  readonly issuetype: JiraIssueType;
  readonly assignee: JiraUser | null;
  readonly priority: JiraPriority | null;
  readonly labels: readonly string[];
  readonly components: readonly JiraComponent[];
  readonly issuelinks: readonly JiraIssueLink[];
  /** Sous-tâches, avec leur type et leur statut. */
  readonly subtasks: readonly JiraLinkedIssueRef[];
  /** Ticket parent (epic ou parent d'une sous-tâche), avec son résumé. */
  readonly parent: JiraLinkedIssueRef | null;
  /** Versions de correction. Vide si le champ n'a pas été demandé. */
  readonly fixVersions: readonly JiraVersion[];
  /** Versions affectées (champ Jira `versions`). Vide si le champ n'a pas été demandé. */
  readonly affectsVersions: readonly JiraVersion[];
  readonly created: Date | null;
  readonly updated: Date | null;
  /**
   * Champs `customfield_*` conservés bruts : l'identifiant du champ Story Points, du champ
   * Goals ou du drapeau n'est connu qu'à la lecture de la configuration du board.
   */
  readonly customFields: Readonly<Record<string, JsonValue>>;
}

export interface JiraIssue {
  readonly id: string;
  readonly key: string;
  readonly fields: JiraIssueFields;
  readonly changelog: JiraChangelog | null;
}

/**
 * Estimation lue dans le champ désigné par la configuration du board
 * (`estimation.field.fieldId`). `null` si le champ est absent ou vide : rien n'est inventé.
 */
export function estimate(fields: JiraIssueFields, fieldId: string | null): number | null {
  const value = fieldId === null ? undefined : fields.customFields[fieldId];
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * Tickets rattachés à celui-ci, par lien Jira ou comme sous-tâche, sans doublon.
 * Le sens du lien importe peu : un bug « lié à », « causé par » ou « bloque » reste un bug
 * rattaché au ticket.
 */
export function relatedIssues(fields: JiraIssueFields): JiraLinkedIssueRef[] {
  const linked = fields.issuelinks
    .map((link) => link.inwardIssue ?? link.outwardIssue)
    .filter((ref): ref is JiraLinkedIssueRef => ref !== null);
  const seen = new Set<string>();
  return [...linked, ...fields.subtasks].filter((ref) => {
    if (seen.has(ref.key)) return false;
    seen.add(ref.key);
    return true;
  });
}

export function isBlockedByLink(fields: JiraIssueFields): boolean {
  return fields.issuelinks.some(indicatesBlocked);
}

/**
 * Tickets qui bloquent celui-ci, tels que Jira les inclut dans `issuelinks` : clé, résumé,
 * statut et type, sans appel supplémentaire.
 */
export function blockingIssues(fields: JiraIssueFields): JiraLinkedIssueRef[] {
  return fields.issuelinks
    .filter(indicatesBlocked)
    .map((link) => link.inwardIssue)
    .filter((ref): ref is JiraLinkedIssueRef => ref !== null);
}

/**
 * Vrai si le ticket porte le drapeau Jira : le champ « Flagged » contient au moins une valeur
 * (« Impediment »). Vide ou absent : pas de drapeau.
 */
export function isFlagged(fields: JiraIssueFields, fieldId: string | null): boolean {
  const value = fieldId === null ? undefined : fields.customFields[fieldId];
  if (value === undefined || value === null) return false;
  return Array.isArray(value) ? value.length > 0 : true;
}

/**
 * Valeur d'un champ personnalisé, mise en texte pour la carte.
 *
 * Seules les formes simples sont lues : texte, nombre, booléen, liste de choix (`value`),
 * utilisateur (`displayName`), objet nommé (`name`), et leurs tableaux. Tout le reste (texte
 * riche, objets inconnus) donne une liste vide.
 */
export function displayValues(fields: JiraIssueFields, fieldId: string | null): string[] {
  const value = fieldId === null ? undefined : fields.customFields[fieldId];
  return value === undefined ? [] : displayValuesOf(value);
}

function displayValuesOf(value: JsonValue): string[] {
  if (value === null) return [];
  if (typeof value === "string") return value.trim() === "" ? [] : [value.trim()];
  if (typeof value === "number") return [String(value)];
  if (typeof value === "boolean") return [value ? "Oui" : "Non"];
  if (Array.isArray(value)) return value.flatMap(displayValuesOf);

  // Liste en cascade : « parent › enfant ».
  const child = value.child;
  if (typeof value.value === "string" && isRecord(child) && typeof child.value === "string") {
    return [`${value.value} › ${child.value}`];
  }
  for (const key of ["value", "displayName", "name"]) {
    const text = value[key];
    if (typeof text === "string" && text !== "") return [text];
  }
  return [];
}

/**
 * Identifiants des Goals Atlassian rattachés à ce ticket.
 *
 * C'est le lien natif : les Goals se rattachent aux tickets, pas aux sprints. Le format de la
 * valeur n'étant pas documenté, la lecture est volontairement tolérante — tableau de chaînes,
 * tableau d'objets `{id}`, ou valeur unique — et ne retient que ce qui est un ARI de Goal ou
 * une clé `ABC-123`.
 */
export function linkedGoalIds(fields: JiraIssueFields, fieldId: string | null): string[] {
  const value = fieldId === null ? undefined : fields.customFields[fieldId];
  if (value === undefined) return [];
  const found: string[] = [];
  collectGoalIdentifiers(value, found);
  return [...new Set(found)];
}

function collectGoalIdentifiers(value: JsonValue, result: string[]): void {
  if (typeof value === "string") {
    if (looksLikeGoalIdentifier(value)) result.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectGoalIdentifiers(item, result);
    return;
  }
  if (value === null || typeof value !== "object") return;

  // Un objet décrivant un Goal porte son identifiant sous l'une de ces clés.
  for (const key of ["id", "ari", "goalId", "key"]) {
    const text = value[key];
    if (typeof text === "string" && looksLikeGoalIdentifier(text)) {
      result.push(text);
      return;
    }
  }
  for (const nested of Object.values(value)) collectGoalIdentifiers(nested, result);
}

/** Un identifiant de Goal est un ARI Atlassian, ou une clé de la forme `ABC-123`. */
function looksLikeGoalIdentifier(text: string): boolean {
  if (text.startsWith("ari:") && text.includes("goal")) return true;
  return /^[A-Z][A-Z0-9]*-\d+$/.test(text);
}

// ─── Sprint ──────────────────────────────────────────────────────────────────

export interface JiraSprint {
  readonly id: number;
  readonly name: string;
  /** `active` | `future` | `closed` */
  readonly state: string;
  readonly startDate: Date | null;
  readonly endDate: Date | null;
  readonly completeDate: Date | null;
  /**
   * Démarrage effectif du sprint. Distinct de `startDate`, qui est la date planifiée : c'est
   * lui qui fait foi pour savoir si un ticket a été ajouté « en cours de route ».
   */
  readonly activatedDate: Date | null;
  readonly originBoardId: number | null;
  /**
   * Objectif de sprint natif Atlassian : UNE SEULE chaîne de texte libre. Lu, jamais écrit.
   */
  readonly goal: string | null;
}

/** Démarrage réel : `activatedDate` si Jira le fournit, sinon `startDate`. */
export function sprintActivated(sprint: JiraSprint): Date | null {
  return sprint.activatedDate ?? sprint.startDate;
}

// ─── Transitions ─────────────────────────────────────────────────────────────

export interface JiraTransitionField {
  // Seules les informations nécessaires pour déléguer la saisie à Jira sont conservées.
  readonly required: boolean;
  readonly name: string | null;
  readonly hasDefaultValue: boolean | null;
}

export interface JiraTransition {
  readonly hasScreen?: boolean;
  readonly id: string;
  readonly name: string;
  readonly to: JiraStatus;
  readonly isAvailable: boolean | null;
  /** Champs exigés par l'écran de transition, indexés par identifiant de champ. */
  readonly fields: Readonly<Record<string, JiraTransitionField>>;
}

/**
 * Champs obligatoires sans valeur par défaut : la transition échouerait. L'application refuse
 * alors d'agir plutôt que d'écrire des données arbitraires.
 */
export function blockingRequiredFields(transition: JiraTransition): string[] {
  return Object.entries(transition.fields)
    .filter(([, field]) => field.required && field.hasDefaultValue !== true)
    .map(([id, field]) => field.name ?? id)
    .sort();
}

// ─── Goal Atlassian ──────────────────────────────────────────────────────────

export interface AtlassianGoal {
  readonly id: string;
  readonly key: string | null;
  readonly name: string | null;
  readonly statusLabel: string | null;
  readonly ownerName: string | null;
  readonly targetDate: string | null;
  readonly url: string | null;
  /** Objectif archivé côté Atlassian. Exclu par défaut des listes de sélection. */
  readonly isArchived: boolean;
}

/** Libellé affichable, sans jamais inventer de texte. */
export function goalDisplayName(goal: AtlassianGoal): string {
  return goal.name ?? goal.key ?? goal.id;
}

// ─── Dates ───────────────────────────────────────────────────────────────────

const JIRA_DATE =
  /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:?\d{2}))?$/;

/**
 * Jira renvoie plusieurs formats selon les champs (`2015-04-11T15:22:00.000+1000`, avec ou sans
 * millisecondes, décalage avec ou sans deux-points, et `2015-04-11` pour les dates seules, lues
 * en UTC). Un format inconnu donne `null` plutôt que de faire échouer tout le décodage.
 */
export function parseJiraDate(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const match = JIRA_DATE.exec(value.trim());
  if (!match) return null;
  const [, year, month, day, hours, minutes, seconds, fraction, zone] = match;

  let offsetMinutes = 0;
  if (zone !== undefined && zone !== "Z") {
    const sign = zone.startsWith("-") ? -1 : 1;
    const digits = zone.slice(1).replace(":", "");
    offsetMinutes = sign * (Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2, 4)));
  }
  const utc = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hours ?? 0),
    Number(minutes ?? 0),
    Number(seconds ?? 0),
    Number((fraction ?? "0").padEnd(3, "0")),
  );
  const date = new Date(utc - offsetMinutes * 60_000);
  return Number.isNaN(date.getTime()) ? null : date;
}

// ─── Décodage ────────────────────────────────────────────────────────────────

function fail(context: string, detail: string): never {
  throw new JiraError({ kind: "decoding", context, detail });
}

function text(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function list<T>(value: unknown, decode: (item: unknown) => T | null): T[] {
  if (!Array.isArray(value)) return [];
  return value.map(decode).filter((item): item is T => item !== null);
}

export function decodeUser(value: unknown): JiraUser | null {
  if (!isRecord(value) || typeof value.displayName !== "string") return null;
  const avatarUrls: Record<string, string> = {};
  if (isRecord(value.avatarUrls)) {
    for (const [size, url] of Object.entries(value.avatarUrls)) {
      if (typeof url === "string") avatarUrls[size] = url;
    }
  }
  return { accountId: text(value.accountId), displayName: value.displayName, avatarUrls };
}

export function decodeStatus(value: unknown): JiraStatus | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.name !== "string") {
    return null;
  }
  const category = value.statusCategory;
  const statusCategory =
    isRecord(category) && typeof category.key === "string"
      ? {
          id: typeof category.id === "number" ? category.id : 0,
          key: category.key,
          name: text(category.name) ?? "",
        }
      : null;
  return { id: value.id, name: value.name, statusCategory };
}

export function decodeIssueType(value: unknown): JiraIssueType | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.name !== "string") {
    return null;
  }
  return {
    id: value.id,
    name: value.name,
    iconUrl: text(value.iconUrl),
    subtask: typeof value.subtask === "boolean" ? value.subtask : null,
  };
}

function decodePriority(value: unknown): JiraPriority | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.name !== "string") {
    return null;
  }
  return { id: value.id, name: value.name, iconUrl: text(value.iconUrl) };
}

function decodeComponent(value: unknown): JiraComponent | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.name !== "string") {
    return null;
  }
  return { id: value.id, name: value.name };
}

function decodeVersion(value: unknown): JiraVersion | null {
  if (!isRecord(value) || typeof value.name !== "string") return null;
  return { id: text(value.id), name: value.name };
}

function decodeLinkedRef(value: unknown): JiraLinkedIssueRef | null {
  if (!isRecord(value) || typeof value.key !== "string") return null;
  const fields = isRecord(value.fields) ? value.fields : {};
  return {
    key: value.key,
    summary: text(fields.summary),
    status: decodeStatus(fields.status),
    issuetype: decodeIssueType(fields.issuetype),
  };
}

function decodeLink(value: unknown): JiraIssueLink | null {
  if (!isRecord(value) || !isRecord(value.type)) return null;
  const { name, inward, outward } = value.type;
  if (typeof name !== "string" || typeof inward !== "string" || typeof outward !== "string") {
    return null;
  }
  return {
    type: { name, inward, outward },
    inwardIssue: decodeLinkedRef(value.inwardIssue),
    outwardIssue: decodeLinkedRef(value.outwardIssue),
  };
}

export function decodeChangelog(value: unknown): JiraChangelog | null {
  if (!isRecord(value) || !Array.isArray(value.histories)) return null;
  return {
    histories: list(value.histories, (history) => {
      if (!isRecord(history)) return null;
      return {
        created: parseJiraDate(history.created),
        items: list(history.items, (item) => {
          if (!isRecord(item) || typeof item.field !== "string") return null;
          return {
            field: item.field,
            fromString: text(item.fromString),
            toString: text(item.toString),
          };
        }),
      };
    }),
  };
}

export function decodeIssueFields(value: unknown, context = "ticket"): JiraIssueFields {
  if (!isRecord(value)) fail(context, "fields absent");
  const status = decodeStatus(value.status) ?? fail(context, "status absent ou illisible");
  const issuetype =
    decodeIssueType(value.issuetype) ?? fail(context, "issuetype absent ou illisible");

  const customFields: Record<string, JsonValue> = {};
  for (const [name, field] of Object.entries(value)) {
    // Garder `null` permet de distinguer un champ demandé mais vide d'un champ absent de la
    // réponse : cette distinction est nécessaire au repli Kanban sur le champ Goals des tickets.
    if (name.startsWith("customfield_") && field !== undefined) {
      customFields[name] = field as JsonValue;
    }
  }

  return {
    summary: text(value.summary) ?? "",
    status,
    issuetype,
    assignee: decodeUser(value.assignee),
    priority: decodePriority(value.priority),
    labels: list(value.labels, text),
    components: list(value.components, decodeComponent),
    issuelinks: list(value.issuelinks, decodeLink),
    subtasks: list(value.subtasks, decodeLinkedRef),
    parent: decodeLinkedRef(value.parent),
    fixVersions: list(value.fixVersions, decodeVersion),
    affectsVersions: list(value.versions, decodeVersion),
    created: parseJiraDate(value.created),
    updated: parseJiraDate(value.updated),
    customFields,
  };
}

export function decodeIssue(value: unknown): JiraIssue {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.key !== "string") {
    fail("ticket", "id ou key absent");
  }
  return {
    id: value.id,
    key: value.key,
    fields: decodeIssueFields(value.fields, `ticket ${value.key}`),
    changelog: decodeChangelog(value.changelog),
  };
}

export function decodeSprint(value: unknown): JiraSprint {
  if (!isRecord(value) || typeof value.id !== "number" || typeof value.name !== "string") {
    fail("sprint", "id ou name absent");
  }
  return {
    id: value.id,
    name: value.name,
    state: text(value.state) ?? "",
    startDate: parseJiraDate(value.startDate),
    endDate: parseJiraDate(value.endDate),
    completeDate: parseJiraDate(value.completeDate),
    activatedDate: parseJiraDate(value.activatedDate),
    originBoardId: typeof value.originBoardId === "number" ? value.originBoardId : null,
    goal: text(value.goal),
  };
}

export function decodeTransition(value: unknown): JiraTransition {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.name !== "string") {
    fail("transition", "id ou name absent");
  }
  const to = decodeStatus(value.to) ?? fail(`transition ${value.id}`, "statut cible absent");
  const fields: Record<string, JiraTransitionField> = {};
  if (isRecord(value.fields)) {
    for (const [id, field] of Object.entries(value.fields)) {
      if (!isRecord(field)) continue;
      fields[id] = {
        required: field.required === true,
        name: text(field.name),
        hasDefaultValue: typeof field.hasDefaultValue === "boolean" ? field.hasDefaultValue : null,
      };
    }
  }
  return {
    id: value.id,
    name: value.name,
    to,
    hasScreen: value.hasScreen === true,
    isAvailable: typeof value.isAvailable === "boolean" ? value.isAvailable : null,
    fields,
  };
}
