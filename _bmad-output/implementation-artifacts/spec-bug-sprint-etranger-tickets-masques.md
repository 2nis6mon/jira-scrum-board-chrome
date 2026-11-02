---
title: 'Bug — Sprint d’un autre board dont tous les tickets du board sont masqués, encore affiché'
type: 'bugfix'
created: '2026-11-02'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/spec-bug-sprint-vide-d-un-autre-board.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Constaté par Denis le 02/11/2026 après 0.48.1, sur le sandbox (board 3013) : le sprint futur 3334 « APP : Backlog tech/dette » (`originBoardId` 1569) reste proposé dans le Sprint Planning. Vu du board, il contient deux tickets `Closed`, dans la dernière colonne (« Validé Squad ») : masqués depuis la 8.22, ils font paraître le sprint vide sans qu’il soit écarté, car 0.48.1 jugeait « vide » sur tous les tickets lus.

**Approach:** Un sprint d’un autre board est « vide » quand aucun de ses tickets vus depuis le board n’est restant au sens de la 8.22 (statut dans une colonne visible autre que la dernière, règle `columnStates`). Même règle pour le menu des sprints (`withoutEmptyForeignSprints`) et pour la colonne, les destinations et la clôture (`loadSprintPlanning`), sans lecture en plus. Un sprint du board, même vide ou terminé, reste proposé ; lecture en échec : sprint gardé.

**Décision de Denis (02/11/2026) :** ne pas afficher un sprint vide qui n’appartient pas au board ; correctif proposé le 02/11 (juger « vide » sur les tickets à faire ou en cours selon les colonnes) et poursuivi à sa demande.

</frozen-after-approval>

## Implementation Notes

- `src/core/sprintPlanning.ts` : `withoutEmptyForeignSprints` reçoit les colonnes du board ; un prédicat commun `isRemaining(states)` sert au filtre `remaining` (8.22), au filtre `shown` des sprints étrangers et au menu.
- `src/app/model/PlanningModel.ts` : passe `configuration.columns`.
- Sprint actif étranger dont tous les tickets du board sont terminés : ni section ni clôture (même règle que les futurs ; clore depuis ce board un sprint d’une autre équipe n’a pas de sens ici).
- Tests : core (menu et snapshot, ticket terminé et ticket sans colonne) ; banc `planningFixture` : `foreignFutureSprint: "done"`.
- Constat préalable (lectures seules du sandbox, 02/11/2026) : board 3013, sprints futurs étrangers 3334 (origine 1569 : 2 tickets du board, `Closed`), 3707 (origine 1650 : 1 ticket `TO DELIVER IN PROD`), 6269 (origine 2753) ; « Closed » et « TO DELIVER IN PROD » sont dans « Validé Squad », dernière colonne. Hypothèses « extension non rechargée » et « sprint du board » écartées.
- Régressions : les trois nouveaux cas échouent sans le correctif.

## Review Triage Log

Passe 1, faite sans sous-agent (couche Blind Hunter non lancée, mode autonome) :
- Configuration sans colonnes : tout sprint étranger écarté. — low, rejeté : un board Scrum a toujours des colonnes ; le backlog serait aussi vide (8.22), comportement cohérent.
- Sprint actif étranger aux tickets du board tous terminés : plus proposé à la clôture. — false : voulu, même règle que les futurs ; le clore depuis ce board n'a pas de sens.
- Sous-tâche restante dans un sprint étranger : le garde. — low, rejeté : ticket réel du board à faire, le sprint n'est pas vide.

## Verification

**Commands:**
- `npm run check`, `npm run verify:jira`, `npm run verify:planning`, `npm run verify:planning:package` -- verts
