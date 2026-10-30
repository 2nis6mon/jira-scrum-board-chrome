---
title: 'Story 1.1 — Ne jamais perdre de données en écrivant sprintgoals.v1'
type: 'refactor'
created: '2026-10-30'
status: 'done'
baseline_commit: 'af7ba3dd556be78321326f4a07a53f100125a150'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** La propriété `com.scrumboardmac.sprintgoals.v1` est écrite par trois fonctions (`linkToTextGoal`, `pinAtlassianGoals`, `publishSprintPlanning`) avec trois décodages et trois règles de conflit ; `linkToTextGoal` réencode une version inconnue et perd les champs inconnus d'un objectif.

**Approach:** `core/sprintGoals.ts` devient le seul module qui décode, encode et met à jour la propriété : il expose une primitive de mise à jour (relecture stricte, contrôle de la zone modifiée, mutation pure fournie par l'appelant, encodage conservant les inconnus, une seule écriture). Les trois écrivains ne fournissent plus qu'une mutation et la zone qu'ils modifient.

## Boundaries & Constraints

**Always:** une seule tentative par écriture ; version inconnue ou donnée illisible jamais écrasée ; clés inconnues conservées au niveau du document et de chaque objectif (par `id`) ; fusion sur Jira frais quand seule la zone d'un lien change ; refus si la zone modifiée a changé depuis la lecture ; horodatage `updatedAt` ISO à la seconde pour tous les écrivains ; format persisté inchangé ; textes visibles dans `src/i18n/messages.ts` et `src/i18n/es/messages.ts`.

**Never:** nouvelle écriture, nouvel endpoint ou nouvelle version de format ; rejouer une écriture après un conflit ; changer le comportement visible hors du refus du rattachement texte en conflit ; toucher aux files d'écriture (story 1.4) ou aux phrases de `core` (story 1.8).

**Decision (agent, 30/10/2026) :** pas d'essai réel sur Jira pour le refus en conflit — contrôle sur Jira fictif uniquement (un essai réel exige l'autorisation de Denis ; question ouverte de la spec de conformité reportée).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Version inconnue | propriété `version: 2` | rattachement, épinglage et planning n'écrivent rien | avis de refus (décodage), aucune nouvelle tentative |
| Champ inconnu | objectif `{id,title,…, extra:1}`, clé racine `future:{}` | rattachement écrit `extra` et `future` inchangés | N/A |
| Autre lien modifié | base sans lien `ABC-2`, Jira frais a `ABC-2→g2` | écrit `ABC-1→g1` et conserve `ABC-2→g2` | N/A |
| Même lien modifié | base `ABC-1→g1`, Jira frais `ABC-1→g3` | rien n'est écrit, résultat `conflict` | avis « Ce ticket a été modifié par quelqu'un d'autre depuis le chargement. » + « Le board a été rechargé ; recommence si besoin. », board relu |
| Rien à changer | mutation identique au frais (hors horodatage) | aucune écriture, `unchanged` | N/A |

</frozen-after-approval>

## Code Map

- `src/core/sprintGoals.ts` -- module propriétaire : ajouter lecture stricte (reprise des contrôles de `readGoalProperty` de `sprintPlanning.ts`), encodage sur valeur brute conservant inconnus racine et par objectif (clés connues d'objectif : `id,title,color,position,atlassianGoalId,atlassianKey,atlassianStatus,atlassianURL`), `prepareSprintGoalUpdate` pur et `updateSprintGoalProperty(reader, writer, {sprintId, unchangedSince, mutate, accountId, now})`.
- `src/core/boardWrites.ts` -- supprimer `readStoredDocument`, `DOCUMENT_KEYS`, `documentValue`, `timestamp` ; `linkToTextGoal` renvoie `LinkOutcome` (`linked`/`unchanged`/`conflict`) et prend `knownGoalId` (lien lu au chargement) ; `pinAtlassianGoals` passe par la primitive ; garder `withTextGoalLink`/`withPinnedGoals` comme mutations pures.
- `src/core/sprintPlanning.ts` -- supprimer `readGoalProperty` et l'encodage manuel de `planningProperty` ; préparer la valeur avec la primitive pure (validation avant toute écriture) et écrire via `updateSprintGoalProperty` avec zone = document brut entier.
- `src/core/boardIssue.ts` / `src/core/boardSync.ts` -- ajouter au snapshot `storedTextLinks?` (liens bruts de chaque sprint réuni, par `sprintId`) pour fournir `knownGoalId`.
- `src/app/services/BoardMovementService.ts` -- traiter `conflict` : avis `warning` avec le message décidé, journal `échec` « conflit : lien modifié dans Jira », retour `false` (le `finally` de `BoardModel.dropIssue` relit déjà le board).
- `src/app/services/BoardSettingsService.ts` -- inchangé hors type de résultat si nécessaire.
- `tests/core/boardWrites.test.ts`, `tests/core/sprintPlanning.test.ts`, `tests/core/sprintGoals.test.ts`, `tests/app/BoardModel.drop.test.ts` -- tests existants à réutiliser.

## Tasks & Acceptance

**Execution:**
- [x] `src/core/sprintGoals.ts` -- lecture stricte, encodage conservatif, primitive de mise à jour -- seul module propriétaire (AD-4)
- [x] `src/core/boardWrites.ts` -- brancher rattachement et épinglage sur la primitive, `LinkOutcome` -- une seule règle de conflit
- [x] `src/core/sprintPlanning.ts` -- brancher la publication sur la primitive -- idem
- [x] `src/core/boardIssue.ts`, `src/core/boardSync.ts` -- `storedTextLinks` dans le snapshot -- base du contrôle de conflit
- [x] `src/app/services/BoardMovementService.ts` -- avis de conflit, journal -- refus visible décidé
- [x] `src/i18n/messages.ts`, `src/i18n/es/messages.ts` -- deux phrases du refus + détail de journal -- NFR10
- [x] `tests/core/sprintGoals.test.ts`, `tests/core/boardWrites.test.ts`, `tests/core/sprintPlanning.test.ts`, `tests/app/BoardModel.drop.test.ts` -- couvrir la matrice pour les trois écrivains -- CAP-1

**Acceptance Criteria:**
- Given le code livré, when on cherche `decodeSprintGoalDocument`/`encodeSprintGoalDocument` ou un `sprintProperty.put` de `SPRINT_PROPERTY_KEYS.goals`, then ils n'apparaissent que dans `core/sprintGoals.ts` (et la lecture tolérante d'affichage de `boardSync.ts`).
- Given un rattachement en conflit sur le board, when il est refusé, then le board est relu et aucune écriture n'est rejouée.

