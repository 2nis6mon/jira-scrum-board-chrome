---
title: 'Story 8.20 — Un seul en-tête d’objectif, avec une barre par état'
type: 'feature'
created: '2026-11-02'
status: 'done'
baseline_commit: 'fbd8f4d27b848a3858717b30642b75e71d99e8e1'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-8-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Le board et le planning jugent l’état d’un ticket par trois règles (dernière colonne pour l’en-tête d’objectif du board et le report, catégorie de statut Jira pour la barre du sprint, la santé, le vieillissement et tout le planning, rien pour les statuts sans colonne, comptés dans un objectif sans jamais être terminés). Les en-têtes d’objectif des deux écrans diffèrent.

**Approach:** Une seule règle d’état dans `core`, par colonnes visibles du board, appliquée partout ; un seul en-tête d’objectif et une barre empilée par état partagés par les deux écrans.

**Décisions de Denis (02/11/2026) :**
- Première colonne visible = « à faire », colonnes du milieu = « en cours », dernière = « terminé ». Jamais la catégorie de statut Jira.
- Option A : un ticket dont le statut n’est dans aucune colonne visible est ignoré partout (ni affiché ni compté), avec l’avis « non affichés, comme dans Jira ».
- Tous les calculs d’état passent aux colonnes dans cette story : barre et chiffres du sprint, santé, vieillissement, sous-tâches, reste à faire d’un sprint actif du planning.
- Barre : gris à faire, bleu en cours, vert terminé, proportionnelle aux points (aux tickets sans points) ; les pastilles de 8.16 deviennent sa légende.

## Boundaries & Constraints

**Always:** une seule fonction de `core` pour l’état ; aucune lecture ni écriture ajoutée ; valeurs de la barre en texte (légende, survol, texte masqué), rien par la couleur seule ; textes en `t()` en, es.

**Never:** catégorie de statut pour juger un état, sauf les règles de Jira lui-même (refus d’ajouter au sprint un ticket résolu ou une sous-tâche : `canJoinSprint`, gardes de `placePlanningIssue`/`removePlanningIssues`), les bloquants (souvent hors du board) et la couleur de la pastille de statut (affichage de Jira). Pas de déjà livré dans la barre (8.21), pas de masquage du backlog ni des sprints futurs (8.22).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Trois colonnes | statuts en 1re, 2e, 3e colonne | à faire, en cours, terminé | — |
| Catégorie trompeuse | « Recette » catégorie done en colonne du milieu | en cours, pas terminé | — |
| Sans colonne | « Annulé » rattaché à l’objectif | ni dans n/N, ni barres, ni santé ; objectif atteignable ; avis | — |
| Deux colonnes / une colonne | board minimal | pas d’en cours / tout terminé | — |
| Sans points | aucun ticket estimé | barre et texte en tickets | — |
| Objectif vide | 0 ticket (ou que des sans-colonne) | « Aucun ticket rattaché » sur les deux écrans | — |

</frozen-after-approval>

## Code Map

- `src/core/columnState.ts` (nouveau) -- `ColumnState`, `columnStates(columns)` (`ofColumn`, `ofStatus`, `doneStatusIds`), tallies par état. Base : `visibleColumns` (`boardConfiguration.ts:267`).
- `src/core/boardIssue.ts` -- `goalProgress` (`:181`, retirer le paramètre `lastColumnId` optionnel au profit des états, ajouter la répartition par état, exclure les sans-colonne), `subtaskProgress`/`isSubtaskDone` (`:66`, `:145` ; `Subtask` gagne `statusId`), `sprintMetrics` (`:390`), `snapshotGoalProgress` ; `isIssueDone` disparaît.
- `src/core/boardLayout.ts:138`, `boardPreferences.ts:86`, `sprintHealth.ts` (`:100-135`) -- appels à la règle unique ; santé sans les sans-colonne.
- `src/core/sprintPlanning.ts:111-175` -- `loadSprintPlanning` reçoit les colonnes ; reste à faire actif = statuts mappés hors dernière colonne.
- `src/core/jql.ts:50`, `jiraQuickFilters.ts:36` -- portée planning : `status not in (<statuts de la dernière colonne>)` au lieu de `statusCategory != Done`.
- `src/core/planningProgress.ts:13` -- `progressCategory` supprimé (le déjà livré, `:128-216`, reste à 8.21).
- `src/app/model/PlanningModel.ts` -- états des colonnes de la configuration ; sprint en préparation sans les sans-colonne (lanes, « Sans objectif », charge) et leur nombre pour l’avis ; `lanes.progress` par état ; report (`:1400`) par la règle unique.
- `src/app/views/LaneHeader.tsx` (nouveau, à côté de `GoalMarker.tsx`) -- `LaneHeader`, `GoalProgressSummary`, `StateBar`.
- `src/app/views/board/BoardView.tsx` -- en-tête de swimlane (`:1236-1326`), `SprintProgress` (`:609`) en barre par état, `kanbanDone`, objectifs atteints (`:269`).
- `src/app/views/board/IssueCard.tsx` -- sous-tâches et vieillissement par état ; prop `lastColumnId` → `columnStates` (aussi `settings/CardPreview.tsx`).
- `src/app/views/planning/PlanningView.tsx` -- `PlanningLane` (`:1088`), `LaneProgress` (`:1209`, déjà livré gardé à part), `SprintLoad` (`:678`) au gabarit `StateBar`, avis des sans-colonne.
- Styles : `tokens.css` (couleurs d’état), `app.css` (`.state-bar`, `.lane-progress`), `planning.css` (pastilles).
- Tests : `boardIssue`, `subtasks`, `sprintHealth`, `boardLayout`, `boardSync`, `jql`, `jiraQuickFilters`, `sprintPlanning`, `PlanningModel`, `PlanningView`, `BoardView`/`Workspace` ; bancs `planningFixture` (statut 5 sans colonne), `scripts/verify-planning.mjs`.

