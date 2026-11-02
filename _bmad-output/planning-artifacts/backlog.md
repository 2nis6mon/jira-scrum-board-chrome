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
Restent l'essai sur un vrai Jira avec la décision sur les droits (8.10), puis l'activation (8.11).

- [ ] Bug (essai du 02/11/2026) : le menu des sprints à préparer propose des sprints que
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
  droits (8.10).
- [x] Bug (essai du 02/11/2026) : après le démarrage du sprint préparé, ses nouveaux objectifs
  arrivent masqués (œil fermé) sur le Sprint Board. Cause : `BoardLoadingService.ts` masque, après
  la première lecture, tout objectif inconnu (absent de `goalColorIndex` et de la lecture
  précédente) qui a des tickets rattachés ; les objectifs créés pendant le planning ont un identifiant
  neuf, les objectifs reportés gardent le leur et restent visibles. Ne masquer que les Goals
  introduits par un ticket seulement, jamais les objectifs du texte d'un sprint ni les Goals épinglés ;
  test de régression sur un démarrage de sprint. Corrigé en 0.42.3, vérifié sur Jira fictif ; à
  confirmer à l'essai réel (8.10).
- [ ] À investiguer (essai du 02/11/2026) : la colonne « Où sont les tickets » montre des tickets
  fermés, alors que Denis ne les voit pas dans le backlog Jira. Constat dans le code : `sections`
  (`PlanningModel.ts`) affiche tout ce que renvoient la lecture du backlog
  (`GET /rest/software/1.0/board/{id}/backlog`) et celle des autres sprints futurs, sans filtre sur
  le statut. Les tickets terminés y sont seulement en consultation (`canJoinSprint`, `PlanningView.tsx`).
  À vérifier dans la documentation Atlassian et sur un vrai Jira : le backlog Jira masque-t-il les
  tickets dont le statut est dans la dernière colonne du board (règle à confirmer), et l'endpoint les
  renvoie-t-il quand même ? Si oui, appliquer la même règle (statuts de la dernière colonne visible,
  comme `isDone` du report) au backlog et aux sprints futurs, puis vérifier le cas des sous-tâches et
  du reste à faire du sprint actif. Aucune écriture.
