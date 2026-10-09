# Guide développeur — Sprint Goals Board pour Jira

Dernière mise à jour : **9 octobre 2026**\
Version décrite : **0.25.0** (Scrum et Kanban, swimlanes par type)\
Mode unique : **intégré dans Jira**, URL Jira toujours présente derrière le board.

Ce document est le point d’entrée pour reprendre le projet. Il décrit l’état réel du dépôt, les
décisions produit, l’architecture, les invariants de sécurité, les procédures de test et de
livraison, les problèmes connus et les évolutions envisagées.

Les détails historiques restent disponibles dans `README.md`, `TODO.md`, `CLAUDE.md` et
`docs/SECURITY-AUDIT.md`. En cas de contradiction, vérifier le code et les tests de la branche :
les versions datées conservent l'historique de l'application autonome et du prototype Jira,
abandonnés comme modes de livraison depuis la 0.25.0.

---

## 1. Objectif du produit

L’extension fournit une vue Scrum ou Kanban centrée sur les objectifs :

- les tickets des sprints actifs (Scrum) ou du périmètre du board (Kanban) sont organisés par **Goal Atlassian** ;
- chaque Goal devient une swimlane ;
- les tickets sans Goal visible rejoignent **Build** ;
- les objectifs vides restent affichés ; Build et les swimlanes par type ne sont affichés que
  lorsqu'ils contiennent des tickets. Build vide apparaît provisoirement pendant le déplacement
  d'un ticket par objectif, afin de conserver la possibilité de le détacher ;
- les tickets hors objectifs sont rangés dans des **swimlanes par type** (0.23.0) : chacune
  regroupe un ou plusieurs types de tickets (par exemple « RUN » : Anomalie Prod et Anomalie de
  Recette ; « OPS » : Demande de configuration et Demande de service). Son nom est celui de ses
  types tant qu’on ne le change pas. Réglages partagés avec l’équipe ; l’ancienne swimlane
  Kanban (« RUN » jusqu’en 0.20.2) est relue comme une swimlane par type ;
- les colonnes, statuts, transitions, types, filtres rapides et limites WIP viennent du board Jira ;
- Jira reste la source de vérité ;
- les boards **Scrum et Kanban** sont pris en charge depuis 0.24.0. Kanban n'utilise aucun sprint ;
  les objectifs y sont épinglés dans les réglages du board et partagés avec l'équipe.

Le projet est distinct de l’application macOS `jira-scrum-board-advanced`, même s’il reprend une
partie de sa spécification et de ses concepts. L’application Mac est **abandonnée** (décision de
Denis du 24/09/2026) : ne plus en tenir compte, ni pour les formats ni pour la parité. Son dépôt
reste consultable en lecture seule.

---

## 2. Un seul mode : intégré dans Jira

Décision de Denis du 09/10/2026 : supprimer la possibilité d'exécuter le board hors de Jira.
Le lanceur sert seulement à choisir une URL de board et à demander l'autorisation Chrome ;
aucune vue métier, aucun ticket et aucune administration ne s'affichent dans ce lanceur.

Commande :

```bash
npm run build
```

Sortie : `dist/`  
Manifest source : `public/manifest.json`  
Version : `0.25.0` (sans suffixe `.2`)\
Identifiant Chrome stable : `efhpkdoiimdggndnfcgdoaniobdcmokb`

Le manifest source est celui de l'intégration : permissions `storage`,
`declarativeNetRequestWithHostAccess` et `scripting`, autorisation optionnelle limitée à
`https://*.atlassian.net/*`, ressources exposées limitées à `board.html`, `assets/*` et `icons/*`,
et `frame-ancestors https://*.atlassian.net`. Cette promotion des droits déjà utilisés par
l'intégration applique la décision produit ; aucun hôte supplémentaire n'est ajouté.

L'identifiant et le stockage des installations de développement sont conservés. Les commandes
historiques `build:jira-direct-test`, `watch:jira-direct-test` et `check:jira-direct-test` restent
des alias compatibles et produisent exactement le même paquet. Il n'existe plus de construction autonome.

Avant tout rendu métier et toute lecture Jira, le garde-fou d'hébergement exige une seule origine
parente, égale au site Jira annoncé, une URL de board de ce site et l'autorisation Chrome.
L'ouverture directe de `board.html`, les cadres imbriqués et un autre site hôte sont refusés.

### Activation

L’intégration n’est active que sur une URL de board contenant :

```text
?sprintGoals=1
```

Exemple :

```text
https://site.atlassian.net/jira/software/c/projects/PROJET/boards/123?sprintGoals=1
```

- Un clic sur l'icône ouvre le lanceur `launcher.html`. Si l'onglet courant est un board Jira
  déjà autorisé, ce board s'ouvre automatiquement dans Sprint Goals.
- Sinon, le lanceur affiche son formulaire et préremplit le board mémorisé s'il en existe un.
  L'utilisateur peut remplacer l'URL, notamment pour changer de site, puis choisir « Ouvrir
  dans Jira ». Chrome demande l'autorisation du site si nécessaire, avant d'ouvrir la vraie
  URL Jira avec `sprintGoals=1`. Un refus ou une erreur laisse le formulaire disponible.
