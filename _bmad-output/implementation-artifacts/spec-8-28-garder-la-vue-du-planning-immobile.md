---
title: 'Story 8.28 — Garder la vue du planning immobile quand des cartes lointaines sont sélectionnées'
type: 'bugfix'
created: '2026-11-03'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-8-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Essai 8.10 (défaut D2) : avec des cartes sélectionnées loin dans une colonne qui défile, le document de la vue déborde. L'annonce « Sélectionné » (`.visually-hidden`, `position: absolute`) n'a de bloc conteneur ni dans `.planning-card` ni dans la colonne. Elle échappe donc au rognage de `.planning-sources` / `.planning-lanes` et allonge la page (annonces jusqu'à 3 526 px pour 691 visibles). La vue défile alors, de 2 835 px pendant un glisser, et l'en-tête et les filtres quittent l'écran. Reproduit sur le banc fictif : 717 px pour une fenêtre de 520 px avec une carte sélectionnée en bas de « Où sont les tickets ».

**Approach:** Donner un bloc conteneur à la carte du planning et aux deux colonnes qui défilent, pour que tout texte masqué positionné reste rogné par sa colonne, y compris les libellés masqués des pastilles d'état des en-têtes d'objectif (`position: static` dans le planning). CSS seulement, sans changer l'affichage. Le banc Chrome réel vérifie que le document garde la hauteur de la fenêtre, après une sélection en bas de colonne et pendant un glisser dans la bande basse.

</frozen-after-approval>

## Implementation Notes

- Contrôle rendu rouge d'abord sur le banc (`verify:planning`) : « Sélection de ABC-204 en bas de colonne : la vue déborde (717 px pour 520 visibles) ». Sans le correctif, la mesure pendant le glisser du lot échoue aussi (même 717 px).
- `src/app/styles/planning.css` : `position: relative` sur `.planning-card`, `.planning-sources` et `.planning-lanes`. `.visually-hidden` est le seul élément positionné dont le bloc conteneur change : menus et autocomplétion ont déjà un ancêtre positionné, et leur z-index (20, 40) les garde au-dessus des colonnes. Les libellés masqués des pastilles d'état (`LaneHeader`, en-tête `position: static` dans le planning) sont rognés par `.planning-lanes`. Sur le board, l'en-tête collant les contient déjà.
- `scripts/browser-check.mjs` : nouvel assistant `checkDocumentStill` (hauteur du document égale à celle de la fenêtre, aucun défilement), appelé par `checkDragAutoScroll` dans la bande basse. Le board (`verify:drag`) et le planning sont donc couverts pendant un glisser.
- `scripts/verify-planning.mjs` : carte sélectionnée en bas de « Où sont les tickets », fenêtre de 520 px, mesure, puis Échap ; le glisser du lot (8.15, ABC-204 en bas de colonne) vérifie aussi le défilement de `.planning-sources`.
- `docs/technique/developpement.md`, `CHANGELOG.md`, version 0.48.8.
- Vérifications : `npm run check` (2016 tests), `verify:planning`, `verify:planning:package`, `verify:drag` et `verify:jira` verts. `verify:i18n` n'est pas lancé, faute de texte visible modifié. Deux échecs de timing intermittents des bancs, antérieurs, sont reportés dans deferred-work.md.

## Review Triage Log

Relecture faite sans sous-agent (rythme de l'Epic 8).

| # | Constat | Verdict | Suite |
|---|---------|---------|-------|
| 1 | Les colonnes, devenues positionnées, pourraient passer au-dessus des panneaux de menu ou de filtre ouverts dans l'en-tête. | false | `.menu-panel` et `.filter-menu-panel` en z-index 20, `.jql-suggestions` en 40 ; aucun contexte d'empilement dans l'en-tête du planning ; les menus de carte sont en `position: fixed`. |
| 2 | Le nouvel assistant s'était inséré entre la documentation de `checkDragAutoScroll` et sa fonction. | low | patch : documentation remise en place. |
| 3 | La mesure du document était écrite deux fois (banc planning et assistant partagé). | low | patch : un seul assistant exporté, `checkDocumentStill`. |
| 4 | Le même débordement pourrait toucher d'autres écrans (`.visually-hidden` des réglages, du board). | false | Board : légendes dans des `details` positionnés, pastilles dans l'en-tête collant ; la mesure du board pendant le glisser passe. Les réglages sont hors de cette story et n'ont pas été constatés. |
| 5 | Échecs intermittents des bancs (contrôle 8.24, étape 640 px). | maybe-false | defer : antérieurs à cette story et réussis aux relances ; à confirmer fenêtre visible puis masquée (deferred-work.md). |
