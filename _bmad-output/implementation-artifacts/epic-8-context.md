# Epic 8 Context: Sprint Planning en direct dans Jira

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Permettre à l'équipe de clôturer son sprint, de construire le suivant par objectifs avec des tickets trouvés partout sur le board, puis de le démarrer, sans quitter l'extension. Chaque geste écrit aussitôt dans Jira, qui reste la seule source : la page se reconstruit depuis le texte de l'objectif du sprint, la propriété `sprintgoals.v1` et les tickets du sprint, sans brouillon local. État au 02/11/2026 : socle livré en 0.42.0 (8.1 à 8.9), clôture du bon sprint en 0.42.1 (8.18), type, statut et clic droit sur la carte en 0.42.2 (8.12, 8.13), tous acceptés après essai. Restent les compléments 8.14 à 8.17, puis l'essai sur un vrai Jira (8.10) et l'activation dans le paquet distribué (8.11). Création de sprint et création de Goals Atlassian restent hors périmètre.

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

- **Écritures autorisées** : E3, E4, E5, E8 (texte `goal` du sprint), E9 (ajout au sprint, y compris depuis un autre sprint futur) et E10 (retour au backlog, au plus 50 tickets). E11 (estimation) est décidé le 02/11/2026 mais n'entre dans `jira/writes.ts`, `securite.md` et la règle « Écritures métier » d'AGENTS.md qu'après vérification du contrat Atlassian (candidat : `PUT /rest/agile/1.0/issue/{id}/estimation?boardId=`, sinon `PUT /rest/api/3/issue/{id}` limité à ce champ). Aucun autre endpoint, hôte, droit Chrome ni assouplissement de CSP ; tout usage non confirmé revient à Denis.
- **Une seule tentative par écriture** : jamais de rejeu ; après un échec ou un résultat incertain, relire Jira, indiquer l'étape confirmée et ne pas annoncer de réussite. Un lot (8.15) dit quels tickets sont confirmés et lesquels restent à refaire ; au-delà de 50 tickets (limite de E9 et E10), il est refusé avant toute écriture.
- **Objectifs** : en texte, E8 puis E5, avec relecture du texte avant E8 (s'il a changé, rien n'est écrit et la page est relue). En Goals Atlassian, recherche par nom et épinglage (E5), jamais de création.
- **Tickets** : ajoutés depuis le backlog ou un sprint futur ; retirés seulement du sprint en préparation (vers le backlog ou un autre sprint futur). Reste à faire du sprint actif, sous-tâches et tickets terminés : consultation seulement (ni menu, ni sélection, ni estimation).
- **Clôture et démarrage** : par les fenêtres natives Jira, que l'utilisateur seul remplit ; l'extension relit ensuite Jira (relectures bornées, aucune écriture rejouée) et ne reporte les objectifs non atteints du sprint choisi que si celui-ci est relu clos.
- **Lectures seules** pour 8.14 (filtres rapides évalués par Jira) et 8.16 (propriétés des sprints clos, `workItems` des Goals, lecture incomplète signalée, hors charge du sprint ; coût à mesurer en 8.10).
- **Interrupteur** : `SPRINT_PLANNING_ENABLED` reste faux dans `npm run package` jusqu'à 8.11, qui exige toutes les autres stories terminées et un constat favorable de 8.10 ; `verify:planning` (banc fictif) puis `verify:planning:package` couvrent les deux builds.
- **Textes** : tout avis en clés de catalogue avec paramètres, en français, anglais et espagnol, journal `audit.v1` compris.
- **Décision ouverte** : droits du planning (lecture seule annoncée à l'ouverture, ou découverte au premier refus), tranchée sur le constat de 8.10. D'ici là, un refus 403 s'affiche au premier geste, sans nouvelle tentative.

## Technical Decisions

- **Une fonction de `core` par intention (AD-2)** : écrire les objectifs, placer un ticket (`placePlanningIssue`), le retirer (`removePlanningIssue`), reporter les objectifs, enregistrer la vélocité. Le déplacement en lot (8.15) et l'estimation (8.17) ont chacun leur fonction, qui porte séquence, relecture, arrêt au premier échec et résultat partiel typé. Lot : une seule E9 ou E10, puis une seule E5 en texte, ou un lien E3 par ticket (après E4 si besoin) en Goals.
- **Porte d'écriture unique (AD-6)** : chaque geste acquiert la porte de `BoardModel` ; `core` ne reçoit que le writer décoré. `canEdit` ne concerne que E6 ; les écritures du planning sont laissées aux droits Jira.
- **`sprintgoals.v1` (AD-4)** : écriture par la primitive du module propriétaire, fusion sur Jira frais et refus si la zone modifiée a changé ; clés inconnues conservées, version inconnue jamais écrasée, 32 Ko maximum. Champ `velocity` facultatif. L'épinglage passe par le résolveur unique des Goals épinglés.
- **Modèles (AD-3)** : `PlanningModel` ne garde que des signaux dérivés des lectures Jira ; les vues appellent ses méthodes.
- **Filtres rapides (8.14)** : le périmètre de `quickFilterKeys` dans `core/jql.ts`, limité aujourd'hui aux sprints actifs, s'élargit au sprint en préparation, aux autres sprints futurs, au backlog et au reste à faire du sprint actif ; plusieurs filtres se combinent en intersection.
- **Fenêtres natives (AD-7)** : messages déclarés dans `src/integration/messages.ts` et recopiés dans `injectBoard.ts`, sans import ; origine et fenêtre source vérifiées dans les deux sens.
- **Erreurs** : `core` renvoie des résultats typés ou des `CoreError`, jamais de phrase.

## UX & Interaction Patterns

- Grammaire de la page du sprint (maquette v2) : barre latérale avec choix du board et objectifs prévus, sprint préparé en titre avec le menu des sprints futurs, champ « Vélocité de l'équipe » et charge, colonne « Où sont les tickets », une swimlane par objectif puis « Sans objectif ».
- Filtres (8.14) : recherche `/` (règle du board), Personne, Type, Parent, Statut, Label, pastille « Bloqués » et filtres rapides du board, comme la page du sprint (décision de Denis du 02/11/2026 : ni Priorité ni Composant). Ils s'appliquent aux swimlanes, à « Sans objectif » et à la colonne de gauche ; totaux et charge restent calculés sans filtre. « Ajoutés » et « Reportés » ne sont pas proposés.
- Sélection multiple (8.15) : Ctrl/Cmd+clic et Maj+clic (plage dans la même section), nombre affiché, Échap vide la sélection ; la sélection se glisse ou passe par le menu d'une de ses cartes.
- Avancement d'un objectif (8.16) : à faire, en cours, terminé, en tickets et en points, dans la grammaire de l'avancement de la page du sprint ; le déjà livré avant ce sprint est indiqué à part.
- Estimation sur la carte (8.17) : clic sur la valeur (« ? » si vide), Entrée ou sortie du champ valide, Échap annule, valeur inchangée n'écrit rien ; non modifiable sans champ d'estimation, en consultation ou si le champ est verrouillé (la fiche native reste le recours).

## Cross-Story Dependencies

- Les fondations de l'Epic 1 (porte d'écriture, primitive sans perte de `sprintgoals.v1`, `featureFlags.ts`, `messages.ts`) et l'épinglage par sprint de l'Epic 2 servent partout.
- 8.15 reprend les écritures du menu de carte (8.4, 8.13) ; 8.17 dépend de la vérification préalable du contrat E11 ; 8.16 remonte la chaîne des reports (8.7, 8.18).
- 8.14 à 8.17 se jouent avant 8.10. L'essai 8.10, avec l'autorisation de Denis, couvre aussi déplacement groupé, estimation et coût des lectures de 8.16, et fonde la décision sur les droits. 8.11 suit un constat favorable.
- Points ouverts au backlog, liés à l'epic : ne proposer que les sprints que l'utilisateur peut modifier (menu des sprints, colonne de gauche, cibles « Vers {sprint} », clôture), avec des lectures de droits dont le contrat reste à vérifier, à rapprocher de la décision 8.10 ; tickets fermés visibles dans la colonne « Où sont les tickets », à investiguer (règle du backlog Jira à confirmer, aucune écriture).
