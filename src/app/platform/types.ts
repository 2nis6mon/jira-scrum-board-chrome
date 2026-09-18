import type { FetchLike } from "../../jira/transport";
import type { OriginSessionRule } from "./originRule";

/** Permissions d'hôte accordées par Chrome à l'exécution. */
export interface HostPermissions {
  contains(pattern: string): Promise<boolean>;
  /** À appeler directement dans le geste de l'utilisateur, sans `await` préalable. */
  request(pattern: string): Promise<boolean>;
  remove(pattern: string): Promise<boolean>;
}

/** Stockage local à ce navigateur. Jamais `storage.sync` : rien ne part chez Google. */
export interface LocalStore {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  remove(key: string): Promise<void>;
}

/** Règle de session qui ajuste l'en-tête `Origin` vers la passerelle GraphQL (voir originRule.ts). */
export interface OriginRules {
  /** Remplace la règle de l'extension ; `null` la retire. */
  apply(rule: OriginSessionRule | null): Promise<void>;
}

/** Tout ce que l'interface attend du navigateur, injectable pour les tests. */
export interface Platform {
  readonly permissions: HostPermissions;
  readonly store: LocalStore;
  readonly fetch: FetchLike;
  readonly originRules: OriginRules;
  /** Identifiant de l'extension : seul initiateur visé par la règle `Origin`. */
  readonly extensionId: string;
  readonly extensionVersion: string;
  readonly userAgent: string;
  copyText(text: string): Promise<void>;
}
