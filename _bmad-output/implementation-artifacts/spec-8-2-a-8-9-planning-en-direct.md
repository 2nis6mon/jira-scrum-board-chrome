---
title: 'Stories 8.2 à 8.9 — Sprint Planning en direct dans Jira'
type: 'feature'
created: '2026-11-01'
status: 'in-progress'
baseline_commit: '4079b6d986901848a47eadcde3a428b7b8269cdb'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-8-context.md'
  - '{project-root}/_bmad-output/forge/sprint-planning-complet/forged-idea.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Sprint Planning suit encore la décision du 14/10 (brouillon local puis « Publier »). Depuis le 01/11, chaque geste doit écrire aussitôt dans Jira, seule source, avec clôture et démarrage par les fenêtres natives.

**Approach:** Remplacer la publication groupée par une fonction de `core` par intention (objectifs texte, placer/retirer un ticket, épingler un Goal, vélocité, report après clôture), appelée par la porte du board ; reconstruire `PlanningModel` sans brouillon et `PlanningView` dans la grammaire de la page du sprint ; ouvrir les fenêtres natives par l'hôte ; avis en clés de catalogue fr/en/es. Une seule spec : les stories 8.2 à 8.9 remplacent le même modèle et le même écran.

**Décisions prises en autonomie (Denis, 01/11/2026 : « tu es autonome, prends toutes les décisions ») :**
- Anciens brouillons `sprint-planning.v1` : effacés à l'ouverture du planning, sans synthèse (fonction expérimentale, builds locaux seulement) ; la déconnexion continue de les effacer.
- Droits : pas de lecture préalable ; un refus Jira s'affiche au premier geste (décision reportée au constat de 8.10).
- Filtres rapides « Ajoutés » et « Reportés » masqués dans le planning (sans objet avant le démarrage).
- Objectif sans ticket : atteint au sens de la règle (« tickets pas tous dans la dernière colonne »), donc non reporté.
- Retirer un ticket ne réécrit pas son lien dans la propriété : sans ticket dans le sprint, le lien est sans effet, et un retour du ticket le retrouve sur son objectif.
- Le report se déclenche seul après la fermeture de la fenêtre native, si le sprint relu est clos ; il est idempotent (titres déjà présents et Goals déjà épinglés ignorés).

## Boundaries & Constraints

**Always:** une tentative par écriture, relecture qui conditionne chaque écriture, arrêt au premier échec avec étapes confirmées ; tout passe par `BoardModel` → porte (`write`) ; `sprintgoals.v1` seulement par `updateSprintGoalProperty` (clés inconnues conservées, version inconnue jamais écrasée) ; E10 refusé pour un ticket hors du sprint en préparation ou présent dans un sprint actif ; `SPRINT_PLANNING_ENABLED` garde chaque point d'entrée et reste faux dans le paquet ; textes visibles dans `src/i18n` (en, es).

**Never:** création de sprint ou de Goal ; écriture de `state`, dates ou nom ; remplir ou valider une fenêtre native ; retrait depuis un autre sprint, le sprint actif ou un sprint démarré ; brouillon local ; nouvel hôte, droit Chrome ou CSP.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Objectif ajouté | sprint futur, texte inchangé | E8 relu puis E5 relu | — |
| Texte changé ailleurs | `goal` relu ≠ affiché | rien écrit, page relue, avis « refaire » | refus |
| E8 ok, E5 en échec | 403 sur E5 | avis : texte confirmé, liens non | partiel, pas de rejeu |
| Renommage | Entrée / sortie du champ | E8 puis E5, même identifiant | Échap : rien |
| Ticket du backlog posé sur objectif | sprint futur | E9 relu puis E5 (texte) ou E3 (Goals) | E9 ok, lien KO : partiel |
| Ticket d'un autre sprint futur | idem | E9 (déplacement) puis lien | idem |
| Ticket du sprint actif | glisser | refusé, consultation | — |
| Retrait au backlog | ticket du sprint en préparation | E10 puis relecture | ticket entre-temps en sprint actif : refus |
| Vélocité | valeur ≥ 0 validée | E5 `velocity` | conflit : refus, relecture |
| Clôture native fermée, sprint clos | objectifs non atteints | reportés (texte : E8+E5 avec liens des tickets arrivés ; Goals : épinglage) | fenêtre annulée : rien |
| Démarrer avec un sprint actif | — | bouton désactivé avec raison | — |

