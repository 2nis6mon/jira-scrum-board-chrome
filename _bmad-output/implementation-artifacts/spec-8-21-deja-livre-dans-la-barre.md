---
title: 'Story 8.21 — Le déjà livré dans la partie terminée de la barre'
type: 'feature'
created: '2026-11-02'
status: 'done'
baseline_commit: '80e3d9ec964c38f1cb5a9bb67a313c3e7bc7684b'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-8-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Le déjà livré d’un objectif (story 8.16) s’affiche à part (« Déjà livré : 2 tickets · 8 pts ») ; Denis le veut dans la partie « Terminé ». Il se lit aussi avec la catégorie de statut Jira, contraire à la règle d’état par colonnes (8.20).

**Approach:** Dans l’en-tête commun (8.20), le déjà livré devient un segment vert hachuré à la suite du terminé, mentionné par la légende de « Terminé » ; il suit la règle de la dernière colonne visible, en texte comme en Goals Atlassian.

**Décisions de Denis (02/11/2026) :** déjà livré dans « Terminé » ; segment hachuré (proposition de la table acceptée) ; « terminé » = dernière colonne visible du board.

## Boundaries & Constraints

**Always:** charge, vélocité et « n/N terminés · x/y pts » ne comptent que le sprint en préparation ; seule la largeur des segments tient compte du déjà livré ; lecture incomplète toujours signalée ; lectures seules ; textes en `t()` en, es.

**Never:** déjà livré sur le board ; catégorie de statut ; écriture.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Déjà livré | 3 terminés 5 pts, déjà livré 2 · 8 pts | segment hachuré après le vert ; légende « Terminé : 3 tickets · 5 pts, plus déjà livré : 2 tickets · 8 pts » ; plus de mention à part | — |
| Totaux | même objectif | « 3/N terminés · 5/x pts », charge inchangée | — |
| Texte | ticket d’un sprint clos en colonne du milieu, catégorie done | pas livré | — |
| Atlassian | JQL | `key in (…) AND status in (<dernière colonne>)` ; sans dernière colonne, aucune lecture | lecture refusée : incomplète |
| Sans déjà livré | — | barre de la 8.20 inchangée | — |

</frozen-after-approval>

## Code Map

- `src/core/planningProgress.ts` -- `textGoalHistory`, `atlassianGoalHistory` : paramètre `doneStatusIds` (statuts de la dernière colonne), JQL `status in (…)`, identifiants numériques seulement.
- `src/app/model/PlanningModel.ts` -- `#readHistory` : `columnStates(configuration.columns).doneStatusIds`, dans la clé de relecture.
- `src/app/views/LaneHeader.tsx` -- `GoalProgressSummary`/`LaneHeader` : `delivered` facultatif (segment `delivered`, légende de « Terminé »).
- `src/app/views/planning/PlanningView.tsx` -- `LaneDelivered` (`:1225`) supprimé, `delivered` passé à l’en-tête ; note « lecture incomplète » (`:987`) gardée.
- Styles `app.css` (segment hachuré, `+n` de la légende) ; i18n en, es.
- Tests : `tests/core/planningProgress.test.ts`, `tests/app/PlanningModel.test.ts`, `tests/app/PlanningView.test.tsx`, `tests/app/LaneHeader.test.tsx` ; banc `planningFixture` (tickets livrés en dernière colonne).

## Tasks & Acceptance

**Execution:**
- [x] `core` + tests -- dernière colonne, JQL.
- [x] Modèle -- statuts terminés.
- [x] Vue partagée, planning, styles, i18n + tests.
- [x] Docs (`integration-jira.md`, `invariants.md`), CHANGELOG, version 0.47.2, `sprint-status.yaml`.

**Acceptance Criteria:**
- Given le paquet, when il est construit, then rien du planning n’y figure (`verify:planning:package`).

## Implementation Notes

- Implémenté directement (mode autonome). Les statuts terminés entrent dans la clé de relecture de l'historique.
- Banc `planningFixture` : les tickets livrés des sprints clos 40 et 41 passent du statut 5 (sans colonne) au statut 6 (dernière colonne).
- Clé de catalogue « Tickets terminés avant ce sprint, hors de sa charge » retirée (plus affichée) ; ajout de « Terminé : {p0}, plus déjà livré : {p1} » en, es.
- Un objectif sans ticket dans le sprint mais avec du déjà livré montre « 0/0 terminés » et la seule part hachurée, au lieu de « Aucun ticket rattaché ».

## Spec Change Log

## Review Triage Log

Passe 1, faite sans sous-agent :
- Statut terminé injecté dans le JQL des Goals Atlassian. — false : seuls des identifiants numériques passent, comme pour la portée des filtres rapides.
- Sans dernière colonne (configuration vide), le déjà livré Atlassian lirait tout. — false : aucune lecture, déjà livré vide (test).
- Objectif vide avec déjà livré : « 0/0 terminés » peu parlant. — low, rejeté : cas rare (objectif reporté dont tous les tickets ont été retirés du sprint) ; la légende dit le déjà livré.
- Largeur de la barre en points quand le déjà livré a des points mais pas le sprint. — false : `weight` additionne les points du déjà livré avant de choisir l'unité.

## Verification

**Commands:**
- `npm run check`, `npm run verify:jira`, `npm run verify:planning`, `npm run verify:planning:package`, `npm run verify:i18n` -- verts
