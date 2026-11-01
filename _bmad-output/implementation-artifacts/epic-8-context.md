# Epic 8 Context: Sprint Planning en direct dans Jira

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Permettre à l'équipe de clôturer son sprint, de construire le suivant par objectifs avec des tickets trouvés partout sur le board, puis de le démarrer, sans quitter l'extension. Chaque geste écrit aussitôt dans Jira, qui reste la seule source : plus de brouillon local, plus de « Relire et publier ». Cette orientation (Denis, 01/11/2026) remplace celle du 14/10/2026 (préparation locale, publication explicite, ni retrait, ni démarrage), que le code expérimental actuel suit encore et qu'il faut reprendre. Sprint Planning reste désactivé à la compilation dans le paquet distribué jusqu'à ce qu'un essai sur un vrai Jira le valide (8.10) et qu'il soit activé (8.11). La création de sprint et la création de Goals Atlassian restent hors périmètre.

## Stories

- Story 8.1 : Vérifier les contrats Atlassian du planning en direct
- Story 8.2 : L'écran du planning parle comme la page du sprint
- Story 8.3 : Écrire les objectifs texte du sprint au fil de la séance
- Story 8.4 : Poser un ticket sur un objectif l'ajoute au sprint
- Story 8.5 : Préparer le sprint avec les Goals Atlassian
- Story 8.6 : Vélocité partagée du sprint
- Story 8.7 : Clôturer le sprint actif et reporter ses objectifs non atteints
- Story 8.8 : Démarrer le sprint préparé
- Story 8.9 : Avis du planning dans les trois langues
- Story 8.10 : Valider le Sprint Planning sur un vrai Jira
- Story 8.11 : Activer le Sprint Planning dans le paquet

## Requirements & Constraints

- **Lecture** : la page se reconstruit à l'entrée, puis après chaque geste, depuis le texte natif de l'objectif du sprint (une ligne par objectif), la propriété `sprintgoals.v1` (identifiants, ordre, couleurs, liens) et les tickets du sprint. Les anciens brouillons locaux `sprint-planning.v1` ne sont plus appliqués.
- **Objectifs, selon la source du board** :
  - en « Texte du sprint », l'ajout, la suppression, l'ordre et le renommage écrivent E8 (champ `goal`) puis E5, une seule fois chacun. Le renommage s'écrit quand le champ est validé (Entrée ou sortie du champ) ; Échap annule sans écrire. Il garde l'identifiant de l'objectif : sans E5 dans la foulée, le rapprochement par libellé détacherait ses tickets ;
  - en Goals Atlassian, les Goals sont créés en amont. Le planning les cherche par nom (recherche Goals existante) et les épingle sur le sprint en préparation (E5). Leurs tickets s'y rattachent par E3/E4. Le planning ne crée jamais de Goal.