- Choisir un autre board depuis la vue intégrée navigue vers son URL Jira ; le site et le board
  affichés restent ceux de la page hôte.
- L’URL peut être enregistrée dans les favoris.
- Une URL Jira sans ce paramètre reste entièrement normale.
- Aucun onglet, bouton ou lien Sprint Goals n’est ajouté à l’interface Jira.
- La vue Sprint Goals recouvre toute la page Jira, qui reste chargée derrière.

### Ouverture des tickets

Deux comportements doivent rester distincts :

1. **Clic normal sur une carte** : la fiche Jira complète est affichée dans une popin de `1280 px`
   de large, avec des marges adaptatives de `16 à 60 px`.
2. **Transition du workflow exigeant des champs** (0.19.15.2) : un seul chemin. La fiche du
   ticket est chargée **cachée** dans la popin ; l’extension y ouvre le menu de statut de Jira et
   clique la transition — seulement si le libellé d’un élément, comparé sans accents, espaces,
   flèches ni ponctuation, vaut exactement son nom ou « nom + statut d’arrivée ». Sinon rien n’est
   cliqué et la fiche est montrée : l’utilisateur choisit. Jira dessine alors sa fenêtre (moderne,
   ou « classique » dans son iframe), que la popin isole et dimensionne.
   L’extension ne remplit ni ne valide aucun champ.
   Jira Cloud n’a **aucune adresse** qui serve cette fenêtre : elle est dessinée par son
   application. L’essai par `/secure/CommentAssignIssue!default.jspa` (0.19.11 à 0.19.13,
   documenté pour Data Center) est retiré — sur le Jira de Denis il renvoyait une page vide, et
   quand Jira refusait d’encadrer cette adresse, le cadre restait sur `about:blank` : la popin ne
   sortait alors jamais de son message d’attente.
   Garde-fous d’affichage : fiche jamais reconnue au bout de 12 s → la page de Jira est montrée
   telle quelle ; cadre jamais accessible au bout de 20 s → la popin se ferme et le dit. Une popin
   blanche qui ne bouge plus n’est jamais un état d’arrivée. Les étapes sont tracées dans la
   console de l’onglet (`Sprint Goals — …`) : c’est le seul moyen de savoir où l’ouverture s’arrête
   sur un Jira auquel le développeur n’a pas accès.

La fermeture de la fiche ou du formulaire conserve le board Sprint Goals et provoque une relecture
de Jira.

---

## 3. Décisions fonctionnelles à conserver

### Goals et sprints

En Kanban (0.24.0), `configuration.boardType === "kanban"` choisit le périmètre du board :
`snapshot.sprint` vaut `null`, `activeSprints` est vide, sans signifier un board vide.
`boardPinnedGoalIds` est une sélection partagée dans la propriété des réglages du board.
Le mode texte du sprint est indisponible ; les Goals Atlassian sont obligatoires. Une panne de leur
lecture empêche la nouvelle photographie de remplacer l'ancienne : pas de repli qui classerait
à tort les tickets dans Build. L'épinglage Kanban exige le droit de modifier le board ; il passe
par la même relecture, détection de conflit et écriture unique que les autres réglages partagés.
Il ne crée ni sprint ni propriété de sprint. Les règles ci-dessous relatives au sprint concernent Scrum.

- Les **Goals Atlassian** sont la source par défaut.
- Le texte du Sprint Goal reste disponible comme mode de repli.
- Le champ Jira « Sprint Goal » est lu mais **n’est jamais écrit**.
- Avec plusieurs sprints actifs, les tickets de tous les sprints sont réunis sans doublon.
- Le premier sprint par date de début est le sprint de référence pour les dates, l’épinglage et le
  mode texte.
- Les Goals Atlassian sont déduits des tickets de tous les sprints actifs.
- Si un ticket possède plusieurs Goals, il apparaît pour l’instant dans une seule swimlane : le
  premier Goal résolu.
- Un Goal nouvellement découvert par un ticket arrive masqué ; son ticket reste dans Build jusqu’à
  ce que l’utilisateur réaffiche le Goal depuis la barre latérale.
- Un Goal est atteint si tous ses tickets se trouvent dans la dernière colonne visible. Un Goal
  vide n’est jamais atteint.
- Le vert est réservé à l’état « Goal atteint » et n’est pas proposé comme couleur de swimlane.

### Board et affichage

- Scrum et Kanban : mêmes colonnes, règles de swimlanes, sous-tâches, transitions, rang, Daily et
  présentation. Les dates, le filtre « ajouté en cours de sprint » et l'épinglage au sprint
  restent propres à Scrum.
