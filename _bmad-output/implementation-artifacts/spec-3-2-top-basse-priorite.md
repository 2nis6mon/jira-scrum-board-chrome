---
title: 'Story 3.2 — Mettre un ticket en top ou en basse priorité'
type: 'feature'
created: '2026-10-31'
status: 'done'
baseline_commit: '9ebf97459c8e92681f042646e0da124b7481c707'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-3-1-menu-carte-envoyer-vers-goal.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Changer la priorité d'un ticket exige de le glisser en tête ou en fin de sa swimlane, et le glissé ne classe que par rapport aux cartes visibles de sa cellule.

**Approach:** Ajouter au menu de carte (story 3.1) « Mettre en top priorité » et « Mettre en basse priorité » : une seule écriture E2 classe le ticket avant le premier, ou après le dernier, ticket de sa swimlane, toutes colonnes et tous sprints actifs confondus, filtres ignorés, dans l'ordre de rang Jira.

## Boundaries & Constraints

**Décisions (délégation de Denis, 31/10/2026, mode autonome) :**
- *Ordre de rang global* : l'ordre affiché réunit les sprints l'un après l'autre (`issueOrder`), ce qui n'est pas le rang Jira entre sprints. Le rang se lit donc dans le champ de rang du board (`ranking.rankCustomFieldId` de `GET /rest/agile/1.0/board/{id}/configuration`, lecture déjà faite), demandé en plus des champs de la lecture des tickets (même endpoint, aucune requête en plus), et comparé comme chaîne (LexoRank). Rang absent d'un ticket de la swimlane : si tous ses tickets sont d'un même sprint (ou Kanban), l'ordre de lecture (`issueOrder`) fait foi ; sinon les deux actions sont désactivées, raison « Ordre de rang Jira indisponible ».
- *Sous-tâches* : Jira ne classe une sous-tâche que parmi celles de son parent ; une sous-tâche se classe donc parmi les sous-tâches du même parent dans sa swimlane, un autre ticket parmi les tickets qui ne sont pas des sous-tâches.
- En Daily et en présentation, les deux actions restent permises (le glissé classe aussi en Daily). Écriture en cours : désactivées, raison de 3.1.

**Always:** swimlane = bloc où le ticket est affiché (`laneKey`) ; une seule écriture `issue.rank` (avant/après la référence), par la porte, une seule tentative ; journal « classement », avis et repère de 3.1 en cas d'échec ou d'incertitude ; réussite seulement après la relecture du board. Action déjà sans effet (premier ou dernier) désactivée, raison visible, rien d'écrit. Libellés FR/EN/ES. Configuration locale existante sans champ de rang relue sans erreur (champ `null`), complétée à la relecture de structure.

**Never:** champ Priorité Jira modifié ; nouvelle écriture, endpoint, droit ; transition ou changement d'objectif ; classement par rapport aux seules cartes visibles.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Top | swimlane G : A(rang a), B(b), C(c), ticket C | `PUT issue/rank` `{ issues:[C], rankBeforeIssue:A }` | N/A |
| Basse | même swimlane, ticket A | `{ issues:[A], rankAfterIssue:C }` | N/A |
| Déjà premier / dernier | ticket A, menu | top désactivé « Déjà en tête de sa swimlane » ; basse active | N/A |
| Seul ticket | swimlane d'un seul ticket | deux actions désactivées | N/A |
| Deux sprints | A (sprint 42, rang m), D (sprint 43, rang b), ticket A | top → avant D (rang global) | N/A |
| Filtre actif | A masqué par un filtre, ticket C | top → avant A | N/A |
| Autres colonnes | A dans « Terminé », C dans « À faire » | référence A (toutes colonnes) | N/A |
| Rang inconnu, deux sprints | champ de rang absent | deux actions désactivées « Ordre de rang Jira indisponible » | N/A |
| Rang inconnu, un sprint | champ absent, un seul sprint | ordre `issueOrder` | N/A |
| Sous-tâche | sous-tâches S1, S2 du parent P et stories dans la swimlane, ticket S2 | top → avant S1 | N/A |
| Échec | 403 sur le rang | avis « Planifier les tickets », repère, aucune nouvelle tentative | board relu |
| Écriture en cours | ticket en attente | actions désactivées « Une écriture est en cours » | N/A |

