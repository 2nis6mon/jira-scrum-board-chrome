---
title: 'Story 8.23 — Ne plus voir les tickets terminés du sprint en préparation'
type: 'feature'
created: '2026-11-02'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/spec-8-22-plus-de-tickets-termines-dans-ou-sont-les-tickets.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Essai de Denis du 02/11/2026 sur le sandbox : le sprint en préparation montre des tickets de la dernière colonne du board. La 8.22 les avait gardés (« le sprint en préparation ne change pas »).

**Approach:** Appliquer au sprint en préparation la règle de la 8.22 : un ticket dont le statut est dans la dernière colonne visible du board, comme un statut sans colonne, n'y est ni affiché ni compté (swimlanes, « Sans objectif », charge, avancement des objectifs, filtres, sélection, compteur « n / N tickets »).

**Décision de Denis (02/11/2026) :** « Les masquer aussi » : ni affichés, ni comptés dans la charge ; remplace, pour le sprint en préparation, la décision de la 8.22.

</frozen-after-approval>

## Implementation Notes

- Filtre au niveau du modèle (`PlanningModel.#sprintItems`), pas dans `loadSprintPlanning` : `snapshot.sprintIssues` reste complet pour ce qui n'est pas de l'affichage (gardes des gestes, Goals Atlassian, exclusion du « déjà livré », relectures).
- Avancement des objectifs : la partie « terminé » ne vient plus que du déjà livré des sprints précédents (8.21) ; un ticket terminé du sprint en préparation n'est pas basculé dans le déjà livré (choix fait seul, à signaler).
- `unmappedCount` (avis « non affichés, comme dans Jira ») reste limité aux statuts sans colonne ; les tickets terminés disparaissent sans avis, comme en 8.22 (choix fait seul).
- Fichiers : `PlanningModel.ts` (`shownInSprint`, `#sprintItems`, `sprintIssueCount`, `planningIssues` et `selectable` avec les états de colonnes, élagage de la sélection à la relecture), `PlanningTypes.ts`, `PlanningView.tsx` (total du compteur), test de modèle (échoue sans le changement).

## Review Triage Log

Passe 1, faite sans sous-agent (couche Blind Hunter non lancée, mode autonome) :
- Objectif dont tous les tickets du sprint sont terminés, sans déjà livré : affiché vide au lieu d'atteint. — low, accepté : conséquence directe de « ni comptés » ; à signaler à Denis.
- Glisser un lot : `PlanningView` lit `snapshot.sprintIssues` pour savoir si le lot est dans le sprint. — false : un ticket masqué n'est plus sélectionnable ni affiché, il ne peut pas faire partie d'un lot.
- Ticket sélectionné qui passe dans la dernière colonne : `selectable` reçoit désormais les états de colonnes, la relecture le retire de la sélection, sans avis (comme 8.22).

## Verification

**Commands:**
- `npm run check`, `npm run verify:jira`, `npm run verify:planning`, `npm run verify:planning:package` -- verts