- Périmètre Kanban : `boardIssues`, avec le sous-filtre `subQuery.query` de la configuration Jira,
  et statuts associés aux colonnes du board. Le backlog n'est pas lu séparément. Un ticket de
  backlog n'est présent que si son statut est mappé et qu'il satisfait ce périmètre. Aucune limite
  d'âge locale pour les tickets terminés ; aucune coupure silencieuse des réponses paginées.
  Jira fait foi pour les statuts du périmètre : un statut absent de la structure locale reste
  compté et signalé comme non mappé ; « Relire structure » permet de replacer sa carte.
  Les filtres rapides et les règles de couleur JQL utilisent le même sous-filtre, sans clause sprint.
  Référence API vérifiée le 01/10/2026 :
  https://developer.atlassian.com/cloud/jira/software/rest/api-group-board/
  L'endpoint Agile existant de lecture des tickets est annoncé déprécié par Atlassian ; la migration
  vers l'endpoint Software « enhanced » est distincte de ce changement.
- Limites de lecture explicites : la limite de sécurité de 5 000 tickets refuse désormais un
  périmètre plus grand au lieu de le tronquer. Les liens Goal → tickets sont paginés quand
  l'introspection expose les arguments et champs nécessaires. Sans pagination exploitable, une
  page pleine de 100 liens est signalée comme incomplète ; Kanban utilise alors le champ Goals
  des tickets s'il est complet, sinon refuse une photographie qui ferait passer des tickets liés
  pour des tickets sans objectif. Les recherches de Goals et
  leurs liens restent bornés à 20 pages ; un curseur incohérent ou une borne atteinte est signalé.
- Depuis 0.24.1, un schéma Goals sans `workItems` n'empêche plus le Kanban de charger lorsque
  le champ Goals Jira est présent sur chaque ticket classé par objectif, y compris avec la valeur
  `null`. Les associations viennent alors des tickets ; si le champ manque sur un de ces tickets, la
  lecture reste bloquée pour ne pas classer à tort ce ticket dans Build.
- Périmètre (0.19.21, signalé par Denis) : les tickets d’un sprint sont lus depuis le board,
  `GET /rest/agile/1.0/board/{board}/sprint/{sprint}/issue`, et non plus par le sprint seul, qui
  ramenait aussi les tickets des autres boards d’un sprint partagé. Un sprint actif sans aucun
  ticket du board (sprint d’un autre board qui contenait un de nos tickets) n’est plus affiché
  dans l’en-tête, et l’épinglage des Goals se fait sur le premier sprint AFFICHÉ ; si aucun n’a
  de ticket, le premier reste. Filtrage par le filtre du board : décrit par la spécification
  (« from the board »), à constater sur le Jira de Denis.
- Les swimlanes couvrent toute la largeur logique du board, même avec défilement horizontal.
- L’en-tête, les filtres et les colonnes restent fixes pendant le défilement vertical.
- Le titre du Goal courant reste fixe sous les colonnes jusqu’à ce que le suivant le pousse.
- Les Goals atteints sont verts sur le board et dans la barre latérale.
- Dans la barre latérale, un Goal atteint n’affiche ni coche ni barre de progression.
- L’en-tête affiche le nombre de Goals atteints parmi les Goals visibles.
- Santé du sprint masquée pour l’instant (0.22.1, choix de Denis) : `SPRINT_HEALTH_ENABLED` dans
  `BoardView.tsx`, à repasser à `true` pour la réafficher.
- La daily se lance par le bouton plein « ▶ Daily », en tête des actions de l’en-tête (0.22.2).
- `DIAGNOSTIC_ENABLED` (`AdminView.tsx`, 0.22.7) peut masquer le diagnostic, mais reste à `true` :
  le bandeau « Invalid CORS request » y renvoie. À `false`, un compte sans droit sur le board n’a
  plus d’administration du tout, seulement la déconnexion.
- « Ajouté en cours de sprint » (0.23.1) : le ticket n’était pas dans le sprint à son démarrage,
  d’après l’historique du champ Sprint rejoué jusqu’au démarrage, ou sa date de création s’il n’y
  a aucun changement (`sprintScope`, `jira/models.ts`). Sans historique, rien n’est affiché.
- `columnLoad` compte tous les tickets de la colonne, swimlanes par type comprises (0.22.7, choix
  de Denis).
- Swimlanes par type (0.23.0, demande de Denis du 25/09/2026) : un type de ticket est « par
  objectif », dans une swimlane par type (`TicketSwimlane` de `core/boardConfiguration.ts`), ou
  ignoré. Une seule série de colonnes pour tout le board (`columns`). Administration → Board →
  « Types de tickets et swimlanes » : un bloc par groupe, un menu « Déplacer vers » par type ; une
  swimlane naît de son premier type et disparaît avec le dernier ; nom vide = noms des types
  réunis (`swimlaneName`). Une carte d’une swimlane par type ne se dépose que dans la sienne.
  Compatibilité 0.22.7 (collègues sur le même board) : la propriété du board garde les anciennes
  clés, DÉDUITES (`kanbanColumns`, `showKanbanSection`, `kanbanSectionLabel`,
  `dailyKanbanStockLimit`, catégories `SCRUM`/`KANBAN`), et ajoute `ticketSwimlanes` et
  `dailyStockLimit`, que la 0.22.7 réécrit telles quelles (`core/teamSettings.ts`).
