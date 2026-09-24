# Guide développeur — Sprint Goals Board pour Jira

Dernière mise à jour : **24 septembre 2026**  
Branche décrite : **`codex/mode-daily`** (issue de `main` le 24/09/2026 pour le mode Daily ; contient 0.19.21)  
Produit autonome : **0.20.2**  
Prototype d’intégration Jira : **0.20.2.2**

Ce document est le point d’entrée pour reprendre le projet. Il décrit l’état réel du dépôt, les
décisions produit, l’architecture, les invariants de sécurité, les procédures de test et de
livraison, les problèmes connus et les évolutions envisagées.

Les détails historiques restent disponibles dans `README.md`, `TODO.md`, `CLAUDE.md` et
`docs/SECURITY-AUDIT.md`. En cas de contradiction, vérifier le code et les tests de la branche :
certains passages de ces anciens documents décrivent encore l’application autonome avant le
prototype Jira.

---

## 1. Objectif du produit

L’extension fournit une vue Scrum centrée sur les objectifs :

- les tickets des sprints actifs sont organisés par **Goal Atlassian** ;
- chaque Goal devient une swimlane ;
- les tickets sans Goal visible rejoignent **Build** ;
- les types classés RUN sont regroupés dans **RUN** ;
- les colonnes, statuts, transitions, types, filtres rapides et limites WIP viennent du board Jira ;
- Jira reste la source de vérité ;
- le board ne prend en charge que les **boards Scrum**. Les boards Kanban sont explicitement hors
  périmètre.

Le projet est distinct de l’application macOS `jira-scrum-board-advanced`, même s’il reprend une
partie de sa spécification et de ses concepts. Le dépôt de l’application Mac est une référence en
lecture seule.

---

## 2. Les deux modes présents dans cette branche

### 2.1 Application autonome

Commande :

```bash
npm run build
```

Sortie : `dist/`  
Manifest source : `public/manifest.json`  
Version : `0.20.2`  
Identifiant Chrome stable : `efhpkdoiimdggndnfcgdoaniobdcmokb`

L’icône ouvre `board.html` dans un onglet de l’extension. Le service worker autonome est
`src/background/service-worker.ts`.

Ce mode :

- n’injecte rien dans Jira ;
- ne demande pas la permission `scripting` ;
- ouvre normalement un ticket dans Jira depuis la carte ;
- possède sa propre page, sa barre latérale et son administration.

### 2.2 Prototype d’ouverture directe dans Jira

Commande :

```bash
npm run build:jira-direct-test
```

Sortie : `dist/` (les deux paquets, depuis le 23/09/2026 ; il n’y a plus de `dist-*`)  
Version générée : `0.20.2.2`  
Nom généré : `Sprint Goals — test ouverture Jira`

Les deux paquets gardent la clé du manifest : **même identifiant Chrome et même stockage**. Une
seule entrée dans `chrome://extensions` ; passer d’un paquet à l’autre demande seulement de
reconstruire puis de recharger l’extension, en conservant le site connecté, le board et les
réglages. Le nom et la version (`x.y.z.2`) disent lequel est chargé.

Le prototype ajoute uniquement au manifest généré :

- la permission `scripting` ;
- un service worker expérimental ;
- les ressources nécessaires à l’iframe sur `https://*.atlassian.net` ;
- `frame-ancestors https://*.atlassian.net` pour les pages de l’extension.

Il ne faut pas reporter ces permissions dans `public/manifest.json` sans décision explicite de
faire de ce prototype le produit principal et sans mise à jour de l’audit de sécurité.

Depuis la 0.19.9.2 (audit, constats S9 et S10) :

- la page du board encadrée ne s’affiche et ne lit Jira que dans la page de premier niveau du site
  qu’elle annonce (`location.ancestorOrigins`), pour un board de ce site autorisé dans Chrome
  (`src/experiment/embeddingGuard.ts`) ; sinon elle affiche un simple refus ;
