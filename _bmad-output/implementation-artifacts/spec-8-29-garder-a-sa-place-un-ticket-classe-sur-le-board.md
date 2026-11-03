---
title: 'Story 8.29 — Garder à sa place un ticket classé sur le board malgré le délai d''indexation de Jira'
type: 'bugfix'
created: '2026-11-03'
status: 'ready-for-dev'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-8-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Sur le Sprint Board, après un changement de rang (glisser dans une colonne, ou top / basse priorité du menu), la carte revient à sa position initiale ; un refresh juste après la montre au bon rang (signalé par Denis le 03/11/2026). Le board se relit aussitôt après l'E2, alors que la route des tickets du board la montre avec ~1 s de retard (constat 8.10).

**Approach:** Après une E2 acceptée, relire l'ordre par la même route à intervalles bornés (règle de la 8.26) jusqu'à voir le nouveau rang, sans jamais rejouer l'écriture ; le board ne se relit en entier qu'ensuite. Si le rang reste invisible, un avis dit que Jira l'a reçu sans le montrer encore.

## Boundaries & Constraints

**Always:** une seule tentative par écriture ; relectures seules, sur les routes déjà lues par le board (aucun nouvel endpoint) ; attente injectée (`core` sans minuterie) ; mêmes délais que la 8.26 (`READ_BACK_DELAYS_MS`) ; journal du classement « réussi » dès l'E2 acceptée ; textes d'avis au catalogue fr/en/es.

**Never:** rejouer l'E2 ; toucher transitions, liens d'objectif ou planning ; garder une projection locale contre l'ordre relu de Jira ; attendre quand la confirmation est indécidable.

## I/O & Edge-Case Matrix

| Scénario | Jira relu après l'E2 | Résultat attendu |
|---|---|---|
| Glisser dans une colonne (Scrum) | 1re relecture : ancien ordre, 2e : nouveau | une E2, une attente, puis relecture du board ; ni avis ni repère d'alerte |
| Top / basse priorité du menu | idem | idem |
| Board Kanban | route des tickets du board en retard | même confirmation par cette route |
| Rang jamais relu | toutes les relectures bornées sans le nouvel ordre | une E2, quatre attentes ; avis « Jira a reçu le classement… actualisez » ; journal « réussi » |
| Confirmation indécidable | ticket ou référence absents de la route relue (autre sprint, filtre) | aucune attente ; comportement d'avant |
| Relecture de confirmation en échec | erreur de lecture | rang gardé comme écrit, aucun avis de plus ; la relecture du board suit |
| E2 refusée (403, 207 en échec) | — | aucune relecture de confirmation ; avis d'échec inchangé |

</frozen-after-approval>

## Code Map

