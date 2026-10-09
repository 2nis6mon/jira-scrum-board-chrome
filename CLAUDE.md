# Sprint Goals Board pour Jira — extension Chrome

Nom public choisi par Denis le 18/09/2026 (manifest : nom, nom court « Sprint Goals »,
description ≤ 132 caractères qui met en avant la swimlane automatique par Sprint Goal).
Extension Chrome (Manifest V3) qui reprend les fonctionnalités de l'app macOS « Scrum Board »,
connectée à Jira Cloud. **L'app Mac est abandonnée (décision de Denis du 24/09/2026) : ne plus en
tenir compte** — ni compatibilité de format, ni parité. Les mentions du Mac ci-dessous sont
historiques.

## Références

- **Point d'entrée pour reprendre le projet : `DEVELOPER.md`** (état réel, paquet intégré, décisions,
  invariants, procédures, problèmes connus). Tenu à jour avec ce fichier.
- Spécification fonctionnelle commune aux deux projets : `docs/reference-app-mac/PROMPT.md`.
- API Atlassian vérifiées, audit de sécurité et README du Mac : même dossier. Ce sont des copies
  conformes (voir `LISEZ-MOI.md` pour le commit d'origine) : ne pas les modifier ici.
- Audit de sécurité de l'extension : `docs/SECURITY-AUDIT.md` (0.14.1). Le tenir à jour à chaque
  nouvelle écriture, permission, hôte ou donnée écrite dans Jira (inventaire E*, constats S*).
- Code de l'app Mac : `/Users/dsimon/Claude Code/jira-scrum-board-advanced`. **Lecture seule,
  ne jamais le modifier.** Ses tests Swift sont la référence des cas de test à porter.

## Règles non négociables

1. **Cinq catégories d'écriture dans Jira, rien d'autre** : propriété de sprint (épinglage des
   Goals), lien ticket↔Goal (`goals_linkWorkItem` / `goals_unlinkWorkItem`), transitions, rang,
   et propriété du board pour les réglages du board partagés (validée par Denis le 19/09/2026 ;
   depuis 0.22.0, à sa demande du 24/09/2026, écrite à chaque modification d'un de ces réglages
   par l'utilisateur, ce geste valant geste explicite ; jamais pour un changement automatique).
   Les transitions incluent les champs de leur formulaire validé, le commentaire et, depuis
   la demande explicite de Denis du 20/09/2026, le temps passé (`update.worklog`) et les
   Story Points. Seuls les champs exposés par la transition et les opérations autorisées
   par Jira sont envoyés, jamais un ajout de temps séparé avant la transition.
2. **Ne JAMAIS réécrire le champ « Sprint Goal » du sprint.** Il est lu, jamais écrit.
3. Réglages du board (colonnes, types et swimlanes par type, ordre et couleurs des swimlanes,
   objectifs masqués, Goals épinglés au board Kanban, champs des cartes, règles de couleur, nom de Build, daily…,
   `core/teamSettings.ts`) :
   PARTAGÉS par la propriété du board depuis 0.22.0 — relus et appliqués à chaque chargement,
   écrits à chaque modification ; une copie reste dans `chrome.storage.local`, jamais dans
   `storage.sync`. Sans droit de modifier le board (`canEdit` faux, ou refus de Jira), ils ne se
   modifient pas. Les réglages personnels (swimlanes repliées, filtres, rafraîchissement, épinglage
   local, largeur de la barre, panneau Santé) ne sont jamais écrits dans Jira.
4. **Une seule tentative pour tout POST/PUT/DELETE.** Jamais de retry sur une écriture ; si
   l'issue est incertaine, on relit Jira.
5. Pas de fiche ticket reproduite par l'extension : ouvrir la fiche native Jira dans la popin.
6. Aucune écriture sans geste explicite de l'utilisateur. Rien n'est affiché comme réussi avant
   la confirmation de Jira.
7. **Aucune donnée fictive dans le code de production** (`src/`, `public/`, `board.html`).
   Les données de test vivent uniquement sous `tests/`.
8. Ne rien inventer de l'API Atlassian : endpoint, champ ou paramètre non vérifié = non utilisé.
   Ne jamais écrire « testé sur Jira » pour ce qui ne l'a pas été.

## Contraintes de travail

- Ne jamais accéder aux identifiants ni à la session Jira de Denis. Ne jamais lancer l'extension
  contre son vrai Jira : c'est lui qui installe, se connecte et valide. `npm run verify:load`
  utilise un profil Chrome temporaire vierge et n'émet aucune requête vers Jira.
- Répondre en français. Code, commentaires et messages de commit en français.
- Commits : `git -c user.name="2nis6mon" -c user.email="denis.simon@gmail.com" commit …`, sans
  trailer `Co-Authored-By` (demande de Denis du 09/10/2026).
- Pousser chaque commit sur sa branche, toujours (consigne de Denis du 24/09/2026). Fusionner
  dans `main` seulement sur demande explicite.
- **Mode unique depuis le 09/10/2026 (demande de Denis) : intégré dans Jira, version 0.26.2.**
  Construire avec `npm run build` dans `dist/`, prêt à charger dans Chrome. `watch`, `check` et
  `package` ciblent aussi ce mode ; les alias `:jira-direct-test` restent compatibles.
  Supprimer le fonctionnement autonome : toute vue métier exige une page Jira hôte autorisée.
  Le lanceur reconnaît le board de l'onglet courant (`activeTab`) ou demande son URL, demande
  l'autorisation Chrome, puis ouvre Jira ; il ne charge aucun ticket et ne comporte pas
  d'administration.
- IntelliJ IDEA : configurations npm partagées dans `.run/`, réglages locaux `.idea/` ignorés.
  La compilation et la surveillance à choisir sont celles du paquet Jira intégré.

## Droits de l'extension

Le manifest (`public/manifest.json`) est gardé par `tests/manifest.test.ts`. Toute permission
supplémentaire, tout hôte supplémentaire, tout assouplissement de la CSP doit être **proposé à
Denis avant d'être codé**. La décision du 09/10/2026 autorise la promotion du manifest intégré
déjà utilisé : `storage`, `declarativeNetRequestWithHostAccess` et `scripting` à l'installation ;
accès à un site `https://*.atlassian.net`
demandé à l'exécution ; CSP `connect-src https://*.atlassian.net`. `activeTab` s'y ajoute en
0.26.0 (choix de Denis du 09/10/2026, préféré à un accès à `*.atlassian.net` dès l'installation) :
il ne sert qu'à lire l'adresse de l'onglet courant au clic sur l'icône. Ne pas le remplacer par
`tabs` ni par une permission d'hôte à l'installation sans nouvelle décision.

`declarativeNetRequestWithHostAccess` ne sert qu'à UNE règle de session
(`src/app/platform/originRule.ts`) : en-tête `Origin` retiré ou remplacé par l'adresse du site,
pour les seuls POST émis par l'extension (`initiatorDomains: [id]`) vers l'adresse exacte
`|https://<site>/gateway/api/graphql|`. Sans `initiatorDomains`, la règle toucherait aussi les
requêtes des pages web vers la passerelle et affaiblirait sa protection : ne jamais l'élargir. Un
garde-fou (`tests/guards/sources.test.ts`) confine `declarativeNetRequest` à `platform/chrome.ts`.

Le manifest source `public/manifest.json` décrit désormais ce seul paquet : clé conservée
(même identifiant et stockage), version unique sans suffixe `.2`, `web_accessible_resources`
limité à `board.html`, `assets/*` et `icons/*` sur `https://*.atlassian.net/*`, et
`frame-ancestors https://*.atlassian.net`. Aucun hôte supplémentaire n'est autorisé.
Comme n'importe quel site Atlassian peut encadrer la page, `src/experiment/embeddingGuard.ts`
n'autorise l'affichage métier et toute lecture que dans la page Jira de premier niveau du site
annoncé, pour un board de ce site autorisé dans Chrome. Ouverture directe, cadre imbriqué et
autre site hôte sont refusés. Conserver ces contrôles avant toute création du modèle métier.

`.secrets/extension-key.pem` est la clé privée qui correspond au champ `key` du manifest (elle
fige l'identifiant de l'extension). Elle est ignorée par git : ne jamais la committer.

## Architecture

```
board.html            vue intégrée, uniquement dans la page Jira autorisée
launcher.html         lanceur minimal vers l'URL du board Jira
src/app/              interface Preact
src/app/platform/     seul endroit qui touche chrome.* (permissions, stockage)
src/app/model/        état de l'interface (signals), plateforme injectée : AppModel (connexion,
                      vue), BoardModel (board, synchro, filtres, glisser-déposer), DiagnosticModel,
                      boardStore, auditLog (journal des écritures), graphqlOrigin (règle Origin)
src/app/views/        vues Preact ; Sidebar = barre latérale ; views/board/ = en-tête, filtres,
                      swimlanes, cartes ; views/health/ = panneau Santé du sprint ;
                      views/settings/ = Administration (réglages, diagnostic, déconnexion)
src/experiment/       intégration Jira (nom historique du dossier) : route
                      `?sprintGoals=1`, service worker, script de contenu, injection de l'iframe,
                      popin de la fiche et du formulaire Jira natifs, garde-fou d'hébergement
src/jira/             site, erreurs, transport HTTP, inventaire des écritures, diagnostic,
                      modèles Jira et leur décodage, client REST (lectures), transitions
src/core/             logique métier pure, portée de l'app Mac (voir ci-dessous)
tests/                tests Vitest ; tests/support = faux Jira, fausse plateforme, fabriques
tests/harness/        banc d'essai visuel (données fictives), jamais dans dist/
scripts/              outillage de développement
```

`src/jira/` et `src/core/` n'utilisent ni `chrome.*` ni le DOM : ils se testent sous Node.

Correspondance avec l'app Mac (les tests Swift de même nom sont la référence) :

| Extension | App Mac |
|---|---|
| `core/sprintGoals.ts` | `SprintGoalText`, `SprintGoalReconciler`, `SprintGoalDocument`, `GoalPalette` |
| `core/boardBlocks.ts` | `BoardBlock`, `BoardBlockLayout` |
| `core/boardConfiguration.ts` | `BoardConfiguration`, `BoardDiscovery` |
| `core/boardIssue.ts` | `BoardIssue`, `BoardAssembler`, `GoalProgress`, `BoardSnapshot` |
| `core/filters.ts` | `BoardFilters`, `BoardFilterEngine`, `AtlassianGoalFilter` |
| `core/dropPlan.ts` | `BoardDropPlan`, `RankChange` |
| `core/cardColors.ts`, `core/cardFields.ts` | `CardColorRule`, `CardColorResolver`, `CardField`, `BoardController.refreshCardColors`, `CardColorsAdminView` |
| `jira/models.ts`, `jira/transitionPlanner.ts` | `Models.swift`, `TransitionPlanner` |
| `jira/client.ts` | lectures de `JiraClient.swift` (board, sprints, tickets, champs, propriété) |
| `core/boardSync.ts` | `BoardController.detectBoard` et `performSync` (lecture seule) |
| `core/boardLayout.ts` | répartition en swimlanes et colonnes des vues SwiftUI du board |
| `core/boardWrites.ts` | `BoardController.moveIssue`, `rankIssue`, `assignGoal` (mode texte), `SprintGoalStore.saveAtlassianSelection` (épinglage) |
| `jira/goals.ts` | `GoalsClient.swift` |
| `core/atlassianGoals.ts` | `BoardController.loadAtlassianSprintGoals` |
| `core/jiraQuickFilters.ts`, `core/jql.ts` | `BoardController.refreshQuickFilterSelection`, `JiraClient.quickFilters`, `CardColorResolver.queries` |
| `core/boardSettings.ts`, `views/settings/` | `AdminView` (section Board), `GoalsAdminView` (source, Goals du board, couleurs), `CardFieldsAdminView` |
| `core/boardPreferences.ts` | `BoardController.setBlockOrder`, `moveBlock`, `setBlockCollapsed`, `setGoalHidden`, `setGoalColor` |
| `core/parentColors.ts` | aucun : couleur des badges parent, propre à l'extension (demande de Denis) |
| `views/Sidebar.tsx`, `core/boardPreferences.ts` (`laneSummaries`) | `SidebarView`, `BoardSwitcherView` (menu), `WorkspaceView` |
| `views/settings/AdminView.tsx` | `AdminView` (réglages), plus le diagnostic et la déconnexion |
| `core/sprintHealth.ts`, `views/health/HealthPanel.tsx` | `SprintHealthView` (ici un panneau de la vue Sprint) |
| `core/teamSettings.ts`, `views/settings/TeamSettings.tsx` | aucun : réglages d'équipe, propres à l'extension (format prévu pour l'app Mac) |

Écarts voulus : `SprintGoalText.render` n'est pas porté (il ne servait qu'à réécrire le champ du
sprint) ; le mode de compatibilité « Build et RUN restent en bas » des ordres enregistrés avant la
2.2 du Mac n'existe pas ; les champs « optionnels pour d'anciennes configurations » ont ici une
valeur par défaut. Le format de `SprintGoalDocument` était partagé avec le Mac (abandonné) ; il reste relu par les
sprints existants : ne le changer qu'avec une relecture de l'ancien format.
Écarts de prudence sur la propriété du sprint (`boardWrites.ts`) : si sa relecture échoue, rien
n'est écrit (le Mac écrivait un document vidé) ; une valeur qui n'est pas un objet JSON n'est pas
écrasée ; les clés inconnues sont réécrites telles quelles ; l'épinglage est refusé si la
sélection lue n'est plus celle affichée. Et dans `atlassianGoals.ts`, les Goals du site sont
interrogés dès qu'aucun Goal n'est associé au board ni déclaré par les tickets, épinglés ou non
(le Mac ne le faisait que sans aucun candidat : un épinglé masquait les autres). Dans
`boardPreferences.ts`, un bloc absent de l'affichage garde sa place relative quand on réordonne
(le Mac le renvoyait en fin de liste, sous Build). Les filtres rapides Jira sont évalués sur les
seuls sprints actifs (`jql.ts`), pas sur tout le board comme le Mac : même résultat affiché.

Garde-fous à connaître avant de toucher au réseau :

- `src/jira/transport.ts` est le seul fichier qui appelle `fetch`. Session du navigateur
  (`credentials: "include"`), un seul hôte, redirections jamais suivies, GET rejouable sur erreur
  transitoire, **écritures jamais rejouées**.
- `src/jira/writes.ts` est l'inventaire exhaustif des écritures REST : ajouter une écriture, c'est
  ajouter un cas au type `JiraWrite` ET une ligne dans `tests/jira/writes.test.ts`.
- `tests/guards/sources.test.ts` balaie `src/` : `fetch`, méthodes HTTP d'écriture, mutations
  GraphQL, `storage.sync`, données fictives, imports depuis `tests/`.

## Commandes

```bash
npm run check         # types + lint + tests + construction
npm run verify:load   # construit puis charge dist/ dans un Chrome temporaire sans interface
npm run watch         # reconstruit dist/ à chaque modification
npm run harness       # banc d'essai visuel, données fictives, http://localhost:5199/?scenario=board
npm run verify:drag         # vrais gestes de glisser-déposer dans Chrome (faux Jira)
npm run verify:transition   # formulaire de transition dans Chrome (faux Jira)
npm run verify:jira   # construit le paquet intégré dans dist/ puis le vérifie dans Chrome
npm run package       # zip du Chrome Web Store (paquet intégré, sans key) dans release/
npm run store:screenshots   # captures 1280 × 800 du Store, banc d'essai, docs/store/captures/
```

Vérifier sans toucher au paquet de Denis : `npx vite build --outDir <dossier>` puis
`JIRA_DIRECT_DIST=<dossier> node scripts/verify-jira-direct-test.mjs`.

Git (depuis le 20/09/2026) : travail sur des branches `codex/...` ; chaque commit est poussé
(24/09/2026), la fusion dans `main` se fait sur demande. `codex/tickets-du-board` (0.19.21) puis
`codex/mode-daily` (0.20.0–0.21.1) ont été fusionnées dans `main` le 24/09/2026, à sa demande. Puis
`codex/reglages-automatiques` (0.22.0–0.22.6, avance rapide) et `codex/publication` (outillage du
Store : `npm run package`, `store:screenshots`, `docs/store/`, `docs/privacy/`), le même jour. Enfin
`codex/store-maj` (fiche, confidentialité et captures alignées sur 0.22), le même jour aussi.
`codex/retours-sandbox` (0.22.7) a été fusionnée le 25/09/2026, puis elle et `codex/store-maj`
supprimées ; `codex/swimlanes-par-type` (0.23.0) part de là. La branche du prototype `codex/test-ouverture-jira-directe` a été fusionnée dans `main` à
la demande de Denis le 23/09/2026 (avance rapide, 27 commits), puis supprimée avec les autres
branches `codex/...`. Cet historique précédait la décision du 09/10/2026 : l'intégration Jira
est désormais le mode unique et son manifest est le manifest source. Une validation locale
avec faux Jira ne vaut jamais validation sur l'instance de Denis.

Dépendances en versions exactes (`.npmrc` : `save-exact`, `ignore-scripts`). Toute nouvelle
dépendance d'exécution se justifie : il y en a deux aujourd'hui (`preact`, `@preact/signals`).

## Étapes

Les entrées datées ci-dessous conservent l'historique du projet, notamment les anciens paquets
autonomes et versions `.2` ; elles ne remplacent pas les procédures actuelles ci-dessus.

0.25.0 (décision de Denis du 09/10/2026) : abandon du mode autonome. Toutes les constructions
ciblent l'intégration Jira ; le lanceur ouvre une URL Jira autorisée, sans charger de vue métier.
Le manifest intégré devient la source, l'identifiant et les données locales sont conservés.

0.26.0 (demandes de Denis du 09/10/2026, branche `codex/bouton-board`, plan validé) : plus
d'adresse à coller, un bouton dans Jira, et le changement de board change la page.
1. `activeTab` (seul droit ajouté) : au clic sur l'icône, le lanceur lit l'adresse de l'onglet
   courant et reconnaît son board (`LauncherModel.detected`) ; l'accès au site reste demandé sur
   le clic « Ouvrir dans Jira ». Sur une page Jira qui n'est pas un board, il dit d'en ouvrir un.
2. Bouton « Sprint Goals » flottant en bas à droite de tout board d'un site autorisé
   (`bootstrap.ts`, script de contenu sans import, racine fantôme, rien n'est inséré dans
   l'interface de Jira). Il suit la navigation interne de Jira. Clic : chargement de
   l'adresse suivie de `sprintGoals=1` (`selectedIssue` retiré ; `location.assign` depuis
   0.26.2) ; retour arrière = board natif et son bouton. Le bouton n'existe pas avant la première autorisation du
   site, qui passe par l'icône.
3. Changer de board dans la vue (menu des boards, ajout par la recherche, retrait du board
   affiché) change de page Jira : `BoardModel.hostBoardNavigator`, message
   `sprint-goals:open-board` (identifiant et clé de projet, JAMAIS une adresse) ; la page hôte
   (`injectBoard.ts`) valide, forme l'adresse sur son propre site et y navigue. Le board est rendu
   actif avant de partir ; rien n'est relu dans la vue quittée. Un board sans clé de projet
   s'affiche sur place avec un avertissement (la page Jira derrière ne suit pas).
À CONSTATER chez Denis : que
l'adresse `/jira/software/c/projects/<clé>/boards/<id>` ouvre aussi les boards des projets gérés
par l'équipe ; que le bouton ne recouvre rien d'utile. Aucune écriture ni hôte nouveaux.

0.26.1 (retour de Denis du 09/10/2026 : bouton invisible sur son board) : le bouton se place à
gauche du bouton Rovo de Jira (`right: 96px ; bottom: 28px`, valeurs estimées, à ajuster sur son
Jira), et il est reposé à chaque passage du script s'il a disparu — Jira peut reconstruire sa page
après l'injection. La cause exacte chez lui n'est pas établie. Un onglet Jira ouvert avant le
rechargement de l'extension garde l'ancien script : il faut recharger la page.

0.26.2 (essai de Denis du 09/10/2026 sur son Jira : bouton visible, mais le clic n'ouvrait pas
la vue) : le clic ne passe plus par `history.pushState`. Il charge l'adresse marquée
(`location.assign`), le chemin déjà validé chez lui avec le lanceur. La cause exacte de l'échec
n'est pas établie (marqueur retiré par le routeur de Jira, ou adresse de l'expéditeur non mise à
jour pour le service worker) : ne pas revenir à une ouverture sans rechargement sans l'avoir
constatée sur son instance.

Constats sur l'instance de Denis (18/09/2026) : la session du navigateur est reconnue ; les POST
de lecture REST et les écritures REST (PUT/DELETE de propriété de sprint) passent SANS en-tête
particulier — le transport garde `X-Atlassian-Token` absent par défaut. La passerelle GraphQL
(`/gateway/api/graphql`, API Goals) répond `403 {"message":"Invalid CORS request"}`,
`x-failure-category: FAILURE_CLIENT_CORS`, avec ou sans `no-check` : elle rejette l'en-tête
`Origin: chrome-extension://…`. Parade validée par Denis et livrée en 0.4.0 : la règle `Origin`
ci-dessus. Diagnostic 0.4.0 sur son instance : Origin conservé → refus, Origin RETIRÉ → refus,
Origin = adresse du site → accepté. D'où la variante par défaut « site » (`DEFAULT_ORIGIN_MODE`) ;
le diagnostic mémorise par site la variante acceptée (`graphqlOrigin.v1`).

0.5.0 : lecture des Goals (`src/jira/goals.ts`, port de `GoalsClient.swift` : introspection,
`goals_search`, `goals_byIds`, `workItems`) et objectifs du sprint déduits des tickets
(`src/core/atlassianGoals.ts`). Rattachement natif par les deux mutations de l'inventaire
`GraphqlWrite` (`writes.ts`) : forme ARI du ticket d'abord, identifiant brut seulement après un
REFUS explicite, jamais après une issue incertaine.

0.6.0 : épinglage de Goals au sprint (`pinAtlassianGoals`, fenêtre `PinGoalsDialog` — section de
l'administration depuis 0.22.4 —, menu « ⋯ »),
qui termine l'étape 4.

0.7.0 : étape 5a (ordre, repli, couleur, masquage des swimlanes) et filtres rapides du board
Jira, demandés par Denis. `GET /rest/agile/1.0/board/{id}/quickfilter` n'est pas dans
ATLASSIAN-API-CAPABILITIES.md : forme vérifiée dans la spécification OpenAPI de Jira Software
(`developer.atlassian.com/cloud/jira/software/swagger.v3.json`) le 18/09/2026. Reste de l'étape 5 :
page Réglages (colonnes, types, affichage, source des objectifs, champs des cartes, règles de
couleur), évaluation des règles de couleur, rafraîchissement automatique.

0.7.1 (demandes de Denis) : glisser-déposer des swimlanes par une poignée (type de données propre,
`application/x-scrum-board-lane`, distinct de celui des cartes) ; icône de l'app Mac dans le
manifest (`icons`, `action.default_icon`), l'onglet et l'en-tête du sprint ; séparateur avant les
filtres standard.

0.8.0 : étape 5b, page Réglages (onglet de l'en-tête). Section Board en brouillon appliqué d'un
coup (remplacé en 0.10.1 par un enregistrement champ par champ) ;
rafraîchissement automatique branché (`BoardModel`, suspendu pendant un geste).

0.9.0 : lot 5c, qui termine l'étape 5. Règles de couleur des cartes (section Réglages, JQL évalué
par Jira sur les sprints actifs, `evaluateColorRules` dans `cardColors.ts`) ; sélection
d'épinglage gardée dans le navigateur après un refus de droits (`localPinnedGoalIds` de la
configuration, par sprint ; portage de `keepSelectionLocally`), qui ne sert que si Jira n'a
aucune sélection et s'efface dès que Jira enregistre. Prochaine étape : 6 (compléments).

0.9.1 (demandes de Denis sur la carte) : drapeau Jira agrandi, à côté de la priorité ; résumé
coupé à deux lignes ; parent en badge à son titre (sans clé), d'une couleur par parent
(`parentColors.ts` : classement par clé, jamais deux fois la même couleur) ; champs choisis en
badges sans leur nom ; statut retiré de la carte. Écart voulu avec le Mac, qui affiche le parent
et les champs en texte.

0.10.0 (demande de Denis, maquette = fenêtre de l'app Mac) : l'en-tête de l'application devient
une barre latérale (`views/Sidebar.tsx`) : board affiché et son menu (actions du board ; la liste
des boards : lot 6b), vues Board et Sprint Health,
swimlanes dans l'ordre du board (clic = dépliée et amenée à l'écran, glissé = réordonner, même
état de glissé que le board), objectifs masqués, Administration en pied. Administration
(`views/settings/AdminView.tsx`) = réglages du board + Diagnostic + Se déconnecter. En-tête du
sprint aligné sur la maquette (badge actif, points et %, compteurs à icônes, « Jira · hh:mm »,
flèche ronde) ; filtres à icônes dans l'ordre du Mac. Icônes dessinées dans `views/Icon.tsx` (aucune ressource externe,
aucune permission) ; leur couleur vient du parent par `--icon-color`. Sous happy-dom, le
glissé DOM n'atteint pas les gestionnaires de Preact (pas de propriété `ondragstart`) : le
geste se vérifie dans Chrome sur le banc d'essai.

0.10.1 (remarques de Denis) : œil animé sur chaque objectif de la barre latérale (ouvert, il se
ferme au survol : masquer ; fermé dans « Masqués du board », il s'ouvre : réafficher ; CSS seule,
coupée si l'utilisateur réduit les animations) ; bouton plein écran retiré, à sa demande. Section
Board de l'administration sans Annuler/Appliquer : chaque réglage est une fonction pure de
`boardSettings.ts` (`withColumnName`, `withWipLimit`…), validée puis appliquée à la configuration
la plus récente ; un champ texte s'enregistre à la validation (événement `change`), pas à chaque
frappe ; seuls types, bugs et labels de blocage relisent Jira. Les autres sections gardent
Appliquer.

0.10.2 (demande de Denis) : largeur de la barre latérale réglable en tirant sa bordure droite
(`SidebarResizer`, un `<hr>` focusable, curseur `col-resize`), de 200 px à la moitié de la fenêtre
(`clampSidebarWidth` ; la CSS applique aussi `clamp(200px, …, 50vw)`, qui suit la fenêtre) ;
flèches du clavier, double-clic = 248 px. Gardée dans `chrome.storage.local`, clé `interface.v1`
(préférence d'affichage, commune à tous les sites), enregistrée au relâchement seulement.

0.10.3 (signalé par Denis) : le menu « ⋯ » d'une swimlane était rogné par la zone du board, qui
défile horizontalement (`overflow-x: auto` rogne aussi en vertical). Son panneau est désormais
en position fixe, placé à l'ouverture (`views/board/floatingMenu.ts`) sous son bouton ou
au-dessus faute de place, et refermé si la page ou le board défile.

0.10.4 (demandes de Denis sur la carte) : dernière ligne = alertes en pastilles à icône (bloqué,
bugs, ajouté, jours) à gauche, points et assigné à droite, jamais repoussés à la ligne ; clé
jamais sur deux lignes (`white-space: nowrap`, « … » en dernier recours) ; une carte étroite se
compacte par requête de conteneur (`.lane-item`, `@container (max-width: 175px)`).

0.10.5 (validé par Denis) : largeur minimale des colonnes portée de 150 à 170 px (`--column-min`
dans app.css, `MINIMUM_COLUMN_WIDTH` dans layoutMetrics.ts), écart voulu avec le Mac : une clé
comme CLIENT-10114 tient en entier sur sa carte, drapeau compris. Prix : à 7 colonnes, le board
défile horizontalement sous environ 1 550 px de fenêtre (1 410 avant).

Étape 6, découpée en lots (annoncés à Denis) : 6a Sprint Health · 6b plusieurs boards · 6c déplacer
une carte au clavier (abandonné le 19/09/2026) · 6d audit de sécurité (0.14.1) · 6e empaquetage. Le plein
écran du navigateur reste retiré (0.10.1) ; un mode présentation sans plein écran est revenu en
0.15.0, à la demande de Denis. Le mode Daily (0.20.0) puis le mode présentation (0.21.1) le
demandent à leur lancement.

0.11.0 : lot 6a, Sprint Health (`core/sprintHealth.ts`, port de `SprintHealthView`) : comptages
directs, filtres appliqués, aucun score. Écart voulu : la charge par colonne ignore les filtres,
comme les limites WIP du board. L'en-tête et la barre de filtres du board y sont réutilisés
(`SprintHeader`, `FilterBar`, `Notices` exportés de BoardView) ; le compteur « dans Build »
ramène au board (`ScreenControls.showBoard`, retiré en 0.14.0 avec la vue à part).

0.12.0 : lot 6b, plusieurs boards (port de `BoardSwitcherView`). `boardStore.ts` : `listBoards`,
`activateBoard`, `removeBoard` ; `saveBoard` ne rend actif que sur demande (ajout, changement de
board) : un réglage enregistré après un changement ne ramène pas l'ancien board. `BoardModel` :
`boards`, `switchBoard`, `removeBoard`, `canSwitchBoard` (refusé pendant une écriture Jira, un
enregistrement d'épinglage ou une relecture de structure), `#enterBoard` commun à l'ajout et au
changement (tout l'état du board quitté est oublié ; une synchronisation en cours est ignorée).
Menu du nom de board (`Sidebar.tsx`) avec confirmation du retrait. La barre latérale a un
`z-index` (30) : `sticky` crée un empilement, sinon la bande des colonnes du board passait
par-dessus sa fenêtre de confirmation ; le menu d'une swimlane est au-dessus (40).

0.13.0 (validé par Denis) : réglages d'équipe partagés par la propriété du board
`com.scrumboardmac.boardsettings.v1` (`GET`/`PUT /rest/agile/1.0/board/{id}/properties/{clé}`,
vérifiés dans la spécification OpenAPI de Jira Software le 19/09/2026 : lecture pour qui voit le
board, écriture pour qui peut le modifier). Cinquième catégorie d'écriture (`boardProperty.put`
dans `writes.ts`). `core/teamSettings.ts` : extraction et application (structure toujours
relue dans Jira, colonnes et types par identifiant, couleurs combinées), différences par famille,
document v1 (`publishedAt` à la milliseconde, `publishedBy` nom et compte), publication avec
relecture, conflit si quelqu'un a publié depuis la version connue (`teamBase` de la
configuration), clés inconnues gardées, valeur illisible jamais écrasée, une seule écriture.
`BoardModel` relit la propriété à chaque actualisation : nouvelle version appliquée d'office si
rien n'a été modifié ici (ou si le board vient d'être ajouté), sinon proposée (Appliquer / Garder
les miens). Onglet « Réglages d'équipe » de l'administration, bandeaux sur le board.

0.14.0 (point 1 de TODO.md, choix de Denis) : Sprint Health n'est plus une vue à part mais un
panneau repliable de la vue du sprint (`views/health/HealthPanel.tsx`), entre la barre de filtres
et les swimlanes, ouvert et fermé par un bouton icône seule de l'en-tête (tracé de pouls, à côté de
la flèche ronde, `aria-pressed`) ou par le chevron du panneau. État gardé dans `interface.v1`
(`healthOpen`, préférence d'affichage commune à tous les sites). L'entrée « Board » de la barre
latérale devient « Sprint » ; tout ce qui désigne le board Jira garde « board » (menu du board,
section Board de l'administration, « Masqués du board », limites WIP du board). Le lot 6c
(déplacer une carte au clavier) est abandonné à la demande de Denis.

0.14.1 : lot 6d, audit de sécurité (`docs/SECURITY-AUDIT.md`, sur le modèle de celui du Mac :
inventaire E1–E7 des écritures, constats S1–S8, correspondance avec C1–C10). Seul correctif :
S1, le lien « Ouvrir le Goal » ne mène plus qu'à `atlassian.com` ou un sous-domaine
d'`atlassian.com`/`atlassian.net` (`atlassianLink` dans `jira/site.ts`) ; deux garde-fous
ajoutés (`target="_blank"` toujours avec `noopener noreferrer`, aucun `href` formé directement
d'`atlassianUrl`). Le reste est informatif (session = tous les droits, réglages d'équipe appliqués
d'office, restriction JQL syntaxique, clé privée locale).

0.14.2 (demande de Denis) : menus Priorité, Objectif et Composant retirés de la barre de filtres
(restent Personne, Type, Parent, Statut, Label). Le moteur de filtres (`core/filters.ts`,
`filterOptions`) est inchangé, porté du Mac : le filtre par objectif sert toujours au clic sur le
titre d'une swimlane (« N'afficher que cet objectif »).

0.15.0 (demande de Denis) : mode présentation. Bouton icône (chevalet) au bout de l'en-tête ;
masque barre latérale, en-tête et panneau Santé, restent filtres, bandeaux et board
(`AppModel.presenting`, jamais enregistré ; `ScreenControls.presenting`). Sortie toujours visible :
bouton « Quitter » au bout de la barre de filtres (ou seul dans une barre si les filtres manquent) ;
bulle flottante « Échap pour revenir » 5 s (`PresentationHint`, `PRESENTATION_HINT_MS`, sans
capter la souris). Échap (écouteur de `Workspace`) laisse d'abord la main à une fenêtre ouverte
(`[role="dialog"]`), referme un menu ouvert, n'efface pas une recherche remplie. L'administration
et la déconnexion quittent le mode. Pas de plein écran du navigateur (retiré par Denis en 0.10.1).

0.15.1 (demande de Denis) : en présentation, filtres, bandeaux et board agrandis par `zoom`
(`--presentation-zoom: 1.25` sur `.board-screen-presenting`), les fenêtres gardent leur taille.
`zoom` standardisé (Chrome 128+) : `getBoundingClientRect` et `clientY` restent en pixels de la
fenêtre, le point de dépôt d'une carte est donc juste (vérifié dans Chrome 152 : glissé d'une
carte, menu « ⋯ »). Le menu « ⋯ », en position fixe sous un parent zoomé, divise ses positions
par `currentCSSZoom` (`floatingMenu.ts`, hauteur maximale comprise).

0.16.0 : glisser-déposer par statut, validé avec Denis. Même colonne : Goal et rang seulement.
Autres colonnes : transitions préchargées au début du geste, zones par statut, destinations
inaccessibles grisées (lecture en cours ou en échec distinguée). Plusieurs transitions vers le
statut choisi : fenêtre avant toute écriture ; annulation complète. Statut et transitions relus
avant exécution, y compris après choix. Écran de transition (`hasScreen`) ou champs obligatoires :
passage par Jira. Ordre des écritures : transition → objectif → rang ; réussite partielle dite
explicitement, sans restauration automatique. Sans position précise dans une zone de statut,
le rang est conservé. Banc d'essai : `board-statuts` (zones), `board-choix` (fenêtre), `board-dnd`
(déplacement), `board-erreur` (refus). Aucun essai contre le Jira réel dans ce lot.

0.17.0 : recherche des boards par nom (`GET /rest/agile/1.0/board`, filtré par Jira selon les droits,
300 ms de pause, cinq boards Scrum au plus), confirmation avant la déconnexion. 0.18.0 : carte
projetée à destination pendant un déplacement (`core/pendingMove.ts`), compteurs basés sur les
seules données confirmées ; repère rouge « Déplacement à vérifier » en cas de refus. 0.18.1–0.18.2 :
autocomplétion des boards sous le champ ; ajout d'un board uniquement par la recherche (saisie
d'URL retirée) ; boards Scrum seulement, Kanban hors périmètre. 0.18.3 : zones de statut
superposées aux colonnes (plus de décalage au début du geste) ; plus de repère vert après
réussite, seules les erreurs gardent un repère rouge (quatre secondes) ; `verify:drag`.

0.19.0 : écrans de transition dans un formulaire dynamique (`jira/transitionFields.ts`,
`TransitionFormDialog.tsx`, `expand=transitions.fields`) : valeurs préremplies, seules les valeurs
modifiées envoyées avec la transition (`fields`, `update.comment`), statut et métadonnées relus à la
validation, widgets non pris en charge signalés avec un lien vers Jira. 0.19.1 (demande de Denis
du 20/09/2026, règle 1) : Story Points (champ numérique repéré par les métadonnées) et temps passé
(`update.worklog` `add`, seulement si la transition l'expose), dans le même POST ; jamais d'ajout de
temps séparé. `verify:transition`.

0.19.2–0.19.7 : Goals atteints (tous leurs tickets dans la dernière colonne visible ; un Goal vide
ne l'est jamais) en vert sur le board et dans la barre latérale, sans coche ni barre d'avancement
dans la barre ; le vert est retiré de la palette des swimlanes ; en-tête, filtres, colonnes et
bandeau du Goal courant fixes au défilement ; compteur des Goals atteints dans l'en-tête. 0.19.8 :
bandeaux des swimlanes sur toute la largeur du board ; un Goal découvert par un nouveau ticket
arrive masqué (ticket dans Build jusqu'à ce qu'on réaffiche le Goal).

0.19.8.2 (paquet d'essai, branche `codex/test-ouverture-jira-directe`) : ouverture directe dans
Jira sur `?sprintGoals=1` (overlay plein écran, iframe de l'application), fiche Jira dans une popin
de 1 280 px, transition exigeant des champs ouverte dans le formulaire Jira natif, recadré, jamais
rempli ni validé par l'extension. `DEVELOPER.md` décrit le fonctionnement et ses fragilités.

0.19.9 (demandes de Denis après relecture) : deux durcissements du prototype.
1. Hébergement : la page du board encadrée ne s'affiche et ne lit Jira que si
   `location.ancestorOrigins` est exactement l'origine annoncée (`jiraHost`), que le board
   (`jiraBoard`) est de ce site et que ce site est autorisé dans Chrome
   (`embeddingGuard.ts`, `embeddedBoardTarget` dans `embedded.ts`, vérifié AVANT tout rendu dans
   `main.tsx`) ; sinon un simple refus. Clic sur une carte : clé envoyée seulement si le site
   connecté est la page hôte.
2. Transition native (`injectBoard.ts`) : clic seulement sur l'élément qui porte l'identifiant de
   la transition (valeur d'attribut délimitée) et mentionne son nom, ou à défaut sur un unique
   libellé exactement égal ; sinon aucun clic, le menu reste au choix de l'utilisateur. Cliquer un
   mauvais élément exécuterait une transition sans écran : une écriture hors de `writes.ts`.
Le greffon du manifest d'essai respecte désormais `--outDir`. `verify:jira-direct-test` : trois
scénarios ajoutés (refus sans autorisation, refus chez un autre site Atlassian, transition ambiguë
jamais cliquée ; le script échoue avec l'ancien `injectBoard.ts`).

0.19.10 (signalé par Denis) : un écran de transition « classique » (temps passé, date de début,
estimation restante, commentaire) s'affichait par-dessus la fiche complète au lieu d'être isolé :
Jira le charge dans une iframe, où sont ses champs et son titre, et le repérage cherchait les
champs et le nom de la transition dans la fenêtre elle-même. `injectBoard.ts` retient désormais la
fenêtre APPARUE après le choix de la transition (celles déjà présentes, fiche comprise, sont
écartées), avec un formulaire ou une iframe ; le nom est aussi cherché dans ses iframes de même
origine. La popin est dimensionnée quand ses iframes sont chargées et sa taille stable pendant trois
passages (environ une seconde). Pendant ce temps, la fiche reste cachée (« Ouverture de « … »… ») ;
elle est montrée si l'extension laisse le choix de la transition à l'utilisateur, ou après 8 s sans
formulaire reconnu. `verify:jira-direct-test` : scénario d'écran classique (échoue avec 0.19.9).
Attention : l'ancien prototype « prototype dans Jira » (branche `codex/test-board-dans-jira`,
0.19.1.x, onglet « Sprint Goals » ajouté dans Jira) n'a pas ces corrections et ouvre le formulaire
de l'extension ; son dossier n'existe plus.

0.19.11 (demande de Denis : « par la transition du workflow, pas par le libellé ») : l'essai de
la 0.19.10.2 sur son Jira a montré que le menu de statut affiche « Merge into develop → To merge
into develop » sans identifiant : la règle S10 laissait le menu ouvert. Toute la mécanique fiche +
menu + clic est retirée pour les transitions à champs : `injectBoard.ts` (`openTransition`) charge
directement l'écran de la transition, `/secure/CommentAssignIssue!default.jspa?id=<id du ticket>&
action=<id de la transition>` (`!default` affiche sans exécuter ; adresse documentée pour Data
Center, PAS dans la doc Cloud : à constater chez Denis). Popin cadrée sur le formulaire dont
l'action contient `CommentAssignIssue`, hauteur = son contenu une fois stable ; fermée quand Jira
quitte l'écran (validation, Cancel), puis relecture ; page montrée telle quelle après 10 s sans
formulaire. `BoardModel.nativeTransitionHandler(key, issueId, transition)` transmet l'identifiant
du ticket ; l'hôte exige des identifiants numériques. Le clic sur une carte (fiche complète) est
inchangé. `verify:jira-direct-test` : écran servi à cette adresse, 15 contrôles.

0.19.12 (demande de Denis) : l'administration ne remplace plus la vue par sa propre colonne. Son
bouton, en pied de barre latérale, déplie ses sections juste au-dessus de lui (`AdminMenu` dans
`Sidebar.tsx` : board affiché, cinq sections, Diagnostic, site et déconnexion) ; un second clic, ou
le choix d'une autre entrée de la barre, les replie et ramène au sprint (`AppModel.toggleAdmin`).
`AdminView.tsx` ne garde que le contenu (`BOARD_SECTIONS` y reste, exporté pour la barre).

0.19.12.1 (demande de Denis du 23/09/2026) : un seul dossier construit, `dist/`. Les dossiers
`dist-jira-test/` et `dist-jira-direct-test/` sont supprimés, et le prototype GARDE la clé du
manifest : même identifiant Chrome et même stockage que le paquet autonome, donc site, board et
réglages conservés en passant de l'un à l'autre (une seule entrée dans `chrome://extensions`). La
permission `scripting` n'existe que tant que le paquet d'essai est chargé.

0.19.13 (essai de Denis, 23/09/2026) : sur son Jira Cloud, `CommentAssignIssue!default.jspa` renvoie
une page VIDE — l'adresse documentée pour Data Center n'y sert pas l'écran. La fenêtre qu'il veut est
la fenêtre moderne de Jira Cloud, dessinée par l'application quand on choisit la transition dans son
menu de statut : elle n'a pas d'adresse. `injectBoard.ts` enchaîne donc deux essais : l'écran direct
par identifiants (3 s), puis, sans formulaire, la fiche du ticket où l'on ouvre le menu de statut et
où l'on ne clique QUE l'élément dont le libellé, comparé sans accents, espaces, flèches ni
ponctuation, vaut exactement le nom de la transition ou « nom + statut d'arrivée » (`to` transmis par
`embedded.ts`) ; sinon rien n'est cliqué et l'utilisateur choisit. La fenêtre qui apparaît ensuite
est isolée dans la popin (repérage 0.19.10). `verify:jira-direct-test` : 16 contrôles, dont le repli
(écran absent, fenêtre moderne isolée, transition voisine de même nom jamais cliquée).

0.19.14 (essai de Denis, 23/09/2026) : sa popin restait blanche sur « Ouverture de « TEST OK »… »
sans jamais se replier. Cause : l'essai par adresse directe ne se repliait que si le document du
cadre était LISIBLE ; Jira n'encadrant pas `/secure/CommentAssignIssue!default.jspa`, le cadre
restait sur `about:blank` et la boucle sortait à chaque passage avant le délai de 3 s. Cet essai est
supprimé : une transition à champs passe désormais par le seul chemin qui fasse dessiner sa fenêtre
à Jira Cloud — la fiche chargée cachée, le menu de statut, et le clic strictement encadré de
0.19.13. L'identifiant du ticket ne sert plus à rien et sort du message
(`nativeTransitionHandler(key, transition)`). Deux garde-fous : fiche non reconnue en 12 s, la page
de Jira est montrée telle quelle ; cadre jamais accessible en 20 s, la popin se ferme et le dit —
une popin blanche figée n'est jamais un état d'arrivée. Les étapes sont tracées dans la console de
l'onglet (`Sprint Goals — …`, prototype seulement), seul moyen de savoir où l'ouverture s'arrête sur
un Jira auquel je n'ai pas accès. `verify:jira-direct-test` : 15 contrôles (fenêtre de Jira isolée à
sa taille, transition ambiguë jamais cliquée et fiche rendue).

0.19.14 (demande de Denis) : l'administration dépliée est un panneau à part en pied de barre
latérale — son bouton reste EN TÊTE, ses sections se déplient au-dessous, sur un fond blanc bordé et
arrondi qui le détache du gris de la barre (`sidebar-admin-block`, classe `is-open`).

0.19.15 (signalé par Denis) : le bouton « Administration » changeait d'aspect en s'ouvrant (fond
blanc du panneau, icône bleue de `aria-current`). Le panneau blanc ne couvre plus que les sections
(`.is-open > .sidebar-admin`) et le bouton s'affiche à l'identique ouvert ou fermé : fond et bordure
transparents, graisse normale, icône `--ink-3`.

0.19.16 (signalé par Denis, paquet d'essai) : au premier lancement, aucun board n'étant enregistré,
l'icône ouvre la page de l'extension ; on y saisissait le site, on y cherchait le board, et rien ne
menait ensuite à Jira — il fallait recliquer sur l'icône pour obtenir la superposition. L'onglet
rejoint désormais de lui-même la page Jira du board choisi (`src/experiment/openInJira.ts`,
`followBoardToJira`, branché dans `main.tsx` pour le seul mode `jira-direct-test` hors cadre).
Seul le PREMIER board configuré déclenche le saut : une page rouverte sur un board déjà enregistré
reste dans l'onglet, sinon son administration deviendrait inatteignable. Board sans clé de projet
utilisable : on reste dans l'onglet. L'adresse est construite par `boardPageAddress`, extraite de
`launchAddress.ts` et partagée avec l'icône.

0.19.17 (demande de Denis) : les explications d'un état stable du board — aucun Goal rattaché au
sprint, tickets dont le statut n'est dans aucune colonne visible, propriété du sprint illisible par le
compte — ne décalent plus les swimlanes. Elles flottent en bas à droite au-dessus du board
(`FloatingNotices` dans `BoardView.tsx`, `z-index` 35 : au-dessus des bandes collantes et de la barre
latérale, sous les menus et les fenêtres), chacune avec une croix qui la ferme POUR DE BON sur ce
board, rechargement compris (`src/app/model/noticeStore.ts`, clé locale `dismissedNotices.v1`, par
site et par board ; oubliée avec le board retiré ou à la déconnexion ; jamais dans les réglages
d'équipe ni dans Jira). Tant que les fermetures ne sont pas relues, ces bandeaux restent cachés
(`dismissedNotices` vaut `null`) plutôt que de clignoter. Restent dans le flux, SANS fermeture
définitive, les erreurs de synchronisation, les résultats d'écriture, la décision sur les réglages
d'équipe et les lectures en échec (« Goals Atlassian illisibles », lecture partielle des Goals,
propriété du sprint non lue) : les masquer pour de bon cacherait le prochain incident. Banc
d'essai : scénario `board-infos`.

0.19.18 (signalé par Denis) : deux corrections de l'administration dépliée. 1. Style : plus de
panneau blanc en retrait ; ses sections sont dans le gris de la barre, en retrait sous le libellé
« Administration », et la section affichée prend l'aspect de l'entrée courante de la barre (fond
blanc bordé), comme « Sprint ». 2. Largeur : à l'ouverture, la liste des objectifs rapetisse et se
met à défiler ; avec des barres de défilement classiques (macOS avec souris, ou « toujours
afficher »), sa barre de 15 px rétrécissait toutes les lignes — 247 → 232 px, mesuré dans Chrome en
forçant des barres classiques. `scrollbar-gutter: stable` sur `.sidebar-scroll` et `.sidebar-admin`
réserve cette place en permanence : plus de décalage. La barre latérale elle-même garde sa largeur
(248 px mesurés dans les deux états, board débordant compris).

0.19.19 (choix de Denis : seules les stories se déplacent ; couches A, B et D proposées) :
sous-tâches repliées dans la carte de leur parent. Avant, elles avaient chacune une carte (leur
type, exclu des réglages, tombait dans Scrum par défaut) et, faute de Goal propre, tombaient dans
Build, loin de leur story. A : `foldSubtasks` (`core/boardSync.ts`) retire du board toute
sous-tâche (`issuetype.subtask`) dont le parent est un ticket du sprint ; les autres gardent leur
carte et héritent du Goal du parent quand elles n'en ont pas. B : `BoardIssue.subtasks`
(`core/boardIssue.ts`), lu dans le champ `subtasks` du parent, statut et assigné repris du ticket
du sprint quand il y est ; `SubtaskBar` dans `IssueCard.tsx`, un segment par sous-tâche, terminées
d'abord, détail au survol (pas de bouton dans la carte : c'est un lien, un élément interactif y
serait invalide). D : `subtaskProgress` — toutes terminées avant la dernière colonne visible
(même notion que les Goals atteints) : jauge verte ; parent dans la dernière colonne avec des
sous-tâches ouvertes : pastille `badge-subtasks-open`. Une sous-tâche sans statut compte comme
ouverte. Filtres (`core/filters.ts`) : Personne (`assigneesOf`), recherche et filtres rapides Jira
passent par les sous-tâches ; « Non assigné » non. Menu Personne : assignés des sous-tâches, une
fois par carte. Conséquence voulue : les sous-tâches repliées ne comptent plus dans les colonnes,
les limites WIP, l'en-tête, la santé du sprint ni les Goals atteints. Écart avec le Mac, qui les
affiche comme des tickets. Banc d'essai : `board-soustaches`.

0.19.20 (demande de Denis, révise 0.19.19) : « maintenant que les sous-tâches sont dans le même
objectif, on peut les garder comme fiches ». Plus de repliement : chaque sous-tâche a de nouveau sa
carte. `subtaskFamilies` (remplace `foldSubtasks`) donne le Goal du parent à TOUTE sous-tâche sans
Goal propre, parent sur le board ou non, et place la sous-tâche dans le bloc de son parent (Scrum ou
RUN) quand il est sur le board : la famille reste dans la même swimlane. Survol : `familyKey`
(`core/boardIssue.ts` ; la story elle-même, ou le parent d'une sous-tâche — jamais l'epic d'une
story) ; `BoardGrid` garde la famille survolée et la transmet à `LaneView` ; `IssueCard` reçoit
`highlighted` et `onHoverChange`, classe `card-family` (contour rouge `--blocked` et halo). Rien ne
s'éclaire pour une famille d'une seule carte affichée, ni pendant un glissé. Jauge et signaux de
0.19.19 conservés sur la carte de la story. Filtres, recherche, filtres rapides et menu Personne
reviennent au comportement d'avant 0.19.19 : chaque carte pour elle-même. Conséquence : les
sous-tâches comptent de nouveau dans les colonnes, les limites WIP et l'en-tête, et désormais aussi
dans l'avancement et l'atteinte du Goal de leur story (elles y sont rattachées).

0.19.21 (signalé par Denis le 24/09/2026, branche `codex/tickets-du-board`) : le board affichait
les tickets d'un sprint partagé avec un autre board, et le sprint actif d'un autre board qui
contenait un de ses tickets (« Sprint A + Sprint B »). Les tickets sont désormais lus par
`GET /rest/agile/1.0/board/{boardId}/sprint/{sprintId}/issue` (spécification OpenAPI de Jira
Software vérifiée le 24/09/2026 : « issues […] that belong to the sprint from the board », mêmes
paramètres ; le filtrage par le filtre du board reste à CONSTATER sur son Jira). `loadSnapshot`
n'affiche que les sprints actifs ayant au moins un ticket du board (à défaut, le premier), et le
premier sprint affiché porte l'épinglage : il ne peut plus s'écrire sur le sprint d'un autre board.

0.20.0 (demande de Denis du 24/09/2026, branche `codex/mode-daily`, choix validés un par un) :
mode Daily. Bouton ▶ de l'en-tête (`daily-start`) : plein écran du navigateur demandé au clic
(refusé, la daily se déroule dans la fenêtre), mise en page de la présentation et UNE swimlane à la
fois, toujours dépliée (le repli enregistré n'est pas touché ; ni poignée, ni repli, ni menu, ni
focus par le titre). `core/daily.ts` : étapes = swimlanes affichées dans l'ordre du board, Build et
RUN compris, masquées et sans ticket affiché sautées ; séance (`DailySession`, jamais enregistrée)
recalculée depuis l'heure de départ, pauses exclues ; étape disparue remplacée par celle qui a pris
son rang. `AppModel.daily` (arrêtée par l'administration, le diagnostic, la déconnexion ; le plein
écran est rendu à la fin). `DailyBar` (`BoardView.tsx`) : minuteur (orange à 2 min, rouge avec
« +mm:ss » ensuite, sans son ni arrêt), temps de l'étape, Précédent/Suivant, pause, plein écran,
Terminer ; clavier ← → Espace Échap (Échap en plein écran appartient au navigateur). Glisser-déposer
inchangé : aucune nouvelle écriture. Durée `dailyMinutes` (15 par défaut, 1 à 120) dans la section
Board de l'administration, locale au board, hors réglages d'équipe. Prototype : l'iframe injectée
porte `allow="fullscreen"` (attribut HTML, aucune permission ni CSP en plus).

0.20.1 (demande de Denis) : barre de la daily dans l'ordre minuteur, Précédent, Suivant, puis la
swimlane présentée (objectif, Build ou RUN) ; « En pause » passe après elle.

0.20.2 (brainstorming avec Denis, seule piste retenue) : en daily, la première colonne visible du
RUN est plafonnée — les N premières cartes dans l'ordre de Jira (rang), puis un bouton « + N autres »
qui déplie sur place, et « Afficher moins ». Le dépliage vaut jusqu'à la fin de la daily
(`DailySession.runStockExpanded`). N = `dailyRunStockLimit` (3 par défaut, 1 à 50), section Board de
l'administration, local. Seulement le RUN et seulement en daily : hors daily, tout reste affiché. Un
dépôt après la dernière carte affichée se place avant les cartes cachées. Écartés par Denis : tour
de parole par personne, bandeau d'alertes du stock, critère d'urgence, « Qui prend ? ».

0.21.0 (demande de Denis du 24/09/2026, branche `codex/mode-daily`) : « RUN » devient « Kanban »
partout — un type de ticket est traité en mode Scrum (par objectifs) ou en mode Kanban. Code
(catégorie `KANBAN`, bloc `kanban`, `kanbanColumns`, `kanbanIssues`, `showKanbanSection`,
`dailyKanbanStockLimit`, classes `lane-kanban`…, couleur `--kanban`, icône tableau à colonnes),
libellés et tests. Nouveau réglage `kanbanSectionLabel` (« Kanban » par défaut ; Denis le nomme
« Run »), section Board de l'administration, PARTAGÉ dans les réglages d'équipe comme le nom de
Build. Anciens formats relus : configuration locale et propriété d'équipe (`runColumns`,
`showRunSection`, `dailyRunStockLimit`, catégorie `RUN`, bloc `run` dans l'ordre et le repli) ; la
publication suivante écrit le nouveau format et retire `runColumns` et `showRunSection`.

0.21.1 (demande de Denis) : le mode présentation passe aussi en plein écran, comme la daily.
`views/fullscreen.tsx` (demande, sortie, suivi par `fullscreenchange`, bouton « Plein écran »)
sert aux deux. Plein écran demandé au clic sur le chevalet, rendu en quittant la présentation ou
la daily (effet de `Workspace`). En plein écran, Échap appartient au navigateur : il en sort, la
présentation continue ; un bouton « Plein écran » apparaît alors à côté de « Quitter », et un
second Échap quitte la présentation.

0.21.2 (signalé par Denis) : en présentation plein écran, Échap ne ramenait pas au mode normal —
le navigateur garde la touche pour sortir du plein écran et ne la transmet pas à la page. `Workspace`
écoute `fullscreenchange` : sortir du plein écran pendant la présentation la quitte. Le bouton
« Plein écran » à côté de « Quitter » est retiré (inutile). La daily garde son comportement :
sortir du plein écran ne l'arrête pas.

0.22.0 (demande de Denis du 24/09/2026, branche `codex/reglages-automatiques`) : plus de
« paramètres locaux non enregistrés ». `BoardModel.#changeShared` : un geste qui change un réglage
partagé (`sameTeamSettings`) l'applique à l'écran, puis `#saveShared` relit la propriété, rejoue le
changement sur la version relue (les réglages d'un collègue sont gardés) et écrit UNE fois par
`publishTeamSettings` (conflit s'il y a eu une écriture entre les deux lectures : rien n'est écrit,
la version de Jira s'affiche, on le dit). Écritures enchaînées ; une relecture commencée avant une
écriture est écartée. `#refreshTeamSettings` applique la version de Jira à chaque lecture (plus de
bandeau « Appliquer / Garder les miens », plus d'onglet « Réglages d'équipe », plus de « Publier
pour l'équipe »). Rien d'automatique n'est écrit (couleur d'un nouvel objectif, objectif découvert
masqué) : cela part avec la prochaine modification. Durée de la daily et stock Kanban deviennent
partagés. Droit d'édition : `JiraClient.boardCanEdit`, champ `canEdit` de `GET
/rest/agile/1.0/board?name=…&projectKeyOrId=…&expand=permissions` (spécification OpenAPI vérifiée le
24/09/2026 ; à CONSTATER sur le Jira de Denis) ; inconnu = modifiable, un 403 à l'écriture le passe
à faux. Faux : administration réduite au Diagnostic, ni poignée, ni œil, ni couleur, ni Monter/
Descendre ; le repli reste. Échec réseau : la modification sera remplacée au prochain chargement
(accepté par Denis). Banc d'essai : `board-lecture-seule`.

0.22.1 (demande de Denis : « pour l'instant je ne veux pas l'afficher ») : santé du sprint masquée —
ni bouton dans l'en-tête ni panneau, même si `healthOpen` était resté vrai. Interrupteur
`SPRINT_HEALTH_ENABLED` dans `BoardView.tsx` ; le code et ses tests restent (test du panneau
suspendu par `it.skipIf`).

0.22.2 (demande de Denis) : lancement de la daily plus visible — bouton plein « ▶ Daily » (icône
et texte, couleur principale) déplacé en tête des actions de l'en-tête, avant l'heure de synchro.

0.22.3 (demande de Denis) : textes d'aide des Goals revus — « associés au board » (filtre de
recherche, tous les sprints, partagé ; n'affiche pas un Goal sans ticket) et « épinglés au sprint »
(ce sprint seulement, swimlane même sans ticket) ; plus de mention de l'app Mac dans l'interface.

0.22.4 (demande de Denis) : « Goals associés au board » retiré — interface, recherche
(`atlassianGoals.ts` : épinglés + déclarés par les tickets, tout le site si les tickets n'en
déclarent aucun), configuration et réglages partagés (`boardGoalIds` rangée dans
`LEGACY_SETTINGS_KEYS`, effacée de la propriété du board à la prochaine écriture). L'épinglage au
sprint n'a plus de fenêtre : `views/settings/PinGoalsPanel.tsx` (ex-`PinGoalsDialog`), directement
dans la section Goals de l'administration ; brouillon ouvert d'office et recalé sur Jira tant qu'il
n'est pas modifié ; « Enregistré dans Jira. » après confirmation. Les entrées du board (menu du
board, bandeaux « Épingler des Goals… », « Réessayer dans Jira… ») ouvrent cette section, et
n'apparaissent que si les réglages du board sont modifiables (sinon l'administration est réduite
au Diagnostic).

0.22.5 (demande de Denis : « pour ne pas gérer les choses deux fois ») : « Couleur et visibilité des
objectifs » fusionnée avec l'épinglage dans une seule section, « Objectifs du sprint « nom » »
(`views/settings/SprintGoalsPanel.tsx`, ex-`PinGoalsPanel`). Une ligne par objectif (swimlanes
affichées puis masquées) : couleur, Masquer/Réafficher (réglages partagés, écrits aussitôt) et, en
Goals Atlassian, Épingler/Désépingler (brouillon, étiquette « à enregistrer »). Un Goal épinglé sans
swimlane encore apparaît en pointillés jusqu'à l'enregistrement. Dessous, « Épingler un Goal du
site » (recherche) puis Annuler / « Enregistrer dans Jira », une seule écriture. En « Texte du
sprint », la section ne garde que couleur et masquage.

0.22.6 (signalé par Denis) : le paquet d'essai s'appelait de nouveau « Sprint Goals — test
ouverture Jira » — le correctif était resté sur `codex/publication`, non fusionnée. Reporté ici
(`vite.config.ts` ne change plus le nom) ; description du manifest : « …glisser-déposer, Daily et
mode présentation » (santé du sprint retirée tant qu'elle est masquée).

Publication (24/09/2026, branche `codex/store-maj`) : fiche (`docs/store/fiche.md`) et politique de
confidentialité (`docs/privacy/index.html`, republiée sur `2nis6mon/sprint-goals-privacy`) alignées
sur 0.22 — réglages du board écrits à chaque modification, droit de modifier le board lu, plus de
« Publier pour l'équipe », plus de santé du sprint dans la fiche. Capture `03-sante` remplacée par
`03-objectifs` (administration, objectifs du sprint). Zip : `release/sprint-goals-board-0.22.6.zip`.

0.22.7 (essai de Denis sur son Jira de sandbox le 24/09/2026, branche `codex/retours-sandbox`).
Constaté chez lui : droit de modifier le board reconnu et écriture acceptée, enregistrement
automatique, swimlane Kanban renommée « Run » partout, daily plein écran avec stock plafonné (3
cartes puis « + 14 autres » sur 17 vraies cartes), santé du sprint bien masquée. Trois corrections :
1. `columnLoad` (`boardLayout.ts`) compte désormais TOUS les tickets de la colonne, Kanban compris
   (son choix) : en daily sur la swimlane Run, la bande annonçait 13 au-dessus de 17 cartes, parce
   que le compteur ne voyait que le Scrum et que ses colonnes Kanban, identiques aux colonnes Scrum,
   font réutiliser la même bande. Les limites WIP se comparent donc à la charge entière de la
   colonne du board Jira.
2. Section Board de l'administration : les libellés qui désignent LA swimlane prennent son nom
   (« Afficher la swimlane Run », « Stock Run en daily »…) ; « mode Kanban » reste le mode.
3. Texte « Réglages du board, partagés avec l'équipe… » retiré de la barre latérale ; celui de la
   lecture seule reste, sinon le menu amputé serait inexplicable. `DIAGNOSTIC_ENABLED`
   (`AdminView.tsx`) existe désormais comme `SPRINT_HEALTH_ENABLED`, mais reste à `true` : Denis a
   demandé de masquer le diagnostic, puis de le rétablir le jour même — le bandeau « Invalid CORS
   request » y renvoie, et c'est le seul écran qui retient la variante d'en-tête Origin acceptée par
   la passerelle des Goals. À `false`, le bouton « Administration » disparaît pour qui ne peut pas
   modifier le board : la barre latérale ne garde alors que le site et « Se déconnecter »
   (`SiteAccount`, sorti de `AdminMenu`), et le droit qui tombe pendant que l'administration est
   ouverte ramène au sprint.

0.23.0 (demande de Denis du 25/09/2026, branche `codex/swimlanes-par-type`, plan validé) : la
notion de Kanban disparaît. Un type de ticket est « par objectif » (swimlane de son Goal, ou Build),
dans une **swimlane par type**, ou ignoré (`IssueCategory` : `GOAL`, `SWIMLANE`, `IGNORED`). Une
swimlane par type (`TicketSwimlane` : identifiant « 1 », « 2 »…, nom, types, masquage) regroupe un
ou plusieurs types — ex. RUN = Anomalie Prod + Anomalie de Recette, OPS = Demande de configuration
+ Demande de service. Nom par défaut : les noms de ses types réunis par « / » (`swimlaneName`),
tant qu'on ne le change pas ; vide, ou identique au nom calculé, il suit ses types.
`normalizeSwimlanes` tient l'invariant (un type en `SWIMLANE` est dans une et une seule swimlane ;
un orphelin rejoint la première, ou en crée une). Bloc `{ kind: "swimlane", swimlaneId }`, forme
`swimlane:<id>` ; `BoardIssue.swimlaneId` ; photographie `goalIssues` / `swimlaneIssues`. Une
seule série de colonnes pour tout le board (`columns`, ex-`scrumColumns` ; `kanbanColumns`
disparaît). Glisser-déposer : une carte d'une swimlane par type ne va que dans la sienne.
Administration → Board → « Types de tickets et swimlanes » : un bloc par groupe (par objectif,
chaque swimlane avec son nom et « Affichée », ignorés), un menu « Déplacer vers » par type
(« Nouvelle swimlane » crée ; retirer le dernier type supprime la swimlane, sa place dans l'ordre
et son repli). Daily : le stock plafonné vaut pour TOUTES les swimlanes, objectifs et Build compris
(`dailyStockLimit`, `DailySession.expandedStockIds`, dépliage swimlane par swimlane). Relus :
`scrumColumns`, `kanbanSectionLabel` (« Kanban » = nom calculé), `showKanbanSection`,
`dailyKanbanStockLimit`, catégories `SCRUM`/`KANBAN`/`RUN`, blocs `kanban`/`run` (→
`swimlane:1`). **Compatibilité 0.22.7** (collègues en mode développeur sur le même board) : la
0.22.7 exige `scrumColumns` et `kanbanColumns` et réécrit telles quelles les clés inconnues. La
propriété du board garde donc les clés d'avant, DÉDUITES et jamais relues quand
`ticketSwimlanes` existe (`kanbanColumns` = copie des colonnes, `showKanbanSection`,
`kanbanSectionLabel` = noms réunis, `dailyKanbanStockLimit`, catégories écrites `SCRUM`/`KANBAN`) :
elle y voit une seule swimlane Kanban. Un type qu'elle repasse en `SCRUM` quitte sa swimlane, un
type qu'elle classe `KANBAN` rejoint la première. Banc d'essai : `board-swimlanes` (RUN et OPS).
Aucune écriture, permission ni hôte nouveaux.

0.23.1 (question de Denis du 25/09/2026) : « ajouté en cours de sprint » ne regarde plus la
PREMIÈRE entrée du ticket dans le sprint mais sa présence AU DÉMARRAGE (`sprintScope`,
`jira/models.ts`, remplace `dateAddedToSprint`) : dernier changement du champ Sprint avant le
démarrage ; sinon ancienne valeur du premier changement d'après ; sans aucun changement, date de
création. Un ticket mis dans le sprint pendant le planning, retiré, puis remis après le démarrage
est donc « ajouté » (il ne l'était pas) ; un ticket présent au démarrage, sorti puis revenu, non ;
un ticket créé après le démarrage sans entrée notée, oui. Sans historique : toujours inconnu.

0.24.0 (plan validé par Denis le 01/10/2026, branche `codex/support-kanban`) : les boards Kanban
sont pris en charge. `boardType === "kanban"` ne requiert ni sprint actif ni propriété de sprint.
Le périmètre est celui du board, de son sous-filtre et des statuts mappés à ses colonnes ; pas de
limite d'âge arbitraire pour les tickets terminés, ni de troncature silencieuse. Les Goals Atlassian
restent la source en Kanban (pas de texte du sprint) ; `boardPinnedGoalIds` est partagé via les
réglages du board, sur geste explicite et avec droit de modification, relecture et contrôle de conflit.
Une erreur de lecture des Goals est signalée sans convertir leurs tickets en tickets sans objectif.
Build et les swimlanes par type, Daily, présentation, filtres et déplacements restent communs.
Pas de nouvelle permission ni d'hôte. L'ancienne consigne « Scrum seulement » est remplacée par
ce choix explicite. La validation sur un vrai board Jira demeure à effectuer par Denis.

0.24.1 (retour de Denis du 01/10/2026) : certains sites n'exposent pas `workItems` sur les Goals
GraphQL. En Kanban, le champ Goals Jira déjà demandé sur les tickets devient alors la source des
rattachements, uniquement s'il est présent sur chaque ticket classé par objectif. Une valeur `null` est un
champ lu et vide ; un champ absent bloque toujours le chargement. Un schéma incompatible reste
signalé après Actualiser, y compris quand l'introspection est en cache. Paquet livré : intégré
dans Jira, 0.24.1.2, dossier `dist/`.

Ne pas reconstruire `dist/` pendant que Denis teste l'extension : construire ailleurs avec
`npx vite build --outDir <scratchpad>`.

Plan validé le 18/09/2026 : 0 socle · 1 connexion et diagnostic (essai XSRF par Denis) ·
2 logique métier · 3 board en lecture seule · 4 les quatre écritures · 5 réglages locaux ·
6 compléments. Chaque étape se termine par `npm run check` au vert, un commit, et la liste de ce
qui reste à valider sur l'instance de Denis.
