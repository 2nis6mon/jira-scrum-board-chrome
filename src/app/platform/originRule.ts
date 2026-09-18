import type { JiraSite } from "../../jira/site";
import { GRAPHQL_PATH } from "../../jira/transport";

/**
 * En-tête `Origin` des requêtes de l'extension vers la passerelle GraphQL d'Atlassian.
 *
 * Chrome ajoute `Origin: chrome-extension://…` à tout POST émis par l'extension ; la passerelle le
 * rejette (« Invalid CORS request », constaté sur instance réelle). Une règle de session
 * `declarativeNetRequest` le retire (`remove`) ou le remplace par l'adresse du site (`site`) —
 * pour les SEULES requêtes émises par l'extension (`initiatorDomains`), en POST, vers la seule
 * adresse de la passerelle du site connecté. Les requêtes des pages web ne sont pas touchées :
 * vérifié dans Chrome 153 avec une page tierce visant la même adresse.
 *
 * `keep` : aucune règle, l'en-tête part tel que Chrome le pose.
 */
export type OriginMode = "keep" | "remove" | "site";

export const ORIGIN_RULE_ID = 1;

/** Forme d'une règle de session, telle que Chrome l'attend (valeurs en chaînes). */
export interface OriginSessionRule {
  readonly id: number;
  readonly priority: number;
  readonly action: {
    readonly type: "modifyHeaders";
    readonly requestHeaders: readonly [
      | { readonly header: "origin"; readonly operation: "remove" }
      | { readonly header: "origin"; readonly operation: "set"; readonly value: string },
    ];
  };
  readonly condition: {
    readonly urlFilter: string;
    readonly requestMethods: readonly ["post"];
    readonly resourceTypes: readonly ["xmlhttprequest"];
    readonly initiatorDomains: readonly [string];
  };
}

export function graphqlOriginRule(
  site: JiraSite,
  mode: OriginMode,
  extensionId: string,
): OriginSessionRule | null {
  if (mode === "keep") return null;
  if (!/^[a-p]{32}$/.test(extensionId)) {
    throw new Error(`Identifiant d'extension inattendu : ${extensionId}`);
  }
  return {
    id: ORIGIN_RULE_ID,
    priority: 1,
    action: {
      type: "modifyHeaders",
      requestHeaders: [
        mode === "remove"
          ? { header: "origin", operation: "remove" }
          : { header: "origin", operation: "set", value: site.origin },
      ],
    },
    condition: {
      // `|…|` : l'adresse exacte, début et fin ancrés ; aucune autre adresse du site.
      urlFilter: `|${site.origin}${GRAPHQL_PATH}|`,
      requestMethods: ["post"],
      resourceTypes: ["xmlhttprequest"],
      initiatorDomains: [extensionId],
    },
  };
}
