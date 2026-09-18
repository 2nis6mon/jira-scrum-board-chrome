# Scrum Board — extension Chrome

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
src/app/views/        vues Preact ; views/board/ = en-tête, filtres, swimlanes, cartes
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
| `core/cardColors.ts`, `core/cardFields.ts` | `CardColorRule`, `CardColorResolver`, `CardField` |
| `jira/models.ts`, `jira/transitionPlanner.ts` | `Models.swift`, `TransitionPlanner` |
| `jira/client.ts` | lectures de `JiraClient.swift` (board, sprints, tickets, champs, propriété) |
| `core/boardSync.ts` | `BoardController.detectBoard` et `performSync` (lecture seule) |
| `core/boardLayout.ts` | répartition en swimlanes et colonnes des vues SwiftUI du board |
| `core/boardWrites.ts` | `BoardController.moveIssue`, `rankIssue`, `assignGoal` (mode texte) |

Écarts voulus : `SprintGoalText.render` n'est pas porté (il ne servait qu'à réécrire le champ du
sprint) ; le mode de compatibilité « Build et RUN restent en bas » des ordres enregistrés avant la
2.2 du Mac n'existe pas ; les champs « optionnels pour d'anciennes configurations » ont ici une
valeur par défaut. Le format de `SprintGoalDocument` est PARTAGÉ avec le Mac : ne pas le changer.

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
npm run harness       # banc d'essai visuel, données fictives, http://localhost:5199/?scenario=ok
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
ci-dessus ; le diagnostic essaie « conservé / retiré / adresse du site » et mémorise par site la
variante acceptée (`graphqlOrigin.v1`). La lecture des Goals (port de `GoalsClient.swift`) attend
le rapport de ce diagnostic ; `BoardModel` passe encore `goalsLoader: null`.

Ne pas reconstruire `dist/` pendant que Denis teste l'extension : construire ailleurs avec
`npx vite build --outDir <scratchpad>`.

Plan validé le 18/09/2026 : 0 socle · 1 connexion et diagnostic (essai XSRF par Denis) ·
2 logique métier · 3 board en lecture seule · 4 les quatre écritures · 5 réglages locaux ·
6 compléments. Chaque étape se termine par `npm run check` au vert, un commit, et la liste de ce
qui reste à valider sur l'instance de Denis.