- Épinglage des Goals au sprint directement dans Administration → Objectifs, sans fenêtre
  (0.22.4). « Goals associés au board » n’existe plus. Depuis 0.22.5, une seule section
  « Objectifs du sprint » (`SprintGoalsPanel.tsx`) : couleur, masquage et épinglage par objectif.
- Le mode présentation masque la barre latérale et l’en-tête, conserve les filtres et agrandit le
  board. Depuis 0.21.1, il passe aussi en plein écran, comme la daily (`views/fullscreen.tsx`).
  Échap ramène au mode normal (0.21.2) : en plein écran, c’est la sortie du plein écran
  (`fullscreenchange`) qui quitte la présentation, le navigateur ne transmettant pas la touche.
- Mode Daily (0.20.0, choix de Denis du 24/09/2026). Bouton ▶ de l’en-tête : plein écran du
  navigateur (demandé au clic ; refusé, la daily se déroule dans la fenêtre), mise en page de la
  présentation, UNE swimlane à la fois. Étapes = swimlanes affichées dans l’ordre du board, Build
  et swimlanes par type comprises, objectifs masqués et swimlanes sans ticket affiché sautés (`core/daily.ts`).
  Barre de daily, dans cet ordre (0.20.1) : minuteur global (orange dans les 2 dernières minutes,
  rouge avec le dépassement « +mm:ss » ensuite, jamais d’arrêt ni de son), Précédent, Suivant,
  swimlane présentée (objectif, Build ou swimlane par type) avec le temps passé dessus, « En pause » s’il y a
  lieu ; à droite pause, plein écran, Terminer. Clavier : ← →, Espace, Échap (en plein écran, Échap
  appartient au navigateur : il en sort et la daily continue). Le temps est recalculé depuis
  l’heure de départ, pauses exclues. Les cartes restent déplaçables (mêmes transitions et rangs,
  aucune nouvelle écriture) ; changer de Goal par glissé n’est pas possible, une seule swimlane
  étant affichée. Les filtres restent ceux de l’utilisateur ; le repli enregistré des swimlanes
  n’est pas touché. Durée : section Board de l’administration, 15 min par défaut, de 1 à 120,
  locale au board (`dailyMinutes`), jamais dans les réglages d’équipe. Rien n’est enregistré de la
  séance : recharger la page l’arrête. Stock (0.20.2, étendu à toutes les swimlanes en 0.23.0) :
  en daily, la première colonne de chaque swimlane n’affiche que ses N premières cartes dans
  l’ordre de Jira (`dailyStockLimit`, 3 par défaut, réglable dans la section Board), puis
  « + N autres », qui déplie cette swimlane seule jusqu’à la fin de la daily. L’iframe injectée porte
  `allow="fullscreen"` (attribut HTML, pas une permission Chrome).
- L’administration se déplie dans la barre latérale, sous son bouton, dans le gris de la barre ;
  elle se replie au second clic ou dès qu’une autre entrée de la barre est choisie.
- Sous-tâches (0.19.20, choix de Denis). Chacune garde sa carte, mais suit sa story : sans Goal
  propre, elle prend celui de son parent, et quand le parent est sur le board elle va dans le même
  bloc que lui, par objectif ou sa swimlane par type (`subtaskFamilies`, `core/boardSync.ts`). Elles comptent comme des
  tickets (colonnes, limites WIP, en-tête, santé du sprint, avancement et Goals atteints). Survoler
  une story ou une de ses sous-tâches entoure de rouge et éclaire toute la famille (`familyKey`,
  classe `card-family`), seulement si la famille a au moins deux cartes affichées et hors glissé.
  La carte de la story garde la jauge de ses sous-tâches (foncé = terminée, bleu clair = en cours,
  gris = à faire), la jauge verte quand toutes sont terminées avant la dernière colonne, et la
  pastille d'alerte quand elle est dans la dernière colonne avec des sous-tâches ouvertes. Les
  filtres s'appliquent carte par carte, comme dans Jira. Aucun appel Jira de plus.

### Glisser-déposer et transitions

- Même colonne : ne jamais changer le statut. Seuls le rang et/ou le Goal peuvent changer.
- Autre colonne : afficher les statuts accessibles comme zones de dépôt.
- Une colonne sans transition accessible est grisée et refuse le dépôt.
- Plusieurs transitions vers le même statut : demander à l’utilisateur laquelle employer.
- Ordre des écritures : **transition → Goal → rang**.
- Arrêt au premier échec ; une réussite partielle est signalée.
- Aucun retour arrière automatique sur les écritures Jira déjà confirmées.
- La carte projetée à destination est seulement un retour visuel. Les compteurs restent basés sur
  les données confirmées par Jira.
- Seules les erreurs gardent un repère rouge. Il n’y a plus de confirmation verte après déplacement.
- Si Jira exige des champs, utiliser le formulaire natif décrit plus haut.

### Réglages et partage

