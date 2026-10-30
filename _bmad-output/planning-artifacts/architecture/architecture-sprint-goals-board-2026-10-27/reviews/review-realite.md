# Relecture « réalité » — ARCHITECTURE-SPINE.md (2026-10-27)

Objet : vérifier que chaque décision de la spine est confrontée au dépôt (versions, chemins, symboles,
sens des imports) et cohérente avec DEVELOPER.md et CLAUDE.md. Web non consulté : pour un projet
existant, le dépôt fait foi. Aucune mise à jour de dépendance n'est proposée.

Méthode : lecture de `package.json`, `package-lock.json`, `public/manifest.json`, `vite.config.ts` ;
extraction de toutes les instructions `import … from "…"`/`export … from "…"` relatives de `src/`
(script Node), regroupées par couche source → couche cible ; `grep` des symboles cités.

## Verdict

Stack et symboles nommés sont exacts. En revanche, le graphe de dépendances d'AD-1 omet plusieurs
flèches réelles et massives (`app/model → jira`, `app/services → jira`, `app/services → app/model`,
`integration → jira`, racine `src/app/*`) : lu littéralement (« les imports suivent le graphe »),
AD-1 déclare non conforme une grande partie du code actuel sans que la section « Écarts à résorber »
le mentionne. C'est le principal défaut à corriger avant adoption.

## 1. Stack — confrontation aux fichiers du projet

| Ligne spine (l.99-106) | Réalité | Statut |
|---|---|---|
| Chrome Manifest V3, Chrome ≥ 116 | `public/manifest.json:2` `manifest_version: 3`, `:8` `minimum_chrome_version: "116"` ; `vite.config.ts:29` `target: "chrome116"` | Conforme |
| TypeScript 7.0.2 | `package.json` devDependencies `7.0.2` ; `package-lock.json:1644-1645` | Conforme |
| Preact 10.29.8 | `package.json` dependencies ; `package-lock.json:1524-1525` | Conforme |
| @preact/signals 2.11.2 | `package.json` ; `package-lock.json:240-241` | Conforme |
| Vite 8.3.0 | `package.json` ; `package-lock.json:1686-1687` | Conforme |
| Vitest 5.0.1 | `package.json` ; `package-lock.json:1764-1765` | Conforme |
| Biome 2.5.14 | `package.json` `@biomejs/biome` ; `package-lock.json:27-28` | Conforme |
| Node.js ≥ 22.12.0 | `package.json` `engines.node: ">=22.12.0"` ; DEVELOPER.md:444 | Conforme |

Version du produit cohérente sur les trois fichiers (0.35.2). Aucun écart de version.

## 2. Constats

### C1 — Haute — Flèche `app/model → jira` absente du graphe (23 imports, dont des constructions)

- Preuve : `src/app/model/AppModel.ts:11-14` (`JiraClient`, `JiraTransport`, `site`, `json`),
  `src/app/model/BoardModel.ts:32-38` (`JiraClient`, `GoalsClient`, `JiraTransport`, `JiraError`…),
  `src/app/model/DiagnosticModel.ts:2,11-12` ; instanciations `AppModel.ts:436-437`,
  `BoardModel.ts:293,299,313`, `DiagnosticModel.ts:57`. Spine l.37-52 : aucune arête `model → jira`.
- Portée : AD-1 (l.58) impose « les imports suivent le graphe » et précise que `core` ne construit
  jamais client/transport — sans dire *qui* les construit. La réalité : les modèles sont la racine de
  composition. Non listé dans « Écarts à résorber » (l.135-140).
- Correction : ajouter `model --> jira` (arête pleine) et énoncer dans AD-1 que les modèles
  (`AppModel`, `BoardModel`, `DiagnosticModel`) sont la racine de composition qui instancie
  `JiraTransport`/`JiraClient`/`GoalsClient` et les injecte dans services et `core`.

### C2 — Haute — Flèche `app/services → jira` absente du graphe (14 imports)

- Preuve : `src/app/services/BoardSettingsService.ts:14-17` (dont valeurs `JiraError`,
  `BOARD_PROPERTY_KEYS`), `BoardMovementService.ts:11-13`, `BoardLoadingService.ts:7-9`,
  `JqlService.ts:1-4`. Spine l.45-49 : `services` ne pointe que vers `core`.
- Correction : ajouter `services -. contrats .-> jira` en le restreignant, comme pour `core` et les
  vues, aux contrats (types, `JiraError`, constantes). Note : `BOARD_PROPERTY_KEYS` dans un service
  sert précisément l'écart AD-2 déjà listé (relecture de `boardsettings`, `BoardSettingsService.ts:223-226,399,538`) ;
  il disparaîtra avec ce déplacement.

### C3 — Haute — Flèche `app/services → app/model` (inverse du graphe, cycle) non signalée

