---
title: 'Story 1.2 — Un seul endroit décide où sont stockés les Goals épinglés'
type: 'refactor'
created: '2026-10-30'
status: 'ready-for-dev'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** L'emplacement des Goals épinglés (propriété `sprintgoals.v1` du sprint en Scrum, `boardsettings.v1` du board en Kanban) est choisi à plusieurs endroits selon `boardType` : `BoardSettingsService` (`#saveBoardPinnedGoals`, `editor.sprintId === null`), `BoardModel` (`canPinGoals`, `openPinEditor`) et la vue `SprintGoalsPanel.tsx`.

**Approach:** Un résolveur unique dans `core` choisit le stockage à partir de la configuration et du snapshot, et une fonction de `core` par stockage porte relecture, contrôle de la sélection affichée et écriture ; modèle, service et vue consomment le stockage résolu sans tester `boardType`.

## Boundaries & Constraints

**Always:** Scrum avec sprint actif → propriété du sprint de référence (E5, via `pinAtlassianGoals` de la story 1.1) ; Kanban → `boardPinnedGoalIds` de `boardsettings.v1` (E6) ; Scrum sans sprint actif → indisponible, comme Jira : aucune écriture, éditeur non ouvrable ; une seule tentative ; textes, avis et journal inchangés ; repli local (`keepPinnedLocally`, `localPinnedGoalIds`) réservé au stockage sprint, comme aujourd'hui.

**Never:** changer les formats persistés ; ajouter un choix de sprint (Epic 2) ; modifier la file des réglages (`#teamQueue`, story 1.4) au-delà du nécessaire ; tester `boardType` pour choisir la propriété dans `BoardSettingsService`, `BoardModel` ou une vue (les libellés « board / sprint » d'une vue peuvent suivre le `kind` du stockage résolu).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Scrum, sprint actif | `boardType: scrum`, `snapshot.sprint` 42 | stockage `{kind: "sprint", sprintId: 42}` ; sélection lue = `snapshot.pinnedGoalIds` ; écriture E5 sur le sprint 42 | conflit/refus comme aujourd'hui |
| Kanban | `boardType: kanban` | stockage `{kind: "board", boardId}` ; sélection = `configuration.boardPinnedGoalIds` ; écriture E6 | conflit des réglages comme aujourd'hui |
| Scrum sans sprint actif | `snapshot.sprint === null` | stockage `{kind: "unavailable"}` ; `canPinGoals` faux ; `openPinEditor` et `savePinnedGoals` ne font rien | aucune lecture ni écriture |

</frozen-after-approval>

## Code Map

- `src/core/pinnedGoals.ts` (nouveau) -- `pinnedGoalsStorage(configuration, snapshot)` → `{kind:"sprint", sprintId, sprintName} | {kind:"board", boardId, boardName} | {kind:"unavailable"}` ; `pinnedGoalIdsIn(storage, configuration, snapshot)` (sélection lue, `null` si inconnue) ; `saveBoardPinnedGoals(reader, writer, …)` qui reprend de `BoardSettingsService.#saveBoardPinnedGoals` la relecture de `boardsettings.v1`, le décodage (`decodeTeamDocument`), le contrôle `sameOrder(current, base)`, le cas « rien à changer » et l'appel à `publishTeamSettings`, et renvoie un résultat typé (`pinned` avec document, `unchanged`, `conflict` avec document courant ou `null`). Le stockage sprint réutilise `pinAtlassianGoals` (`core/boardWrites.ts`).
- `src/app/services/BoardSettingsService.ts` -- `savePinnedGoals` aiguille sur `editor.storage.kind` ; le chemin Kanban garde file, garde de péremption/droits du writer, avis, journal et `#applyTeamDocument`, mais délègue relecture/conflit/écriture à `core/pinnedGoals.ts` ; supprimer le test `configuration?.boardType !== "kanban"`.
- `src/app/model/BoardTypes.ts` -- `PinEditor` porte `storage` (le stockage résolu) ; garder `sprintId` seulement s'il reste utile au repli local, dérivé du stockage.
- `src/app/model/BoardModel.ts` -- `canPinGoals` (l. ~199) et `openPinEditor` (l. ~1010) utilisent le résolveur ; conserver les conditions existantes (Kanban : `teamKnown && canEditSettings` ; Scrum : `goalsOrigin === "atlassianGoals"` et sélection connue).
- `src/app/views/settings/SprintGoalsPanel.tsx` -- `pinned` (l. ~40) et les libellés via le stockage résolu exposé par le modèle (par ex. un `computed` `pinStorage`), plus de `boardType`.
- Tests à réutiliser : `tests/app/BoardModel.pin.test.ts`, `tests/app/BoardModel.kanban.test.ts`, `tests/app/services/` ; nouveau `tests/core/pinnedGoals.test.ts`.

## Tasks & Acceptance

**Execution:**
- [ ] `src/core/pinnedGoals.ts` -- résolveur, lecture de la sélection, écriture Kanban -- AD-4 (résolveur unique)
- [ ] `src/app/services/BoardSettingsService.ts` -- déléguer à `core`, aiguiller sur le stockage -- plus de choix par `boardType`
- [ ] `src/app/model/BoardTypes.ts`, `src/app/model/BoardModel.ts` -- `PinEditor.storage`, `canPinGoals`, `openPinEditor`, stockage exposé -- idem
- [ ] `src/app/views/settings/SprintGoalsPanel.tsx` -- consommer le stockage résolu -- idem
- [ ] `tests/core/pinnedGoals.test.ts` -- trois cas de la matrice + conflit/unchanged Kanban -- CAP-2
- [ ] `tests/guards/sources.test.ts` -- garde : `BoardSettingsService.ts` et `src/app/views/**` ne contiennent pas `boardType` à côté de `PinnedGoalIds`/`pinEditor` (ou plus simplement : `BoardSettingsService.ts` ne mentionne plus `boardType`) -- régression
- [ ] `_bmad-output/planning-artifacts/architecture/architecture-sprint-goals-board-2026-10-27/ARCHITECTURE-SPINE.md` -- retirer l'écart AD-4 « Choix de la propriété des Goals épinglés » ; `CHANGELOG.md` (entrée sous la version en cours 0.36.2, sans nouvelle version)

**Acceptance Criteria:**
- Given les tests existants d'épinglage Scrum et Kanban, when `npm run check` tourne, then ils passent sans modification d'attente (comportement visible inchangé).
- Given `npm run verify:settings`, when il tourne, then il passe.

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `npm run check` -- expected: vert
- `npm run verify:settings` -- expected: vert
- `npm run verify:jira` -- expected: vert
