---
title: 'Bug — Le planning ne propose que les sprints que l’utilisateur peut modifier'
type: 'bugfix'
created: '2026-11-02'
status: 'done'
baseline_commit: 'd6fb70c711f517de757a0f466c80f2ac7892a516'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-8-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Essai du 02/11/2026 : le menu des sprints à préparer propose un sprint d’un autre board, remonté par le filtre, que l’utilisateur ne peut pas modifier. Ajouter un objectif texte échoue alors avec « Only a Jira administrator can update this sprint ».

**Approach:** Lire, avant de proposer un sprint, si l’utilisateur peut le modifier. Jira exige « Gérer les sprints » sur tous les projets du board d’origine du sprint (`originBoardId`), ou l’administration de Jira. Les sprints refusés ne sont proposés nulle part ; les cas indécidables restent proposés.

**Décisions (Denis, 02/11/2026, reprises du backlog ; mode autonome pour le reste) :**
- Ne proposer que les sprints modifiables, et non seulement ceux du board.
- Même règle pour le menu des sprints à préparer, les autres sprints futurs de la colonne « Où sont les tickets », les cibles « Vers {sprint} » et les sprints actifs proposés à la clôture.
- Cas indécidable (sprint sans `originBoardId`, board sans projet référencé, lecture refusée ou en échec) : le sprint reste proposé, et le refus de Jira s’affiche au premier geste.
- Un sprint futur non modifiable disparaît de la colonne de gauche avec ses tickets (ce sont ceux d’une autre équipe). Un sprint actif non modifiable reste visible en consultation (reste à faire), mais n’est plus proposé à la clôture.
- Aucun sprint futur modifiable : l’écran dit « Aucun sprint futur que vous pouvez modifier ».

## Boundaries & Constraints

**Always:** lectures seules ; contrats vérifiés dans l’OpenAPI Atlassian (02/11/2026) : `GET /rest/agile/1.0/board/{boardId}/project` (`values[].key`, pagination `startAt`/`isLast`) et `GET /rest/api/3/mypermissions?permissions=…&projectKey=…` (`permissions.<CLÉ>.havePermission`, une clé de projet par requête, permissions globales indépendantes du contexte). Clés : `MANAGE_SPRINTS_PERMISSION`, `ADMINISTER`. Lectures mises en cache pendant le chargement du planning, relues à l’actualisation et au changement de board. Lecture refusée ou en échec : pas d’erreur affichée, sprint gardé.

**Never:** aucune écriture, aucun nouvel hôte ni droit Chrome ; pas de lecture par ticket ; pas de changement du Sprint Board (hors planning).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Sprint d’un autre board sans droit | `originBoardId` 9, projets [XYZ], pas de MANAGE_SPRINTS sur XYZ | absent du menu, de la colonne de gauche et des cibles « Vers » | — |
| Droit sur tous les projets | origine 7, projets [ABC], droit sur ABC | proposé | — |
| Droit sur une partie des projets | projets [ABC, XYZ], droit sur ABC seulement | non proposé | — |
| Administrateur Jira | ADMINISTER accordé | tous proposés, aucune lecture par projet | — |
| Indécidable | `originBoardId` absent, ou board sans projet, ou lecture en 403/échec | proposé | aucune erreur affichée |
| Sprint actif non modifiable | sprint actif d’un autre board | reste en consultation, absent de la clôture | — |
| Aucun futur modifiable | seuls des sprints refusés | message « Aucun sprint futur que vous pouvez modifier » | — |
| Sprint sélectionné devenu refusé | relecture | le premier sprint modifiable est sélectionné | — |

</frozen-after-approval>

## Code Map

- `src/jira/client.ts` -- ajouter `boardProjectKeys(boardId)` (pagination comme `quickFilters`, garde `assertEntityId`) et `myPermissions(keys, projectKey?)` qui rend `Record<clé, boolean>` ; décodage défensif (`isRecord`).
- `src/core/sprintPermissions.ts` (nouveau) -- `editableSprintIds(reader, sprints, cache?)` : lit `ADMINISTER` (global) une fois ; sinon, par `originBoardId` distinct, ses projets puis `MANAGE_SPRINTS_PERMISSION` par projet ; rend l’ensemble des sprints proposables (modifiables ou indécidables). Pas de DOM ni `chrome.*`. Cache par `originBoardId` et par projet fourni par l’appelant.
- `src/core/sprintPlanning.ts` -- `loadSprintPlanning` : option `proposable?: (sprint) => boolean` qui retire des `futureSprints` les sprints refusés (le sprint en préparation n’est pas concerné). `removePlanningIssue` : refuser `notFuture` si la cible n’est pas proposable (même prédicat passé en entrée).
- `src/app/model/PlanningModel.ts` -- `#loadSprintsAndSelection` (l. ~325) : filtre des sprints futurs par `editableSprintIds` ; cache vidé dans `refresh()` et `reset()`. Nouveau signal calculé `closableSprints` (actifs proposables) utilisé par la vue pour la clôture ; `activeSprints` reste pour « Démarrer » et la consultation. Signal `hiddenSprintCount` ou booléen pour le message « aucun modifiable ».
- `src/app/model/PlanningTypes.ts` -- exposer `closableSprints` et l’indicateur « aucun sprint modifiable ».
- `src/app/views/planning/PlanningView.tsx` -- `PlanningHeader` (l. ~345) : bouton/menu de clôture sur `closableSprints` ; état vide (l. ~116) : nouveau message.
- `src/i18n/board.ts`, `src/i18n/es/board.ts` -- nouveau texte.
- `tests/support/planningFixture.ts` -- option `foreignFutureSprint` : sprint futur 46, `originBoardId` 9, routes projets des boards 7 et 9 et `mypermissions` réglables.
- `tests/jira/client.planning.test.ts`, `tests/core/sprintPermissions.test.ts` (nouveau), `tests/app/PlanningModel.test.ts`, `tests/app/PlanningView.test.tsx`.

