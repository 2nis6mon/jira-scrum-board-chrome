---
title: 'Story 8.33 — Déplacer plusieurs cartes du board vers un objectif'
type: 'feature'
created: '2026-11-05'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-8-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Depuis la 8.30, on sélectionne plusieurs cartes du Sprint Board (Ctrl/Cmd+clic, Maj+clic), mais la sélection n'a aucune action : pour réorganiser le sprint par objectif, il faut rattacher chaque ticket un par un.

**Approach:** Décision de Denis du 05/11/2026 : une sélection de plusieurs cartes ne change que d'objectif ou de swimlane, jamais d'état ni de rang.
- Glisser une carte de la sélection emmène tout le lot. Seules les swimlanes d'objectif ou par défaut sont des zones de dépôt, entières comme en 8.32, swimlane de départ comprise ; aucune zone de colonne ni de statut. Une swimlane qui refuse un ticket du lot (`accepts`) est indisponible, avec un message, et rien n'est écrit.
- Au dépôt, seul l'objectif de chaque ticket change : une seule E5 par sprint en texte, E4 si besoin puis E3 par ticket en Goals Atlassian ; ni transition, ni rang ; la sélection est vidée.
- Une seule tentative par écriture, arrêt au premier échec, relecture ; l'avis dit les tickets confirmés et ceux à refaire, comme le lot du planning (8.15), en français, anglais et espagnol.
- Le menu d'une carte de la sélection applique ses objectifs à tout le lot ; ses entrées de rang (le menu du board n'a pas d'entrée de statut) sont désactivées avec leur raison.
- Aucune nouvelle route d'écriture (E3, E4, E5), au plus 50 tickets par lot (refus avant toute écriture), une entrée de journal par lot ; `verify:drag` joue la sélection de deux cartes, leur glisser vers un objectif et le refus d'une swimlane incompatible.

</frozen-after-approval>

## Implementation Notes

- `core/boardMove.ts` : `assignGoalBatch` (et `BOARD_BATCH_LIMIT`, 50). En texte, les tickets sont regroupés par sprint de la propriété (`textLinkSprintId`) ; une `updateSprintGoalProperty` par groupe, dont la mutation applique `withTextGoalLink` à chaque ticket, refusée si le lien d'un ticket du groupe a changé dans Jira depuis le chargement. En Goals, `changeAtlassianGoal` ticket par ticket. Résultat typé : tickets confirmés, à refaire, et premier échec (`GoalStepResult` du ticket).
- `BoardMovementService.executeGoalBatch` : l'avis du premier échec reprend celui d'un ticket seul (`#reportGoal` sans journal : paramètre `journal` ajouté à `#reportGoal`, `#reportAtlassianGoal` et `#fail`), complété par « Tickets confirmés : … . À refaire : … . » (clés déjà au catalogue pour le planning). Une seule entrée « rattachement » par lot, `issueKey` nul, détail « Tickets {p0} : {p1} ».
- `BoardModel` : `DragState.keys` et `lanes` (lot et destination par défaut de chacun), posés par `startDrag` d'après la sélection (`#gestureKeys` : toute la sélection si la carte en fait partie et qu'elle compte plusieurs cartes). Un lot ne lit aucune transition. `acceptsDrag(block)` vérifie tout le lot. `dropOnLane` et `sendToGoal` passent par `#sendBatchToGoal` pour un lot : refus au-delà de 50 tickets (« Lot de {n} tickets : au plus 50 par geste. », texte du planning), seuls les tickets dont l'objectif affiché change sont écrits, porte d'écriture, cartes en attente, relecture ; la sélection est vidée, ou réduite aux tickets à refaire (`CardSelection.keep`). Vers une swimlane par défaut, chaque ticket rejoint la sienne : `acceptsDrag` garantit qu'elle est la même pour tout le lot.
- Menu : `cardMenuOptions` renvoie `keys` ; pour un lot, `batchGoalTargets` (`core/cardMenu.ts`) propose tous les objectifs non masqués et « Retirer du goal » si chaque ticket rattaché a sa destination par défaut affichée ; top et basse priorité sont bloqués (`selection`). `CardMenu.tsx` affiche « {count} tickets sélectionnés » et la raison « Indisponible pour une sélection de plusieurs tickets » (nouveau texte EN/ES).
- Vue : `wholeLaneDrag` (BoardView) étend la zone entière de la 8.32 à toutes les swimlanes pour un lot ; toutes les cartes du lot portent `card-dragging`.
- Choix fait seul : comme dans le planning (8.15), un ticket sélectionné puis masqué par un filtre reste dans le lot ; la question reste ouverte au backlog, complétée pour le board.
- Tests : `tests/core/boardMove.test.ts` (une E5 par sprint sur deux sprints réunis, échec au second), `tests/app/BoardModel.batch.test.ts` (glisser d'un lot, swimlane de départ, refus, conflit, plus de 50, menu, carte hors sélection, Goals avec refus au milieu), `BoardDragGoal.test.tsx` (lot en vrais événements), `CardMenu.test.tsx` (en-tête, rang désactivé, envoi du lot). `verify:drag` : sélection au Ctrl+clic de deux cartes, glisser vers un objectif (une écriture, colonne gardée, sélection vidée), puis un lot RUN + OPS refusé par OPS, sans écriture.
- Docs : manuel et guides EN/ES, `invariants.md`, `developpement.md`, backlog (question du filtre), `CHANGELOG.md`, version 0.50.0.
- Vérifications : `npm run check` (2037 tests), `verify:drag`, `verify:jira`, `verify:i18n` verts.

## Review Triage Log

Relecture faite sans sous-agent (rythme de l'Epic 8).

| # | Constat | Verdict | Suite |
|---|---------|---------|-------|
| 1 | Vers une swimlane par défaut, `#sendBatchToGoal(null)` envoie chaque ticket vers sa propre destination, pas forcément la swimlane visée. | false | `acceptsDrag` n'accepte une swimlane par défaut que si tout le lot a cette destination. |
| 2 | Un lot dans une swimlane de départ pourrait encore afficher « Lecture des transitions… » dans les cases. | false | Les messages de case ne paraissent que pour un glisser d'une seule carte depuis sa swimlane (`fromHere`). |
| 3 | En texte sans sprint où écrire (`noSprint`), le lot s'arrête sans avis ni journal. | low | Rejeté : même silence qu'un ticket seul ; cas sans sprint actif, où les objectifs texte n'existent pas. |
| 4 | Une E5 au résultat incertain dit « À refaire » pour des tickets peut-être écrits. | low | Rejeté : même présentation que le lot du planning ; l'avis dit déjà que l'écriture a peut-être eu lieu et le board est relu. |
| 5 | Banc : après le premier lot, Build est vide et masqué ; le refus visait une swimlane absente. | medium | Corrigé : le refus vise OPS, qui refuse RUN-7. |