- Les réglages personnels utilisent `chrome.storage.local`, jamais `storage.sync`.
- Réglages du board partagés (0.22.0) : aucun réglage « local non enregistré ». Ils vivent dans la
  propriété de board `com.scrumboardmac.boardsettings.v1`, relue et appliquée à chaque chargement ;
  chaque modification par l’utilisateur y est écrite aussitôt, sur la version relue juste avant
  (celles des collègues sont gardées), une seule tentative. Un changement automatique (couleur d’un
  nouvel objectif) n’est jamais écrit seul. Échec réseau : la modification est perdue au prochain
  chargement (accepté par Denis).
- Sans droit de modifier le board (`canEdit`, ou refus de Jira) : administration réduite au
  Diagnostic, ni ordre, ni couleur, ni masquage des swimlanes ; le repli reste personnel.
- Les Goals épinglés vivent dans la propriété de sprint
  `com.scrumboardmac.sprintgoals.v1` (nom hérité de l’application Mac, abandonnée).
- Les préférences personnelles ne sont jamais publiées dans Jira.
- La déconnexion rend l’autorisation Chrome du site et efface les boards/réglages locaux de ce site,
  après confirmation.

---

## 4. Invariants de sécurité et d’écriture

### Écritures Jira autorisées

Il existe cinq catégories d’écriture :

1. transition d’un ticket ;
2. rang d’un ticket ;
3. lien ticket ↔ Goal ;
4. propriété du sprint ;
5. propriété du board.

Le diagnostic peut temporairement écrire puis supprimer sa propriété technique dédiée.

Toute nouvelle écriture doit :

1. être approuvée comme décision produit ;
2. être vérifiée dans la documentation ou le schéma Atlassian ;
3. être ajoutée à `src/jira/writes.ts` ;
4. être couverte par des tests ;
5. être documentée dans `README.md`, `TODO.md`, `DEVELOPER.md` et
   `docs/SECURITY-AUDIT.md`.

### Règles d’exécution

- Un POST, PUT ou DELETE n’est tenté qu’une fois.
- Une écriture incertaine n’est jamais rejouée automatiquement.
- Jira est relu après une issue incertaine.
- Aucune réussite n’est affichée avant la confirmation de Jira.
- Les champs d’une transition, le commentaire, le temps passé et les Story Points sont envoyés avec
  la transition, jamais dans une écriture préparatoire séparée.
- L’extension ne demande ni mot de passe ni jeton. Elle utilise la session Jira du navigateur.
- Aucune donnée fictive ne doit entrer dans `src/`, `public/` ou `board.html`.

### GraphQL Goals et règle Origin

La passerelle Goals refuse l’Origin `chrome-extension://…`. La plateforme installe une unique règle
de session qui retire ou remplace l’Origin par le site Jira, seulement pour :

- les requêtes POST de l’extension ;
- l’URL exacte `/gateway/api/graphql` ;
- l’identifiant de l’extension comme initiateur.

Ne jamais élargir cette règle aux pages Jira ni à d’autres URLs.

---

## 5. Architecture

```text
board.html                       point d’entrée de la vue intégrée, protégé hors de Jira
launcher.html                    choix de l'URL du board et autorisation du site
public/manifest.json             manifest intégré, permissions et ressources contrôlées
src/app/                          Preact, styles, modèles et vues
src/core/                         logique métier pure, sans DOM ni chrome.*
src/jira/                         transport, décodage, API REST/GraphQL, écritures
src/experiment/                   intégration Jira (nom historique du dossier)
tests/                            tests Vitest et faux Jira
tests/harness/                    banc visuel, données fictives
scripts/                          vérifications Chrome et outils
docs/                             audit et références de l’application Mac
```

### Couche application

- `AppModel` : connexion au site, vue, présentation, préférences globales.
- `BoardModel` : configuration active, synchronisation, filtres, glisser-déposer, écritures,
  notifications et état des fenêtres.
- `boardStore.ts` : boards enregistrés par origine Jira et board actif par site.
- `DiagnosticModel` : tests des capacités Jira et diagnostic de la règle Origin.
- `auditLog.ts` : journal local des tentatives d’écriture.

### Couche métier

- `boardSync.ts` : découverte et lecture du board/sprints/tickets.
- `boardIssue.ts` : assemblage des tickets, métriques et progression des Goals.
- `boardLayout.ts` / `boardBlocks.ts` : colonnes et swimlanes.
- `dropPlan.ts` / `boardWrites.ts` : planification puis exécution des déplacements.
- `filters.ts` / `jiraQuickFilters.ts` : filtres locaux et JQL Jira.
- `teamSettings.ts` : sérialisation et fusion des réglages d’équipe.
- `pendingMove.ts` : projection visuelle d’un déplacement en cours.

### Couche Jira

- `transport.ts` : HTTP, erreurs et absence de retry des écritures.
- `client.ts` : API REST Jira Software/Platform.
- `goals.ts` : introspection et opérations Goals GraphQL.
- `transitionPlanner.ts` / `transitionFields.ts` : transitions et formulaire dynamique.
- `writes.ts` : inventaire fermé des écritures autorisées.

### Intégration Jira

