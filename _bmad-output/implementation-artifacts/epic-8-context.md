# Epic 8 Context: Sprint Planning en direct dans Jira

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Permettre à l'équipe de clôturer son sprint, de construire le suivant par objectifs avec des tickets trouvés partout sur le board, puis de le démarrer, sans quitter l'extension. Chaque geste écrit aussitôt dans Jira, qui reste la seule source : la page se reconstruit depuis le texte de l'objectif du sprint, la propriété `sprintgoals.v1` et les tickets du sprint, sans brouillon local. Le socle (8.1 à 8.9) est livré en 0.42.0 et la clôture du bon sprint (8.18) en 0.42.1, en revue. Restent les compléments issus de l'essai du 02/11/2026 (8.12 à 8.17), puis l'essai sur un vrai Jira (8.10) et l'activation dans le paquet distribué (8.11). Création de sprint et création de Goals Atlassian restent hors périmètre.

## Stories

- Story 8.1: Vérifier les contrats Atlassian du planning en direct
- Story 8.2: L'écran du planning parle comme la page du sprint
- Story 8.3: Écrire les objectifs texte du sprint au fil de la séance
- Story 8.4: Poser un ticket sur un objectif l'ajoute au sprint
- Story 8.5: Préparer le sprint avec les Goals Atlassian
- Story 8.6: Vélocité partagée du sprint
- Story 8.7: Clôturer le sprint actif et reporter ses objectifs non atteints
- Story 8.8: Démarrer le sprint préparé
- Story 8.9: Avis du planning dans les trois langues
- Story 8.12: La carte du planning montre le type et le statut du ticket
- Story 8.13: Ouvrir le menu d'une carte du planning au clic droit
- Story 8.14: Filtrer le planning comme la page du sprint
- Story 8.15: Déplacer plusieurs tickets ensemble
- Story 8.16: Voir l'avancement de chaque objectif
- Story 8.17: Estimer un ticket pendant la séance
- Story 8.18: Clôturer le bon sprint et toujours dire ce qui a été reporté
- Story 8.10: Valider le Sprint Planning sur un vrai Jira
- Story 8.11: Activer le Sprint Planning dans le paquet

## Requirements & Constraints

