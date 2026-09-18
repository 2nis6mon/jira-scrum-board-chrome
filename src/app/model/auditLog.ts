import type { LocalStore } from "../platform/types";

/**
 * Journal local des écritures dans Jira, pour le diagnostic : quoi, sur quel ticket, avec quel
 * résultat. Il reste dans ce navigateur (`chrome.storage.local`) et ne contient aucun secret ni
 * nom de personne. Les 500 dernières entrées sont conservées.
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
    | "épinglage";
  /** Ticket concerné ; `null` pour une écriture qui porte sur le sprint (épinglage). */
  readonly issueKey: string | null;
  readonly from: string | null;
  readonly to: string | null;
  /** `incertain` : Jira n'a pas répondu, l'écriture a peut-être eu lieu. */
  readonly outcome: "réussi" | "échec" | "incertain";
  readonly detail: string | null;
}

const AUDIT_KEY = "audit.v1";
export const MAX_AUDIT_ENTRIES = 500;

export class AuditLog {
  readonly #store: LocalStore;
  /** Les ajouts sont enchaînés : deux écritures simultanées ne perdent aucune entrée. */
  #queue: Promise<unknown> = Promise.resolve();

  constructor(store: LocalStore) {
    this.#store = store;
  }

  append(entry: AuditEntry): Promise<void> {
    const next = this.#queue.then(async () => {
      const entries = await this.#readAll();
      entries.push(entry);
      await this.#store.set(AUDIT_KEY, entries.slice(-MAX_AUDIT_ENTRIES));
    });
    this.#queue = next.catch(() => {});
    return next;
  }

  /** Entrées d'un site, de la plus récente à la plus ancienne. */
  async list(site: string): Promise<AuditEntry[]> {
    await this.#queue;
    return (await this.#readAll()).filter((entry) => entry.site === site).reverse();
  }

  /** Efface les entrées d'un site (bouton du journal, ou déconnexion). */
  forgetSite(site: string): Promise<void> {
    const next = this.#queue.then(async () => {
      const kept = (await this.#readAll()).filter((entry) => entry.site !== site);
      if (kept.length === 0) await this.#store.remove(AUDIT_KEY);
      else await this.#store.set(AUDIT_KEY, kept);
    });
    this.#queue = next.catch(() => {});
    return next;
  }

  async #readAll(): Promise<AuditEntry[]> {
    const raw = await this.#store.get(AUDIT_KEY);
    return Array.isArray(raw) ? raw.filter(isEntry) : [];
  }
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