- Preuve : `src/app/services/BoardLoadingService.ts:10-12`, `BoardMovementService.ts:14-21`,
  `BoardSettingsService.ts:18-19`, `ports.ts:2` importent `model/BoardTypes`, `model/auditLog`,
  `model/LoadDiagnostics` (types) et surtout la **valeur** `toMessage` de `model/messages.ts:10`
  (3 services). Le graphe (l.45) n'a que `model --> services` ; l'inverse crée un cycle
  `model ↔ services`. AD-3 (l.70) dit que les services ne voient l'état que par `ports.ts` — or
  `ports.ts` lui-même importe `model/auditLog`.
- Cohérence DEVELOPER.md:35-37 : « ports … n'importent ni `BoardModel` … types communs dans
  `BoardTypes.ts` » — DEVELOPER.md tolère donc implicitement `services → model/BoardTypes`, la spine non.
- Correction : soit ajouter `services -. types .-> model` (types partagés `BoardTypes`, `auditLog`,
  `LoadDiagnostics`) et inscrire `toMessage` en écart (à déplacer vers `services` ou un module
  neutre), soit déplacer ces types/`toMessage` hors de `app/model` ; dans les deux cas, l'inscrire
  dans « Écarts à résorber ».

### C4 — Moyenne — `integration → jira` et `integration → i18n` réels, graphe muet

- Preuve : `src/integration/boardRoute.ts:1`, `embedded.ts:5`, `embeddingGuard.ts:1`,
  `launchAddress.ts:1-2`, `LauncherModel.ts:9` importent `jira/site` et `jira/json` (fonctions
  pures). Spine l.39 : `integration --> app/*` seulement. `i18n` est déclaré transversal (OK).
- Correction : ajouter `integration -. contrats .-> jira` (fonctions pures sans E/S), cohérent avec
  la règle « contrats » d'AD-1. `embeddingGuard` dépend légitimement de `normalizeSiteUrl`.

### C5 — Moyenne — Fichiers racine de `src/app/` hors du modèle de couches

- Preuve : `src/app/App.tsx`, `main.tsx`, `featureFlags.ts`, `i18n.ts`, `styles/` ne figurent pas
  dans la table l.24-33 ni dans le graphe. `src/app/main.tsx:3` importe la valeur
  `embeddedBoardTarget, installEmbeddedLinks` de `integration/embedded` (arête `app → integration`
  inverse de l.39). AD-3 (`app/i18n.ts`) et AD-5 (`app/featureFlags.ts`) les citent pourtant.