## Tasks & Acceptance

**Execution:**
- [x] `src/jira/client.ts` + `tests/jira/client.planning.test.ts` -- deux lectures, chemins et paramètres exacts, pagination, décodage.
- [x] `src/core/sprintPermissions.ts` + `tests/core/sprintPermissions.test.ts` -- une ligne de la matrice par test au niveau `core`.
- [x] `src/core/sprintPlanning.ts` + `tests/core/sprintPlanning.test.ts` -- filtre des sprints futurs et refus d’une cible non proposable.
- [x] `src/app/model/PlanningModel.ts`, `PlanningTypes.ts` + `tests/app/PlanningModel.test.ts` -- menu, colonne, cibles, clôture, sélection, cache.
- [x] `src/app/views/planning/PlanningView.tsx` + `tests/app/PlanningView.test.tsx` -- clôture sur les seuls sprints proposables, message vide.
- [x] `src/i18n/*` -- textes en, es.
- [x] `tests/harness/harness.tsx` -- routes de droits du banc fictif (tout accordé par défaut) pour que `verify:planning` reste vert.
- [x] `docs/technique/integration-jira.md` (lectures de droits du planning), `_bmad-output/planning-artifacts/backlog.md` (bug coché), `CHANGELOG.md`, version 0.43.1.

**Acceptance Criteria:**
- Given un board dont tous les sprints sont modifiables, when le planning s’ouvre, then il se comporte comme avant, avec au plus une lecture `mypermissions` globale plus une par projet du board.
- Given un sprint refusé, when l’utilisateur cherche à y agir, then aucune écriture n’est possible depuis l’écran.

## Implementation Notes

- Implémenté directement (sans sous-agent : mode autonome demandé, sous-agents non demandés). Nom retenu : `proposableSprintIds` dans `src/core/sprintPermissions.ts`, cache `SprintPermissionCache` (lectures en promesses partagées, `null` = indécidable).
- Écart assumé avec le Code Map : le filtre passe par l'option `proposable` de `loadSprintPlanning`, appliquée AVANT la lecture des tickets (un sprint futur refusé n'est pas lu) ; le snapshot porte `closableSprintIds`. `removePlanningIssue` n'est pas modifié : le modèle ne propose que les `futureSprints` filtrés, seule entrée vers ce geste.
- Le banc fictif (`planningFixture`) répond aux lectures de droits (ABC accordé, XYZ refusé, réglable et relu à chaque requête) ; `tests/harness/harness.tsx` en hérite, `verify:planning` reste vert sans changement du banc.
- Règle « Gérer les sprints sur tous les projets du board » : documentation Atlassian « Managing project permissions » (Jira Data Center) ; non décrite dans l'OpenAPI Cloud. À confirmer en 8.10.
- Vérification : `npm run check` (1 870 tests), `verify:jira`, `verify:planning`, `verify:planning:package`, `verify:i18n` verts.

## Spec Change Log

## Review Triage Log

Passe 1, faite sans sous-agent (chasse aveugle, cas limites, trous de vérification) :
- `noEditableSprint` restait vrai si la relecture suivante échouait : l'écran disait « aucun sprint modifiable » à côté de l'erreur. — low, patch : remis à faux au début de chaque lecture.
- Ligne de matrice « sprint sélectionné devenu refusé » sans test. — medium (trou de vérification), patch : test de modèle (droits changés puis actualisation).
- `removePlanningIssue` n'a pas de garde de droits en `core`. — low, rejeté : la seule entrée est le modèle, qui ne propose que les sprints filtrés ; Jira refuse de toute façon.
- Cache des droits gardé après un geste refusé par Jira (403). — low, rejeté : l'actualisation relit les droits ; le refus est affiché au geste comme prévu.
- `MAX_BOARD_PROJECTS` sans test. — low, rejeté : même garde que les autres paginations.

## Verification

**Commands:**
- `npm run check` -- vert
- `npm run verify:jira` -- vert
- `npm run verify:planning` et `npm run verify:planning:package` -- verts
- `npm run verify:i18n` -- vert
