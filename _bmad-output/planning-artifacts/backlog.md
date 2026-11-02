# Backlog — Sprint Goals Board pour Jira

Travaux restants et pistes à décider, à transformer en epics et stories avec le workflow BMAD
`bmad-create-epics-and-stories` au moment de les planifier. Une piste produit n'est pas
engagée tant qu'elle n'est pas décidée. Mise en conformité d'architecture :
[spec dédiée](../specs/spec-conformite-architecture/SPEC.md).

## Fiabilité et distribution

- [ ] Bug (signalé par Denis, 02/11/2026) : pendant le glisser d'un ticket à la souris, approcher la
  carte du haut (ou du bas) du board ne le fait pas défiler ; un objectif hors de l'écran est alors
  impossible à atteindre. Constat dans le code : glisser-déposer HTML natif (`draggable`,
  `onDragStart` dans `IssueCard.tsx`, `BoardView.tsx`), aucun défilement automatique de notre côté ;
  le board défile dans son propre conteneur (`.board`, `overflow: auto`, `app.css`), dans l'iframe
  injectée dans Jira. Piste, à confirmer : la zone de défilement automatique de Chrome, au bord du
  conteneur, est trop étroite ou inaccessible (en-têtes, bord de l'iframe). Correctif possible :
  pendant un `dragover`, faire défiler le conteneur quand le pointeur entre dans une bande en haut
  ou en bas (vitesse croissante vers le bord), arrêt au `drop`, au `dragend` ou à la sortie. Vérifier
  aussi le Sprint Planning (`.planning-lanes` et `.planning-sources`, `overflow-y: auto`) et le
  défilement à la molette pendant le glisser. Test : Chrome réel sur le banc fictif, board plus haut
  que la fenêtre. Aucune écriture concernée.
- [ ] Workflows réels : Time Spent, Story Points, Resolution, commentaires, plusieurs champs,
  widgets tiers ; validation et annulation. Améliorer le diagnostic des formulaires non reconnus sans données sensibles.
- [ ] Schémas Goals réels : plus de 100 liens, absence de `workItems`, champ Goals manquant ;
  contrôler pagination et signalement des résultats incomplets déjà implémentés.
- [ ] Réglages/conflits sur deux postes, avec et sans `canEdit` ; volumes importants et limites WIP réelles.
- [ ] Routes des boards gérés par l'équipe, changement de board et placement du bouton sur les dispositions Jira.
- [ ] Étudier les lectures Software « enhanced » avant de remplacer les endpoints Agile ; préserver filtre, sprints et pagination.
- [ ] Confirmer publication et canal de mise à jour ; fiche, empaquetage et politique existent.
- [ ] Renouveler les captures Store après chaque évolution visuelle ; revue de sécurité indépendante avant diffusion large.
- [ ] Correctif (demande de Denis, 02/11/2026) : renommer les clés des propriétés Jira écrites par
  l'extension de `com.scrumboardmac.*` en `com.mousquetaires.*`. Clés concernées (inventaire
  `src/jira/writes.ts`) : `sprintgoals.v1` (E5, propriété de sprint), `boardsettings.v1` (E6, propriété
  du board) et `diagnostic` (E7, écrite puis supprimée). À trancher avant de commencer : la règle
  d'AGENTS.md « préserver les clés `com.scrumboardmac.*` » (à amender), et la reprise des données
  existantes. Les objectifs épinglés et les réglages d'équipe déjà publiés restent sous l'ancienne
  clé. Piste : lire la nouvelle clé, sinon l'ancienne ; écrire seulement la nouvelle au prochain geste
  explicite ; ne jamais supprimer l'ancienne automatiquement. Format `v1` inchangé, mêmes écritures,
  aucune nouvelle. Références à mettre à jour (recensées le 02/11/2026, toutes sur ces trois clés) :
  `src/jira/writes.ts`, `src/jira/diagnostics.ts`, `src/core/sprintGoals.ts`, `src/core/teamSettings.ts` ;
  tests (`writes.test.ts` et sa garde de chemins, `BoardWriteGate`, `PlanningModel`, `App`, `sprintGoals`,
  `teamSettings`, `BoardModel.*`), `scripts/verify-planning.mjs` ; `docs/technique/` (`securite.md`,
  `donnees.md`, `index.md`), AGENTS.md, note d'architecture, `epics.md`, spec de conformité. Les specs
  terminées et les `.memlog.md` gardent l'ancien nom (historique).

