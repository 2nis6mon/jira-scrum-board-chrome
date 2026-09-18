import type { JiraSite } from "../../jira/site";
import { graphqlOriginRule, type OriginMode } from "../platform/originRule";
import type { Platform } from "../platform/types";

const ORIGIN_KEY = "graphqlOrigin.v1";

/** Variante utilisable en production : celle que le diagnostic a vue acceptée par la passerelle. */
export type WorkingOriginMode = Exclude<OriginMode, "keep">;

/**
 * Variante par défaut : l'adresse du site. Sur l'instance réelle essayée (diagnostic 0.4.0), la
 * passerelle refuse l'en-tête de l'extension ET son absence, et n'accepte que celle-ci.
 */
export const DEFAULT_ORIGIN_MODE: WorkingOriginMode = "site";

/**
 * Règle `Origin` du site connecté : posée à la connexion, retirée à la déconnexion. La variante
 * retenue est celle que le diagnostic a vue fonctionner ; elle est mémorisée par site.
 */
export class GraphqlOrigin {
  readonly #platform: Platform;
  readonly #site: JiraSite;

  constructor(platform: Platform, site: JiraSite) {
    this.#platform = platform;
    this.#site = site;
  }

  /** Variante mémorisée pour ce site, ou la variante par défaut. */
  async preferred(): Promise<WorkingOriginMode> {
    const stored = await this.#platform.store.get(ORIGIN_KEY);
    const value =
      typeof stored === "object" && stored !== null
        ? (stored as Record<string, unknown>)[this.#site.origin]
        : null;
    return value === "remove" || value === "site" ? value : DEFAULT_ORIGIN_MODE;
  }

  async remember(mode: WorkingOriginMode): Promise<void> {
    const stored = await this.#platform.store.get(ORIGIN_KEY);
    const all =
      typeof stored === "object" && stored !== null
        ? { ...(stored as Record<string, unknown>) }
        : {};
    all[this.#site.origin] = mode;
    await this.#platform.store.set(ORIGIN_KEY, all);
  }

  /** Pose la règle correspondant à `mode` (pour une sonde du diagnostic, par exemple). */
  async use(mode: OriginMode): Promise<void> {
    await this.#platform.originRules.apply(
      graphqlOriginRule(this.#site, mode, this.#platform.extensionId),
    );
  }

  /** Repose la variante retenue pour ce site. */
  async restore(): Promise<void> {
    await this.use(await this.preferred());
  }

  /** Déconnexion : plus de règle, plus de préférence pour ce site. */
  async forget(): Promise<void> {
    await this.#platform.originRules.apply(null);
    const stored = await this.#platform.store.get(ORIGIN_KEY);
    if (typeof stored !== "object" || stored === null) return;
    const all = { ...(stored as Record<string, unknown>) };
    delete all[this.#site.origin];
    if (Object.keys(all).length === 0) await this.#platform.store.remove(ORIGIN_KEY);
    else await this.#platform.store.set(ORIGIN_KEY, all);
  }
}
