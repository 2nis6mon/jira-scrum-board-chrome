---
title: 'Correctif rétro Epic 1 n°1 — La déconnexion attend les écritures en cours'
type: 'bugfix'
created: '2026-10-31'
status: 'done'
baseline_commit: 'b7d4d6ac06d7f02be89fa04085cb1c4e0457c3f6'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-retro-2026-10-31.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `AppModel.disconnect()` (`src/app/model/AppModel.ts:243-264`) appelle `board.dispose()` puis `forgetSiteData` sans attendre ni la porte d'écriture (`BoardWriteGate`) ni la file locale du board (`BoardModel.#saveQueue`). Un geste en vol ou en file se termine après l'effacement : `BoardModel.#record` ajoute une entrée `audit.v1` du site, et `#persist`/`#updatePreferences` réécrit son entrée dans `boards.v1`. La déconnexion promet pourtant qu'il ne reste aucune donnée du site (story 1.7, constat F1 de la rétrospective).

**Approach:** Après `dispose()` (qui fait déjà refuser par la porte toute écriture Jira encore en file), la déconnexion attend que la porte soit vide et que la file locale du board soit écoulée, puis efface ; ensuite le board fermé n'écrit plus rien localement (`#record` et `#persist` deviennent sans effet).

## Boundaries & Constraints