## Pistes produit à décider

- [ ] Export/import JSON validé avec aperçu des différences.
- [ ] Menu contextuel (clic droit) sur un ticket du board : « Envoyer vers un goal », « Mettre en top priorité »,
  « Mettre en basse priorité ». Priorité = rang en tête/en fin, écritures déjà autorisées ; le champ Priorité Jira serait une nouvelle écriture.
- [ ] Préférences personnelles entre postes : propriété utilisateur Jira = nouvelle écriture à autoriser ; `storage.sync` exclu.
- [ ] WIP en points et minimums de colonne ; présentation des sources Goals selon capacités du site.
- [ ] Déploiement IT via `storage.managed` si besoin ; déplacement clavier si la décision d'abandon est réouverte.

## Sprint Planning

Sprint Planning est réservé au `dist/` local. Son amélioration, sa validation sur une instance
réelle (droits, volumes) et son activation dans le paquet sont planifiées dans l'Epic 8 de
[epics.md](epics.md).
Depuis le 01/11/2026, le planning se fait en direct dans Jira, clôture et démarrage par les fenêtres
natives compris ([décisions](../forge/sprint-planning-complet/forged-idea.md)). La création de sprint
et la création de Goals restent hors périmètre. Livré en 0.42.0 (stories 8.1 à 8.9), toujours désactivé
dans le paquet ; contrats dans [intégration Jira](../../docs/technique/integration-jira.md).
Restent l'essai sur un vrai Jira avec la décision sur les droits (8.10), puis l'activation (8.11).

- [x] Bug (signalé par Denis, 02/11/2026) : un sprint vide qui n'appartient pas au board apparaît dans
  le Sprint Planning. On sait qu'il n'est pas au board par son `originBoardId` (API Agile). Décision :
  ne l'afficher nulle part dans le planning (menu des sprints, colonne, destinations, clôture) ; un
  sprint du board, même vide, reste proposé. Corrigé en 0.48.1, sur Jira fictif.
- [x] Suite (constatée par Denis sur le sandbox, 02/11/2026, board 3013, sprint « APP : Backlog
  tech/dette ») : un sprint d'un autre board dont tous les tickets du board sont terminés ou sans
  colonne, masqués depuis la 8.22, restait proposé. « Vide » = sans ticket restant selon les
  colonnes. Corrigé en 0.48.2, sur Jira fictif. Toujours visible dans le menu des sprints sur le
  sandbox : la lecture réduite (`status` seul) échouait au décodage (`issuetype` exigé), sprint
  gardé. Corrigé en 0.48.3 ; à revoir sur le sandbox.