- l’écran d’une transition est d’abord demandé par identifiants ; à défaut seulement, l’extension
  ouvre le menu de statut de Jira et ne clique qu’une correspondance certaine (voir « Ouverture des
  tickets »).

L’ancien prototype « Sprint Goals — prototype dans Jira » (branche `codex/test-board-dans-jira`,
0.19.1.x, onglet « Sprint Goals » ajouté dans Jira) n’a plus de dossier : s’il reste chargé dans
Chrome, le retirer pour éviter toute confusion.

#### Activation

L’intégration n’est active que sur une URL de board contenant :

```text
?sprintGoals=1
```

Exemple :

```text
https://site.atlassian.net/jira/software/c/projects/PROJET/boards/123?sprintGoals=1
```

- Un clic sur l’icône construit cette URL avec le board actif.
- Sans board enregistré, l’icône ouvre la page de l’extension ; dès que le premier board y est
  choisi, l’onglet rejoint lui-même cette URL (`followBoardToJira`, 0.19.16.2). Les ouvertures
  suivantes sur un board déjà enregistré restent dans la page, qui garde son administration.
- L’URL peut être enregistrée dans les favoris.
- Une URL Jira sans ce paramètre reste entièrement normale.
- Aucun onglet, bouton ou lien Sprint Goals n’est ajouté à l’interface Jira.
- La vue Sprint Goals recouvre toute la page Jira, qui reste chargée derrière.

#### Ouverture des tickets

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

- Scrum seulement ; Kanban n’est pas pris en charge.
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
- Le mode présentation masque la barre latérale et l’en-tête, conserve les filtres et agrandit le
  board. Il ne déclenche pas le plein écran du navigateur.
- Mode Daily (0.20.0, choix de Denis du 24/09/2026). Bouton ▶ de l’en-tête : plein écran du
  navigateur (demandé au clic ; refusé, la daily se déroule dans la fenêtre), mise en page de la
  présentation, UNE swimlane à la fois. Étapes = swimlanes affichées dans l’ordre du board, Build
  et RUN compris, objectifs masqués et swimlanes sans ticket affiché sautés (`core/daily.ts`).
  Barre de daily, dans cet ordre (0.20.1) : minuteur global (orange dans les 2 dernières minutes,
  rouge avec le dépassement « +mm:ss » ensuite, jamais d’arrêt ni de son), Précédent, Suivant,
  swimlane présentée (objectif, Build ou RUN) avec le temps passé dessus, « En pause » s’il y a
  lieu ; à droite pause, plein écran, Terminer. Clavier : ← →, Espace, Échap (en plein écran, Échap
  appartient au navigateur : il en sort et la daily continue). Le temps est recalculé depuis
  l’heure de départ, pauses exclues. Les cartes restent déplaçables (mêmes transitions et rangs,
  aucune nouvelle écriture) ; changer de Goal par glissé n’est pas possible, une seule swimlane
  étant affichée. Les filtres restent ceux de l’utilisateur ; le repli enregistré des swimlanes
  n’est pas touché. Durée : section Board de l’administration, 15 min par défaut, de 1 à 120,
  locale au board (`dailyMinutes`), jamais dans les réglages d’équipe. Rien n’est enregistré de la
  séance : recharger la page l’arrête. Stock du RUN (0.20.2) : en daily, la première colonne du
  RUN n’affiche que ses N premières cartes dans l’ordre de Jira (`dailyRunStockLimit`, 3 par
  défaut, réglable dans la section Board), puis « + N autres » qui déplie jusqu’à la fin de la
  daily. Dans le prototype, l’iframe injectée porte
  `allow="fullscreen"` (attribut HTML, pas une permission Chrome).
- L’administration se déplie dans la barre latérale, sous son bouton, dans le gris de la barre ;
  elle se replie au second clic ou dès qu’une autre entrée de la barre est choisie.