</frozen-after-approval>

## Code Map

- `src/core/sprintPlanning.ts` -- réécrit : `loadSprintPlanning` (sprint préparé, autres sprints futurs, RAF actif, propriété, vélocité, Goals épinglés) et intentions `writeTextGoals`, `placePlanningIssue`, `removePlanningIssue`, `savePlanningVelocity`, `carryOverGoals`, résultat typé `PlanningOutcome`.
- `src/core/sprintGoals.ts` -- champ `velocity` (fait), `reconcileSprintGoals`/`stableGoalIds` pour des identifiants stables.
- `src/core/boardWrites.ts` -- réutiliser `linkToTextGoal`, `pinAtlassianGoals` ; `src/core/boardMove.ts` `changeAtlassianGoal` ; `src/core/atlassianGoals.ts` `loadAtlassianSprintGoals`.
- `src/core/reasons.ts`, `src/app/model/coreText.ts` -- codes `planning*` et `planningMessage` réécrits en clés.
- `src/app/model/PlanningModel.ts`, `PlanningTypes.ts` -- modèle sans brouillon ; garde `pendingClosure` pour le report.
- `src/app/model/BoardModel.ts` -- contexte du planning : porte, Goals (`#goals`), configuration, fenêtres natives ; `siteData.ts` garde `forgetPlanningDrafts`.
- `src/app/views/planning/PlanningView.tsx`, `src/app/styles/planning.css` -- écran : en-tête (sprint préparé, menu, vélocité, charge, Clôturer/Démarrer), colonne « Où sont les tickets », swimlanes par objectif, « Sans objectif ».
- `src/integration/messages.ts`, `injectBoard.ts` -- message `sprintDialog` (vue → hôte) et ouverture de la fenêtre native depuis la page backlog.
- `src/i18n/*.ts`, `src/i18n/es/*.ts` -- nouveaux textes.
- Tests : `tests/core/sprintPlanning.test.ts`, `tests/app/PlanningModel.test.ts`, `tests/app/PlanningView.test.tsx`, `tests/integration/messages.test.ts`, `tests/support/planningFixture.ts` ; harnais `scripts/verify-planning.mjs`.

## Tasks & Acceptance

**Execution:**
- [ ] `src/core/sprintPlanning.ts` + tests -- intentions et lecture (8.3, 8.4, 8.5, 8.6, 8.7).
- [ ] `src/app/model/PlanningModel.ts`, `PlanningTypes.ts`, `BoardModel.ts`, `coreText.ts` -- modèle en direct, avis en clés (8.2, 8.9).
- [ ] `src/app/views/planning/PlanningView.tsx`, `planning.css` -- écran (8.2, 8.4, 8.6, 8.7, 8.8).
- [ ] `src/integration/messages.ts`, `injectBoard.ts`, plateforme -- fenêtres natives (8.7, 8.8).
- [ ] `src/i18n` en/es, tests en/es (8.9).
- [ ] `scripts/verify-planning.mjs`, `docs/technique/*`, manuel, CHANGELOG, version.

**Acceptance Criteria:**
- Given un board Scrum avec sprints futurs, when j'ouvre Sprint Planning, then le titre est le sprint préparé avec le menu des sprints futurs, la colonne de gauche regroupe autres sprints futurs, backlog et RAF actif filtrés par la recherche, et les tickets sans objectif suivent les swimlanes.
- Given le paquet (`npm run package`), when il est construit, then aucune entrée, lecture ni écriture du planning n'existe.
- Given un avis du planning, when l'interface est en anglais ou espagnol, then il est traduit (tests en/es).

## Implementation Notes

## Verification

**Commands:**
- `npm run check` -- vert
- `npm run verify:jira` -- vert
- `npm run verify:planning` et `npm run verify:planning:package` -- verts
- `npm run verify:i18n` -- vert

## Design Notes

Déjà fait (non commité, à garder) : `velocity: number | null` dans `SprintGoalDocument` (`sprintGoals.ts`, lecture stricte, `isVelocity`) et sa conservation dans `withTextGoalLink`/`withPinnedGoals`. Ne pas committer : l'orchestrateur committe. Respecter AGENTS.md (français, `t()` + catalogues en/es, pas de données fictives dans `src/`).