## Implementation Notes

## Spec Change Log

## Review Triage Log

| # | Constat | Verdict | Preuve / route |
|---|---------|---------|----------------|
| 1 | Base inconnue (sprint absent de `storedTextLinks`) traitée comme « aucun lien » → faux conflit | medium | Le service passe `?? null` ; patch : `undefined` = base inconnue, fusion sans contrôle |
| 2 | Rattachement `unchanged` sans entrée de journal | medium | Avant, « réussi » était toujours journalisé ; patch |
| 3 | `storedTextLinks` non testé par sprint ; aucun dépôt sur un second sprint | medium | Gap pré-vérifié (verification-gap) ; patch |
| 4 | Cas de conflit manquants (détachement, lien retiré par un collègue) | low | Tests absents de `boardWrites.test.ts` ; patch (ajout direct) |
| 5 | `withTextGoalLink` reconstruit les objectifs du chargement et retire les liens vers un objectif ajouté depuis | medium | Même code avant le diff : antérieur à la story ; defer |
| 6 | Lecture stricte accepte `color`/`position`/`updatedAt` mal typés puis les remplace | low | Rejeté : improbable, le correctif ajoute des gardes |
| 7 | Clé `__proto__` perdue par `unknownEntries` | low | Rejeté : improbable, correctif non direct |
| 8 | Avis tutoie, ne nomme pas le ticket, annonce la relecture | false | Message décidé par Denis (bloc figé) ; `dropIssue` relit juste après |
| 9 | `LinkOutcome.current` inutilisé | low | Rejeté : sans effet utilisateur |
| 10 | Décodage affiche l'indice de permission | false | L'indice n'est montré que si `info.kind === "forbidden"` |
| 11 | Dérive possible entre `GOAL_KEYS` et l'encodage | low | Rejeté : hypothétique |
| 12 | Garde AD-4 contournable par littéral ou alias | low | Rejeté : improbable ; gardes durcies en story 1.5 |
| 13 | Spec non à jour | false | Statut et tâches mis à jour aux étapes 3 et 4 |
| 14 | Manuel non modifié, verify:i18n non prouvé | low | Rejeté : verify:i18n lancé à l'implémentation |
| 15 | Objectifs bruts en double : inconnus des suivants perdus | low | Rejeté : identifiants uniques, improbable |

## Design Notes

`unchangedSince(fresh)` : prédicat de l'appelant sur le document frais décodé (et brut pour le planning). Rattachement : `fresh.links[issueKey] ?? null === knownGoalId`. Épinglage : `atlassianGoalIds` frais égaux à `shownGoalIds`. Planning : brut frais identique au brut de la photographie. La primitive refuse avant d'appeler `mutate`, compare le résultat encodé au brut frais sans `updatedAt`/`updatedBy` pour décider `unchanged`, puis écrit une fois et renvoie la valeur écrite (le planning la relit pour confirmer).

## Verification

**Commands:**
- `npm run check` -- expected: typecheck, lint, tests et build verts
- `npm run verify:jira` -- expected: parcours intégré vert sur Jira fictif