</frozen-after-approval>

## Code Map

- `src/jira/client.ts:60-76,630-652` -- `JiraBoardStructure` += `rankFieldId: string | null` (`configuration.ranking.rankCustomFieldId`, nombre → `customfield_<n>` ; absent → `null`), sur le modèle d'`estimationFieldId`.
- `src/core/boardConfiguration.ts:82,340,441` -- `BoardConfiguration.rankFieldId` (persisté comme `estimationFieldId`, `textOrNull` à la lecture : ancienne config → `null`). `src/core/boardSync.ts:~126-140` relecture de structure.
- `src/core/boardSync.ts:225-245,~456` -- ajouter `rankFieldId` aux `extraFieldIds` des lectures de tickets (Scrum et Kanban).
- `src/core/boardIssue.ts:~86,~495` -- `BoardIssue.rank: string | null` (chaîne du champ de rang). Fixtures de tests construisant `BoardIssue` : `rank: null`.
- `src/core/cardMenu.ts` -- `edgeRank(snapshot, configuration, issue, edge: "top" | "bottom")` → `{ kind: "rank"; change: RankChange } | { kind: "blocked"; reason: "first" | "last" | "unknownRank" }`, pure ; références : `allIssues` de même `laneKey`, filtrées (sous-tâches du même parent, ou non-sous-tâches), triées par `rank` (sinon `issueOrder`, règle des décisions).
- `src/app/model/BoardModel.ts:965-1080` -- extraire la fin de `dropIssue` (projection `pendingMove`, porte, `#movements.execute`, `sync`, `moveFeedback`) en méthode privée réutilisée ; ajouter `cardMenuOptions(...).top/.bottom` (raison incluse) et `rankToEdge(issueKey, edge, context)` : plan `{ goalChange: none, changesColumn: false }`, `RankChange` d'`edgeRank`. `BoardMovementService.#reportRank` journalise déjà.
- `src/app/model/BoardTypes.ts` -- `CardMenuBlocked` += `"first" | "last" | "unknownRank"` ; `CardMenuOptions.top/.bottom`.
- `src/app/views/board/CardMenu.tsx` -- deux `menuitem` après « Envoyer vers un goal », raisons comme 3.1.
- `src/i18n/board.ts`, `src/i18n/es/board.ts` -- libellés.
- Ne pas toucher : `writes.ts` (E2 existe), `core/boardMove.ts`.

## Tasks & Acceptance

**Execution:**
- [x] `src/jira/client.ts`, `src/core/boardConfiguration.ts`, `src/core/boardSync.ts`, `src/core/boardIssue.ts` -- lire le rang -- ordre global entre sprints.
- [x] `src/core/cardMenu.ts` -- `edgeRank` pur.
- [x] `src/app/model/BoardModel.ts`, `BoardTypes.ts` -- options et `rankToEdge` par le chemin du dépôt.
- [x] `src/app/views/board/CardMenu.tsx`, i18n -- deux actions.
- [x] `tests/core/cardMenu.test.ts`, `tests/app/BoardModel.cardMenu.test.ts`, `tests/app/CardMenu.test.tsx`, `tests/jira/*` (décodage `rankFieldId`), `tests/core/boardConfiguration*` (ancienne config) -- matrice.
- [x] `CHANGELOG.md`, `docs/manuel-utilisateur.md`, `docs/technique/integration-jira.md` (champ de rang lu), versions 0.40.0.

**Acceptance Criteria:**
- Given top choisi, then la seule écriture est le `PUT /rest/agile/1.0/issue/rank` attendu, puis le board est relu, journal « classement » réussi.
- Given une configuration locale sans `rankFieldId`, when le board se charge, then aucune erreur, et la relecture de structure renseigne le champ.

## Implementation Notes

