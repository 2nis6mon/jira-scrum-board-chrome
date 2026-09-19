import { blockingRequiredFields, type JiraStatus, type JiraTransition } from "./models";

/** Issue de la résolution d'un déplacement de carte. */
export type TransitionResolution =
  /** Le ticket est déjà dans un statut de la colonne cible : aucune écriture Jira. */
  | { kind: "alreadyInTargetColumn" }
  /** Une transition directe existe et peut être exécutée. */
  | { kind: "ready"; transition: JiraTransition; targetStatus: JiraStatus }
  | { kind: "choose"; available: JiraTransition[] }
  /** La transition existe mais Jira exige des champs que l'application ne remplit pas. */
  | { kind: "requiresFields"; transition: JiraTransition; fields: string[] }
  /**
   * Aucune transition ne mène à la destination : aucune autre destination proposée.
   */
  | { kind: "unreachable"; available: JiraTransition[] };

/**
 * Détermine la transition Jira correspondant à un déplacement de carte.
 *
 * Choix assumé — pas de saut multiple automatique. Jira n'expose la liste des transitions que
 * depuis le statut COURANT d'un ticket ; le graphe complet du workflow n'est accessible qu'aux
 * administrateurs. Enchaîner des transitions « à l'aveugle » pour atteindre une colonne
 * reviendrait à provoquer de vraies écritures sans savoir où le ticket s'arrêterait — et
 * pourrait le laisser bloqué dans un statut intermédiaire.
 *
 * Une seule action possible est exécutée ; plusieurs demandent un choix explicite.
 */
export function resolveTransition(
  currentStatusId: string,
  targetStatusIds: readonly string[],
  transitions: readonly JiraTransition[],
): TransitionResolution {
  if (targetStatusIds.includes(currentStatusId)) return { kind: "alreadyInTargetColumn" };

  const usable = transitions.filter((transition) => transition.isAvailable !== false);

  const candidates = usable.filter((transition) => targetStatusIds.includes(transition.to.id));
  if (candidates.length > 1) return { kind: "choose", available: candidates };
  const transition = candidates[0];
  if (!transition) return { kind: "unreachable", available: [] };
  const missing = blockingRequiredFields(transition);
  if (transition.hasScreen || missing.length > 0) {
    return { kind: "requiresFields", transition, fields: missing };
  }
  return { kind: "ready", transition, targetStatus: transition.to };
}
