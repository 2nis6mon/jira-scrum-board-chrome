---
title: 'Story 8.32 — Changer d''objectif sur le board sans changer d''état'
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

**Problem:** Sur le Sprint Board, glisser une carte vers la swimlane d'un autre objectif propose une zone par colonne (et des zones de statut) : un même dépôt peut changer à la fois l'objectif et l'état du ticket, voire son rang. On change d'état sans le vouloir en lâchant la carte dans la mauvaise colonne.

**Approach:** Décision de Denis du 05/11/2026 : changer d'objectif ou de swimlane ne change jamais l'état.
- Pendant le glisser, toute swimlane autre que celle de départ (objectif, ou swimlane par défaut du type) est une seule zone de dépôt, en-tête compris, avec le message « Rattacher à cet objectif » ou « Retour dans la swimlane par défaut » ; ni zone par colonne, ni zone de statut. Une swimlane refusée (`accepts`) reste indisponible avec son message actuel.
- Lâchée n'importe où dans cette swimlane, la carte ne change que d'objectif (E5 en texte, E4 puis E3 en Goals, règles actuelles) : ni transition, ni rang ; elle garde sa colonne.
- Dans la swimlane de départ, rien ne change : transition (zones de statut, formulaire natif) et rang, sans changer d'objectif.
- Aucune lecture ni écriture Jira ajoutée ; le modèle refuse désormais un dépôt qui changerait objectif et colonne à la fois. `verify:drag` joue un glisser vers un autre objectif depuis une colonne (objectif changé, état et rang inchangés) ; manuel et guides EN/ES à jour. Scrum et Kanban partagent ce code.

</frozen-after-approval>

## Implementation Notes

- `BoardTypes.ts` : `DragState.laneId`, swimlane où la carte est affichée au début du geste (`laneKey`), posée par `BoardModel.startDrag`. `DropTarget.columnId` peut valoir `null` : toute une autre swimlane ; `refused` marque une swimlane survolée qui refuse la carte.
- `BoardModel.ts` : nouvelle `dropOnLane(issueKey, block)`, qui appelle `dropIssue` sur la colonne actuelle du ticket, sans position. `dropIssue` refuse sans requête un dépôt qui changerait objectif et colonne, et n'écrit jamais de rang quand l'objectif change (le rang n'était déjà pas écrit sans position, une carte venue d'ailleurs étant comptée en fin de case).
- `BoardView.tsx` (`LaneView`) : hors de la swimlane de départ, la section entière (en-tête compris, donc aussi une swimlane repliée) reçoit `dragover`/`drop` ; les cases s'effacent. Classes `lane-drop-zone`, `lane-drop-target`, `lane-drop-unavailable` et `aria-disabled` sur la section. Les cases et les zones de statut ne servent plus que dans la swimlane de départ. Le message de dépôt (`lane-drop-message`) est collant sous l'en-tête et sans hauteur : visible sur une longue swimlane, sans décaler les cases. Le message de refus ne paraît qu'au survol (avant : sur chaque case de toutes les swimlanes refusées) ; une capture l'a montré débordant sur l'en-tête suivant.
- `app.css` : règles de la swimlane entière, placées après `.lane-cell` et `.lane-item` (ordre de spécificité) ; `.drop-goal-message`, devenue inutile, est retirée.
- Choix fait seul : le chemin « transition puis objectif » de `BoardMovementService` reste en place, même s'il n'est plus emprunté par le board (aucun autre appelant ne combine les deux) ; le retirer toucherait `core/boardMove.ts` sans changer le comportement.
- Tests : les tests du modèle qui combinaient objectif et colonne déposent maintenant dans la swimlane de départ, ou constatent le refus sans requête ; nouveau `BoardDragGoal.test.tsx` (vrais événements de glisser : zone unique, dépôt sur « Terminé » qui ne change que l'objectif, en-tête d'une swimlane repliée, refus au survol). Kanban : `KanbanBoard.test.tsx` vérifie la zone unique de la swimlane par défaut (même `LaneView`). `verify:drag` lâche RUN-7 sur la colonne « Terminé » des autres swimlanes et constate objectif changé, colonne « En cours » gardée, aucune transition ni rang. Le banc de glisser n'a pas de scénario Kanban : couvert par le test de vue.
- Docs : manuel et guides EN/ES, `invariants.md`, `developpement.md`, `CHANGELOG.md`, version 0.49.1. Aucun nouveau texte : `verify:i18n` non rejoué.
- Vérifications : `npm run check` (2025 tests), `verify:drag`, `verify:jira` verts ; captures du survol (cible et refus) relues sur le banc fictif.

## Review Triage Log

Relecture faite sans sous-agent (rythme de l'Epic 8).

| # | Constat | Verdict | Suite |
|---|---------|---------|-------|
| 1 | Le message de dépôt, en bas de la section, est hors de l'écran sur une swimlane plus haute que la fenêtre. | medium | Corrigé : message collant sous l'en-tête, sans hauteur. |
| 2 | Message aplati en une barre (flex étiré sur une hauteur nulle), vu sur capture. | medium | Corrigé : `align-items: flex-start`. |
| 3 | Les messages de refus de toutes les swimlanes refusées s'affichent en même temps ; celui d'une swimlane sortant par le haut déborde sur l'en-tête suivant. | medium | Corrigé : message au survol seulement (critère « quand je la survole »). |
| 4 | Passer d'une swimlane à l'autre pourrait effacer la nouvelle cible (`dragleave` après `dragover`). | false | `dragleave` n'efface que si la cible est encore cette swimlane. |
| 5 | `dropOnLane` étant asynchrone, `endDrag` pourrait effacer le glisser avant que `dropIssue` lise le statut connu. | false | `dropIssue` lit `dragging` avant son premier `await` ; test de vue vert. |
| 6 | Le message ciblé d'une swimlane presque sortie par le haut peut encore déborder de quelques pixels sur la suivante. | low | Rejeté : le pointeur est alors sur la swimlane visée, cas rare, sans effet sur le dépôt. |
| 7 | Le chemin « transition puis objectif » de `BoardMovementService` n'est plus emprunté. | low | Rejeté : sans effet, voir les notes. |