- `boardRoute.ts` : accepte uniquement une route moderne de board avec `sprintGoals=1`.
- `launchAddress.ts` : construit l’URL du board actif à partir du stockage local.
- `worker.ts` : enregistrement du content script et injection sur le site autorisé.
- `bootstrap.ts` : reste inerte sans le paramètre ; retire l’overlay si le paramètre disparaît.
- `injectBoard.ts` : overlay plein écran, iframe de l’application et popins Jira.
- `embedded.ts` : communication entre le board embarqué et la page Jira hôte.

La communication utilise `postMessage` avec vérification stricte de l’origine et de la fenêtre
source. Les clés de ticket et les identifiants de transition sont validés avant usage.

---

## 6. Modèle de données local

Principales clés `chrome.storage.local` :

- `connection.v1` : origine Jira connectée ;
- `launcher.v1` : dernière URL de board choisie dans le lanceur ;
- `boards.v1` : boards et board actif, groupés par origine ;
- `interface.v1` : largeur/repli de la barre, panneau santé et préférences d’interface ;
- `dismissedNotices.v1` : explications du board fermées pour de bon, par site et par board
  (`src/app/model/noticeStore.ts`) ; effacées avec le board retiré ou à la déconnexion ;
- réglage de variante GraphQL par site ;
- journal d’audit local.

`BoardConfiguration` se trouve dans `src/core/boardConfiguration.ts`. Lors de toute évolution de
son format :

- garder le décodage tolérant aux anciennes valeurs ;
- fournir des valeurs par défaut ;
- ne jamais rendre une installation inutilisable à cause d’un champ local absent ;
- tester la lecture d’une configuration ancienne.

Le paquet intégré conserve l'identifiant Chrome de développement et relit le stockage des
versions précédentes. Le changement de mode ne remet pas les préférences à zéro.

---

## 7. Développement local

Prérequis : Node `>= 22.12`.

```bash
npm ci
npm run check
```

`npm run check` exécute le typage, le lint, les tests et la construction intégrée dans `dist/`.
`npm run watch` surveille les sources et reconstruit ce même paquet. Les alias
`:jira-direct-test` conservent ces comportements pour les procédures existantes.

IntelliJ IDEA ouvre directement la racine contenant `package.json`. Le plugin Node.js et un
interpréteur Node `>= 22.12` sont nécessaires. Les configurations npm partagées de `.run/`
permettent l'installation, la compilation intégrée, la compilation continue et les contrôles
complets. `.idea/` et les fichiers personnels de l'IDE sont ignorés, `.run/` est versionné.

Validation de la 0.24.0, le 01/10/2026 : typage et lint réussis ; 890 tests réussis, 1 ignoré.
Les deux constructions ont été réalisées dans `release/kanban-0.24.0` et
`release/kanban-jira-0.24.0`, sans modifier `dist/`. Les scripts de vérification du chargement et
de l'intégration Jira ont été exécutés sous Edge Chromium, sur profils temporaires et faux Jira.
Le banc visuel Kanban couvre objectifs, Build/RUN/OPS, épinglage partagé, Daily et board vide.
La compatibilité avec l'instance Jira réelle reste à valider par Denis.
Validation de la 0.24.1 : typage et lint réussis ; 895 tests réussis, 1 ignoré ; paquet intégré
`0.24.1.2` construit dans `dist/` et contrôle navigateur isolé du mode intégré réussi.
Validation de la 0.24.2 : Build et les swimlanes par type vides sont masqués ; les objectifs vides
restent visibles. La barre latérale suit la même règle et l'indicateur Build disparaît à zéro.
Typage et lint réussis ; 899 tests réussis, 1 ignoré ; paquet intégré `0.24.2.2` construit dans
`dist/` et vérifié sous Edge Chromium avec un profil isolé et un faux Jira.
En 0.24.3, l'information de lecture partielle des Goals se ferme comme les autres explications
flottantes. Sa fermeture reste personnelle, par site et par board ; une erreur bloquante de
synchronisation reste visible.
Typage et lint réussis ; 900 tests réussis, 1 ignoré ; paquet intégré `0.24.3.2` construit dans
`dist/` et vérifié sous Edge Chromium avec un profil isolé et un faux Jira.
En 0.24.4, le projet inclut des configurations IntelliJ partagées pour installer les dépendances,
construire ou surveiller le paquet Jira intégré et lancer les contrôles complets.
Typage et lint réussis ; 900 tests réussis, 1 ignoré ; paquet intégré `0.24.4.2` construit dans
`dist/`. La vérification navigateur isolée n'a pas abouti sur cette machine : Edge ne répond pas
à `Extensions.loadUnpacked` dans le délai imparti.

Commandes utiles :

```bash
npm run test
npm run test:watch
npm run typecheck
npm run lint
npm run format
npm run build
npm run watch
npm run verify:load
npm run verify:drag
npm run verify:transition
npm run harness
```

Contrôle de l'intégration Jira :

```bash
npm run verify:jira
```

