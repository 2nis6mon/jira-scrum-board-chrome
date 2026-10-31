---
title: 'Correctif rétro Epic 1 n°2 — Le refus de la porte d''écriture est typé'
type: 'bugfix'
created: '2026-10-31'
status: 'done'
baseline_commit: 'ab7ef76338b40d043081ae164778e633c79d9eb9'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-retro-2026-10-31.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `BoardWriteGate` refuse une écriture avant l'envoi (board périmé, ou E6 sans `canEdit`) en levant `new Error(<phrase française>)`, la phrase étant passée en option libre (`refusal?: string`). Les services ne reconnaissent pas ce refus : quand `canEdit` passe à faux pendant qu'un réglage partagé attend la porte, `#saveShared` ne relit pas les réglages de Jira, la modification locale optimiste reste affichée et `boards.v1` garde un réglage jamais publié ; le journal enregistre un « échec » indiscernable d'un refus de Jira alors que rien n'a été envoyé (constat F2 de la rétrospective).

**Approach:** La porte lève une erreur typée portant sa raison (`stale` ou `cannotEdit`). Les services la reconnaissent : `cannotEdit` est traité comme une perte du droit de modifier le board (relecture forcée des réglages de Jira, avis existant de lecture seule), `stale` reste silencieux comme aujourd'hui ; l'entrée de journal dit que rien n'a été envoyé à Jira, sous forme de clé du catalogue.

## Boundaries & Constraints

**Always:** aucune écriture rejouée ; textes visibles repris du catalogue existant quand un texte convient, sinon nouvelles clés en fr, en et es ; l'entrée de journal reste au format clé + paramètres de la story 1.8, lisible par 0.36.1 ; E1–E5, E8, E9 toujours laissés aux droits Jira ; le refus `stale` n'affiche rien de nouveau.

**Never:** nouvelle écriture Jira ; changer le contrat `outcome` de `audit.v1` (`réussi` / `échec` / `incertain`) ; garder un message de refus en option libre ; traduire un contenu Jira.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Droit perdu pendant l'attente | `changeShared` en file, `canEdit` passe à faux avant son PUT | aucun PUT ; réglages relus dans Jira, la modification locale disparaît ; avis de lecture seule ; journal : rien envoyé | N/A |
| Épinglage Kanban, droit perdu | même situation pour `#saveBoardPinnedGoals` | aucun PUT ; avis actuel « Il faut pouvoir modifier le board pour y épingler des Goals. » ; journal : rien envoyé | N/A |
| Board périmé | geste en file au moment d'un changement de board | aucun envoi, aucun avis nouveau (comportement actuel) | N/A |
| Refus de Jira (403) | PUT envoyé et refusé | comportement actuel inchangé (branche `forbidden`) | N/A |
| Déplacement refusé par la porte | board fermé pendant un dépôt, étape suivante refusée | entrée de journal « rien n'a été envoyé à Jira » au lieu du texte brut du refus | N/A |

</frozen-after-approval>

## Code Map

