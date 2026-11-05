---
title: 'Story 8.30 — Les mêmes gestes à la souris sur une carte du board et du planning'
type: 'bugfix'
created: '2026-11-04'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-8-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Denis l'a signalé en testant la 8.28 le 04/11/2026 : un même geste ne fait pas la même chose sur les deux écrans. Sur le Sprint Board, Ctrl+clic sur une carte (`a.card`, `target="_blank"`) ouvre le ticket dans un nouvel onglet. Dans le Sprint Planning, le même geste sélectionne la carte, seule la clé ouvre la fiche, et le clic du milieu ne fait rien. On ouvre un onglet en croyant sélectionner, ou l'inverse.

**Approach:** Décision de Denis du 04/11/2026, appliquée aux deux écrans :
- clic simple n'importe où sur la carte : la fiche native ; les boutons de la carte (⋯, estimation) gardent leur action ;
- clic du milieu : nouvel onglet ;
- Ctrl/Cmd+clic et Maj+clic (plage dans la même colonne et la même swimlane) : sélection, sans onglet ni fenêtre, avec le même repère et le même compteur que le planning ; Échap vide la sélection.

Sur le board, le périmètre se limite à la sélection elle-même ; les actions groupées restent à décider (backlog). Aucune lecture ni écriture Jira n'est ajoutée. La sélection du planning (8.15) ne change pas, et les bancs `verify:drag` et `verify:planning` jouent ces gestes.

</frozen-after-approval>

## Implementation Notes

- `src/app/model/CardSelection.ts` (nouveau) : sélection du board. Ctrl/Cmd+clic ajoute ou retire une carte. Maj+clic prend la plage entre la dernière carte choisie et celle-ci, dans la liste affichée de la colonne ; sans départ dans cette liste, il agit comme Ctrl+clic. `BoardModel.cardSelection` porte cette sélection et `selectedKeys` ne garde que les tickets encore sur le board. La sélection est vidée au changement de board. Celle du planning (`PlanningModel.selection`, 8.15) n'est pas touchée.
- `IssueCard.tsx` : props `selected` et `onSelect`. Avec une touche, le clic gauche est empêché : pas d'onglet. Le clic simple reste au lien, intercepté par `integration/embedded.ts` (inchangé) pour ouvrir la fiche native. Le clic du milieu reste celui du lien. La carte reçoit `card-selected` et l'annonce masquée « Sélectionné ».
- `PlanningView.tsx` : la carte entière ouvre la fiche au clic simple, carte en consultation comprise. `ownControl` laisse leur action aux boutons, au champ et au menu, mais pas à la clé, qui reste le bouton d'accès au clavier. Le clic du milieu passe par `window.open` (`noopener,noreferrer`) sur `PlanningModel.issueUrl` (adresse `/browse/` des seuls tickets du planning). Sous Windows, son `mousedown` est empêché pour ne pas lancer le défilement automatique.
- Éléments partagés : `views/SelectionChip.tsx` (compteur et hook `useEscapeClearsSelection`, repris du planning), et `.card-selected` / `.selection-chip` dans `app.css`. Les classes `planning-selection` et `planning-card-selected` restent pour les bancs. Sur le board, le compteur dit « Échap vide la sélection. » : nouveau texte en anglais et en espagnol.
- Bancs :
  - `verify:drag` joue Ctrl, Cmd et Maj+clic sur trois cartes, vérifie le repère, le compteur et l'absence d'onglet, puis Échap, puis un clic du milieu laissé au lien. Celui-ci est intercepté après coup pour ne rien ouvrir. Le board fictif n'a qu'une carte par colonne : la plage d'une colonne est couverte par les tests unitaires.
  - `verify:planning` joue un clic simple sur une carte (fiche native, notée par le banc via `nativeIssueHandler`) et un clic du milieu (`window.open` intercepté).
- Docs : manuel et guides EN/ES (board), `invariants.md`, `developpement.md`, `CHANGELOG.md`, version 0.49.0.
- Vérifications : `npm run check` (2022 tests), `verify:drag`, `verify:planning`, `verify:planning:package`, `verify:jira` et `verify:i18n` verts.

## Review Triage Log

Relecture faite sans sous-agent (rythme de l'Epic 8).

| # | Constat | Verdict | Suite |
|---|---------|---------|-------|
| 1 | La clé du planning, bouton, ouvrirait la fiche deux fois (son propre clic et celui de la carte). | false | Son gestionnaire est retiré : Entrée, Espace ou clic passent par la carte, une seule fois (test « clic simple n'importe où »). |
| 2 | Échap dans le menu de carte du board viderait la sélection en même temps. | false | Le hook ignore un Échap déjà traité (`defaultPrevented`), un champ, ou un dialogue, menu ou `details` ouvert. Même règle que le planning depuis la 8.15. |
| 3 | Un ticket sélectionné qui quitte le board resterait compté. | false | `selectedKeys` croise la sélection avec les tickets du snapshot. |
| 4 | La plage du Maj+clic sur le board suit l'ordre affiché, pas le rang Jira. | false | C'est voulu, comme dans le planning (`sectionKeys`) : la plage est celle que l'utilisateur voit dans la colonne. |
| 5 | Sur le board, un ticket sélectionné puis masqué par un filtre reste sélectionné. | low | Rejeté : sans action groupée sur le board, sans effet. À reprendre avec la décision du backlog sur les actions groupées (même question que la 8.15). |
