---
title: 'Bug : objectifs masqués au démarrage du sprint préparé'
type: 'bugfix'
created: '2026-11-02'
status: 'done'
baseline_commit: '89e78990c57006d1b13bb2e12999125ef3b1a4db'
route: 'dispatch'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Après le démarrage du sprint préparé, ses objectifs créés pendant le planning arrivent masqués (œil fermé) sur le Sprint Board. Après la première lecture, `BoardLoadingService.ts` masque tout objectif inconnu (absent de `goalColorIndex` et de la lecture précédente) qui a des tickets rattachés. Or les objectifs créés pendant le planning ont un identifiant neuf ; seuls les objectifs reportés, qui gardent le leur, restent visibles.

**Approach:** Ne masquer à l'arrivée que les Goals Atlassian introduits par un ticket seulement : ni épinglés pour un sprint réuni, ni dans la sélection gardée localement, ni dans `boardPinnedGoalIds` (Kanban). Jamais les objectifs du texte d'un sprint, y compris en repli texte quand les Goals sont illisibles. C'est la règle déjà écrite dans `docs/technique/invariants.md` (« un Goal nouvellement découvert par un ticket »). Décision de Denis, backlog du 02/11/2026.

## Boundaries & Constraints

**Always:** les préférences restent locales (`updatePreferences`), et rien n'est écrit dans Jira. Les règles existantes sont gardées : couleurs stables, première lecture sans masquage, Goal inconnu introduit par un ticket non épinglé masqué.

**Never:** pas de migration de `hiddenGoalIds`. On ne peut pas distinguer un objectif masqué par l'utilisateur d'un objectif masqué à tort : celui-ci se réaffiche depuis « Goals masqués ». Le rattachement des tickets n'est pas modifié, et la vue n'est pas touchée.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Démarrage, objectifs texte neufs | lecture suivante, `goalsOrigin` `sprintText`, objectifs inconnus avec tickets | visibles, aucun ajout à `hiddenGoalIds` | — |
| Repli texte | Goals illisibles (`goalsIssue` failed), objectif texte inconnu lié | visible | — |
| Goal épinglé neuf | Goals Atlassian, Goal inconnu épinglé sur un sprint réuni (Jira ou repli local) | visible | — |
| Goal épinglé du board (Kanban) | Goal inconnu dans `boardPinnedGoalIds` | visible | — |
| Goal découvert par un ticket | Goals Atlassian, Goal inconnu non épinglé, lié à un ticket | masqué (comportement actuel) | — |
| Première lecture | aucun objectif connu | rien masqué (comportement actuel) | — |

</frozen-after-approval>

## Code Map

- `src/app/services/BoardLoadingService.ts` (l. ~170-224) -- calcul de `newLinkedGoalIds`. À restreindre : `result.snapshot.goalsOrigin === "atlassianGoals"`, et Goal absent des épinglages effectifs.
- `src/core/boardSync.ts` -- `goalsOrigin` (l. ~336-369, `"atlassianGoals"` seulement si le chargeur réussit) ; épinglage effectif Scrum = `sprintLocalPinnedGoalIds[id] ?? sprintPinnedGoalIds[id]` pour chaque sprint de `goalSprintIds` (l. ~342-354) ; Kanban : `configuration.boardPinnedGoalIds` (l. ~474).
- `src/core/pinnedGoals.ts` -- résolveur des Goals épinglés (AD-4). Y ajouter une fonction pure, par exemple `pinnedGoalIdsOfSnapshot(snapshot, configuration)`, qui réunit l'épinglage effectif de tous les sprints réunis, `pinnedGoalIds` et `localPinnedGoalIds` du sprint de référence, et `boardPinnedGoalIds` en Kanban. Ne pas recalculer ces règles dans le service.
- `tests/app/BoardModel.test.ts` (l. ~118, « masque un Goal inconnu introduit par un ticket ») -- ce test vérifie le masquage d'un objectif **texte**, contraire à la décision. À réécrire : objectif texte neuf visible ; le masquage puis le réaffichage passent dans un test Goals Atlassian.
- `tests/app/BoardModel.goals.test.ts`, `tests/support/atlassianGoalsBoard.ts` -- banc Goals Atlassian, pour les cas épinglé et découvert par un ticket.
- `tests/support/planningFixture.ts`, `tests/app/PlanningModel.test.ts` -- fixtures du planning, pour la régression sur un démarrage.
- `docs/technique/invariants.md` (l. ~61-63) -- préciser : « Goal Atlassian découvert par un ticket, non épinglé ; jamais un objectif texte ».

## Tasks & Acceptance

