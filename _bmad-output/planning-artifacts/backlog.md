# Backlog — Sprint Goals Board pour Jira

Travaux restants et pistes à décider, à transformer en epics et stories avec le workflow BMAD
`bmad-create-epics-and-stories` au moment de les planifier. Une piste produit n'est pas
engagée tant qu'elle n'est pas décidée. Mise en conformité d'architecture :
[spec dédiée](../specs/spec-conformite-architecture/SPEC.md).

## Fiabilité et distribution

- [ ] Workflows réels : Time Spent, Story Points, Resolution, commentaires, plusieurs champs,
  widgets tiers ; validation et annulation. Améliorer le diagnostic des formulaires non reconnus sans données sensibles.
- [ ] Schémas Goals réels : plus de 100 liens, absence de `workItems`, champ Goals manquant ;
  contrôler pagination et signalement des résultats incomplets déjà implémentés.
- [ ] Réglages/conflits sur deux postes, avec et sans `canEdit` ; volumes importants et limites WIP réelles.
- [ ] Routes des boards gérés par l'équipe, changement de board et placement du bouton sur les dispositions Jira.
- [ ] Étudier les lectures Software « enhanced » avant de remplacer les endpoints Agile ; préserver filtre, sprints et pagination.
- [ ] Confirmer publication et canal de mise à jour ; fiche, empaquetage et politique existent.
- [ ] Renouveler les captures Store après chaque évolution visuelle ; revue de sécurité indépendante avant diffusion large.

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
Essai réel 8.10 joué le 03/11/2026 sur le sandbox (board 3013, constat dans
[la spec 8.10](../implementation-artifacts/spec-8-10-valider-le-sprint-planning-sur-un-vrai-jira.md)) :
défauts D1 à D4 planifiés en stories 8.26 à 8.28 (et 8.29 pour le même délai sur le board), puis 8.30 (mêmes gestes à la souris sur une carte du board et du planning, 04/11/2026) et 8.31 (sprint actif retiré de « Où sont les tickets », 04/11/2026), puis 8.32 (changer d'objectif sur le board sans changer d'état) et 8.33 (déplacer une sélection du board vers un objectif), 05/11/2026, toutes livrées ; 8.27 vérifiée sur le sandbox le 06/11/2026 (clôture et démarrage
conformes). Essai des Goals Atlassian joué le 06/11/2026 (story 8.34) : conforme sur le fond, défaut D5
planifié en story 8.35. 8.35 livrée en 0.50.4 et 0.50.5 (D5, puis D6 constaté au rejeu), conforme au rejeu du 06/11/2026.
Restent les stories des droits (8.36 à 8.38), puis l'activation (8.11).

- [x] Décidé par Denis le 05/11/2026 (question ouverte par la story 8.30) : une sélection de
  plusieurs cartes du Sprint Board ne change que d'objectif ou de swimlane, jamais d'état ni de rang
  (story 8.33) ; changer d'objectif ne change jamais l'état, même pour une seule carte (story 8.32).
- [x] Décidé par Denis le 06/11/2026 : droits du planning (question ouverte par l'essai 8.10). Un sprint
  futur non modifiable qui contient des tickets du board est montré dans « Où sont les tickets » et
  ses tickets se planifient, sans qu'on puisse préparer ce sprint (story 8.36) ; pas de Sprint
  Planning sans le droit de gérer les sprints du board (story 8.37, à confirmer par un essai sans
  droit, compte à trouver) ; gestes d'un ticket désactivés sans *Schedule issues* ou *Edit issues*
  sur son projet (story 8.38).
- [ ] À décider (essai 8.10) : un ticket sélectionné puis masqué par un filtre part avec le lot,
  sans autre signal que le compteur « 2 issues selected » (constaté : CLIENT-5303 ajouté au sprint
  avec CLIENT-6566). Élaguer la sélection aux cartes visibles, ou l'annoncer avant le geste.
  Même comportement sur le Sprint Board depuis la 8.33 (lot vers un objectif), à trancher ensemble.
- [ ] À investiguer (essai 8.10) : sur le Sprint Board, la barre latérale range les objectifs reportés
  avant ceux créés au planning, contrairement à l'ordre de `goal` et `sprintgoals.v1`, et Goal 1 y
  compte 0/5 contre 3 tickets dans le planning. Le compte rendu de clôture reste aussi affiché au-dessus
  d'un autre sprint préparé après le démarrage.
- [ ] À investiguer (essai 8.34, 06/11/2026) : sur le sandbox, l'introspection ne trouve pas de lien
  Goal → tickets (`workItems`) exploitable ; avertissement permanent « partially loaded », déjà livré
  et report signalés incomplets, liens lus par le seul champ Goals des tickets. Vérifier le schéma
  GraphQL réel (variante de `workItems` non reconnue, ou absente du site) avant 8.11. Le même essai
  confirme la seconde partie de l'observation ci-dessus : le Sprint Board compte les sous-tâches dans
  l'avancement d'un objectif, le planning non.
- [ ] Optimisation (essai 8.10) : chaque relecture du planning lit deux fois les tickets des sprints
  futurs d'autres boards (menu des sprints, puis planning). Coût relevé : 18 à 24 requêtes par geste,
  32 à 37 par actualisation, sans limitation de débit observée sur un backlog de 255 tickets.

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
  fictif. Essai 8.10 (03/11/2026) : menu conforme pour un administrateur (sprints du board et 2024T1.1
  du board 2753 proposés, 3334 et 3707 écartés) ; cas sans droit non joué.
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
  Jira fictif ; confirmé en 8.10 (backlog de 255 tickets, 99 affichés comme dans Jira). Essai sur le sandbox (02/11/2026) : décision de
  Denis de les masquer aussi du sprint en préparation, ni affichés ni comptés (story 8.23, 0.48.4).
