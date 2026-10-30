import { LANGUAGE_PREFERENCE_KEY } from "../../i18n/language";
import type { LocalStore } from "../platform/types";
import { AUDIT_STORE_KEYS, forgetAuditSite } from "./auditLog";
import { BOARD_STORE_KEYS, forgetSite as forgetBoards } from "./boardStore";
import { BUTTON_POSITION_KEYS, forgetButtonPosition } from "./buttonPosition";
import { CONNECTION_STORE_KEYS, forgetConnection } from "./connectionStore";
import { forgetGraphqlOrigin, GRAPHQL_ORIGIN_STORE_KEYS } from "./graphqlOrigin";
import { LOAD_HISTORY_KEY } from "./LoadDiagnostics";
import { forgetDismissedNotices, NOTICE_STORE_KEYS } from "./noticeStore";
import { forgetPlanningDrafts, PLANNING_DRAFT_KEYS } from "./PlanningModel";

/**
 * Propriétaire de clés locales contenant des données d'un site (AD-4). `keys` les nomme comme la
 * table de docs/technique/donnees.md (`<clé>:<origine Jira>` pour une clé suffixée).
 */
export interface SiteDataOwner {
  readonly keys: readonly string[];
  forgetSite(store: LocalStore, origin: string): Promise<void>;
}

/**
 * Liste unique parcourue par la déconnexion. Toute nouvelle clé de site y entre par son module
 * propriétaire ; tests/app/siteData.test.ts la confronte à la table des clés.
 */
export const SITE_DATA_OWNERS: readonly SiteDataOwner[] = [
  { keys: CONNECTION_STORE_KEYS, forgetSite: forgetConnection },
  { keys: BOARD_STORE_KEYS, forgetSite: forgetBoards },
  { keys: NOTICE_STORE_KEYS, forgetSite: (store, origin) => forgetDismissedNotices(store, origin) },
  { keys: GRAPHQL_ORIGIN_STORE_KEYS, forgetSite: forgetGraphqlOrigin },
  { keys: AUDIT_STORE_KEYS, forgetSite: forgetAuditSite },
  { keys: PLANNING_DRAFT_KEYS, forgetSite: forgetPlanningDrafts },
  { keys: BUTTON_POSITION_KEYS, forgetSite: forgetButtonPosition },
];

/**
 * Clés locales sans donnée d'un site, gardées par la déconnexion d'un site. Les mesures de
 * chargement ne portent ni nom, ni URL, ni identifiant Jira ; `LoadDiagnostics` les remet
 * entièrement à zéro à la déconnexion, quel que soit le site.
 */
export const NOT_SITE_DATA_KEYS: readonly string[] = [
  LANGUAGE_PREFERENCE_KEY,
  "interface.v1",
  LOAD_HISTORY_KEY,
];

/**
 * Efface toutes les données locales d'un site. Chaque propriétaire est appelé même si un autre
 * échoue ; les échecs sont rendus, sans bloquer la déconnexion qui les ignore.
 */
export async function forgetSiteData(store: LocalStore, origin: string): Promise<unknown[]> {
  const results = await Promise.allSettled(
    // Un propriétaire qui lève de façon synchrone est traité comme un rejet.
    SITE_DATA_OWNERS.map((owner) => Promise.resolve().then(() => owner.forgetSite(store, origin))),
  );
  return results.flatMap((result) => (result.status === "rejected" ? [result.reason] : []));
}