**Execution:**
- [x] `src/core/pinnedGoals.ts` + `tests/core/pinnedGoals.test.ts` -- fonction pure des Goals épinglés d'une photographie (sprints réunis, repli local, board Kanban), avec ses tests.
- [x] `src/app/services/BoardLoadingService.ts` -- `newLinkedGoalIds` limité aux Goals Atlassian non épinglés.
- [x] `tests/app/BoardModel.test.ts`, `tests/app/BoardModel.goals.test.ts` -- un cas par ligne de la matrice. La régression du démarrage : une première lecture avec le sprint actif A, puis une lecture où le sprint préparé B est actif, avec des objectifs texte aux identifiants neufs liés à des tickets. Ils sont visibles et `hiddenGoalIds` est inchangé.
- [x] `docs/technique/invariants.md`, `CHANGELOG.md`, version 0.42.3 (`package.json`, `package-lock.json`, `public/manifest.json`), case du backlog cochée dans `_bmad-output/planning-artifacts/backlog.md`.

**Acceptance Criteria:**
- Given un Sprint Board ouvert, when le sprint préparé est démarré puis le board relu, then tous ses objectifs texte s'affichent, avec leurs tickets dans leur swimlane.
- Given un objectif masqué à tort avant le correctif, when la nouvelle version se charge, then il reste masqué et se réaffiche depuis « Goals masqués ».

## Implementation Notes

- Implémentation par un sous-agent. `pinnedGoalIdsOfSnapshot` (`core/pinnedGoals.ts`) réunit les épinglages ; `BoardLoadingService` ne masque plus rien hors `goalsOrigin === "atlassianGoals"` ni un Goal épinglé.
- Écart : test Kanban dans `tests/app/BoardModel.kanban.test.ts` (banc Kanban), avec une option `goals` ajoutée à `kanbanBoard`.
- `npm run check` lancé par étapes, construction hors de `dist/` (`EXTENSION_DIR`) pour `verify:jira`. Sans le correctif, les 6 nouveaux tests « visible » échouent.
- Audit de la matrice : 6 lignes couvertes (première lecture par les tests Goals existants), 74 tests concernés verts.
- Correctifs de revue (passe 1) : épinglage illisible (`pinnedGoalIdsOfSnapshot` rend `null`, aucun masquage), assertions `toEqual([])`, libellés et formulations. Vérification complète verte (1813 tests, `verify:jira`, `verify:planning`).

## Spec Change Log

## Review Triage Log

Passe 1 (chasse aveugle, cas limites, trous de vérification) :
- Propriété d'un sprint réuni illisible (`pinnedGoalIds` null, sprint absent de `sprintPinnedGoalIds`) : un Goal épinglé mais illisible est pris pour un Goal découvert par un ticket, puis masqué et enregistré. — medium, patch : épinglage inconnu, aucun masquage.
- Assertions `toEqual(hiddenBefore)` : elles ne prouvent pas que rien n'a été masqué. — low, patch : `toEqual([])`.
- Commentaire de `BoardLoadingService` : renvoie à « Goals masqués » alors que l'interface dit « Masqués du board ». — low, patch.
- « souvent » dans le code contre « ont » dans `invariants.md`, pour l'identifiant neuf. — low, patch (les objectifs reportés gardent le leur).
- Parenthèse ambiguë dans le CHANGELOG (« non épinglé (sur …) »). — low, patch.
- Backlog coché `[x]` sans essai réel. — low, patch : préciser « vérifié sur Jira fictif, à confirmer en essai réel ».
- Première lecture en texte (repli, ou passage de la source texte aux Goals), puis lecture Goals : tous les Goals liés non épinglés sont masqués d'un coup. — medium, defer (comportement antérieur au correctif, `knownGoalIds` contient les objectifs texte).
- Kanban : aucun test de synchronisation ne couvre un épinglage modifié pendant la lecture (`latest`). — defer (trou de vérification, disposition du relecteur, branche testée en unitaire).
- Calcul de l'épinglage effectif en double (`boardSync` `effectivePins` et `pinnedGoalIdsOfSnapshot`). — low, rejeté : les deux sont alignés et testés ; risque de divergence noté.
- Scrum : épinglage fait pendant la lecture non pris en compte, alors que Kanban relit `latest`. — low, rejeté : course étroite, garde supplémentaire.
- Aucun test d'intégration du changement de sprint en Goals Atlassian. — low, rejeté : chemin couvert par le test unitaire et par les tests d'épinglage Jira et local.
- Goal masqué automatiquement puis épinglé : il reste masqué. — low, rejeté : `hiddenGoalIds` est une préférence de l'utilisateur, et la règle porte sur l'arrivée.
- Manuel muet sur le masquage automatique. — low, rejeté : lacune antérieure, hors du correctif.
- Rien ne répare les objectifs masqués à tort. — false : choix explicite de l'intention (« pas de migration »).
- Diff relu incomplet (`package-lock.json`, backlog, spec). — false : exclus volontairement du diff de revue ; la montée de version est vérifiée.

## Verification

**Commands:**
- `npm run check` -- vert
- `npm run verify:jira` -- vert
- `npm run verify:planning` -- vert