## Tasks & Acceptance

**Execution:**
- [x] `src/core/columnState.ts` + tests -- règle unique, matrice ci-dessus.
- [x] `core` board (`boardIssue`, `boardLayout`, `boardPreferences`, `sprintHealth`) + tests -- états par colonnes, sans-colonne exclus.
- [x] `core` planning (`sprintPlanning`, `jql`, `jiraQuickFilters`, `planningProgress`) + tests.
- [x] Modèle du planning + tests -- états, avis, report.
- [x] Vues partagées, board, planning, styles, i18n + tests.
- [x] `scripts/verify-planning.mjs`, `docs/technique/invariants.md` (règle d’état), CHANGELOG, version 0.47.0, `sprint-status.yaml`.

**Acceptance Criteria:**
- Given le board et le planning du même sprint, when un objectif est affiché, then il montre le même en-tête (marqueur atteint, n/N terminés · x/y pts, barre empilée, légende).
- Given le paquet, when il est construit, then rien du planning n’y figure (`verify:planning:package`) ; le board y a la nouvelle barre.

## Implementation Notes

- Implémenté directement (mode autonome, sous-agents non demandés).
- `columnStates` part de l'identifiant de colonne déjà calculé (`BoardIssue.columnId`) pour le board et du statut pour le planning ; les sous-tâches gagnent `statusId`.
- La catégorie de statut reste pour : `canJoinSprint` et les gardes d'ajout au sprint (refus de Jira), les bloquants, la couleur de la pastille de statut, le drapeau `isDone` des colonnes (réglage persisté, non utilisé pour l'état) et le déjà livré (8.21).
- Planning : le nombre de tickets de la swimlane ne répète plus les points, donnés par « n/N terminés · x/y pts » comme sur le board.
- Banc du modèle du planning : colonnes du board 7 (« Revue » en cours) au lieu des colonnes génériques.

## Spec Change Log

## Review Triage Log

Passe 1, faite sans sous-agent (chasse aveugle, cas limites, trous de vérification) :
- Ticket du sprint en préparation sans colonne : invisible, donc impossible à retirer depuis le planning. — low, rejeté : décision A de Denis (comme le board Jira) ; l'avis le signale, la fiche Jira reste le recours.
- Portée JQL des filtres rapides avec `statusCategory != Done` : un ticket de sprint clos en colonne du milieu mais catégorie done était exclu à tort. — medium, patch : `status not in (<dernière colonne>)`, identifiants numériques seulement, test d'injection.
- Cas « sans points » et « aucun ticket » de la barre non testés. — low (trou de vérification), patch : `tests/app/LaneHeader.test.tsx`.
- Règle CSS en double sur la largeur de la barre du sprint (lint). — low, patch.
- Pas de scénario Chrome dédié à la barre empilée. — low, rejeté : couverte par les tests de vue, `verify:planning` (640/390 px) et `verify:jira` passent avec le nouvel en-tête.

## Verification

**Commands:**
- `npm run check`, `npm run verify:jira`, `npm run verify:planning`, `npm run verify:planning:package`, `npm run verify:i18n` -- verts