- `src/core/sprintPlanning.ts` -- `PlanningWait`, `READ_BACK_DELAYS_MS`, `readBack` (8.26) : à déplacer dans un module partagé `src/core/readBack.ts`, réexportés depuis `sprintPlanning.ts` (API inchangée pour le planning et ses tests).
- `src/core/boardMove.ts` -- `executeMove` (l. 140-149) : après `rankIssue`, confirmation par `readBack` ; `RankStepResult` gagne `{ kind: "unseen" }` (rang écrit, pas encore relu ; `completed` inclut `rank`). Route : `sprintIssues(boardId, issue.sprintId)` si `issue.sprintId` (BoardIssue, `boardIssue.ts:116`) n'est pas nul, sinon `boardIssues(boardId, kanbanSubQuery)` ; champs réduits `{ estimationFieldId: null, includeChangelog: false, onlyFields: ["issuetype", "status"] }` (comme `withoutEmptyForeignSprints`). Ordre attendu : `RankChange` `before` / `after` ; indécidable si le ticket ou la référence manque à la première lecture.
- `src/app/services/BoardMovementService.ts` -- `MovementCommand` reçoit la portée de lecture (`boardId`, `kanbanSubQuery`) ; le lecteur du constructeur couvre aussi `sprintIssues` / `boardIssues` (c'est déjà `JiraClient`) ; `effects.wait` ; `#reportRank` : `unseen` → journal « réussi » + avis `warning` (texte source français).
- `src/app/model/BoardModel.ts` -- `BoardModelOptions.wait?` (défaut `setTimeout`), réutilisé pour le contexte du planning (l. 419) et passé au service (l. 481-494) ; `dropIssue` (l. ~1065) et `rankToEdge` (l. ~1181) passent `boardId` et `kanbanSubQuery` de la configuration. `#runMovement` inchangé (la relecture du board vient après `execute`).
- `src/i18n/messages.ts`, `src/i18n/es/messages.ts` -- texte de l'avis (catalogue des textes source des services).
- `tests/support/boardFixture.ts` -- le Jira fictif du board applique l'E2 : routes `board/7/sprint/42/issue` et `board/7/issue` servent une liste réordonnée par `PUT /rest/agile/1.0/issue/rank` (204). Les tests qui forcent `jira.on("PUT", RANK, { status: 204 })` sans réordonner doivent s'appuyer sur ce comportement par défaut (sinon la confirmation échoue).
- `tests/core/boardMove.test.ts`, `tests/app/BoardModel.drop.test.ts`, `tests/app/BoardModel.cardMenu.test.ts`, `tests/app/BoardModel.kanban.test.ts`, `tests/app/CardMenu.test.tsx` -- tests du rang à adapter ; nouveaux cas de la matrice.

## Tasks & Acceptance

**Execution:**
- [ ] `src/core/readBack.ts`, `src/core/sprintPlanning.ts` -- extraire la relecture bornée, réexporter -- une seule règle pour planning et board.
- [ ] `src/core/boardMove.ts` -- confirmation du rang après E2, résultat `unseen`, cas indécidable et lecture en échec -- ne pas relire le board trop tôt.
- [ ] `src/app/services/BoardMovementService.ts`, `src/app/model/BoardModel.ts` -- portée de lecture, `wait` injecté, avis et journal de `unseen` -- vraies attentes dans l'extension.
- [ ] `src/i18n/messages.ts`, `src/i18n/es/messages.ts` -- avis en/es.
- [ ] `tests/support/boardFixture.ts` et tests du board -- Jira fictif qui applique l'E2 ; adaptation des tests existants -- non-régression.
- [ ] `tests/core/boardMove.test.ts`, `tests/app/BoardModel.drop.test.ts` -- une ligne de test par ligne de la matrice (lecteur en retard, `wait` injecté), une seule E2 -- couverture.
- [ ] `docs/technique/integration-jira.md`, `CHANGELOG.md`, `package.json`, `package-lock.json`, `public/manifest.json` -- règle étendue au board, version 0.48.7 -- livraison.

**Acceptance Criteria:**
- Given le correctif, when `npm run check`, `npm run verify:drag` et `npm run verify:i18n` sont lancés, then ils passent.
- Given un essai sur le sandbox avec l'autorisation de Denis, when un ticket est classé sur le board, then la carte reste à sa nouvelle place sans actualiser (constat à faire après livraison).

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Design Notes

Le board est dans le paquet distribué : contrairement à la 8.26, le correctif touche tous les utilisateurs. Délais et nombre de lectures repris de la 8.26 (~5,5 s au plus, sablier de la carte affiché pendant ce temps, porte d'écriture tenue). Lecture de confirmation légère (type et statut seuls) ; la relecture complète du board suit une seule fois. Les transitions sont confirmées par la lecture directe du ticket ; l'affichage de la colonne après la relecture du board reste à observer à l'essai.

## Verification

**Commands:**
- `npm run check` -- expected: typage, style et tests verts.
- `npm run verify:drag` -- expected: glisser du board inchangé sur le banc.
- `npm run verify:i18n` -- expected: avis présent en fr/en/es.