- `edgeRank` (pur, `core/cardMenu.ts`) : pairs = `allIssues` de même `laneKey` et même groupe de rang (sous-tâches d'un même parent, sinon non-sous-tâches) ; tri stable par `rank` (comparaison de chaînes), égalités départagées par l'ordre de lecture. Rang manquant : repli sur l'ordre de lecture si tous les pairs ont le même `sprintId` (Kanban : `null`), sinon `unknownRank`. Une sous-tâche sans parent connu n'a aucun pair (actions désactivées).
- `rankFieldId` est décodé seulement si `rankCustomFieldId` est un entier ; `BoardIssue.rank` ne garde qu'une chaîne non vide.
- `BoardModel.#runMovement` porte la fin commune de `dropIssue` et `rankToEdge` (projection, porte, `#movements.execute`, `sync`, repère). `rankToEdge` revérifie les options (écriture en cours, déjà en tête/en fin) avant d'écrire ; plan `{ goalChange: none, changesColumn: false }`. Projection : la carte s'affiche en tête (devant la première autre carte de sa case) ou en fin de sa case jusqu'à la relecture.
- `writes.ts` inchangé : le corps E2 omet toujours `rankCustomFieldId` (champ de rang par défaut de l'instance), le champ lu ne sert qu'à l'ordre.
- Non essayé dans un vrai Chrome ni sur un Jira réel (LexoRank réel, plusieurs sprints) : tests sous happy-dom et Jira fictif.

## Spec Change Log

## Review Triage Log

| # | Source | Constat | Verdict | Preuve / route |
|---|--------|---------|---------|----------------|
| 1 | blind, edge | Champ de rang lu (board) ≠ champ écrit (défaut de l'instance, `rankCustomFieldId` omis) | medium (non vérifié) | rare (board à champ de rang propre) ; le corriger modifie le corps d'E2, décision produit → defer |
| 2 | blind | Compartiments LexoRank différents comparés comme chaînes | low | rééquilibrage Jira ; correction directe → patch |
| 3 | blind, edge | Sous-tâche seule de son groupe : « Déjà en tête » trompeur | low | fréquent (cartes de sous-tâches) → patch (raison dédiée) |
| 4 | blind, edge | `columnId === null` : action active sans effet | false | menu ouvert seulement sur une carte affichée, donc dans une colonne |
| 5 | revue (orchestrateur) | Config. antérieure à 0.40.0 : `rankFieldId` nul jusqu'à une relecture manuelle ; actions désactivées sans piste | medium | `refreshStructure` n'est appelé que depuis Sidebar/BoardSettings → patch (phrase d'aide) |
| 6 | blind | invariants.md, securite.md, donnees.md non à jour | low | patch (docs) |
| 7 | verification-gap | Projection `pendingMove` de `rankToEdge` non testée | medium | patch (test) |
| 8 | blind | Lecture Kanban du champ de rang non testée | low | patch (test) |
| 9 | blind | Test « Seul ticket » sans raison | low | patch (test) |
| 10 | edge | `rankCustomFieldId` ≤ 0 accepté | low | correction directe → patch |
| 11 | blind | CHANGELOG non rejustifié | low | patch |
| 12 | blind | Résultat incertain non testé | low | rejeté : chemin `#runMovement` commun au dépôt, couvert par `BoardModel.drop.test.ts` |
| 13 | blind | Deux sprints non testés de bout en bout | low | rejeté : règle pure couverte dans `cardMenu.test.ts`, lecture du champ testée |
| 14 | blind | Repli partiel ignore les rangs connus | false | décision de la spec (rang absent → ordre de lecture) |
| 15 | blind | Statut spec ≠ sprint-status | false | sprint-status passe à `review` à la présentation |
| 16 | blind | `edgeRank` recalculé plusieurs fois | low | rejeté : coût négligeable sur un board |
| 17 | edge | Référence périmée si la porte attend pendant une relecture | low | rejeté : même comportement que le dépôt, rare |

## Verification

**Commands:**
- `npm run check` -- expected: vert
- `npm run verify:jira` -- expected: vert
- `npm run verify:i18n` -- expected: vert
