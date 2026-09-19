# Sprint Goals Board pour Jira — extension Chrome

Nom public choisi par Denis le 18/09/2026 (manifest : nom, nom court « Sprint Goals »,
description ≤ 132 caractères qui met en avant la swimlane automatique par Sprint Goal).
Extension Chrome (Manifest V3) qui reprend les fonctionnalités de l'app macOS « Scrum Board »,
connectée à Jira Cloud. Projet **distinct** de l'app Mac, qui reste maintenue en parallèle.

## Références

- Spécification fonctionnelle commune aux deux projets : `docs/reference-app-mac/PROMPT.md`.
- API Atlassian vérifiées, audit de sécurité et README du Mac : même dossier. Ce sont des copies
  conformes (voir `LISEZ-MOI.md` pour le commit d'origine) : ne pas les modifier ici.
- Code de l'app Mac : `/Users/dsimon/Claude Code/jira-scrum-board-advanced`. **Lecture seule,
  ne jamais le modifier.** Ses tests Swift sont la référence des cas de test à porter.

## Règles non négociables

1. **Quatre catégories d'écriture dans Jira, rien d'autre** : propriété de sprint (épinglage des
   Goals), lien ticket↔Goal (`goals_linkWorkItem` / `goals_unlinkWorkItem`), transitions, rang.
2. **Ne JAMAIS réécrire le champ « Sprint Goal » du sprint.** Il est lu, jamais écrit.
3. Ordre des swimlanes, couleurs des objectifs, champs des cartes, règles de couleur : réglages
   **locaux** (`chrome.storage.local`), jamais écrits dans Jira, jamais dans `storage.sync`.
4. **Une seule tentative pour tout POST/PUT/DELETE.** Jamais de retry sur une écriture ; si
   l'issue est incertaine, on relit Jira.
5. Pas de fiche ticket native : on ouvre la page Jira dans un onglet.
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
- Commits : `git -c user.name="2nis6mon" -c user.email="denis.simon@gmail.com" commit …`, avec le
  trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Ne pusher que sur demande explicite.

## Droits de l'extension

Le manifest (`public/manifest.json`) est gardé par `tests/manifest.test.ts`. Toute permission
supplémentaire, tout hôte supplémentaire, tout assouplissement de la CSP doit être **proposé à
Denis avant d'être codé**. État actuel : `storage` et `declarativeNetRequestWithHostAccess`
(validée par Denis le 18/09/2026) à l'installation ; accès à un site `https://*.atlassian.net`
demandé à l'exécution ; CSP `connect-src https://*.atlassian.net`.

`declarativeNetRequestWithHostAccess` ne sert qu'à UNE règle de session
(`src/app/platform/originRule.ts`) : en-tête `Origin` retiré ou remplacé par l'adresse du site,
pour les seuls POST émis par l'extension (`initiatorDomains: [id]`) vers l'adresse exacte
`|https://<site>/gateway/api/graphql|`. Sans `initiatorDomains`, la règle toucherait aussi les
requêtes des pages web vers la passerelle et affaiblirait sa protection : ne jamais l'élargir. Un
garde-fou (`tests/guards/sources.test.ts`) confine `declarativeNetRequest` à `platform/chrome.ts`.

`.secrets/extension-key.pem` est la clé privée qui correspond au champ `key` du manifest (elle
fige l'identifiant de l'extension). Elle est ignorée par git : ne jamais la committer.

## Architecture

```
board.html            page plein onglet de l'extension
src/app/              interface Preact
src/app/platform/     seul endroit qui touche chrome.* (permissions, stockage)
src/app/model/        état de l'interface (signals), plateforme injectée : AppModel (connexion,
                      vue), BoardModel (board, synchro, filtres, glisser-déposer), DiagnosticModel,
                      boardStore, auditLog (journal des écritures), graphqlOrigin (règle Origin)
src/app/views/        vues Preact ; Sidebar = barre latérale ; views/board/ = en-tête, filtres,
                      swimlanes, cartes ; views/settings/ = Administration (réglages, diagnostic,
                      déconnexion)
src/background/       service worker (ouvre la page, rien d'autre)
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

Écarts voulus : `SprintGoalText.render` n'est pas porté (il ne servait qu'à réécrire le champ du
sprint) ; le mode de compatibilité « Build et RUN restent en bas » des ordres enregistrés avant la
2.2 du Mac n'existe pas ; les champs « optionnels pour d'anciennes configurations » ont ici une
valeur par défaut. Le format de `SprintGoalDocument` est PARTAGÉ avec le Mac : ne pas le changer.
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
```

Dépendances en versions exactes (`.npmrc` : `save-exact`, `ignore-scripts`). Toute nouvelle
dépendance d'exécution se justifie : il y en a deux aujourd'hui (`preact`, `@preact/signals`).

## Étapes

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

0.6.0 : épinglage de Goals au sprint (`pinAtlassianGoals`, fenêtre `PinGoalsDialog`, menu « ⋯ »),
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
des boards viendra avec le multi-board), vues Board et Sprint Health (emplacement réservé),
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

Ne pas reconstruire `dist/` pendant que Denis teste l'extension : construire ailleurs avec
`npx vite build --outDir <scratchpad>`.

Plan validé le 18/09/2026 : 0 socle · 1 connexion et diagnostic (essai XSRF par Denis) ·
2 logique métier · 3 board en lecture seule · 4 les quatre écritures · 5 réglages locaux ·
6 compléments. Chaque étape se termine par `npm run check` au vert, un commit, et la liste de ce
qui reste à valider sur l'instance de Denis.