- Sous-tâches (0.19.20, choix de Denis). Chacune garde sa carte, mais suit sa story : sans Goal
  propre, elle prend celui de son parent, et quand le parent est sur le board elle va dans le même
  bloc que lui, Scrum ou RUN (`subtaskFamilies`, `core/boardSync.ts`). Elles comptent comme des
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
- Si Jira exige des champs, utiliser le formulaire dynamique autonome ou, dans l’intégration Jira,
  le formulaire natif décrit plus haut.

### Réglages et partage

- Les réglages personnels utilisent `chrome.storage.local`, jamais `storage.sync`.
- Les réglages d’équipe sont publiés uniquement sur le geste « Publier pour l’équipe ».
- Ils vivent dans la propriété de board `com.scrumboardmac.boardsettings.v1`.
- Les Goals épinglés vivent dans la propriété de sprint
  `com.scrumboardmac.sprintgoals.v1`, partagée avec l’application Mac.
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
board.html                         point d’entrée de l’interface
public/manifest.json               manifest autonome, permissions minimales
src/background/service-worker.ts  ouverture de l’application autonome
src/app/                          Preact, styles, modèles et vues
src/core/                         logique métier pure, sans DOM ni chrome.*
src/jira/                         transport, décodage, API REST/GraphQL, écritures
src/experiment/                   intégration Jira expérimentale
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

### Intégration Jira expérimentale

- `boardRoute.ts` : accepte uniquement une route moderne de board avec `sprintGoals=1`.
- `launchAddress.ts` : construit l’URL du board actif à partir du stockage local.
- `worker.ts` : clic sur l’icône, enregistrement du content script et injection.
- `bootstrap.ts` : reste inerte sans le paramètre ; retire l’overlay si le paramètre disparaît.
- `injectBoard.ts` : overlay plein écran, iframe de l’application et popins Jira.
- `embedded.ts` : communication entre le board embarqué et la page Jira hôte.

La communication utilise `postMessage` avec vérification stricte de l’origine et de la fenêtre
source. Les clés de ticket et les identifiants de transition sont validés avant usage.

---

## 6. Modèle de données local

Principales clés `chrome.storage.local` :

- `connection.v1` : origine Jira connectée ;
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

Le paquet expérimental ayant un autre identifiant Chrome, il ne partage pas ce stockage avec le
paquet autonome.

---

## 7. Développement local

Prérequis : Node `>= 22.12`.

```bash
npm ci
npm run check
```

`npm run check` exécute le typage, le lint, les tests et la construction autonome.

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

Prototype Jira :

```bash
npm run build:jira-direct-test
npm run verify:jira-direct-test
```

`verify:jira-direct-test` utilise un profil Chrome temporaire et un faux Jira. Pour ne pas
reconstruire un paquet d’essai chargé dans Chrome, construire ailleurs puis vérifier ce dossier :

