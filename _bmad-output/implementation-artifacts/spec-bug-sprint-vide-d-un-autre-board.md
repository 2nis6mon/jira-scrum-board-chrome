---
title: 'Bug — Sprint vide d’un autre board affiché dans le Sprint Planning'
type: 'bugfix'
created: '2026-11-02'
status: 'done'
baseline_commit: '350a5332c4ec0954b7bf8791676c3357cbb3ff25'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-8-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Signalé par Denis le 02/11/2026 : le Sprint Planning montre des sprints d’un autre board qui ne contiennent aucun ticket du board ; ils encombrent le menu des sprints, la colonne « Où sont les tickets » et les destinations.

**Approach:** Un sprint appartient au board si son `originBoardId` (API Agile) est celui du board, ou s’il est absent (rien ne prouve le contraire, règle `isForeignSprint`). Un sprint d’un autre board sans aucun ticket lu par la route des tickets du board n’est proposé nulle part dans le planning.

**Décision de Denis (02/11/2026) :** ne pas afficher un sprint vide qui n’appartient pas au board dans le Sprint Planning.

## Boundaries & Constraints

**Always:** lectures seules (route des tickets d’un sprint vue depuis le board, champs réduits) ; un sprint du board, même vide, reste proposé ; lecture en échec : le sprint reste (indécidable, comme pour les droits) ; une fonction de `core`.

**Never:** écriture ; masquer un sprint d’un autre board qui contient des tickets du board ; toucher au Sprint Board.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Sprint futur étranger vide | `originBoardId` ≠ board, 0 ticket du board | absent du menu des sprints, de la colonne, de « Vers {sprint} » | — |
| Sprint futur étranger non vide | 1 ticket du board | proposé comme aujourd’hui | — |
| Sprint du board vide | `originBoardId` = board, ou absent | proposé (c’est souvent le sprint à préparer) | — |
| Sprint actif étranger vide | 0 ticket du board | ni section en consultation ni clôture | — |
| Lecture refusée | tickets du sprint illisibles | sprint gardé | — |

</frozen-after-approval>

## Code Map

- `src/core/boardIssue.ts:331` -- `isForeignSprint` (règle existante, réutilisée).
- `src/core/sprintPlanning.ts` -- nouvelle `withoutEmptyForeignSprints(reader, input)` pour le menu ; `loadSprintPlanning` (`:150-190`) écarte, après lecture, les sprints futurs et actifs étrangers sans ticket (clôture comprise).
- `src/app/model/PlanningModel.ts:411` -- `#loadSprintsAndSelection` : après le filtre des droits.
- Tests : `tests/core/sprintPlanning.test.ts`, `tests/app/PlanningModel.test.ts` ; banc `planningFixture` (option sprint étranger vide).

## Tasks & Acceptance

**Execution:**
- [x] `core` + tests -- matrice.
- [x] Modèle + tests -- menu, colonne, destinations, clôture.
- [x] `integration-jira.md` (lecture), `invariants.md`, backlog, CHANGELOG, version 0.48.1.

**Acceptance Criteria:**
- Given le paquet, when il est construit, then rien du planning n’y figure.

## Implementation Notes

- Implémenté directement (mode autonome). Snapshot : filtre après lecture des tickets déjà faite (aucune lecture en plus). Menu : `withoutEmptyForeignSprints`, une lecture par sprint étranger (champ `status`), après le filtre des droits.
- Banc : `foreignFutureSprint` porte désormais un ticket du board ; `"empty"` pour le sprint vide.

## Spec Change Log

## Review Triage Log

Passe 1, faite sans sous-agent :
- Coût : une lecture de plus par sprint étranger à chaque chargement du menu. — low, rejeté : champs réduits, peu de sprints étrangers ; à mesurer en 8.10 avec le reste.
- Sprint étranger dont tous les tickets sont terminés : non vide, gardé. — false : « vide » = aucun ticket du board ; ses tickets terminés sont déjà masqués de la colonne (8.22).
- Sprint en préparation devenu vide et étranger : sélection perdue. — false : la sélection passe au premier sprint proposé, comme pour un sprint non modifiable (test existant).

## Verification

**Commands:**
- `npm run check`, `npm run verify:jira`, `npm run verify:planning`, `npm run verify:planning:package` -- verts
