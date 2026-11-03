---
title: 'Story 8.24 — Faire défiler le board et le planning pendant le glisser d''un ticket'
type: 'bugfix'
created: '2026-11-03'
status: 'ready-for-dev'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-8-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Signalé par Denis le 02/11/2026 : pendant le glisser d'un ticket à la souris, approcher la carte du haut ou du bas du board ne le fait pas défiler ; un objectif hors de l'écran est impossible à atteindre. Le glisser est le glisser-déposer HTML natif ; le board (`.board`) et le planning (`.planning-lanes`, `.planning-sources`) défilent dans leur propre conteneur, dans l'iframe injectée dans Jira, et l'extension ne fait défiler aucun d'eux pendant un glisser.

**Approach:** Pendant un glisser, quand le pointeur entre dans une bande au bord d'un de ces trois conteneurs, le faire défiler vers ce bord, d'autant plus vite que le pointeur s'en approche ; arrêt au dépôt, à l'abandon, à la sortie de la bande ou de la vue. Un seul mécanisme pour le board et le planning.

**Décision de Denis (03/11/2026) :** la molette ne fait pas défiler pendant le glisser (constaté par Denis dans son Chrome) ; le critère sort de la 8.24, la bande de défilement suffit. Faire marcher la molette exigerait de remplacer le glisser natif, hors de cette story.

## Boundaries & Constraints

**Always:** vue seulement (`src/app/views/`) ; même mécanisme pour les trois conteneurs ; glisser natif conservé (zones de dépôt, données transmises, `dropEffect` inchangés) ; fonctionne même quand une zone enfant arrête la propagation de `dragover` ; vertical et horizontal là où le conteneur déborde (le board peut déborder en largeur).

**Never:** aucune lecture ni écriture Jira, aucun texte visible nouveau ; ni bibliothèque de glisser-déposer, ni remplacement du glisser natif ; ne pas toucher aux glissers des réglages ni de la barre latérale.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Bord bas | glisser en cours, pointeur dans la bande basse de `.board` | défile vers le bas, plus vite près du bord, jusqu'à la fin du contenu | — |
| Bord haut | pointeur dans la bande haute | défile vers le haut ; rien en haut du contenu | — |
| Milieu | pointeur hors des bandes | aucun défilement | — |
| Fin du glisser | dépôt, abandon (Échap) ou pointeur hors de la vue | arrêt immédiat | arrêt de sécurité si plus aucun `dragover` depuis 1 s |
| Planning | glisser d'une ou plusieurs cartes, bande de `.planning-lanes` ou de `.planning-sources` | la zone survolée défile, pas l'autre | — |
| Hors glisser | survol à la souris sans glisser | rien | — |

</frozen-after-approval>

## Code Map

- `src/app/views/board/BoardView.tsx:1142` -- `<div class="board">`, conteneur du board (`overflow: auto`, `app.css:842-851`). Cases (`lane-cell`, l. ~1368) et swimlanes (l. ~1232) gèrent `dragover` ; ne pas les modifier.
- `src/app/views/planning/PlanningView.tsx:842` -- `aside.planning-sources` (`overflow-y: auto`, `planning.css:177`), porte `useDrop` (l. 763) qui appelle `stopPropagation` ; l. 899 : le reste à faire actif arrête aussi `dragover`. D'où l'écoute en phase de capture.
- `src/app/views/planning/PlanningView.tsx:974` -- `section.planning-lanes` (`overflow-y: auto`, `planning.css:288`).
- `src/app/App.tsx` -- composant racine, rendu aussi par le banc (`tests/harness/harness.tsx`) : y installer le mécanisme une fois (`useEffect`), pas dans `main.tsx` que le banc n'exécute pas.
- `scripts/verify-drag.mjs` -- banc Chrome réel : `Input.setInterceptDrags` puis `Input.dispatchDragEvent` (l. 21, 86) ; scénario `board-drag-regression` (hauteurs 1200 et 800) à réutiliser avec une fenêtre plus basse que le board.
- `scripts/verify-planning.mjs:140` -- helper `drag(...)` du planning (même technique), scénario `board-planning`.
- `docs/manuel-utilisateur.md:123-128` -- « Ouvrir et déplacer les tickets ».

## Tasks & Acceptance

**Execution:**
- [ ] `src/app/views/dragAutoScroll.ts` -- fonction pure du pas de défilement (position, bornes du conteneur → pas signé par axe), et installation sur une fenêtre : `dragover` en capture (cible `closest('[data-drag-scroll]')`, position mémorisée, boucle `requestAnimationFrame`), arrêt sur `drop`, `dragend`, sortie de la vue (`dragleave` sans `relatedTarget`) ou 1 s sans `dragover` ; renvoie la fonction de désinstallation.
- [ ] `src/app/App.tsx` -- installer une fois, désinstaller au démontage.
- [ ] `BoardView.tsx`, `PlanningView.tsx` -- attribut `data-drag-scroll` sur `.board`, `.planning-sources`, `.planning-lanes`.
- [ ] `tests/app/dragAutoScroll.test.ts` -- pas : milieu, bandes, au-delà du bord, petit conteneur ; boucle : arrêt au dépôt, à l'abandon, après 1 s, rien hors glisser, la zone survolée seule.
- [ ] `scripts/verify-drag.mjs`, `scripts/verify-planning.mjs` -- en Chrome réel, `dragOver` répétés dans la bande basse : `scrollTop` augmente ; au milieu : stable ; puis dépôt normal.
- [ ] `docs/manuel-utilisateur.md`, `CHANGELOG.md`, version 0.48.5 (`package.json`, `package-lock.json`, `public/manifest.json`).

**Acceptance Criteria:**
- Given un board plus haut que la fenêtre, when je glisse une carte vers un objectif hors de l'écran en m'approchant du bord bas, then le board défile jusqu'à lui et le dépôt aboutit comme avant.
- Given le correctif, when `npm run check`, `npm run verify:jira`, `npm run verify:drag` et `npm run verify:planning` tournent, then tout passe, sans nouvelle requête Jira.

## Design Notes

Bande = `min(56 px, taille du conteneur / 4)` ; pas = `ceil(18 × (bande − distance au bord) / bande)` px par image, maximal au bord et au-delà. Valeurs choisies, ajustables après l'essai de Denis. `dragover` arrive aussi quand le pointeur est immobile (environ toutes les 350 ms selon la spécification HTML) : l'arrêt de sécurité à 1 s ne coupe donc pas un défilement en cours.

## Verification

**Commands:**
- `npm run check` -- types, lint, tests, build.
- `npm run verify:drag`, `npm run verify:planning`, `npm run verify:jira` -- banc fictif, Chrome réel.

**Manual checks (if no CLI):**
- Denis, dans `dist/` : glisser une carte vers le bas d'un board long, puis dans le planning.
