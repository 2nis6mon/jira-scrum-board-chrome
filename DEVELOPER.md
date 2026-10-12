# Guide développeur — Sprint Goals Board pour Jira

État décrit : **0.28.1**, 12 octobre 2026. Mode unique : extension Chrome intégrée dans Jira.
Les règles de contribution sont dans `CLAUDE.md`, les travaux ouverts dans `TODO.md` et les
évolutions livrées dans `CHANGELOG.md`. Ce document est la référence de l'architecture et du produit.

## Parcours et points d'entrée

`launcher.html` sert à reconnaître un board depuis l'onglet courant, choisir une adresse et
demander la permission du site. Il ne charge aucun ticket. `board.html` contient l'application
Preact, affichée uniquement dans une iframe autorisée de la page Jira.

Le paramètre `sprintGoals=1` ouvre Sprint Goals. Sans lui, Jira conserve son affichage normal,
avec le bouton flottant d'ouverture sur les boards autorisés. Le changement de board suit l'URL
Jira ; « Retour à Jira » retire le paramètre par rechargement. Le parcours et les popins sont
décrits dans [l'intégration Jira](docs/integration-jira.md).

## Architecture

```text
board.html                 entrée Preact de la vue intégrée
launcher.html              entrée Preact du lanceur / bienvenue
public/manifest.json       permissions, CSP, identité Chrome et entrées compilées
src/app/                   modèles, vues et styles
src/app/platform/          adaptateurs Chrome injectés dans les modèles
src/core/                  logique métier, indépendante du DOM et de Chrome
src/jira/                  transport REST/GraphQL, décodage et inventaire des écritures
src/integration/           service worker, script de contenu, iframe et popins natives
tests/support/             faux services et fabriques de données
tests/harness/             banc visuel fictif, absent du paquet de production
scripts/                   vérification navigateur et distribution
docs/                      documentation utilisateur et technique
```

- `AppModel` pilote connexion, vue et présentation ; `BoardModel` pilote chargement, réglages,
  filtres, déplacements et notifications. `DiagnosticModel` teste les capacités disponibles.
- `boardSync` lit le périmètre ; `boardIssue` assemble tickets et métriques ; `boardLayout` et
  `boardBlocks` répartissent colonnes et swimlanes ; `pendingMove` projette un déplacement en cours.
- `dropPlan` prépare l'intention et `boardWrites` l'exécute après relecture. Les formulaires avec
  champs sont délégués par `nativeTransitionHandler` à l'hôte Jira. Pendant leur ouverture, les
  nouveaux déplacements et le changement de board sont bloqués ; le message de fermeture vérifié
  libère l'état et relit Jira. Aucun formulaire local ni envoi de champs n'est maintenu en secours.
- `teamSettings` relit, fusionne et écrit les réglages partagés ; `boardStore` conserve une copie
  et le board actif par origine. `auditLog` conserve les tentatives d'écriture de l'extension.
- `integration/LauncherModel` utilise `launchAddress` pour reconnaître et valider les adresses.
  `worker` enregistre `bootstrap` sur les sites autorisés et injecte `injectBoard` sur une URL marquée.
- `embeddingGuard` vérifie l'origine parente et l'autorisation avant tout modèle métier.
  `embedded` raccorde le modèle aux messages vérifiés de l'hôte.
- `injectBoard` et `bootstrap` s'exécutent dans la page Jira : la fonction injectée ne doit dépendre
  d'aucun import ni état extérieur, et le script de contenu n'a pas d'import.

## Décisions fonctionnelles

### Goals et sprints

En Kanban (0.24.0), `configuration.boardType === "kanban"` choisit le périmètre du board :
`snapshot.sprint` vaut `null`, `activeSprints` est vide, sans signifier un board vide.
`boardPinnedGoalIds` est une sélection partagée dans la propriété des réglages du board.
Le mode texte du sprint est indisponible ; les Goals Atlassian sont obligatoires. Une panne de leur
lecture empêche la nouvelle photographie de remplacer l'ancienne : pas de repli qui classerait
à tort les tickets dans Build. L'épinglage Kanban exige le droit de modifier le board ; il passe
par la même relecture, détection de conflit et écriture unique que les autres réglages partagés.
Il ne crée ni sprint ni propriété de sprint. Les règles ci-dessous relatives au sprint concernent Scrum.

- Le **texte du Sprint Goal** est la source par défaut d'un board Scrum
  nouvellement ajouté ; les **Goals Atlassian** se choisissent dans l'administration. Un board
  déjà enregistré, ou dont les réglages partagés disent autre chose, garde sa source.
- En Kanban, les Goals Atlassian restent la seule source.
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
  La compatibilité des propriétés existantes est décrite dans `docs/API-CONTRACTS.md`.
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
  partagée au board (`dailyMinutes`). Rien n’est enregistré de la
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

## Données, permissions et écritures

Les [contrats API](docs/API-CONTRACTS.md) décrivent les appels et les données persistées.
L'[audit de sécurité](docs/SECURITY-AUDIT.md) est la référence des écritures E1–E7 et risques S1–S12.
Les nouvelles permissions, hôtes, écritures et modifications de CSP nécessitent une décision
produit explicite. Actualiser l'inventaire, ses tests et l'audit lors de toute évolution.

Le manifest utilise `storage`, `scripting`, `activeTab` et
`declarativeNetRequestWithHostAccess`. L'hôte `https://<site>.atlassian.net/*` est demandé au clic.
Aucun jeton ni mot de passe ; les requêtes utilisent la session Jira du navigateur.

Règles d'exécution : une tentative par écriture, relecture après résultat incertain, aucune
réussite annoncée avant confirmation. `transport.ts` centralise les sorties réseau et refuse
les redirections. La règle Origin ne vise que les POST de l'extension vers la passerelle GraphQL
exacte du site. Les données de test ne doivent jamais entrer dans le paquet de production.

Clés `chrome.storage.local` :

| Clé | Contenu |
|---|---|
| `connection.v1` | Site connecté |
| `launcher.v1` | Dernière adresse de board |
| `boards.v1` | Boards, configuration et sélection par site |
| `interface.v1` | Préférences de présentation |
| `jira-button-position.v1:<origine Jira>` | Position relative du bouton flottant, par site |
| `dismissedNotices.v1` | Avis fermés par site et board |
| `graphqlOrigin.v1` | Variante Origin du site |
| `audit.v1` | Journal local des écritures |

Ne pas renommer les propriétés `com.scrumboardmac.*` ni les identifiants stockés. Leur nom est
historique mais les données restent actives. Les anciennes configurations doivent rester lisibles,
les valeurs absentes recevoir un défaut et les champs inconnus être préservés. La clé publique du
manifest conserve l'identifiant de développement `efhpkdoiimdggndnfcgdoaniobdcmokb`.
Les identifiants internes des scripts de contenu et des éléments injectés sont également conservés
pour reconnaître une intégration déjà présente lors d'une mise à jour.

## Développement et validation

Node >= 22.12. Installer avec `npm ci`, puis `npm run check` (types, lint, tests, construction).
`npm run watch` reconstruit le même paquet intégré dans `dist/`. Les configurations IntelliJ
partagées sont dans `.run/` ; les préférences de l'IDE restent ignorées.

| Commande | Usage |
|---|---|
| `npm run test` / `test:watch` | Tests Vitest |
| `npm run typecheck` / `lint` | Contrôles statiques |
| `npm run format` | Formatage Biome |
| `npm run harness` | Interface fictive, port 5199 |
| `npm run verify:load` | Chargement, bienvenue, permissions et lanceur |
| `npm run verify:jira` | Hébergement, navigation, fiche et formulaires natifs |
| `npm run verify:transition` | Alias du contrôle natif `verify:jira` |
| `npm run verify:drag` | Gestes de déplacement sur le banc visuel |

Les scripts navigateur utilisent un profil temporaire vierge et du faux Jira. `CHROME_PATH`
permet de choisir l'exécutable compatible avec le chargement automatisé d'une extension.
Ne pas confondre ces contrôles avec une validation sur l'instance Jira réelle.

Pour ne pas écraser `dist/` pendant un essai :

```bash
npx vite build --outDir /tmp/sprint-goals-check
EXTENSION_DIR=/tmp/sprint-goals-check node scripts/verify-jira.mjs
EXTENSION_DIR=/tmp/sprint-goals-check node scripts/verify-load.mjs
```

Les anciens alias npm `*:jira-direct-test` et la variable `JIRA_DIRECT_DIST` sont retirés.
Les procédures utilisent les commandes ci-dessus et `EXTENSION_DIR`.

## Git et livraison

- Branche dédiée `codex/...`, commits cohérents sous `2nis6mon <denis.simon@gmail.com>`, sans
  trailer de co-auteur. Chaque commit est poussé ; fusion dans `main` sur demande explicite.
- Avant commit : tests appropriés, `npm run check`, contrôle Jira intégré, examen du diff et des
  fichiers non suivis. Actualiser version, documentation concernée et changelog.
- `dist/`, `release/`, les profils navigateur et les clés privées restent hors de Git.
- `npm run package` construit dans `release/` et produit `sprint-goals-board-<version>.zip` pour
  le Store. Il retire la clé publique de développement : ce paquet peut avoir un autre identifiant.
  Le script refuse clés privées, cartes de sources et données du banc d'essai.
- Textes du Store : `docs/store/fiche.md`. Captures fictives : `npm run store:screenshots`.
  Politique : `docs/privacy/index.html`, à recopier lors d'une modification dans le dépôt public
  `2nis6mon/sprint-goals-privacy` qui la publie via GitHub Pages.
- Préparer une archive ne signifie pas la publier sur le Store.

## Limites connues et reprise

- Le DOM de Jira commande la reconnaissance de la fiche, du menu de statut et du formulaire.
  En cas d'ambiguïté, aucun clic de transition ; la fiche est rendue à l'utilisateur. Les délais
  et critères sont documentés dans `docs/integration-jira.md`.
- L'encadrement de Jira dépend de sa politique d'iframe. Un changement côté Atlassian peut
  empêcher l'affichage de la fiche native.
- Le changement de board construit une route moderne avec clé projet ; sans cette clé, le board
  reste affichable sur place avec un avertissement. Les variantes de routes restent à valider.
- La pagination des Goals dépend du schéma exposé. Sans résultat complet, Kanban utilise le
  champ Goals si possible, sinon conserve le dernier état et signale l'échec.
- Un ticket avec plusieurs Goals apparaît dans une seule swimlane ; le mode texte n'agrège pas
  les textes de plusieurs sprints. Un objectif vide ne compte pas comme atteint.
- Les limites WIP portent sur les tickets ; les avatars externes ne sont pas téléchargés ; les
  préférences personnelles ne sont pas synchronisées entre postes.
- Les transitions natives sont exécutées par Jira : le journal de l'extension ne couvre pas
  les écritures effectuées depuis la fiche Jira elle-même.

La liste d'actions et de validations à mener est dans [TODO.md](TODO.md). Ne pas réintroduire
le mode autonome ni l'application Mac pour résoudre une limitation. Avant de reprendre : lire
ce guide, `CLAUDE.md` et l'audit ; vérifier branche et état du dépôt ; conserver les deux parcours
fiche complète/formulaire seul et les garde-fous d'hébergement ; distinguer tests locaux et essais réels.
