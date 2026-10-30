---
title: 'Story 1.4 — Une seule porte d''écriture par board'
type: 'refactor'
created: '2026-10-30'
status: 'done'
baseline_commit: 'a45a443025910d0bddb8fbb3b83ae95f9d02bc54'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Les écritures d'un board passent par des files séparées : `BoardSettingsService.#teamQueue` pour les réglages et l'épinglage Kanban, `BoardModel.dropIssue` gardé seulement par `pendingKeys`, et rien pour le rattachement texte ni pour la publication du planning ; `PlanningModel` reçoit le `JiraTransport` brut et écrit lui-même dans le journal.

**Approach:** `BoardModel` détient une porte unique (`app/model/BoardWriteGate.ts`) : une file qui sérialise chaque geste qui écrit, et qui remet à `core` et aux services un `JiraWriter` et un `setLink` décorés (péremption de génération ; `canEdit` pour E6 seulement). Services et `PlanningModel` acquièrent cette porte au lieu de leur propre file ou du transport.

## Boundaries & Constraints

**Always:** un geste qui écrit pendant qu'un autre écrit sur le même board attend sa fin, puis part ; une écriture préparée pour une génération de board dépassée est refusée avant l'envoi (comportement actuel des gardes `stale()`) ; `canEdit` ne refuse que `boardProperty.put` (E6), E1–E5, E8, E9 restent aux droits Jira ; une seule tentative ; avis et entrées de journal inchangés ; `PlanningModel` publie par la porte et son entrée « sprint planning » est écrite par le journal du board (`BoardModel.#record`), même contenu.

**Never:** nouvelle écriture ; laisser un service ou modèle construire sa propre file ; donner le `JiraTransport` brut à un service, à `PlanningModel` ou à `core` ; supprimer les protections d'interface existantes (`pendingMove` à un seul déplacement à la fois, `transitionChoice`, `nativeTransitionPending`) ; changer les textes visibles.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Réglage pendant un déplacement | dépôt en cours, `changeShared` déclenché | la publication des réglages commence après la fin des écritures du dépôt | N/A |
| Épinglage pendant un réglage | réglage en file | l'épinglage attend (comme avec `#teamQueue` aujourd'hui) | N/A |
| Publication du planning pendant un réglage | réglage en file | la publication attend la fin du réglage | N/A |
| Changement de board pendant l'attente | génération incrémentée | le geste en attente n'écrit rien | comportement `stale()` actuel |
| `canEdit` faux | rattachement texte (E5), transition (E1) | écritures envoyées, Jira tranche | N/A |
| `canEdit` faux | `boardProperty.put` (E6) | refusé avant l'envoi | message actuel « Le board ou ses droits ont changé… » |

</frozen-after-approval>

## Code Map

- `src/app/model/BoardWriteGate.ts` (nouveau) -- `run<T>(task: (access: { writer: JiraWriter; goals: Pick<GoalsClient,"setLink"> }) => Promise<T>): Promise<T>` : file promise unique, erreurs isolées (une tâche rejetée ne bloque pas la suivante) ; décorateur : refuse si génération changée/board disposé, et refuse E6 si `canEditSettings` faux ; compteur `busy` lisible pour `canWrite` du planning.
- `src/app/model/BoardModel.ts` -- construction (l. ~293–390) : créer la porte, la passer aux services et au planning à la place de `transport` ; `dropIssue` (l. ~875) acquiert la porte autour de `#movements.execute` ; conserver `pendingKeys`/`pendingMove` pour l'interface.
- `src/app/services/BoardSettingsService.ts` -- supprimer `#teamQueue` ; `changeShared`, `changeSharedConfirmed`, `savePinnedGoals` (sprint et board) passent par la porte ; retirer les writers décorés locaux s'ils doublent le décorateur (garder les contrôles propres au geste, ex. famille JQL).
- `src/app/services/BoardMovementService.ts` -- reçoit writer/goals de la porte pour la durée du geste (paramètre de `execute` ou accès par la porte), plus le transport.
- `src/app/model/PlanningModel.ts` -- remplacer `transport: Pick<JiraTransport,"write">` et `context.audit` par `context.write(task)` (la porte) et `context.record(entry)` ; `publish` (l. ~356) appelle `publishSprintPlanning` dans `context.write`.
- `src/app/services/ports.ts` -- y déclarer le type de la porte vu des services si utile (AD-3 : pas de Preact dans les services).
- Tests : `tests/app/BoardModel.concurrency.test.ts`, `tests/app/BoardModel.team.test.ts`, `tests/app/PlanningModel.test.ts`, `tests/app/services/BoardServices.test.ts`.

## Tasks & Acceptance

**Execution:**
- [x] `src/app/model/BoardWriteGate.ts` -- file unique et décorateur -- AD-6
- [x] `src/app/model/BoardModel.ts` -- composer et faire passer tous les gestes par la porte -- AD-6
- [x] `src/app/services/BoardSettingsService.ts`, `src/app/services/BoardMovementService.ts` -- plus de file propre ni de transport -- AD-6
- [x] `src/app/model/PlanningModel.ts` -- publication par la porte, journal par le board -- AD-2/AD-6
- [x] `tests/app/BoardWriteGate.test.ts` (nouveau) et `tests/app/BoardModel.concurrency.test.ts` -- matrice : sérialisation entre gestes, péremption, E6 seul refusé sans `canEdit`, `core` ne reçoit jamais l'instance `JiraTransport` (espion sur les arguments) -- CAP-4
- [x] `tests/guards/sources.test.ts` -- garde : `src/app/services/` et `PlanningModel.ts` n'importent pas `JiraTransport` en valeur et ne contiennent pas `Queue`/`.then(` de file propre (au moins : plus de `#teamQueue`) -- régression
- [x] `ARCHITECTURE-SPINE.md` -- retirer les écarts AD-6 et « AD-2, AD-6 PlanningModel » ; `CHANGELOG.md` sous 0.36.2