- **Écritures autorisées** : E3, E4, E5, E8 (texte `goal` du sprint), E9 (ajout au sprint, y compris depuis un autre sprint futur) et E10 (retour au backlog, `POST /rest/agile/1.0/backlog/issue`). E11 (estimation) est décidé le 02/11/2026 mais n'entre dans `jira/writes.ts`, `securite.md` et la règle « Écritures métier » d'AGENTS.md qu'après vérification du contrat Atlassian (candidat : `PUT /rest/agile/1.0/issue/{id}/estimation?boardId=`). Aucun autre endpoint, hôte, droit Chrome ni assouplissement de CSP ; tout usage non confirmé revient à Denis.
- **Une seule tentative par écriture** : jamais de rejeu ; après un échec ou un résultat incertain, relire Jira, indiquer l'étape confirmée et ne pas annoncer de réussite. Un lot (8.15) dit quels tickets sont confirmés et lesquels restent à refaire ; au-delà de 50 tickets (limite de E9 et E10), il est refusé avant toute écriture.
- **Objectifs** : en texte, E8 puis E5, relecture du texte avant E8 (s'il a changé, rien n'est écrit et la page est relue). En Goals Atlassian, recherche par nom et épinglage (E5), jamais de création.
- **Tickets** : ajoutés depuis le backlog ou un sprint futur ; retirés seulement du sprint en préparation (vers le backlog ou un autre sprint futur). Reste à faire du sprint actif, sous-tâches et tickets terminés : consultation seulement (ni menu, ni sélection, ni estimation).
- **Clôture et démarrage** : par les fenêtres natives Jira, que l'utilisateur seul remplit ; l'extension relit Jira ensuite (relectures bornées, aucune écriture rejouée). Report des objectifs non atteints du sprint choisi seulement si le sprint relu est clos.
- **Lectures seules** pour type, statut, priorité (8.12), filtres rapides évalués par Jira (8.14) et avancement historique (8.16 : propriétés des sprints clos, `workItems` des Goals, lecture incomplète signalée, hors charge du sprint).
- **Interrupteur** : `SPRINT_PLANNING_ENABLED` reste faux dans `npm run package` jusqu'à 8.11, qui exige 8.1 à 8.10 et 8.12 à 8.18 terminées et un constat favorable de 8.10 ; `verify:planning` (banc fictif) et `verify:planning:package` couvrent les deux builds.
- **Textes** : tout avis en clés de catalogue avec paramètres, en français, anglais et espagnol, aussi dans le journal `audit.v1`.
- **Livraison** : `npm run check` et `npm run verify:jira` verts, régression ajoutée si le comportement change, docs techniques et CHANGELOG à jour.
- **Décision ouverte** : droits du planning (annoncer la lecture seule à l'ouverture ou la découvrir au premier refus), tranchée à partir du constat de 8.10.

## Technical Decisions

- **Une fonction de `core` par intention (AD-2)** : écrire les objectifs, placer un ticket (`placePlanningIssue`), le retirer (`removePlanningIssue`), reporter les objectifs, enregistrer la vélocité. Le déplacement en lot (8.15) et l'estimation (8.17) ont chacun leur propre fonction, qui porte séquence, relecture, arrêt au premier échec et résultat partiel typé. Lot : une seule E9 ou E10, puis une seule E5 en texte, ou un lien E3 par ticket (après E4 si besoin) en Goals.
- **Porte d'écriture unique (AD-6)** : chaque geste acquiert la porte de `BoardModel` ; `core` ne reçoit que le writer décoré. `canEdit` ne concerne que E6 ; les écritures du planning sont laissées aux droits Jira.
- **`sprintgoals.v1` (AD-4)** : écriture par la primitive du module propriétaire, avec fusion sur Jira frais et refus si la zone modifiée a changé ; clés inconnues conservées, version inconnue jamais écrasée, 32 Ko maximum. Le champ `velocity` est facultatif. L'épinglage passe par le résolveur unique des Goals épinglés.
- **Modèles (AD-3)** : `PlanningModel` ne garde que des signaux dérivés des lectures Jira ; les vues appellent ses méthodes. Les cartes réutilisent `JiraIcon` et son cache d'images ; le menu clic droit reprend le menu ⋯ et le comportement du menu de carte du board.
- **Filtres rapides** : le périmètre de `quickFilterKeys` dans `core/jql.ts`, limité aujourd'hui aux sprints actifs, s'élargit au sprint en préparation, aux sprints futurs, au backlog et au reste à faire du sprint actif ; plusieurs filtres se combinent en intersection.
- **Fenêtres natives (AD-7)** : messages déclarés dans `src/integration/messages.ts` et copiés dans `injectBoard.ts`, qui reste sans import ; origine et fenêtre source vérifiées dans les deux sens.
- **Erreurs** : `core` renvoie des résultats typés ou des `CoreError`, jamais de phrase.

## UX & Interaction Patterns

- Grammaire de la page du sprint : barre latérale avec le choix du board et les objectifs prévus, sprint préparé en titre d'en-tête avec le menu des sprints futurs, champ « Vélocité de l'équipe » et charge, colonne « Où sont les tickets », une swimlane par objectif puis « Sans objectif ».
- Filtres comme la page du sprint : recherche `/`, Personne, Type, Statut, Parent, Priorité, Label, Composant et filtres rapides du board. Ils s'appliquent aux swimlanes, à « Sans objectif » et à la colonne de gauche ; totaux et charge restent calculés sans filtre. « Ajoutés » et « Reportés » ne sont pas proposés.
- Carte : icônes du type et de la priorité (lettre du type si l'image manque), statut teinté selon sa catégorie, provenance, estimation modifiable sur place (« ? » si vide ; Entrée ou sortie du champ valide, Échap annule, valeur inchangée n'écrit rien).
- Menu de carte : bouton ⋯, clic droit, touche Menu ou Maj+F10 ; Échap referme et rend le focus. Sélection multiple par Ctrl/Cmd+clic et Maj+clic (plage dans la même section), nombre affiché, Échap vide la sélection.
- Clôture : avec plusieurs sprints actifs, choix du sprint à clôturer ; compte rendu du report affiché jusqu'à sa fermeture. « Démarrer » est désactivé, avec sa raison, tant qu'un sprint est actif.
- Avancement d'un objectif : à faire, en cours, terminé, en tickets et en points, dans la grammaire de l'avancement de la page du sprint.

## Cross-Story Dependencies

- Les fondations de l'Epic 1 (porte d'écriture, primitive sans perte de `sprintgoals.v1`, `featureFlags.ts`, `messages.ts`) et l'épinglage par sprint de l'Epic 2 sont réutilisés partout.
- 8.13 et 8.15 reprennent les écritures du menu ⋯ (8.4) ; 8.17 dépend de la vérification préalable du contrat E11 ; 8.16 réutilise la chaîne des reports (8.7, 8.18).
- 8.12 à 8.18 se jouent avant 8.10. L'essai 8.10, avec l'autorisation de Denis, couvre aussi déplacement groupé, estimation et coût des lectures de 8.16, et fonde la décision sur les droits. 8.11 suit un constat favorable.
- Défauts relevés au backlog le 02/11/2026, liés à l'epic : ne proposer que les sprints que l'utilisateur peut modifier (menu des sprints, colonne de gauche, cibles « Vers {sprint} », clôture ; contrat des lectures de droits à vérifier, à rapprocher de la décision 8.10) ; objectifs créés pendant le planning masqués sur le Sprint Board après le démarrage.