- [x] Bug (essai du 02/11/2026) : le menu des sprints à préparer propose des sprints que
  l'utilisateur ne peut pas modifier (ici un sprint d'un autre board, remonté par le filtre) ; y
  ajouter un objectif texte échoue (« Only a Jira administrator can update this sprint »). Choix de
  Denis : ne proposer que les sprints que l'utilisateur a le droit de modifier, et non seulement ceux
  du board. Jira exige « Gérer les sprints » sur tous les projets du filtre du board d'origine du
  sprint (`originBoardId`), sinon seul un administrateur peut le modifier. Lectures candidates, contrat
  à vérifier avant de coder : projets d'un board (`GET /rest/agile/1.0/board/{id}/project`) et droits
  de l'utilisateur (`GET /rest/api/3/mypermissions`, `MANAGE_SPRINTS_PERMISSION`, par projet). Cas
  indécidable (filtre sans projet, lecture refusée) : garder le sprint, le refus de Jira restant
  affiché au premier geste. Même règle pour les autres sprints futurs de la colonne de gauche, les cibles
  « Vers {sprint} » et les sprints actifs proposés à la clôture. À rapprocher de la décision sur les
  droits (8.10). Corrigé en 0.43.1 (contrats vérifiés dans l'OpenAPI, lectures seules), sur Jira
  fictif ; à confirmer sur un vrai Jira en 8.10.
- [x] Bug (essai du 02/11/2026) : après le démarrage du sprint préparé, ses nouveaux objectifs
  arrivent masqués (œil fermé) sur le Sprint Board. Cause : `BoardLoadingService.ts` masque, après
  la première lecture, tout objectif inconnu (absent de `goalColorIndex` et de la lecture
  précédente) qui a des tickets rattachés ; les objectifs créés pendant le planning ont un identifiant
  neuf, les objectifs reportés gardent le leur et restent visibles. Ne masquer que les Goals
  introduits par un ticket seulement, jamais les objectifs du texte d'un sprint ni les Goals épinglés ;
  test de régression sur un démarrage de sprint. Corrigé en 0.42.3, vérifié sur Jira fictif,
  confirmé par Denis le 02/11/2026.
- [x] Amélioration (demande de Denis, 02/11/2026) : menus de carte homogènes entre le Sprint
  Planning et le Sprint Board. Aujourd'hui, celui du board (`CardMenu.tsx`, sous-menu « Envoyer vers
  un goal › ») et celui du planning (`<details>` à plat dans `PlanningView.tsx`) diffèrent à l'écran.
  À garder du planning : la pastille de couleur de chaque objectif, à gauche de son nom, à reprendre
  aussi dans le menu du board. À ajouter au planning : « Mettre en top priorité » et « Mettre en basse
  priorité » (rang, écriture déjà autorisée). Décision de Denis (02/11/2026) : tête ou fin de la
  swimlane de l'objectif dans le sprint en préparation (« Sans objectif » compris), comme sur le board. À ajouter aussi : les
  destinations de sprint (« Renvoyer au backlog », « Vers {sprint} ») regroupées dans un sous-menu
  dépliable, comme celui des objectifs. Piste : un seul composant de menu de carte partagé par les
  deux écrans, avec le même comportement (survol, clavier, Échap). Mêmes écritures qu'aujourd'hui,
  aucune nouvelle. Stories 3.1, 3.2, 8.4 et 8.13.
  Planifiée : story 8.19 (epics.md), 02/11/2026.
- [x] Amélioration (demande de Denis, 02/11/2026) : en-tête d'objectif homogène entre le Sprint
  Planning et le Sprint Board, même apparence pour toute la barre, progression comprise. Écarts relevés
  dans le code : marqueur (`GoalMarker` avec état « atteint » et `lane-header-completed` sur le board,
  `goal-ring` sans état dans le planning) ; compteur et progression (« n/N terminés · x/y pts » et
  `<progress>` sur le board ; dans le planning, `lane-count`, puis `LaneProgress` avec la même ligne,
  la barre, trois pastilles à faire / en cours / terminé et « Déjà livré ») ; « Aucun ticket rattaché »
  seulement sur le board ; actions de l'objectif seulement dans le planning. Règle de « terminé »
  différente : dernière colonne du board (`goalProgress`, `boardIssue.ts`) contre catégorie de statut
  Jira dans le planning (`planningProgress.ts`, story 8.16) ; choisir une seule règle ou dire laquelle
  s'applique. Piste : un composant d'en-tête d'objectif partagé (marqueur, titre, compteur, barre,
  détail), avec des emplacements pour ce qui reste propre à chaque écran (actions, « Déjà livré »,
  repli). Voir aussi la barre du sprint en haut de page (`SprintProgress` sur le board, charge contre
  vélocité dans le planning) : même gabarit visuel, mesures différentes. Lecture seule, aucune
  écriture. Côté planning : stories 8.6 et 8.16.
  Planifiée avec la suivante : story 8.20 (epics.md). Décision de Denis du 02/11/2026 : « terminé »
  veut toujours dire dernière colonne visible du board, planning compris ; première colonne = à faire,
  colonnes du milieu = en cours (jamais la catégorie de statut Jira) ; un statut sans colonne est ignoré
  partout (ni affiché ni compté). Tous les calculs d'état passent aux colonnes dans la 8.20.
