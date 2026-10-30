/**
 * Interrupteurs de fonction (AD-5) : valeurs injectées à la compilation par `vite.config.ts`
 * (et le banc d'essai), jamais par une préférence, un réglage ou une URL. Chacun garde l'affichage
 * et les points d'entrée des modèles qui lisent ou écrivent pour sa fonction ; décodage,
 * conservation des formats et effacement des données n'en dépendent jamais.
 */
declare const __SPRINT_PLANNING_ENABLED__: boolean;
declare const __SPRINT_HEALTH_ENABLED__: boolean;
declare const __DIAGNOSTIC_ENABLED__: boolean;

/** Sprint Planning, expérimental : builds locaux et tests seulement, jamais dans le paquet. */
export const SPRINT_PLANNING_ENABLED = __SPRINT_PLANNING_ENABLED__;

/**
 * Santé du sprint : bouton de l'en-tête et panneau. Masquée pour l'instant ; le code reste, il
 * suffit de repasser la constante de compilation à `true`.
 */
export const SPRINT_HEALTH_ENABLED = __SPRINT_HEALTH_ENABLED__;

/**
 * Diagnostic actif : le bandeau « Invalid CORS request » y renvoie, et c'est le seul écran qui
 * essaie les variantes de l'en-tête Origin et retient celle que la passerelle des Goals accepte.
 * Le couper retire cette issue de secours.
 */
export const DIAGNOSTIC_ENABLED = __DIAGNOSTIC_ENABLED__;