```bash
npx vite build --mode jira-direct-test --outDir <dossier>
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

- Travailler dans une branche `codex/...` dédiée.
- Faire un commit cohérent par correction ou fonctionnalité.
- Utiliser l’identité `2nis6mon <denis.simon@gmail.com>`.
- Pousser chaque commit sur sa branche (consigne de Denis du 24/09/2026) ; ne fusionner dans
  `main` que sur demande explicite.
- Ne jamais committer `.secrets/extension-key.pem`, un profil Chrome, des cookies, des captures de
  données Jira ou un paquet contenant des secrets.
- `dist/` est généré et ignoré par Git ; il reçoit le paquet autonome ou le prototype, selon la
  dernière construction.

Avant un commit :

1. exécuter les tests ciblés pendant le développement ;
2. exécuter `npm run check` ;
3. pour l’intégration Jira, exécuter aussi `npm run verify:jira-direct-test` ;
4. vérifier `git diff` et `git status` ;
5. mettre à jour la documentation et le numéro du paquet concerné.

Ne pas reconstruire le paquet que Denis est en train de tester. Utiliser le dossier expérimental ou
un dossier temporaire lorsqu’une autre version est active dans Chrome.

---

## 9. Problèmes et limites connus

### Problèmes ouverts confirmés par la revue

1. **Pagination des tickets liés à un Goal**  
   `src/jira/goals.ts` lit `workItems(first: 100)` sans pagination complète. Le champ Goals des
   tickets complète souvent les associations mais ne garantit pas l’exhaustivité. Il faut étudier
   le schéma GraphQL, gérer plus de 100 liens ou signaler explicitement une lecture tronquée.

2. **Documentation historique partiellement obsolète**  
   `CLAUDE.md`, le README et l’audit sont à jour depuis la 0.19.9. `TODO.md` présente encore
   l’intégration Jira comme une simple piste. Ne pas se fier aux numéros historiques sans comparer
   au manifest, à `package.json` et à ce document.

3. **Validations réelles de workflows encore incomplètes**  
   Les transitions Time Spent, Story Points, Resolution et certains écrans fournis par des apps Jira
   tierces doivent continuer à être essayés sur les workflows réels. Les tests locaux prouvent le
   comportement du code, pas la stabilité du DOM de chaque instance Jira.

### Limites intentionnelles

- Kanban non pris en charge.
- Un ticket avec plusieurs Goals n’est affiché que dans une swimlane.
- Le mode texte n’agrège pas les textes de plusieurs sprints actifs.
- Le déplacement par glisser-déposer est à la souris ; le déplacement clavier a été abandonné par
  décision produit.
- Les limites WIP comparent un nombre de tickets, pas des points.
- Les avatars externes ne sont pas téléchargés ; les initiales sont affichées.
- `storage.sync` est exclu.
- Les écritures ne sont jamais rejouées automatiquement.

### Fragilités propres au prototype Jira

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
- Le paquet d’essai a un stockage séparé ; l’utilisateur doit reconnecter le site et sélectionner
  son board.
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
- Décider si l’intégration Jira devient le mode principal ou reste un paquet expérimental.
- Si elle devient principale, réconcilier manifest, identifiant Chrome, stockage, permissions,
  audit de sécurité, README et procédure de migration.
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

- Choisir le mode de distribution : Chrome Web Store, paquet interne ou déploiement géré.
- Préparer la signature, la politique de mise à jour et les instructions utilisateurs.
- Vérifier qu’aucune clé privée ni donnée de banc d’essai n’entre dans le paquet.

---

## 11. Checklist de reprise

Avant de modifier le projet :

1. lire ce document, `CLAUDE.md` et `docs/SECURITY-AUDIT.md` ;
2. vérifier la branche et le dernier commit ;
3. déterminer si le travail concerne le produit autonome, le prototype Jira ou les deux ;
4. lancer `npm ci` puis `npm run check` ;
5. construire le paquet concerné ;
6. ne pas ajouter d’endpoint, permission ou écriture non validés ;
7. préserver les deux comportements d’ouverture de ticket ;
8. tester toute modification de transition avec un cas sans champ et un cas avec champ requis ;
9. noter clairement ce qui a été testé localement et ce qui a été essayé sur Jira réel ;
10. ne jamais faire passer les droits du paquet d’essai dans `public/manifest.json` : l’intégration
    directe dans Jira n’est toujours pas validée sur l’instance de Denis.

État Git : `codex/test-ouverture-jira-directe` a été fusionnée dans `main` le 23/09/2026 à la
demande de Denis (avance rapide, 27 commits, aucun conflit), puis supprimée, comme
`codex/board-search-confirmation` (déjà fusionnée) et `codex/test-board-dans-jira` (ancien
prototype à onglet, abandonné, 17 commits perdus volontairement). `main` est la seule branche. L’intégration directe y a suivi ce
chemin : ouverture du board dans Jira (`66e865e`), ouverture du formulaire de transition
(`b3d2c09`), recadrage de la popin (`5161b49`), durcissements de la 0.19.9 (hébergement du board,
clic de transition), essai par adresse directe (0.19.11 à 0.19.13) puis son retrait au profit du
seul menu de statut (0.19.14).