`verify:jira` (alias historique `verify:jira-direct-test`) utilise un profil Chrome temporaire
et un faux Jira. Pour ne pas reconstruire un paquet chargé dans Chrome, construire ailleurs
puis vérifier ce dossier :

```bash
npx vite build --outDir <dossier>
JIRA_DIRECT_DIST=<dossier> node scripts/verify-jira-direct-test.mjs
```

Il vérifie :

- l’overlay uniquement sur l’URL spéciale ;
- le recouvrement plein écran ;
- l’iframe réelle de l’application ;
- la fiche complète à `1280 px` lors d’un clic normal ;
- le formulaire natif ouvert directement lors d’une transition ;
- le recadrage sur ce seul formulaire ;
- l’absence de validation automatique ;
- l’absence de clic sur une transition ambiguë ;
- le refus d’afficher le board sans autorisation du site ou dans la page d’un autre site Atlassian ;
- l’absence d’effet sur une URL Jira normale.

Les essais Chrome automatisés n’utilisent ni la session ni les données Jira de l’utilisateur.

---

## 8. Stratégie Git et livraison

**Consigne de Denis du 09/10/2026 : fonctionnement uniquement dans Jira.** `npm run build`
produit dans `dist/` le seul paquet, chargeable dans Chrome. `npm run package` prépare le même
mode intégré pour le Store. L'ancien mode autonome est supprimé ; la version est unique, sans
suffixe `.2`. L'historique des validations ci-dessus décrit les anciennes livraisons.

- Travailler dans une branche `codex/...` dédiée.
- Faire un commit cohérent par correction ou fonctionnalité.
- Utiliser l’identité `2nis6mon <denis.simon@gmail.com>`.
- Pousser chaque commit sur sa branche (consigne de Denis du 24/09/2026) ; ne fusionner dans
  `main` que sur demande explicite.
- Ne jamais committer `.secrets/extension-key.pem`, un profil Chrome, des cookies, des captures de
  données Jira ou un paquet contenant des secrets.
- `dist/` est généré et ignoré par Git ; il reçoit toujours le paquet intégré.

Avant un commit :

1. exécuter les tests ciblés pendant le développement ;
2. exécuter `npm run check` ;
3. exécuter aussi `npm run verify:jira` ;
4. vérifier `git diff` et `git status` ;
5. mettre à jour la documentation et le numéro du paquet concerné.

Ne pas reconstruire le paquet que Denis est en train de tester. Utiliser un dossier temporaire
lorsqu’une autre version est active dans Chrome.

---

## 9. Problèmes et limites connus

### Problèmes ouverts confirmés par la revue

1. **Pagination des tickets liés à un Goal selon le schéma Atlassian**\
   Depuis 0.24.0, `src/jira/goals.ts` pagine si le schéma expose les champs nécessaires. Sinon,
   une page pleine de 100 liens est signalée comme potentiellement incomplète et bloque le
   chargement Kanban. Ce comportement doit encore être validé sur l'instance Jira réelle.

2. **Documentation historique**
   Les notes de versions conservent les choix et résultats de tests de leur époque, notamment
   les suffixes `.2` et l'ancien mode autonome. Les procédures actuelles décrivent la 0.25.0.

3. **Validations réelles de workflows encore incomplètes**  
   Les transitions Time Spent, Story Points, Resolution et certains écrans fournis par des apps Jira
   tierces doivent continuer à être essayés sur les workflows réels. Les tests locaux prouvent le
   comportement du code, pas la stabilité du DOM de chaque instance Jira.

### Limites intentionnelles

- Kanban utilise les Goals Atlassian ; le mode texte du champ « Sprint Goal » reste propre à Scrum.
- Un ticket avec plusieurs Goals n’est affiché que dans une swimlane.
- Le mode texte n’agrège pas les textes de plusieurs sprints actifs.
- Le déplacement par glisser-déposer est à la souris ; le déplacement clavier a été abandonné par
  décision produit.
- Les limites WIP comparent un nombre de tickets, pas des points.
- Les avatars externes ne sont pas téléchargés ; les initiales sont affichées.
- `storage.sync` est exclu.
- Les écritures ne sont jamais rejouées automatiquement.

### Fragilités de l'intégration Jira

Ces points sont des risques techniques connus, même lorsqu’aucun incident n’est actuellement
reproduit :

- L’extraction de la fiche (clic sur une carte) dépend du DOM accessible de Jira Cloud : boutons
  Fermer/Close, lien `/browse/{clé}`.
- L’ouverture d’une transition dépend du DOM de Jira : un bouton de statut reconnaissable
  (`aria-label`/`title` « changer le statut », ou un `data-testid` contenant `status` avec
  `aria-haspopup`), puis un élément de menu dont le libellé vaut le nom de la transition, seul ou
  suivi de son statut d’arrivée. Si Atlassian change ces libellés, rien n’est cliqué et la fiche
  est rendue à l’utilisateur — jamais une transition voisine.
- La hauteur de la popin suit celle du formulaire, limitée à la fenêtre du navigateur avec une
  marge de 16 px.
- Le mode direct reconnaît les routes modernes `/jira/.../boards/{id}` et requiert une clé projet
  enregistrée pour construire l’URL depuis l’icône.
