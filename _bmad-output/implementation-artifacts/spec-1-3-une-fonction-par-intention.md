---
title: 'Story 1.3 — Une seule fonction de core par intention d''écriture'
type: 'refactor'
created: '2026-10-30'
status: 'done'
baseline_commit: 'c5cc9b7c24f5bbc6a40d6a45c41279290324149b'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Les séquences d'écritures sont orchestrées dans les services : `BoardMovementService.execute` enchaîne transition → Goal → rang, `#assignAtlassianGoal` enchaîne détacher → lier, et `BoardSettingsService.#saveShared` relit `boardsettings.v1` et détecte les conflits avant `publishTeamSettings`. Un nouveau geste (menu contextuel, Epic 3) pourrait écrire dans un autre ordre.

**Approach:** Trois fonctions de `core` portent chacune la séquence, la relecture qui conditionne l'écriture, l'arrêt au premier échec et un résultat typé : déplacer (`core/boardWrites.ts` ou un nouveau `core/boardMove.ts`), changer de Goal Atlassian, publier les réglages partagés (`core/teamSettings.ts`). Les services ne gardent que file, gardes de péremption/droits du writer, journal et traduction du résultat en avis.

## Boundaries & Constraints

**Always:** ordre transition → Goal → rang, arrêt au premier échec, aucune écriture rejouée ; détacher puis lier, arrêt si le détachement est refusé, succès partiel signalé si seul le lien échoue (« Le lien avec l'ancien Goal a déjà été retiré. ») ; mêmes avis, mêmes entrées de journal (texte et ordre) et mêmes lectures Jira qu'avant ; `core` ne reçoit qu'un `JiraWriter`/`Pick<GoalsClient,"setLink">` et ne touche ni signaux ni journal ; le résultat partiel typé dit quelles étapes ont abouti (le service compose encore « Déjà effectué : … »).

**Never:** changer le comportement visible ; changer les files d'écriture (story 1.4) ; déplacer les phrases dans `core` (les phrases restent dans les services ; story 1.8) ; nouvelle écriture.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Déplacement complet | colonne, Goal et rang changent | résultat : 3 étapes abouties, dans l'ordre | N/A |
| Transition refusée | `moveToColumn` → `conflict`/`noTransition`/`requiresFields`/`choose` | arrêt, Goal et rang non écrits, résultat porte l'issue de la transition | le service garde avis, choix, formulaire natif |
| Goal échoue après transition | `setLink`/`linkToTextGoal` lève | arrêt, rang non écrit, résultat : transition aboutie + erreur Goal | avis + « Déjà effectué : statut modifié » |
| Changement de Goal Atlassian | ancien g1, nouveau g2 | `unlink g1` puis `link g2` | détachement refusé : arrêt sans lier ; lien refusé : `detached: true` |
| Réglages, collègue a publié | `publishedAt` relu ≠ base | `conflict` avec le document courant, rien écrit | avis actuel du service |
| Réglages illisibles | version inconnue | `unreadable`, rien écrit | avis « format inconnu » actuel |
| Brouillon JQL confirmé, famille changée | `sameFamily(confirmed, latest)` faux | `changedDuringEdit` avec le document courant | avis actuel |

</frozen-after-approval>

## Code Map

- `src/app/services/BoardMovementService.ts` -- `execute` (l. ~69) et `#assignAtlassianGoal` (l. ~149) : déplacer la séquence dans `core`; garder `#fail`, les avis par `outcome.kind`, `openNative`, `transitionChoice`, `nativeTransitionPending` et `record` dans le service, pilotés par le résultat typé.
- `src/core/boardWrites.ts` -- contient déjà `moveToColumn`, `rankIssue`, `linkToTextGoal` (story 1.1, `LinkOutcome`) : y ajouter (ou dans `core/boardMove.ts`) `executeMove(...)` et `changeAtlassianGoal(goals, {issueId, previousGoalId, goalId})`. Le rattachement texte reste `linkToTextGoal` (déjà une fonction `core`), appelé par `executeMove`.
- `src/app/services/BoardSettingsService.ts` -- `#saveShared` (relecture, `decodeTeamDocument`, test `confirmed`/`sameFamily`, `change(withTeamSettings(...))`, `publishTeamSettings`) : déplacer relecture et détection dans `core/teamSettings.ts` (`saveTeamSettings(reader, writer, {boardId, configuration, change, confirmed?, sameFamily?, publishedBy, now})` → `published{document, previous, next}` | `conflict{current}` | `changedDuringEdit{current}` | `unreadable`). Si la story 1.2 a créé `core/pinnedGoals.ts` avec une relecture Kanban propre, la faire reposer sur `saveTeamSettings` plutôt que dupliquer.
- `src/core/teamSettings.ts` -- `publishTeamSettings` (l. ~337) reste la primitive d'écriture ; ne pas changer sa relecture.
- Tests : `tests/app/services/BoardServices.test.ts`, `tests/app/BoardModel.drop.test.ts`, `tests/app/BoardModel.team.test.ts`, `tests/app/BoardModel.settings.test.ts`, `tests/core/boardWrites.test.ts`, `tests/core/boardSettings.test.ts`.

## Tasks & Acceptance

**Execution:**
- [x] `src/core/boardWrites.ts` (ou `src/core/boardMove.ts`) -- `executeMove` et `changeAtlassianGoal` avec résultats typés -- AD-2
- [x] `src/app/services/BoardMovementService.ts` -- consommer ces résultats ; plus d'enchaînement d'écritures -- AD-2
- [x] `src/core/teamSettings.ts` -- `saveTeamSettings` -- AD-2
- [x] `src/app/services/BoardSettingsService.ts` (et `src/core/pinnedGoals.ts` si présent) -- déléguer relecture/conflit à `core` -- AD-2
- [x] `tests/core/...` -- couvrir la matrice sur les fonctions de `core` ; tests de services existants inchangés dans leurs attentes
- [x] `tests/guards/sources.test.ts` -- garde : `BoardMovementService.ts` et `BoardSettingsService.ts` n'appellent ni `moveToColumn`, ni `rankIssue`, ni `setLink`, ni `boardProperty(` -- régression
- [x] `ARCHITECTURE-SPINE.md` -- retirer les deux écarts AD-2 (`BoardMovementService.execute`…, `BoardSettingsService` relit…) ; `CHANGELOG.md` sous 0.36.2

**Acceptance Criteria:**
- Given les tests existants de déplacement et de réglages, when `npm run check` tourne, then ils passent sans changement d'attente.
- Given `npm run verify:drag` et `npm run verify:settings`, when ils tournent, then ils passent.

## Implementation Notes

## Spec Change Log

## Review Triage Log

| # | Constat | Verdict | Preuve / route |
|---|---------|---------|----------------|
| 1 | Le service recompose « Déjà effectué » sans `result.completed` ; listes `includes` non typées dans `core` | medium | Deux sources de vérité pour un futur geste (Epic 3) ; patch |
| 2 | `saveTeamSettings` recopie lecture et décodage au lieu de `readTeamSettings` | low | Duplication directe dans le même fichier ; patch |
| 3 | Cas manquants de `boardMove.test.ts` (`alreadyThere`, conflit texte, refus Atlassian qui arrêtent le rang) | medium | Branches non exercées ; patch |
| 4 | Détail du journal Atlassian non vérifié | medium | Gap pré-vérifié ; patch |
| 5 | Détail du journal des réglages avec document existant non vérifié | medium | Gap pré-vérifié ; patch |
| 6 | Garde sans `publishTeamSettings(`/`linkToTextGoal(` ; invariants.md muet | low | Ajouts directs ; patch |
| 7 | `nativeTransitionPending` remis à faux après Goal et rang | false | `dropIssue` refuse de démarrer quand il vaut vrai : la remise à faux est sans effet |
| 8 | Journal et avis émis après toutes les écritures | low | Rejeté : texte et ordre identiques ; seul un onglet fermé en plein geste perd l'entrée |
| 9 | Erreur de `record` n'arrête plus les écritures suivantes | low | Rejeté : `#record` est déjà tolérant aux échecs de stockage |
| 10 | `now()` capturé avant la transition | low | Rejeté : écart de quelques millisecondes sur `updatedAt` |
| 11 | Lecture supplémentaire sur un board devenu périmé | low | Rejeté : seulement si le board change pendant l'enregistrement, résultat ignoré, aucune écriture |
| 12 | `unchanged` non traité dans `#saveShared` | false | `#saveShared` ne passe jamais `expect` : cas inatteignable |
| 13 | `textLinkSprintId`/`goalsOfSprint` hors `try` | false | Fonctions pures sans exception |
| 14 | `configuration: () => configuration` capturé trop tôt | low | Rejeté : identique à l'ancien `#saveShared`, qui utilisait la configuration capturée |
| 15 | Condition `result.goal && assign` redondante ; commentaire `changedDuringEdit` non vérifié | low | Rejeté : sans effet observable |
| 16 | Spec non finalisée | false | Finalisée à l'étape 5 |

## Verification

**Commands:**
- `npm run check` -- expected: vert
- `npm run verify:drag` -- expected: vert
- `npm run verify:settings` -- expected: vert
- `npm run verify:jira` -- expected: vert
