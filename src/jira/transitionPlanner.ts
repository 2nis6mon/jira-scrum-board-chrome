import { blockingRequiredFields, type JiraStatus, type JiraTransition } from "./models";

/** Issue de la résolution d'un déplacement de carte. */
export type TransitionResolution =
  /** Le ticket est déjà dans un statut de la colonne cible : aucune écriture Jira. */
  | { kind: "alreadyInTargetColumn" }
  /** Une transition directe existe et peut être exécutée. */
  | { kind: "ready"; transition: JiraTransition; targetStatus: JiraStatus }
  /** La transition existe mais Jira exige des champs que l'application ne remplit pas. */
  | { kind: "requiresFields"; transition: JiraTransition; fields: string[] }
  /**
   * Aucune transition ne mène à la colonne cible depuis le statut courant. `available` liste
   * ce que Jira autorise réellement, pour l'afficher à l'utilisateur.
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
 * L'application exécute donc uniquement les transitions directes, et affiche explicitement les
 * déplacements possibles lorsqu'il n'y en a pas.
 */
export function resolveTransition(
  currentStatusId: string,
  targetStatusIds: readonly string[],
  transitions: readonly JiraTransition[],
): TransitionResolution {
  if (targetStatusIds.includes(currentStatusId)) return { kind: "alreadyInTargetColumn" };

  const usable = transitions.filter((transition) => transition.isAvailable !== false);

  // L'ordre des statuts de la colonne fait foi : on prend le premier atteignable.
  let firstFieldBlocked: { transition: JiraTransition; fields: string[] } | null = null;
  for (const statusId of targetStatusIds) {
    for (const transition of usable.filter((candidate) => candidate.to.id === statusId)) {
      const missing = blockingRequiredFields(transition);
      if (missing.length === 0) return { kind: "ready", transition, targetStatus: transition.to };
      firstFieldBlocked ??= { transition, fields: missing };
    }
  }

  if (firstFieldBlocked) return { kind: "requiresFields", ...firstFieldBlocked };
  return { kind: "unreachable", available: usable };
}