**Acceptance Criteria:**
- Given les tests existants, when `npm run check` tourne, then ils passent ; une attente ne change que si elle reposait sur deux écritures simultanées, et ce changement est noté dans Implementation Notes.
- Given `npm run verify:drag`, `verify:settings` et `verify:planning`, when ils tournent, then ils passent.

## Implementation Notes

- `BoardWriteGate.run(task, { refusal? })` : la génération est capturée à l'appel (le geste est préparé pour le board affiché), puis vérifiée à chaque `write`/`setLink`. Le message de refus reste celui de chaque geste : « Le board ou ses droits ont changé avant l'enregistrement. » par défaut (réglages), « Le board ou vos droits ont changé : rien n'a été écrit. » pour l'épinglage Kanban ; aucun texte nouveau.
- Contrat de la porte vu des services dans `services/ports.ts` (`BoardWriteAccess`, `BoardWriteGateway`) ; `busy` est un signal de la porte, lu par `canWrite` du planning et `canSwitchBoard`.
- `BoardMovementService.execute(command, access)` reçoit l'accès de la porte ; son constructeur ne prend plus ni writer ni goals. `BoardSettingsService` reçoit la porte à la place du writer ; `#teamQueue` et les writers décorés locaux disparaissent, les contrôles propres au geste (board identique, famille JQL, `canEdit` au début de l'épinglage Kanban) restent.
- `PlanningModel(client, platform, context)` : `context.write` (la porte) et `context.record` (journal du board) remplacent le transport et `context.audit`. L'entrée « sprint planning » garde action, ticket, de/vers, résultat et détail ; son horodatage vient désormais de l'horloge du board.
- Nouveaux comportements limités aux cas de concurrence : l'épinglage d'un sprint et le déplacement attendent aussi la porte (auparavant hors file), et un déplacement préparé pour un board quitté est refusé avant l'envoi. Aucune attente des tests existants n'a changé ; seules les constructions de `PlanningModel`, `BoardMovementService` et `BoardSettingsService` dans les tests ont suivi les nouvelles signatures.
- Garde de sources : services et `PlanningModel.ts` ne nomment ni `JiraTransport` ni `graphqlWrite`, aucun `.then(` dans les services, seule file tolérée `#saveQueue` (brouillons locaux du planning), et `new BoardWriteGate` uniquement dans `BoardModel.ts`.

## Spec Change Log

## Review Triage Log

| # | Constat | Verdict | Preuve / route |
|---|---------|---------|----------------|
| 1 | Pendant sa propre publication, le planning affiche « Attendez la fin de l'opération en cours sur le board. » | high | `canWrite` lit `busy`, que la publication incrémente elle-même : texte visible nouveau ; patch + test `BoardModel` réel |
| 2 | Publication du planning et journal non testés à travers le vrai `BoardModel` | medium | Gap pré-vérifié ; patch avec le n° 1 |
| 3 | Génération capturée après `await #saveQueue` : publication pour un board quitté non refusée | medium | `run` appelé après l'attente ; patch (appeler `context.write` avant) |
| 4 | Test `canEdit` limité à quelques kinds | low | Ajout direct : boucle sur l'inventaire ; patch |
| 5 | Test du planning fondé sur un délai | low | `setTimeout(20)` ; patch direct |
| 6 | Spine et invariants décrivent l'ancienne file et le contrôle de droits du service | low | Doc ; patch direct |
| 7 | Épinglage Kanban et `#saveShared` sans contrôle d'identifiant de board à l'écriture | false | Tout changement de board incrémente la génération que la porte compare |
| 8 | Refus de la porte journalisé « échec » pour un board quitté | low | Rejeté : l'entrée dit vrai (rien n'a été envoyé), board déjà fermé |
| 9 | Dépôt en attente derrière un réglage, colonnes du plan périmées | low | Rejeté : avant, le dépôt partait en parallèle sur la même configuration ; `moveToColumn` relit le statut |
| 10 | Tâche périmée exécute encore ses lectures | low | Rejeté : aucune écriture ne part |
| 11 | `record` du planning pourrait rejeter | low | Rejeté : `BoardModel.#record` avale les erreurs de stockage |
| 12 | Garde contournable dans `BoardModel` (transport brut) | low | Rejeté : `BoardModel` est la racine de composition autorisée |
| 13 | Assertions `not.toBeInstanceOf(JiraTransport)` faibles ; ordre POST/PUT | low | Rejeté : la sérialisation est prouvée par l'absence de PUT pendant la pause |
| 14 | Commentaire trop long, spec non finalisée | low | Rejeté : biome vert ; spec finalisée à l'étape 5 |

## Verification

**Commands:**
- `npm run check` -- expected: vert
- `npm run verify:drag`, `npm run verify:settings`, `npm run verify:planning` -- expected: verts
- `npm run verify:jira` -- expected: vert