- Si Jira interdit un jour l’affichage de sa propre page dans une iframe de même origine, la fiche
  et les formulaires natifs ne pourront plus être cadrés de cette manière.

---

## 10. Améliorations futures

### À court terme

- Tester le formulaire Jira natif sur davantage de transitions réelles : Time Spent, Story Points,
  Resolution, commentaires, écrans avec plusieurs champs et champs d’applications tierces.
- Ajouter un diagnostic visible lorsque le formulaire natif n’est pas reconnu, sans exposer de
  données du ticket.
- Tester l’annulation et la validation du formulaire natif, puis confirmer que le board se relit et
  que la carte revient ou reste à destination selon la réponse Jira.
- Corriger la pagination `workItems` des Goals.
- Mettre à jour les sections historiques du README et du TODO devenues obsolètes.

### Produit et ergonomie

- Export/import JSON des réglages, avec validation et aperçu des changements.
- Synchronisation des préférences personnelles entre postes via une propriété utilisateur Jira,
  uniquement après validation de cette nouvelle écriture.
- Limites WIP en points et éventuellement minimums de colonne.
- Adapter la proposition Goals aux capacités réellement disponibles sur le board.
- Déploiement Chrome géré via `storage.managed` si un besoin IT apparaît.
- Améliorer l’accessibilité du glisser-déposer si la décision d’abandon du clavier est réouverte.
- Mode Daily : livré en 0.20.0 sur la branche `codex/mode-daily`, à valider par Denis (voir
  « Board et affichage »). Pistes : réglage partagé par l’équipe, temps indicatif par objectif.

### Sprint Planning, non autorisé à ce jour

Une vue de préparation du prochain sprint a été envisagée, puis redemandée par Denis le
24/09/2026 : objectifs, tickets, capacité et éventuellement démarrage du sprint. Elle demanderait de nouvelles écritures Jira : ajout au sprint,
démarrage du sprint et peut-être création de Goal. Ne rien implémenter avant d’avoir décidé :

- préparation seule ou démarrage inclus ;
- sprint futur automatique ou sprint choisi ;
- Goals existants, texte ou création de Goals ;
- forme de la vue Planning ;
- calcul de capacité.

Chaque nouvelle écriture devra suivre le processus de sécurité décrit plus haut.

### Distribution

- Chrome Web Store, visibilité publique ; le paquet préparé est désormais intégré dans Jira
  (décision du 09/10/2026). La publication reste une opération distincte.
- `npm run package` : `release/sprint-goals-board-<version>.zip`, construit hors de `dist/`, sans
  le champ `key` (le Store attribue son identifiant : c'est une autre extension que celle de
  développement), avec les droits contrôlés du manifest intégré ; refusé s'il contient une carte de sources, une clé privée ou le
  banc d'essai. `EXTENSION_DIR=release/build node scripts/verify-load.mjs` le charge dans un
  Chrome vierge.
- Fiche du Store (textes, justifications des droits, déclarations) : `docs/store/fiche.md` ;
  captures : `npm run store:screenshots` → `docs/store/captures/`.
- Politique de confidentialité : `docs/privacy/index.html`, publiée par GitHub Pages depuis le
  dépôt public `2nis6mon/sprint-goals-privacy` : https://2nis6mon.github.io/sprint-goals-privacy/
  (y recopier le fichier à chaque modification).

---

## 11. Checklist de reprise

Avant de modifier le projet :

1. lire ce document, `CLAUDE.md` et `docs/SECURITY-AUDIT.md` ;
2. vérifier la branche et le dernier commit ;
3. préserver le fonctionnement exclusivement dans une page Jira autorisée ;
4. lancer `npm ci` puis `npm run check` ;
5. construire le paquet intégré ;
6. ne pas ajouter d’endpoint, permission ou écriture non validés ;
7. préserver les deux comportements d’ouverture de ticket ;
8. tester toute modification de transition avec un cas sans champ et un cas avec champ requis ;
9. noter clairement ce qui a été testé localement et ce qui a été essayé sur Jira réel ;
10. vérifier le manifest intégré, le garde-fou d'hébergement et le lanceur sans vue métier ;
    ne pas présenter les tests sur faux Jira comme une validation de l'instance de Denis.

Historique Git (23/09/2026) : `codex/test-ouverture-jira-directe` a été fusionnée dans `main` à la
demande de Denis (avance rapide, 27 commits, aucun conflit), puis supprimée, comme
`codex/board-search-confirmation` (déjà fusionnée) et `codex/test-board-dans-jira` (ancien
prototype à onglet, abandonné, 17 commits perdus volontairement). L’intégration directe y a suivi ce
chemin : ouverture du board dans Jira (`66e865e`), ouverture du formulaire de transition
(`b3d2c09`), recadrage de la popin (`5161b49`), durcissements de la 0.19.9 (hébergement du board,
clic de transition), essai par adresse directe (0.19.11 à 0.19.13) puis son retrait au profit du
seul menu de statut (0.19.14).