- Correction : ajouter une ligne « Composition / entrée » (`src/app/main.tsx`, `App.tsx`) et une
  ligne « Transversal app » (`featureFlags.ts`, `i18n.ts`) avec leurs arêtes, dont
  `main.tsx → integration/embedded` (ou l'inscrire en écart).

### C6 — Moyenne — Second doublon de clé locale non nommé (AD-4)

- Preuve : `jira-button-position.v1:<origine>` est écrite par `src/integration/bootstrap.ts:14`
  (script sans import) et supprimée par un littéral dupliqué dans `src/app/model/AppModel.ts:260`.
  AD-4 (l.76) ne tolère qu'un doublon nommé : `language.v1`.
- Correction : nommer ce doublon imposé dans AD-4 (propriétaire `bootstrap.ts`, effacement à la
  déconnexion par `AppModel`) et vérifier qu'un test le couvre, ou l'ajouter aux écarts.

### C7 — Basse — AD-3 : `LauncherModel` (dans `integration/`) crée des signaux

- Preuve : `src/integration/LauncherModel.ts:1,41-48` (`signal(...)`) ; `src/integration/embedded.ts:1`
  (`effect`). AD-3 l.70 : « Seuls les modèles et `app/i18n.ts` créent des signaux ». Le « Binds »
  liste bien `integration/LauncherModel.ts`, mais la règle ne le désigne pas comme modèle.
- Correction : écrire « les modèles (`app/model/*`, `integration/LauncherModel.ts`) et
  `app/i18n.ts` », et mentionner `effect` dans `embedded.ts` (abonnement, pas création d'état).

### C8 — Basse — `jira → i18n` : `diagnostics.ts` localise ses propres messages

- Preuve : `src/jira/diagnostics.ts:1,408,419,437` (`localize`, `t`). Autorisé par AD-1 (i18n
  importable partout), mais la convention l.90 dit « messages utilisateur produits par les modèles »,
  et les services produisent aussi des textes (`BoardSettingsService.ts:216`).
- Correction : nuancer la convention « Erreurs » : `JiraError` côté `jira`, messages utilisateur
  produits par modèles, services et le rapport de diagnostic de `jira/diagnostics.ts`.

### C9 — Basse — Convention « Textes visibles uniquement dans les catalogues » imprécise

- Preuve : le français est la clé source écrite dans le code (`src/i18n/index.ts:19-52`, `translate`
  renvoie la clé en `fr`) ; DEVELOPER.md:63,77-78.
- Correction : « Textes visibles : clé française dans le code, présente dans les catalogues
  `src/i18n` ; anglais repli, espagnol complet ; contrôlé par `verify:i18n` ».

## 3. Affirmations vérifiées exactes

- `JiraWriter = Pick<JiraTransport, "write">` : `src/core/boardWrites.ts:26`.
- `goals.setLink` : `src/jira/goals.ts:314` (via `transport.graphqlWrite`, l.323) ; appelé par
  `BoardMovementService.ts:169,190`.
- Écritures hors `core` : seuls les décorateurs de `BoardSettingsService.ts:249,439` (garde de
  péremption/droits, conforme AD-2) et E7 dans `jira/diagnostics.ts:275,316`. Aucune écriture dans
  vues ni `platform`.
- `publishTeamSettings` : `src/core/teamSettings.ts:337` ; relecture/conflit préalable dans
  `BoardSettingsService.ts:223-234` — écart AD-2 exact.
- `featureFlags.ts` : `src/app/featureFlags.ts:2-4` ; `define` dans `vite.config.ts:18-19`
  (modes `dist`, `development`, `test`) ; cohérent DEVELOPER.md:449-454 et CLAUDE.md.
- `SPRINT_HEALTH_ENABLED` : `src/app/views/board/BoardView.tsx:63` ; `DIAGNOSTIC_ENABLED` :
  `src/app/views/DiagnosticView.tsx:15` — écart AD-5 exact.
- `connection.v1` : `AppModel.ts:26`, `LauncherModel.ts:60,147` ; `launcher.v1` : `AppModel.ts:251,256`,
  `LauncherModel.ts:62,149` ; `boards.v1` : propriétaire `boardStore.ts:9`, lu brut `LauncherModel.ts:61`
  — écart AD-4 exact.
- `language.v1` doublon : `src/i18n/language.ts:5` et `src/integration/bootstrap.ts:16`, test
  `tests/integration/bootstrap.test.ts`.
- `sprintgoals.v1` écrit par `boardWrites` et `sprintPlanning` : `jira/writes.ts:39`,
  `core/boardWrites.ts:7,17`, `core/sprintPlanning.ts:5,13`.
- `loadTrace` : `src/jira/transport.ts:1` importe `core/loadTrace` ; 5 importeurs
  (`transport.ts`, `boardSync.ts`, `LoadDiagnostics.ts`, `BoardLoadingService.ts`,
  `LoadDiagnosticsView.tsx`) — exact.
- `ports.ts` : `src/app/services/ports.ts` existe (mais voir C3).
- `core` ne construit jamais `JiraClient`/`JiraTransport`/`GoalsClient` (aucun `new` dans `src/core`).
- `jira` sans DOM ni `chrome.*` ; `jira → core` uniquement via `loadTrace` (écart listé).
- Vues → services : types seulement (`CardColorSettings.tsx:14`, `JqlEditor.tsx:3`).
- Vues → jira : fonctions pures/constantes (`blockingRequiredFields`, `isDoneStatus`,
  `goalDisplayName`, `writeConclusion`, `SPRINT_PROPERTY_KEYS`) — conforme « contrats ».
- `platform → integration` : type seul (`launcherChrome.ts:1`) — conforme ; `platform → jira`
  (`site`, `GRAPHQL_PATH`, type `FetchLike`) — conforme au graphe.
- `i18n` n'importe rien de `src/` hors de lui-même.
- Vues : aucune affectation `.value =` dans `src/app/views`.
- Structural Seed : `jira-worker.js`/`jira-bootstrap.js` (`vite.config.ts:36-42`), `injectBoard`
  via `executeScript` (`worker.ts:5,19`), entrées `board.html`/`launcher.html` — exact.

## 4. Cohérence avec DEVELOPER.md et CLAUDE.md

- Pas de contradiction sur produit, sécurité, écritures, flag Sprint Planning, Node, clés persistées.
- Divergence C3 (types partagés `BoardTypes.ts` admis par DEVELOPER.md:36, interdits par le graphe).
- Remarque hors spine : DEVELOPER.md:30 annonce « Trois services » alors que `src/app/services/`
  en contient cinq (`BoardCardColorService`, `JqlService` en plus) ; la spine, qui ne les énumère
  pas, n'est pas en cause.
- Stack : omission sans gravité de `happy-dom` 20.14.5 et `@types/chrome` 0.3.0 (outillage de test
  et typage, `package.json`) ; à ajouter seulement si la spine veut couvrir l'outillage de test.