**Always:** une écriture Jira déjà envoyée n'est ni annulée ni rejouée ; une écriture encore en file au moment de `dispose()` n'est pas envoyée (comportement actuel de la porte) ; l'entrée de journal d'un geste terminé avant l'effacement est effacée avec le reste du site ; la déconnexion se termine même si l'attente rencontre une erreur d'écriture ; ordre visible inchangé pour l'utilisateur (confirmation, puis retour à l'écran de connexion).

**Never:** désactiver le bouton de déconnexion ou ajouter un texte visible ; une attente sans fin (une tâche rejetée ne bloque pas) ; changer les formats `audit.v1` ou `boards.v1` ; toucher aux autres sites.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Geste en vol | dépôt dont la transition est envoyée et pas encore confirmée, puis déconnexion | la transition se termine ; après déconnexion, aucune entrée `audit.v1` ni `boards.v1` du site | N/A |
| Geste en file | second dépôt en attente derrière le premier, puis déconnexion | le second n'envoie rien à Jira ; aucune donnée du site ne reste | refus de la porte absorbé |
| Réglage en file | `changeShared` en attente, puis déconnexion | aucun PUT envoyé ; aucune donnée du site ne reste | N/A |
| Après effacement | une promesse tardive appelle `#record` ou `#persist` | rien n'est écrit | N/A |
| Rien en cours | déconnexion simple | comportement actuel | N/A |

</frozen-after-approval>

## Code Map

- `src/app/model/BoardWriteGate.ts` -- ajouter `idle(): Promise<void>` qui se résout quand la file est vide (boucler tant que `busy > 0` après chaque fin de tâche ; jamais rejeté).
- `src/app/model/BoardModel.ts` -- `dispose()` (l. ~1184) inchangé ; ajouter `async settled(): Promise<void>` qui attend `#gate.idle()` puis la file `#saveQueue` (jusqu'à stabilité), puis marque le board fermé (`#closed = true`) ; `#record` (l. ~1163) et `#persist` (l. ~1336) ne font rien quand `#closed`.
- `src/app/model/AppModel.ts` -- `disconnect()` : après `dispose()` et le second `flushDraft()`, `await current.board.settled().catch(() => {})`, puis `forgetSiteData` comme aujourd'hui.
- Tests : `tests/app/siteData.test.ts` (scénarios de déconnexion existants, faux stockage), `tests/app/BoardModel.concurrency.test.ts` (outil de pause `pauses` des requêtes Jira, l. ~49), `tests/app/BoardWriteGate.test.ts`.

## Tasks & Acceptance

**Execution:**
- [x] `src/app/model/BoardWriteGate.ts` -- `idle()` -- attente de la file
- [x] `src/app/model/BoardModel.ts` -- `settled()`, `#closed`, garde de `#record`/`#persist` -- F1
- [x] `src/app/model/AppModel.ts` -- attendre `settled()` avant `forgetSiteData` -- F1
- [x] `tests/app/siteData.test.ts` (ou `BoardModel.concurrency.test.ts`) -- les cinq lignes de la matrice, avec un vrai `BoardModel` sur Jira fictif -- régression
- [x] `tests/app/BoardWriteGate.test.ts` -- `idle()` se résout après une tâche rejetée et quand une tâche arrive pendant l'attente
- [x] `CHANGELOG.md` -- une ligne sous une nouvelle version 0.36.3 ; version dans `package.json`, `package-lock.json`, `public/manifest.json`

**Acceptance Criteria:**
- Given les tests existants de connexion, de déconnexion et de concurrence, when `npm run check` tourne, then ils passent sans changement d'attente.

## Implementation Notes

- `BoardWriteGate.idle()` boucle `while (busy > 0) await #queue` : `busy` baisse dans le `finally` du résultat, juste après la fin de la file ; une tâche rejetée ou arrivée pendant l'attente est prise en compte.
- `BoardModel.settled()` alterne attente de la porte et de `#saveQueue` jusqu'à stabilité (un geste terminé peut mettre en file un enregistrement), puis pose `#closed` de façon synchrone avant de rendre la main : aucune continuation ne s'intercale entre la fermeture et `forgetSiteData`.
- « Geste en file » : un second dépôt est impossible pendant un dépôt (`pendingKeys` bloque `dropIssue`) ; le test met donc un dépôt en file derrière un réglage partagé dont le PUT est retenu. Le scénario « réglage en file derrière un dépôt » couvre l'ordre inverse.
- « Rien en cours » : couvert par les tests de déconnexion existants de `tests/app/siteData.test.ts`, inchangés.
- Les quatre nouveaux tests de `siteData.test.ts` échouent sans le correctif de `AppModel`/`BoardModel` (vérifié).

- Après revue : `disconnect()` ignore un second appel pendant l'attente (`#disconnecting`, remis à zéro en `finally`) ; `#queued` refuse toute écriture locale une fois le board fermé ; `dismissNotice` et l'oubli des bandeaux et brouillons de `removeBoard` passent par `#queued` (attendus par `settled()`) ; `PlanningModel.#removeStored` passe par la file des brouillons (attendue par `flushDraft()`), `#change` refusait déjà après `dispose()`. `idle()` lit `busy.peek()`. Règle consignée dans `docs/technique/donnees.md`.

## Spec Change Log

## Review Triage Log

| # | Constat | Verdict | Preuve / route |
|---|---------|---------|----------------|
| 1 | Double clic : deux déconnexions en parallèle pendant l'attente | medium | Seul `planning.publishing` bloque la rentrée ; l'attente l'a rendue atteignable ; patch |
| 2 | `activateBoard`/`removeBoard`/`dismissNotice` écrivent encore après fermeture | medium | Garde limitée à `#record`/`#persist` ; `saveDismissedNotice` hors file ; patch |
| 3 | « Termine même si une écriture échoue » non testé | medium | Tous les scénarios répondent 204 ; patch |
| 4 | Scénario « dépôt en vol » sans preuve que l'entrée existait | low | Assertion d'absence seule ; patch direct |
| 5 | `idle()` lit `.value` | low | Correction directe ; patch |
| 6 | Règle non consignée dans `docs/technique/` | low | AGENTS.md : décisions dans docs/technique ; patch |
| 7 | Attente sans borne | false | Chaque requête est bornée par le délai du transport (30 s, `src/jira/transport.ts:72`) ; noté en doc |
| 8 | Outil de pause dupliqué dans le test | low | Rejeté : copie locale d'un utilitaire de test |
| 9 | Test « aussitôt » sans course | low | Rejeté : sans effet observable |
| 10 | `#persist` fermé silencieux | low | Rejeté : board fermé, rien à signaler |
| 11 | `package-lock.json` et specs 2–3 absents du diff | false | Exclus du diff relu, pas de la livraison ; specs 2–3 livrées avec leurs propres commits |
| 12 | Matrice « second dépôt en file » impossible | false | `pendingKeys` bloque un second dépôt ; scénario équivalent testé (Implementation Notes) |

## Verification

**Commands:**
- `npm run check` -- expected: vert
- `npm run verify:jira` -- expected: vert

**Résultats (31/10/2026) :** `npm run check` vert (105 fichiers, 1510 tests réussis, 1 ignoré) ; `npm run verify:jira` vert.