- `src/app/services/ports.ts` -- déclarer `class BoardWriteRefused extends Error { reason: "stale" | "cannotEdit" }` (les services peuvent l'importer en valeur : la couche services possède ses ports) ; supprimer `BoardWriteOptions.refusal` (et l'option si elle devient vide).
- `src/app/model/BoardWriteGate.ts` -- l. ~49–76 : lever `BoardWriteRefused` (`stale` si `stale()`, sinon `cannotEdit` pour E6) ; supprimer `BOARD_CHANGED_REFUSAL`.
- `src/app/services/BoardSettingsService.ts` -- `#saveShared` (catch l. ~500–545) : sur `cannotEdit`, même traitement que `forbidden` (`canEditBoard = false`, `refresh({ force: true })`) avec un avis qui ne dit pas que Jira a refusé ; sur `stale`, sortie silencieuse actuelle. `#saveBoardPinnedGoals` (l. ~180–319, option `refusal` l. ~310) : même reconnaissance, avis actuel conservé. `savePinnedGoals` (chemin sprint) : un refus `stale` ne journalise rien.
- `src/app/services/BoardMovementService.ts` -- `#fail` : `BoardWriteRefused` journalisé avec `detailMessage` = clé « rien n'a été envoyé à Jira … » (outcome `échec`).
- `src/app/model/coreText.ts` -- `errorMessage` : traduire `BoardWriteRefused` par clé du catalogue.
- `src/i18n/messages.ts`, `src/i18n/es/messages.ts` -- nouvelles clés éventuelles ; retirer celles devenues inutilisées seulement si aucun ancien journal ne peut les contenir (sinon les garder pour l'affichage des anciennes entrées).
- Tests : `tests/app/BoardWriteGate.test.ts` (raison levée), `tests/app/BoardModel.team.test.ts` et `tests/app/BoardModel.kanban.test.ts` (droit perdu pendant l'attente : retenir la réponse `canEdit`, voir les pauses de `tests/app/BoardModel.concurrency.test.ts`), `tests/app/services/BoardServices.test.ts`.

## Tasks & Acceptance

**Execution:**
- [x] `src/app/services/ports.ts`, `src/app/model/BoardWriteGate.ts` -- refus typé -- F2
- [x] `src/app/services/BoardSettingsService.ts`, `src/app/services/BoardMovementService.ts`, `src/app/model/coreText.ts` -- reconnaître le refus -- F2
- [x] `src/i18n/messages.ts`, `src/i18n/es/messages.ts` -- clés -- NFR10
- [x] tests -- les cinq lignes de la matrice -- régression
- [x] `CHANGELOG.md` -- une ligne sous 0.36.3

**Acceptance Criteria:**
- Given `npm run verify:i18n` et `npm run verify:settings`, when ils tournent, then ils passent.

## Implementation Notes

- `BoardWriteRefused` (`ports.ts`) porte la raison ; son `message` n'est qu'une trace technique. Le texte vient de `coreText.errorMessage` (journal) et de `toMessage` (avis), qui passent par le catalogue. `BoardWriteOptions` et `BOARD_CHANGED_REFUSAL` sont supprimés ; la porte vérifie la péremption avant le droit (board fermé sans `canEdit` : `stale`).
- Nouvelles clés (fr/en/es) : « Rien n'a été envoyé à Jira : il faut pouvoir modifier le board. » (journal et avis des réglages partagés, avec la suggestion existante de lecture seule) et « Rien n'a été envoyé à Jira : le board a changé avant l'envoi. » (journal). Les deux anciennes phrases de refus restent au catalogue pour les entrées déjà journalisées.
- Épinglage Kanban : le contrôle de `canEdit` au début du tour lève le même refus `cannotEdit`, donc il journalise désormais « rien n'a été envoyé » (il ne journalisait rien) ; l'avis reste « Il faut pouvoir modifier le board pour y épingler des Goals. ».
- Épinglage au sprint : un refus `stale` ferme l'éditeur s'il est toujours le même, sans avis, journal ni `sync`.
- Déplacement : écart volontaire avec la Code Map, `BoardMovementService` reste inchangé. `#fail` journalise déjà `detailMessage: errorMessage(error)` : la clé « Rien n'a été envoyé à Jira : le board a changé avant l'envoi. » vient donc de `coreText.errorMessage`, et l'avis du geste la montre aussi via `toMessage`.
- Réglages partagés, `cannotEdit` sans document d'équipe publié (ou relecture impossible) : `refresh({ force: true })` ne réapplique rien, donc `changeShared` passe à `#saveShared` les réglages partagés d'avant le geste, qui sont réappliqués localement.

## Spec Change Log

## Review Triage Log

| # | Constat | Verdict | Preuve / route |
|---|---------|---------|----------------|
| 1 | Droit perdu sans réglages publiés : la modification locale reste | medium | `refresh` branche `none`/illisible ne réapplique rien ; patch (annulation locale) |
| 2 | Avis du déplacement refusé et fermeture de l'éditeur d'épinglage non vérifiés | medium | Gaps pré-vérifiés ; patch |
| 3 | CHANGELOG faux pour l'épinglage Kanban, titre 0.36.3 trop étroit | low | Doc ; patch |
| 4 | Règle `stale` silencieux / journalisé non écrite | low | AGENTS.md : décisions dans docs/technique ; patch (invariants.md) |
| 5 | Commentaire i18n « jusqu'à 0.36.3 », seconde phrase non marquée | low | Correction directe ; patch |
| 6 | Spec contradictoire sur `BoardMovementService` ; test Kanban sans contrôle de lecture seule | low | Corrections directes ; patch |
| 7 | Publication du planning refusée journalisée « incertain » | medium | Antérieur, prudent, fonction expérimentale ; defer |
| 8 | Plusieurs réglages en file : un journal et une relecture par geste | low | Rejeté : cas rare, chaque geste a bien été refusé |
| 9 | Kanban : `stale` de la porte (board fermé) sans `stale()` du service | low | Rejeté : board fermé, éditeur invisible |
| 10 | `ports.ts` exporte une classe importée en valeur par `app/model` | false | Le graphe AD-1 autorise `model --> services` |
| 11 | Brouillon JQL perdu par la relecture forcée | low | Rejeté : même comportement que la branche `forbidden` existante |

## Verification

Résultats (31/10/2026) : `npm run check` vert (105 fichiers, 1521 tests, 1 ignoré) ; `verify:settings`, `verify:i18n` et `verify:jira` en code de sortie 0.

**Commands:**
- `npm run check` -- expected: vert
- `npm run verify:settings` -- expected: vert
- `npm run verify:i18n` -- expected: vert
- `npm run verify:jira` -- expected: vert
