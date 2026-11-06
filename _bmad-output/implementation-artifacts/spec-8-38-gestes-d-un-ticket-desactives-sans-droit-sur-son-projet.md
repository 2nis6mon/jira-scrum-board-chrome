---
title: 'Story 8.38 — Gestes d''un ticket désactivés sans droit sur son projet'
type: 'feature'
created: '2026-11-06'
status: 'ready-for-dev'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-8-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Le planning ne lit aujourd'hui que « Gérer les sprints » (sprints proposés). Un ticket d'un projet où l'utilisateur n'a pas *Schedule issues* ou *Edit issues* offre pourtant le glisser, l'ajout ou le retrait du sprint, l'estimation et le lien à un Goal Atlassian, que Jira refuse (403) en pleine séance.

**Approach:** Lire une fois par projet des tickets affichés `SCHEDULE_ISSUES` et `EDIT_ISSUES` (`GET /rest/api/3/mypermissions`, déjà au contrat, en cache jusqu'à l'actualisation ou au changement de board). Sans *Schedule issues* : la carte ne se glisse pas, l'ajout au sprint et le retrait (E9, E10) sont désactivés dans son menu avec la raison. Sans *Edit issues* : estimation (E11) et lien à un Goal Atlassian (E3/E4) désactivés avec la raison, la fiche native restant le recours. Un lot qui mêle tickets permis et refusés est refusé avant toute écriture en nommant les tickets en cause. Droits indécidables (lecture refusée ou en échec) : le geste part comme aujourd'hui, une seule tentative, refus de Jira affiché. Aucune nouvelle route ; textes en fr, en et es.

**Décision de Denis (06/11/2026) :** la 8.38 ne touche que le planning (expérimental, absent du paquet distribué). Le rattachement à un Goal Atlassian sur le Sprint Board sans *Edit issues* devient la story 8.39.

## Boundaries & Constraints

**Always:** lectures seules, une requête par projet (les deux droits ensemble), cache vidé comme celui des sprints (`#permissions` de `PlanningModel`) ; un droit n'est refusé que si Jira répond explicitement `havePermission: false` ; le projet d'un ticket est le préfixe de sa clé ; une écriture n'est jamais rejouée.

**Never:** nouvelle route, nouveau droit Chrome, lecture des identifiants ; refuser un geste sur droit indécidable ; masquer une carte (elle reste visible, seuls ses gestes changent) ; toucher aux gestes de texte des objectifs (E8, E5 : droit du sprint, déjà couvert par 0.43.1).

## I/O & Edge-Case Matrix

| Scénario | Droits du projet du ticket | Comportement |
|---|---|---|
| Tout permis | SCHEDULE et EDIT accordés | inchangé |
| Sans Schedule | SCHEDULE refusé | pas de glisser ; « Ajouter au sprint » (backlog, autre sprint futur) et « Retirer du sprint » désactivés, raison « Vous ne pouvez pas planifier les tickets de {projet} » ; en texte, « Envoyer vers un objectif » d'un ticket déjà dans le sprint reste permis (E5 seul) |
| Sans Edit, Goals Atlassian | EDIT refusé | « Envoyer vers un goal » désactivé avec la raison ; ajout « Sans objectif » permis si SCHEDULE |
| Sans Edit, estimation | EDIT refusé | valeur affichée, non modifiable, raison au survol |
| Lot mêlé | un ticket refusé | refus avant écriture : « … impossible pour ABC-1, ABC-2 » ; sélection gardée |
| Indécidable | lecture 403 ou en échec | gestes permis, refus de Jira au geste |

</frozen-after-approval>

## Code Map

- `src/core/sprintPermissions.ts` -- `proposableSprintIds`, `SprintPermissionCache` (`projects` : `MANAGE_SPRINTS` par projet). Ajouter une lecture `issueRights(reader, projectKeys, cache)` → `Map<projet, { schedule: boolean|null; edit: boolean|null }>`, même `orNull`, cache à part dans `SprintPermissionCache`.
- `src/jira/client.ts:494` -- `myPermissions(permissions, projectKey)` : réutilisé tel quel (`SCHEDULE_ISSUES,EDIT_ISSUES`).
- `src/app/model/PlanningModel.ts` -- `#permissions` (l. 184, vidé l. 510 et 1634) ; `#read` (l. 515) : lire les droits des projets des tickets du snapshot ; nouveau signal `issueRights` et méthode `gestureRefusal(keys, gesture)` ; `placeIssue(s)`, `removeIssue(s)`, `estimate` : refus avant écriture (lot mêlé, avis nommant les tickets) ; `selectable` (l. 1719) inchangé (la sélection reste possible, le geste est refusé).
- `src/app/views/planning/PlanningView.tsx` -- `PlanningCard` (l. 1402) : `draggable` (l. 1424), estimation (l. 1609) ; menu de carte (l. ~1780-1860) : `reason` des sous-menus « Ajouter au sprint / Envoyer vers un goal » et « Retirer du sprint ».
- `src/i18n/board.ts` et `src/i18n/es/board.ts` (ou `messages.ts` pour les avis) -- nouvelles clés.
- `tests/support/planningFixture.ts:104-110, 362-395` -- option `permissions` : ajouter les droits par projet et par clé (`schedule`, `edit`), la route `mypermissions` répondant selon la clé demandée.
- Docs : `docs/technique/integration-jira.md` (ligne « Droits de l'utilisateur »), `invariants.md`, `CHANGELOG.md`, version.

## Tasks & Acceptance

**Execution:**
- [ ] `src/core/sprintPermissions.ts` -- lecture des droits de ticket par projet, cache, indécidable à `null` -- règle unique.
- [ ] `tests/core/sprintPermissions.test.ts` -- accordé, refusé, 403, une requête par projet.
- [ ] `src/app/model/PlanningModel.ts` -- droits lus avec le snapshot, refus avant écriture des gestes concernés, avis.
- [ ] `src/app/views/planning/PlanningView.tsx` -- glisser, menu et estimation désactivés avec leur raison.
- [ ] `src/i18n/` (fr, en, es) -- raisons et avis.
- [ ] `tests/support/planningFixture.ts`, `tests/app/PlanningModel.test.ts` -- matrice ci-dessus, aucune écriture refusée.
- [ ] `scripts/verify-planning.mjs` -- carte d'un projet sans *Schedule issues* dans le banc.
- [ ] Docs, CHANGELOG, version.

**Acceptance Criteria:**
- Given un ticket d'un projet sans droit, when j'ouvre son menu ou tente le geste, then la raison s'affiche et aucune requête d'écriture n'est émise.
- Given des droits indécidables, when le geste est tenté, then il part une seule fois et le refus de Jira s'affiche.

## Verification

**Commands:**
- `npm run check` (lint sur le dépôt hors `.claude/settings.local.json`) -- typage, style et tests verts.
- `npm run verify:planning` -- banc avec la carte sans droit.
- `npm run verify:i18n` -- nouveaux textes en fr/en/es.
- `npm run verify:jira` -- inchangé.

## Implementation Notes
