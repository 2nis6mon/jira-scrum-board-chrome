---
title: 'Story 8.22 — Ne plus voir les tickets terminés dans « Où sont les tickets »'
type: 'bugfix'
created: '2026-11-02'
status: 'done'
baseline_commit: '7e56dedf55977962347ece16d5b13fffe1b46d54'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-8-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Essai du 02/11/2026 : la colonne « Où sont les tickets » montre des tickets annulés ou terminés que le backlog Jira ne montre pas. `GET /rest/software/1.0/board/{id}/backlog` renvoie aussi les tickets de la dernière colonne, que l’écran de Jira masque ([base de connaissances Atlassian](https://support.atlassian.com/jira/kb/done-or-resolved-issues-appear-in-a-scrum-board-backlog/)) ; le planning n’avait aucun filtre.

**Approach:** Appliquer la règle d’état unique de la story 8.20 à la lecture du planning : backlog et autres sprints futurs ne gardent que les tickets dont le statut est dans une colonne visible autre que la dernière, comme le reste à faire actif.

**Décisions de Denis (02/11/2026) :** ne plus voir les tickets de la dernière colonne, backlog et sprints futurs compris ; un statut sans colonne visible est masqué aussi (option A de la 8.20) ; le sprint en préparation ne change pas.

## Boundaries & Constraints

**Always:** règle `columnStates` (8.20), appliquée une fois dans `loadSprintPlanning` ; aucune lecture ni écriture ajoutée ; compteurs, filtres et sélection ne voient que les tickets affichés.

**Never:** masquer un ticket terminé du sprint en préparation ; utiliser la catégorie de statut ; avis pour un ticket qui disparaît.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Backlog | ticket « Terminé » (dernière colonne) | masqué | — |
| Catégorie trompeuse | « Recette » catégorie done, colonne du milieu | affiché, en consultation (`canJoinSprint`) | — |
| Sans colonne | « Annulé » non rattaché | masqué | — |
| Sprint futur | ticket de la dernière colonne | masqué | — |
| Sélectionné puis terminé | ticket sélectionné passe en dernière colonne | disparaît de la colonne et de la sélection à la relecture, sans avis | — |
| Sprint en préparation | ticket terminé du sprint | toujours visible et compté | — |

</frozen-after-approval>

## Code Map

- `src/core/sprintPlanning.ts:158-186` -- `loadSprintPlanning` : filtre `remaining` (déjà pour le reste à faire actif) appliqué à `backlogIssues` et aux tickets de `futureSprints`.
- `src/app/model/PlanningModel.ts` -- `sections`, `filterOptions`, élagage de la sélection : lisent le snapshot, rien à changer.
- Tests : `tests/core/sprintPlanning.test.ts` (lecture), `tests/app/PlanningModel.test.ts` (colonne, sélection) ; banc `planningFixture`.

## Tasks & Acceptance

**Execution:**
- [x] `src/core/sprintPlanning.ts` + tests core -- matrice.
- [x] Tests du modèle -- sections et sélection.
- [x] Backlog (élément « À investiguer » coché), CHANGELOG, version 0.47.1, `sprint-status.yaml`.

**Acceptance Criteria:**
- Given le paquet, when il est construit, then rien du planning n’y figure (`verify:planning:package`).

## Implementation Notes

- Implémenté directement (mode autonome). Un seul filtre dans `loadSprintPlanning`, partagé avec le reste à faire actif : sections, options de filtre et élagage de la sélection lisent le snapshot filtré.

## Spec Change Log

## Review Triage Log

Passe 1, faite sans sous-agent :
- Un ticket masqué reste-t-il proposable par une écriture (lot, menu) ? — false : les gestes partent des cartes affichées (`locate` sur le snapshot filtré) et chaque écriture relit Jira.
- Portée JQL des filtres rapides plus large que l'affichage (statuts sans colonne non exclus) — false : le résultat est croisé avec les tickets affichés.
- Pas de test de la sélection d'un ticket qui devient terminé — low, rejeté : l'élagage à chaque relecture est déjà testé (8.15) et lit le même snapshot.

## Verification

**Commands:**
- `npm run check`, `npm run verify:jira`, `npm run verify:planning`, `npm run verify:planning:package` -- verts