**Cœur (`core/sprintPlanning.ts`, remplace la publication groupée).** Lecteur `Pick<JiraClient, "sprint" | "sprints" | "sprintIssues" | "backlogIssues" | "sprintProperty">`, écrivain `JiraWriter`, liens Goals `Pick<GoalsClient, "setLink">`. Résultat commun :

```ts
type PlanningStep = "goalText" | "goalProperty" | "issueAdded" | "issueLinked" | "issueMoved" | "pinned" | "velocity";
type PlanningOutcome =
  | { kind: "done"; confirmed: readonly PlanningStep[] }   // tout relu et confirmé
  | { kind: "unchanged" }                                   // rien à écrire
  | { kind: "refused"; reason: PlanningRefusal }            // rien n'a été écrit
  | { kind: "partial"; confirmed: readonly PlanningStep[]; error: unknown }; // arrêt après une écriture
```

`PlanningRefusal` : `notFuture`, `goalTextChanged`, `goalsChanged`, `invalidGoals`, `issueUnavailable` (+clé), `issueInActiveSprint` (+clé), `issueNotInSprint` (+clé), `velocityChanged`, `invalidVelocity`, `sprintNotClosed`, `failed` (+error : relecture impossible, propriété illisible, taille). Toute erreur levée AVANT le premier `writer.write` donne `refused/failed` ; après, `partial`. Le modèle traite `partial` avec `confirmed: []` et une `BoardWriteRefused` comme « rien n'a été envoyé ».

- `loadSprintPlanning(reader, {boardId, sprintId, query})` → `PlanningSnapshot` : `sprint`, `nativeGoalText`, `rawGoalProperty`, `goals`/`links` (`reconcileSprintGoals` avec `stableGoalIds(sprintId)`), `velocity`, `pinnedGoalIds`, `sprintIssues`, `backlogIssues`, `futureSprints: {sprint, issues}[]` (autres sprints futurs du board, un seul appel `sprints(boardId, ["active","future"])`), `activeSprints: {sprint, issues}[]` (non terminés). Propriété illisible : `CoreError planningUnreadableProperty`.
- `writeTextGoals(reader, writer, {sprintId, baseText, baseProperty, goals, links?, accountId, now})` : relit le sprint (futur, sinon `notFuture` ; `goal` différent de `baseText` : `goalTextChanged`) ; valide les titres (une ligne, sans puce, non vides, distincts sans casse : `invalidGoals`) ; prépare la propriété sur la valeur relue (`prepareSprintGoalUpdate`, zone = objectifs `[id, titre]` de `baseProperty` : `goalsChanged`) AVANT E8 ; E8 seulement si les titres changent (texte Jira gardé si `parseSprintGoalText` identique), relu ; puis `updateSprintGoalProperty` (objectifs suivants : champs stockés gardés par id, titre/position nouveaux ; liens vers objectifs supprimés retirés ; `links` ajoutés), relu par `sameSprintGoalContent`. Ajout, suppression, déplacement, renommage et report texte passent tous par elle.
- `placePlanningIssue(reader, writer, goals, {boardId, sprintId, query, issue, target})`, `target` : `null` | `{kind:"text", goalId, knownGoalId, knownGoalIds, goals}` | `{kind:"atlassian", goalId, previousGoalId}`. Sprint relu futur ; ticket hors du sprint : refus s'il est sous-tâche ou terminé (`issueUnavailable`), relecture des sprints actifs (`issueInActiveSprint`) ; E9 `[clé]`, relu dans `sprintIssues` ; puis lien : `linkToTextGoal` (conflit : `partial`) ou `changeAtlassianGoal` (E4 puis E3). Ticket déjà dans le sprint : lien seulement (changement d'objectif, « Sans objectif »).
- `removePlanningIssue(reader, writer, {boardId, sprintId, query, issueKey, destination: {kind:"backlog"} | {kind:"sprint", sprintId}})` : sprint relu futur, ticket relu dans ce sprint (`issueNotInSprint`), absent des sprints actifs relus ; destination sprint relue future, du board, différente du sprint préparé (`notFuture`). E10 ou E9 ; confirmation : absent du sprint préparé (et présent dans la destination).
- `savePlanningVelocity(reader, writer, {sprintId, base, velocity, accountId, now})` : `isVelocity` ou `null` ; sprint futur ; `updateSprintGoalProperty` avec zone `velocity === base` (`velocityChanged`) ; relu.
- Goals Atlassian : réutiliser `pinAtlassianGoals` (sélection affichée → sélection + id) ; retirer un Goal épinglé = sélection sans lui. Aucune création.
- `carryOverGoals(reader, writer, {boardId, closedSprintId, targetSprintId, query, isDone, mode})` : sprint clos relu (`sprintNotClosed` sinon) ; objectifs du sprint clos (texte : `reconcileSprintGoals` + liens ; Goals : `loadAtlassianSprintGoals` + épinglés) ; non atteint = au moins un ticket lié et pas tous `isDone` (dernière colonne visible du board) ; texte : cible relue, objectifs non atteints ajoutés s'ils n'existent pas (titre sans casse), même id et couleur, liens des tickets liés désormais dans la cible et non terminés, via `writeTextGoals` ; Goals : `pinAtlassianGoals` avec les ids manquants. Ticket envoyé ailleurs : ignoré.

