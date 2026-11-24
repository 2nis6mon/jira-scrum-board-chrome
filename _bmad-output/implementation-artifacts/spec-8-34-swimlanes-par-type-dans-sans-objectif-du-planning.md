---
title: 'Story 8.34 — Voir les swimlanes par type dans « Sans objectif » du planning'
type: 'feature'
created: '2026-11-24'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-8-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Dans le Sprint Planning, la partie « Sans objectif » du sprint en préparation est une liste plate : on ne retrouve pas le classement par type (Build, RUN, etc.) que les réglages du board définissent et que le Sprint Board montre.

**Approach:** Demande de Denis du 24/11/2026. « Sans objectif » est découpée en sous-sections, une par swimlane de type des réglages du board, dans l'ordre du board (`settingsLaneOrder`), avec nom et nombre de tickets. Les sous-sections sans ticket (ou entièrement masquées par les filtres) ne sont pas affichées. Les gestes sur les cartes, les totaux, la charge, l'avancement et les filtres sont inchangés ; déposer sur « Sans objectif » reste un dépôt sur toute la section. Aucune lecture ni écriture Jira, aucune écriture des réglages.

</frozen-after-approval>

## Implementation Notes

- `core/planningLanes.ts` : `splitByTypeLane(configuration, items)` (pur) range chaque ticket dans la swimlane de son type (`swimlaneOfType`) ; un type sans swimlane, ou ignoré, va dans Build (nom `buildSectionLabel`), pour ne perdre aucun ticket du sprint. Ordre : `settingsLaneOrder`. Sous-sections vides omises.
- Choix faits seuls : une swimlane masquée sur le board reste affichée (le planning montre tout le sprint) ; sous-sections non repliables ; en-têtes de sous-sections omis quand Build est seule (rendu inchangé pour un board sans swimlane de type) ; aucun nouveau texte (nom de la swimlane, compteur existant).
- `PlanningModel.unassignedLanes` (computed) dérive de `unassigned` ; `unassigned` reste la liste plate (compteurs, sélection). Plage Maj+clic : clés de la sous-section.
- `PlanningView.tsx` (`UnassignedLane`) rend les sous-sections ; style dans `planning.css`.
- Tests : `tests/core/planningLanes.test.ts`, `PlanningModel.test.ts`, `PlanningView.test.tsx`. `verify:planning` : sous-sections sur le banc.
- Docs : `invariants.md`, `CHANGELOG.md`, version 0.51.0. Manuel et guides EN/ES non touchés : Sprint Planning n'y figure pas (expérimental, hors paquet). `verify:planning` : le banc n'a que des tickets Story, il constate la cohérence sous-sections / cartes (rendu plat) ; le multi-swimlanes est couvert par `PlanningModel.test.ts`, `PlanningView.test.tsx` et `planningLanes.test.ts`.
- Vérifications : `npm run check` (2048 tests), `verify:planning`, `verify:jira` verts.

## Retour du 24/11/2026 (0.51.1)

Denis : les sous-sections doivent être le même composant de swimlane que sur le board, avec pliage. Fait : `TypeLane` (`PlanningView.tsx`) réutilise `LaneHeader`, le chevron `lane-toggle` et « Par défaut » du board, y compris pour Build seule (le rendu plat disparaît). Repli : `PlanningModel.collapsedTypeLanes` / `toggleTypeLane`, le temps de la séance (choix fait seul : pas de lien avec `collapsedBlockIds` du board, ni préférence persistée). Une carte sélectionnée dans une sous-section repliée reste sélectionnée. `verify:planning` plie et déplie la sous-section du banc. `npm run check` (2050 tests), `verify:planning`, `verify:jira` verts.

## Retour du 24/11/2026 (0.52.0)

Denis : ajouter aux swimlanes par type l'avancement d'un objectif (« n/N terminés · x/y pts », barre, légende), sur le Sprint Board et dans le Sprint Planning. Fait : `Lane.tally` (`boardLayout.ts`, Build et swimlanes par type du board), `PlanningTypeLane.issueCount` / `progress` (`PlanningModel.unassignedLanes`, recherche et filtres ignorés) ; les deux en-têtes passent `progress` à `LaneHeader`. Tests : `boardLayout.test.ts`, `Workspace.test.tsx`, `PlanningModel.test.ts`, `PlanningView.test.tsx`. Cela étend la story 8.34 hors Sprint Planning (board) : choix fait sur demande explicite.

## Review Triage Log

Relecture faite sans sous-agent (rythme de l'Epic 8).

| # | Constat | Verdict | Suite |
|---|---------|---------|-------|
| 1 | Sans `configuration()`, `unassignedLanes` renvoie une sous-section Build au nom codé « Build ». | low | Rejeté : la vue la rend à plat (Build seule), le nom n'est pas affiché ; cas sans board chargé. |
| 2 | Un titre `h4` dans la cellule de la section peut perturber la sélection Maj+clic. | false | `sectionKeys` ne contient que les clés de la sous-section ; le titre n'est pas une carte. |
| 3 | Un ticket de type ignoré s'affiche alors que le board l'exclut. | false | Voulu : le planning garde aujourd'hui tous les tickets du sprint ; il rejoint Build. |
