import { getLanguage, type Language, localize } from "../../i18n";
import type { LocalStore } from "../platform/types";
import { type AppMessage, isAppMessage, renderMessage } from "./appMessage";

/**
 * Journal local des écritures dans Jira, pour le diagnostic : quoi, sur quel ticket, avec quel
 * résultat. Il reste dans ce navigateur (`chrome.storage.local`) et ne contient aucun secret ni
 * nom de personne. Les 500 dernières entrées sont conservées.
 *
 * Depuis 0.36.2, les textes produits par l'extension sont gardés en clés du catalogue avec leurs
 * paramètres (`toMessage`, `detailMessage`) et traduits à l'affichage ; `to` et `detail` ne
 * portent plus que du contenu Jira brut, ou `null`. Les entrées plus anciennes gardent leurs
 * phrases françaises dans `to`/`detail` et restent présentées par `localize`. Le message d'erreur
 * d'une écriture en échec est rangé dans `detailMessage` (`{ text }`) ; `detail` ne garde que le
 * message renvoyé par Atlassian. Les champs obligatoires de 0.36.1 sont inchangés : une version
 * précédente accepte les nouvelles entrées, mais affiche vides leurs colonnes Cible et Détail
 * produites par l'extension.
 */
export interface AuditEntry {
  /** Date ISO de la tentative. */
  readonly at: string;
  readonly site: string;
  readonly action:
    | "transition"
    | "transition choisie"
    | "classement"
    | "rattachement"
    | "épinglage"
    | "réglages d'équipe"
    | "sprint planning";
  /** Ticket concerné ; `null` pour une écriture qui porte sur le sprint ou le board. */
  readonly issueKey: string | null;
  readonly from: string | null;
  /** Contenu Jira brut (nom de colonne, de statut, titre d'objectif), ou phrase historique. */
  readonly to: string | null;
  /** Cible décrite par l'extension (« aucun objectif », « après ABC-1 »…), traduite à l'affichage. */
  readonly toMessage?: AppMessage;
  /** `incertain` : Jira n'a pas répondu, l'écriture a peut-être eu lieu. */
  readonly outcome: "réussi" | "échec" | "incertain";
  /** Message renvoyé par Atlassian (rattachement refusé), ou phrase historique. */
  readonly detail: string | null;
  /** Détail décrit par l'extension, traduit à l'affichage. */
  readonly detailMessage?: AppMessage;
}

const AUDIT_KEY = "audit.v1";
export const MAX_AUDIT_ENTRIES = 500;
export const AUDIT_STORE_KEYS = [AUDIT_KEY] as const;

/**
 * File unique des lectures-écritures de audit.v1 pour un même stockage : ajouts des instances et
 * effacement de la déconnexion s'y enchaînent, aucune entrée n'est perdue ni ne revient.
 */
const queues = new WeakMap<LocalStore, Promise<unknown>>();

function enqueue<T>(store: LocalStore, task: () => Promise<T>): Promise<T> {
  const next = (queues.get(store) ?? Promise.resolve()).then(task);
  queues.set(
    store,
    next.catch(() => {}),
  );
  return next;
}

export class AuditLog {
  readonly #store: LocalStore;

  constructor(store: LocalStore) {
    this.#store = store;
  }

  /** Les ajouts sont enchaînés : deux écritures simultanées ne perdent aucune entrée. */
  append(entry: AuditEntry): Promise<void> {
    return enqueue(this.#store, async () => {
      const entries = await readEntries(this.#store);
      entries.push(entry);
      await this.#store.set(AUDIT_KEY, entries.slice(-MAX_AUDIT_ENTRIES));
    });
  }

  /** Entrées d'un site, de la plus récente à la plus ancienne. */
  async list(site: string): Promise<AuditEntry[]> {
    await (queues.get(this.#store) ?? Promise.resolve());
    return (await readEntries(this.#store)).filter((entry) => entry.site === site).reverse();
  }

  /** Efface les entrées d'un site (bouton du journal, ou déconnexion). */
  forgetSite(site: string): Promise<void> {
    return forgetAuditSite(this.#store, site);
  }
}

async function readEntries(store: LocalStore): Promise<AuditEntry[]> {
  const raw = await store.get(AUDIT_KEY);
  return Array.isArray(raw) ? raw.filter(isEntry) : [];
}

/** Efface les entrées d'un site (liste de la déconnexion), dans la file des ajouts. */
export function forgetAuditSite(store: LocalStore, site: string): Promise<void> {
  return enqueue(store, async () => {
    const kept = (await readEntries(store)).filter((entry) => entry.site !== site);
    if (kept.length === 0) await store.remove(AUDIT_KEY);
    else await store.set(AUDIT_KEY, kept);
  });
}

function isEntry(value: unknown): value is AuditEntry {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.at === "string" &&
    typeof entry.site === "string" &&
    typeof entry.action === "string" &&
    (typeof entry.issueKey === "string" || entry.issueKey === null) &&
    typeof entry.outcome === "string"
  );
}

/**
 * Texte d'une colonne de l'entrée, dans la langue courante : le message de l'extension s'il est
 * lisible, sinon le champ texte (contenu Jira, ou phrase historique présentée par `localize`).
 * Un message d'une forme inconnue n'écarte jamais l'entrée.
 */
export function auditText(
  entry: AuditEntry,
  field: "to" | "detail",
  language: Language = getLanguage(),
): string {
  const described = field === "to" ? entry.toMessage : entry.detailMessage;
  if (isAppMessage(described)) return renderMessage(described, language);
  const text = entry[field] ?? "";
  // Le contenu Jira de `to` n'a jamais été traduit ; les phrases historiques de `detail` le sont.
  return field === "detail" ? localize(text, language) : text;
}