**Modèle.** `PlanningModel` : signaux `sprints` (futurs), `selectedSprintId`, `snapshot`, Goals Atlassian (via `loadAtlassianSprintGoals` quand `configuration.goalSource === "atlassianGoals"`), `loading`, `busy` (geste en cours), `notice`, `error`, `search`. Chaque geste : `context.write(({writer, goals}) => intention(...))`, journal (`record`), avis traduit depuis le résultat (clés), puis relecture du sprint. Au chargement, `platform.store.remove(planningDraftKey(origin))` une fois. `publishing`/`saving` deviennent `busy` dans `BoardModel`, `AppModel` et `Sidebar` (changement de board et auto-rafraîchissement attendent un geste). Le contexte reçoit aussi le lecteur Goals (`#goals`), `openSprintDialog(action, sprint)` et la relecture après fermeture d'une fenêtre native (message `refresh`) : `planning.afterNativeDialog()` reporte si `pendingClosure` et sprint relu clos ; encore actif : rien (annulé).

**Écran.** Grammaire et classes de la page du sprint (`app.css`), sans jauge propre. En-tête : titre = nom du sprint préparé + badge « futur », dates, sélecteur des sprints futurs ; champ « Vélocité de l'équipe » (validé Entrée/sortie, Échap annule) et charge (estimations / vélocité) ; « Clôturer le Sprint N » si un sprint actif ; « Démarrer le Sprint N » désactivé avec sa raison tant qu'un sprint est actif ; recherche `/` partagée par la colonne gauche et les swimlanes. Gauche « Où sont les tickets » : sections repliables par autre sprint futur, Backlog, Reste à faire du sprint actif (consultation, non déplaçable) ; dépôt pour retirer (vers le backlog). Principal : une swimlane par objectif (titre éditable sur place en texte, monter/descendre, supprimer ; Goals : nom, retirer l'épinglage), cartes avec menu ⋯ (objectifs, « Sans objectif », « Renvoyer au backlog », « Vers le Sprint X »), origine « Vient du backlog / du Sprint X » pour les tickets arrivés pendant la séance ; ligne « Ajouter l'objectif » (texte) ou recherche de Goal par nom (`GoalsClient.searchGoals`) ; puis « Sans objectif ». Gestes désactivés pendant `busy`.

**Fenêtres natives.** `PROTOCOL.sprintDialog` (vue → hôte) : `{ action: enum ["complete","start"], sprintName: string ≤ 199 }`, copié entre les marqueurs de `injectBoard.ts`. Hôte : adresse = page courante si son chemin finit par `/boards/<id>`, plus `/backlog`, sans `sprintGoals` ; popin existante ; boutons visibles dont le libellé normalisé vaut exactement `complete sprint|terminer le sprint|completar sprint` (ou `start sprint|demarrer le sprint|iniciar sprint`) ; pour démarrer, garder celui dont le plus proche conteneur ne contenant qu'un tel bouton mentionne `sprintName` ; un seul candidat : clic, attente d'un nouveau `[role=dialog]` stable, isolation (comme `isolateTransitionForm`), fermeture de la popin quand la fenêtre disparaît ; aucun ou plusieurs candidats en 10 s : page montrée à l'utilisateur ; fermeture : `refresh()` vers la vue. Côté vue, un gestionnaire comme `nativeIssueHandler` relaie la demande.