- [x] Amélioration (demande de Denis, 02/11/2026), à traiter avec l'en-tête homogène ci-dessus : une
  seule barre de progression découpée par catégorie de statut, en couleur. Aujourd'hui, le Sprint
  Board montre une barre (part terminée seulement) et le planning une barre plus trois pastilles
  à faire / en cours / terminé (`LaneProgress`, `PlanningView.tsx` ; couleurs
  `.planning-progress-part[data-status-category]`, `planning.css`). Ce que Denis veut garder : la
  barre du sprint en cours et les story points par catégorie du planning. Cible : une barre empilée
  à trois segments (gris à faire, bleu en cours, vert terminé), largeurs proportionnelles aux points,
  ou aux tickets sans estimation ; valeurs au survol et en texte masqué pour les lecteurs d'écran.
  Même composant dans les deux écrans. Côté board, la catégorie de statut de chaque ticket doit être
  disponible ; à vérifier avec la règle « terminé » à unifier (dernière colonne contre catégorie).
  Lecture seule, aucune écriture.
  Planifiée : story 8.20 (epics.md).
- [x] Amélioration (demande de Denis, 02/11/2026) : dans l'en-tête d'objectif du planning, ranger
  « Déjà livré : 2 tickets · 8 pts » (`planning-lane-delivered`) dans la partie « Terminé » au lieu
  d'une mention à part. Contrainte de la story 8.16 : le déjà livré date des sprints précédents et
  reste hors de la charge du sprint et de la vélocité ; le distinguer dans la partie terminée (par
  exemple un segment hachuré ou plus clair dans la barre, « Terminé : 3 · 5 pts, plus déjà livré :
  2 · 8 pts » au survol) sans l'ajouter aux totaux du sprint. Lecture seule, aucune écriture.
  Planifiée : story 8.21 (epics.md).
- [x] À investiguer (essai du 02/11/2026) : la colonne « Où sont les tickets » montre des tickets
  fermés, alors que Denis ne les voit pas dans le backlog Jira. Constat dans le code : `sections`
  (`PlanningModel.ts`) affiche tout ce que renvoient la lecture du backlog
  (`GET /rest/software/1.0/board/{id}/backlog`) et celle des autres sprints futurs, sans filtre sur
  le statut. Les tickets terminés y sont seulement en consultation (`canJoinSprint`, `PlanningView.tsx`).
  À vérifier dans la documentation Atlassian et sur un vrai Jira : le backlog Jira masque-t-il les
  tickets dont le statut est dans la dernière colonne du board (règle à confirmer), et l'endpoint les
  renvoie-t-il quand même ? Si oui, appliquer la même règle (statuts de la dernière colonne visible,
  comme `isDone` du report) au backlog et aux sprints futurs, puis vérifier le cas des sous-tâches et
  du reste à faire du sprint actif. Aucune écriture.
  Investigué le 02/11/2026 : la base de connaissances Atlassian confirme que le backlog Jira masque
  les statuts de la colonne la plus à droite (filtre de l'écran, pas de la lecture). Décision de Denis :
  ne plus voir ces tickets, backlog et sprints futurs compris. Corrigé en 0.47.1 (story 8.22), sur
  Jira fictif ; à confirmer sur un vrai Jira en 8.10.