- **Conflit sur le texte** : relire Jira avant E8. Si le texte a changé depuis l'affichage, ne rien écrire, mettre la page à jour et demander de refaire la modification.
- **Une seule tentative par écriture** : jamais de rejeu ni de réussite annoncée sans confirmation. Un échec partiel indique l'étape confirmée, par exemple E8 confirmé puis E5 en échec, ou E9 confirmé puis lien en échec (le ticket est alors dans le sprint, sans objectif).
- **Tickets** : poser un ticket sur un objectif, par glisser-déposer ou par le menu ⋯, l'ajoute au sprint en préparation (E9) puis le rattache (E5 en texte, E3 en Goals). Il peut venir du backlog ou d'un autre sprint futur du board, sans alerte ni confirmation. Le reste à faire du sprint actif est en consultation seulement.
- **Retrait** : uniquement depuis le sprint en préparation, vers le backlog (E10, `POST /rest/agile/1.0/backlog/issue`, nouvel appel) ou vers un autre sprint futur (E9). Aucun retrait n'est possible depuis un autre sprint, depuis le sprint actif, ni une fois le sprint démarré.
- **Clôture et démarrage** : ils passent par les fenêtres natives Jira (« Terminer le sprint », « Démarrer le sprint »). L'utilisateur seul les remplit et les valide ; l'extension ne remplit ni ne valide aucun champ et n'écrit ni la clôture, ni le démarrage, ni le déplacement du reste à faire. Après la fermeture d'une fenêtre, l'extension relit Jira.
- **Report après clôture** : seulement si le sprint relu est clos (une fenêtre annulée ne reporte rien). Est non atteint un objectif dont les tickets ne sont pas tous dans la dernière colonne. En texte, le report écrit E8 et E5, avec les liens de ses tickets réécrits dans la propriété du sprint en préparation. En Goals, il épingle le Goal sur ce sprint ; les liens suivent le Goal. Un ticket que la fenêtre native a envoyé ailleurs est respecté.
- **Démarrer** est désactivé, avec sa raison, tant qu'un sprint est actif.
- **Vélocité** : champ libellé de l'en-tête, écrit dans `sprintgoals.v1` (E5) quand il est validé. La charge du sprint s'y compare. Une propriété sans ce champ reste lisible et n'affiche pas de vélocité.
- **Écritures autorisées** : uniquement E3, E4, E5, E8, E9 (élargi aux tickets venant d'autres sprints futurs) et E10. E10 n'entre dans l'inventaire de `jira/writes.ts` et de `securite.md` que si 8.1 confirme son contrat. Tout usage non confirmé revient à Denis. Aucun autre endpoint, hôte, droit Chrome ni assouplissement de CSP.
- **Interrupteur** : `SPRINT_PLANNING_ENABLED` reste faux dans `npm run package` jusqu'à 8.11. La garde porte sur chaque point d'entrée qui lit ou écrit pour le planning. `verify:planning` (banc fictif, fenêtres natives simulées) et `verify:planning:package` (zéro requête du planning) sont à adapter.
- **Textes** : les avis (conflit, écriture partielle, refus, fenêtre native) sont produits en clés de catalogue avec paramètres, testés en anglais et en espagnol. Aujourd'hui, les avis du planning sont du français relocalisé par motifs.
- **Livraison** : `npm run check` et `npm run verify:jira` verts après chaque story. La documentation technique suit story par story : `securite.md` (E8 à E10) en 8.1 ; `donnees.md` (`sprint-planning.v1` en 8.2, règle de conflit en 8.3, vélocité en 8.6) ; `integration-jira.md` (sprints futurs en 8.2, fenêtres natives en 8.7 et 8.8) ; le paragraphe Sprint Planning de `invariants.md` est réécrit à la livraison de 8.2 à 8.8, pas avant.
- **Décisions ouvertes** :
  - droits : lire les droits à l'ouverture et annoncer la lecture seule (recommandé, si un contrat le permet), ou passer en lecture seule au premier refus. Décision prise à partir du constat de 8.10 ;
  - sort des brouillons `sprint-planning.v1` (synthèse copiable une fois puis effacement, ou effacement simple) : à trancher par Denis à l'ouverture de 8.2 ;
  - filtres « Ajoutés » et « Reportés », sans objet avant le démarrage : à masquer ou à garder, point non tranché.

## Technical Decisions

- **Une fonction de `core` par intention (AD-2)** : écrire les objectifs, placer un ticket dans le sprint en préparation, l'en retirer, reporter les objectifs non atteints, enregistrer la vélocité. Chacune porte sa séquence, sa relecture qui conditionne l'écriture, l'arrêt au premier échec et un résultat partiel typé. Elles remplacent la publication en séquence actuelle (`publishSprintPlanning`, `core/sprintPlanning.ts`). Un service déclenche sur geste, gère la file, le journal et les avis, et peut seulement décorer le `JiraWriter`.
- **Porte d'écriture unique (AD-6)** : chaque geste du planning acquiert la `BoardWriteGate` de `BoardModel`. `core` ne reçoit que le writer décoré (péremption de génération). `canEdit` ne concerne que E6 ; E5 et E8 à E10 sont laissés aux droits Jira tant que la décision sur les droits n'est pas prise. Un geste refusé par la porte avant toute écriture doit être journalisé « rien n'a été envoyé », pas « incertain », comme le relève le suivi des travaux différés.
- **`sprintgoals.v1` (AD-4)** : on écrit uniquement par la primitive du module propriétaire (`updateSprintGoalProperty`), avec une mutation pure du document décodé. Le module fusionne sur Jira frais un seul lien et refuse si la zone modifiée a changé. Les clés inconnues sont conservées, une version inconnue n'est jamais écrasée, la limite est de 32 Ko. La vélocité y est un nouveau champ. Le « document entier pour le planning » disparaît de la règle de conflit. L'épinglage passe par le résolveur unique des Goals épinglés : aucun geste ne choisit la propriété. La reconstruction s'appuie sur `reconcileSprintGoals`.
- **`PlanningModel` (AD-3)** : sans brouillon, il ne garde que des signaux dérivés des lectures Jira. Les vues appellent ses méthodes sans affecter de signal.
- **Fenêtres natives (AD-7)** : l'hôte doit trouver et ouvrir ces fenêtres dans le DOM du backlog Jira, une nouvelle dépendance au DOM Jira comparable aux transitions. Les messages d'ouverture et de fermeture sont déclarés dans `src/integration/messages.ts` et copiés entre les marqueurs `<protocole sprint-goals>` de `injectBoard.ts`, qui reste sans import. L'origine et la fenêtre source sont vérifiées dans les deux sens.
- **Erreurs** : `core` renvoie des résultats typés ou des `CoreError`, jamais de phrase. `app/model/coreText.ts` les traduit, et `audit.v1` stocke clé et paramètres.
- **Lectures** : par `JiraClient`/`GoalsClient` et les endpoints documentés. La lecture des sprints futurs du board est à documenter en 8.2.

## UX & Interaction Patterns

- **Grammaire de la page du sprint**, sans typographie ni jauge propres au planning. Un seul écran sert à la préparation solitaire et à la séance en partage d'écran ; le mode « Animer la séance » est abandonné.
- **Barre latérale** : inchangée, avec le choix du board. Elle liste les objectifs prévus (tickets, points).
- **En-tête** : le titre est le sprint préparé (badge « futur », dates, menu des sprints futurs du board). Le champ « Vélocité de l'équipe » est à gauche de la barre de charge. « Clôturer le Sprint N » est visible tant qu'un sprint est actif (début de séance) ; « Démarrer le Sprint N+1 » sert en fin de séance.
- **Filtres** : les mêmes que la page du sprint (recherche `/`, filtres rapides, filtres Jira, Personne, Type, Parent, Statut, Label). Ils s'appliquent aussi à la colonne de gauche.
- **Colonne « Où sont les tickets »** : sections repliables pour les sprints futurs, le backlog et le reste à faire du sprint actif (consultation). Le sprint en préparation n'y figure pas. On peut glisser un ticket vers cette colonne pour le retirer.
- **Zone principale** : une swimlane teintée par objectif. Le titre se modifie sur place, avec une progression. Une ligne « Ajouter l'objectif » ferme la liste, puis vient « Sans objectif » après les swimlanes. La carte du board indique « Vient du Sprint N / du backlog ».
- **Maquette v2** (`_bmad-output/forge/sprint-planning-complet/`) : elle sert de référence visuelle, mais montre encore « Relire et publier », son texte d'aide et sa fenêtre de relecture, tous obsolètes.

## Cross-Story Dependencies

- **Prérequis livrés par l'Epic 1** : porte d'écriture, primitive sans perte de `sprintgoals.v1`, une fonction par intention, `featureFlags.ts`, `messages.ts`. L'Epic 2 apporte l'épinglage par sprint (2.1), réutilisé en 8.5 et 8.7.
- **8.1 en premier** : elle conditionne E10 et le retrait (8.4), l'élargissement de E9 (8.4) et les fenêtres natives (8.7, 8.8).
- **8.2** fournit l'écran et la lecture à l'entrée sur lesquels s'appuient 8.3 à 8.8.
- **8.7** réutilise l'écriture des objectifs texte (8.3), l'épinglage Goals (8.5) et la réécriture des liens (8.4).
- **8.9** couvre les avis de toutes les stories précédentes.
- **8.10** suit 8.1 à 8.9, avec l'autorisation de Denis, et fonde la décision sur les droits. **8.11** n'a lieu que si le constat de 8.10 est favorable.
