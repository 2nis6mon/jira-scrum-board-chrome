---
title: 'Menu de carte — « Envoyer vers un goal » en sous-menu ouvert au survol'
type: 'bugfix'
created: '2026-11-01'
status: 'done'
baseline_commit: '85dc0cb6202f8502c206fc30856c97cf1049e979'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/spec-3-1-menu-carte-envoyer-vers-goal.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Dans le menu d'une carte, la liste des goals ne s'ouvre qu'au clic sur « Envoyer vers un goal », en accordéon sous la ligne : un geste de plus que les menus du système, et le menu change de taille.

**Approach:** La liste devient un sous-menu en panneau séparé, ouvert au survol et refermé en le quittant, placé à droite du menu (à gauche faute de place). Maquette validée par Denis le 01/11/2026 (https://claude.ai/artifact/Dth8KxngUCnseaNsfC2sdX).

## Boundaries & Constraints

**Always :**
- Ouverture après 150 ms de survol de la ligne (souris ou stylet, pas le tactile), sans déplacer le focus.
- Fermeture au plus tard 300 ms après que le pointeur a quitté la ligne et le sous-menu. Un trajet vers le sous-menu dans la zone de tolérance (triangle entre le point de sortie de la ligne et le bord proche du sous-menu) reporte la fermeture.
- Placement : à droite du menu, première ligne alignée sur la ligne parente. À gauche si la place manque. Remonté s'il déborde en bas, défilant au-delà de la hauteur de la fenêtre. Même conversion de zoom (présentation) que `placeAtPoint`.
- Un clic (ou Entrée/Espace) sur la ligne ouvre le sous-menu et met le focus sur son premier goal ; s'il est déjà ouvert, il ne se referme pas.
- Clavier inchangé : → ouvre avec focus, ← referme et revient à la ligne, Échap/Tab ferment tout le menu.
- Si le sous-menu se ferme au survol alors que le focus y est, le focus revient à la ligne.
- Action désactivée (écriture en cours, aucun objectif) : aucun sous-menu, raison affichée sous la ligne.
- Rôles ARIA, contenu de la liste, envoi par `board.sendToGoal` et fermetures existantes conservés.

**Never :** aucune nouvelle écriture, aucun nouveau texte `t()`, aucun changement dans `BoardModel` ou `core/`, aucune modification du menu des swimlanes.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Survol | pointeur 150 ms sur la ligne | sous-menu ouvert à droite, focus inchangé | N/A |
| Simple passage | pointeur < 150 ms sur la ligne | aucun sous-menu | N/A |
| Diagonale | sortie de la ligne vers le sous-menu, en passant sur « Mettre en top priorité » | sous-menu toujours ouvert, survolable | N/A |
| Sortie | pointeur hors de la ligne et du sous-menu, hors zone | sous-menu fermé ≤ 300 ms | N/A |
| Bord droit | menu à moins d'une largeur de sous-menu du bord droit | sous-menu à gauche du menu | N/A |
| Bas de fenêtre | ligne près du bas | sous-menu remonté dans la fenêtre | N/A |
| Clic | clic sur la ligne, sous-menu ouvert ou non | sous-menu ouvert, focus sur le premier goal | N/A |
| Désactivé | écriture en cours, survol | aucun sous-menu, raison visible | N/A |

</frozen-after-approval>

## Code Map

- `src/app/views/board/CardMenu.tsx` -- `goalsOpen` (booléen) devient un état ouvert par survol ou par focus ; minuteurs dans des refs, nettoyés au démontage ; écouteur `pointermove` sur le document tant que le sous-menu est ouvert. `.card-menu-goals` reste imbriqué dans `.card-menu` dans le DOM (clavier, `items()`, clic ailleurs et défilement intérieur en dépendent) mais il est positionné en fixe. Le replacement du menu principal ne dépend plus de `goalsOpen`. `onClick` de la ligne n'alterne plus.
- `src/app/views/board/floatingMenu.ts` -- ajouter `placeBeside(panel, menu, row, viewport)` (côté, alignement, bornes, `--menu-left/top/max-height`, `data-placed`, `data-side`) et la fonction pure `inCorridor(apex, point, box)` (triangle, bord proche choisi selon la position de l'apex). Réutiliser `MARGIN`, `cssZoom`, `clamp`.
- `src/app/styles/app.css:2775` -- `.card-menu-goals` : panneau fixe au style de `.card-menu` (fond, bord, ombre, `overflow-y: auto`, `max-height`), caché tant que `data-placed` est absent ; ligne parente ouverte surlignée (`[aria-expanded="true"]`).
- `tests/app/CardMenu.test.tsx:131` -- le test clavier existant doit rester vert sans modification de son déroulé.
- `scripts/verify-drag.mjs` -- scénario `board-drag-goal-priority` (`window.__goalPriority`) : ajouter une vérification en vrai Chrome du menu de carte (action ouverte epic-3-retro-item-20).
- Ne pas toucher : `BoardModel.ts`, `core/cardMenu.ts`, `placeFloatingMenu`, catalogues i18n.

## Tasks & Acceptance

**Execution:**
- [x] `src/app/views/board/floatingMenu.ts` -- `placeBeside`, `inCorridor` -- géométrie testable sans minuteur.
- [x] `src/app/views/board/CardMenu.tsx` -- survol, zone de tolérance, clic sans bascule, focus rendu à la ligne -- comportement de la maquette.
- [x] `src/app/styles/app.css` -- sous-menu en panneau fixe.
- [x] `tests/app/floatingMenu.test.ts` -- droite, gauche, remonté, zoom, triangle dedans/dehors.
- [x] `tests/app/CardMenu.test.tsx` -- survol (minuteurs simulés), simple passage, sortie, diagonale, clic sur sous-menu ouvert, désactivé, focus rendu à la ligne.
- [x] `scripts/verify-drag.mjs` -- clic droit réel sur RUN-7, survol, sous-menu à droite, diagonale, choix d'un goal (une écriture, rattachement), puis menu au bord droit : sous-menu à gauche, et fermeture en quittant.
- [x] `docs/manuel-utilisateur.md:124`, `CHANGELOG.md`, versions 0.41.1 (`package.json`, `package-lock.json`, `public/manifest.json`) -- livraison.

**Acceptance Criteria:**
- Given le menu ouvert au clic droit, when le pointeur reste sur « Envoyer vers un goal », then la liste apparaît à côté du menu sans clic et le menu principal ne change ni de taille ni de place.
- Given le sous-menu ouvert au survol, when on choisit un goal, then la seule écriture est le rattachement, comme en 3.1.

## Implementation Notes

- Implémenté directement dans la session, sans sous-agent.
- `CardMenu.tsx` : état `goals` (`"hover" | "focus" | null`). Minuteurs d'ouverture et de fermeture dans une ref. `closeWithin(délai, extend)` ne repousse une échéance que dans la zone de tolérance. Écouteur `pointermove` du document actif seulement liste ouverte. Le tactile (`pointerType: "touch"`) est ignoré par le survol, le clic reste.
- `floatingMenu.ts` : `placeBeside` (côté noté dans `data-side`) et `inCorridor` (triangle, bord proche selon la position du point de sortie).
- Tests du composant en minuteurs simulés (`setTimeout`, `clearTimeout`, `Date`) après la connexion ; il faut avancer de 120 ms pour que les effets Preact s'exécutent. Les vrais délais du premier jet ont été remplacés après la revue.
- Correctifs de revue :
  - liste ouverte au clavier : ignorée par le pointeur tant qu'il n'est pas passé par la ligne (`exit` nul) ;
  - le toucher est ignoré par `leaveRow` et `leaveGoals` ;
  - le sommet de la zone suit le pointeur qui s'en rapproche et repart de zéro à l'entrée dans la liste ;
  - `placeBeside` mesure au coin de la fenêtre et mesure la marge de la première ligne ;
  - le CSS est commun à `.card-menu` et `.card-menu-goals`.
- Contrôles de mutation, chacun fait échouer son test : `inCorridor` forcé à `false` (diagonale), fermeture sans point de sortie (clavier), filtre tactile retiré de `leaveGoals` (toucher), sommet fixe (va-et-vient).
- `verify:drag` en vrai Chrome : survol (rien à 60 ms, ouvert à 310 ms, à droite, aligné, focus resté sur la ligne, menu inchangé), trajet en diagonale de 480 ms passant sur « Mettre en top priorité », envoi de RUN-7 (une écriture, `g-stabilite`), puis menu ouvert près du bord droit (par un `contextmenu` de script) : liste à gauche, refermée quand le pointeur s'éloigne.
- Docs : `invariants.md`, ligne `verify:drag` de `developpement.md`, manuel, changelog 0.41.1.

## Review Triage Log

| # | Source | Constat | Verdict | Preuve / route |
|---|--------|---------|---------|----------------|
| 1 | blind, edge | Liste ouverte au clavier refermée par un mouvement de souris ailleurs | medium | l'écouteur du document agit même en mode « focus » ; patch + test |
| 2 | verification-gap, edge | `pointerleave` tactile (défilement au doigt) referme la liste | medium | `leaveRow`/`leaveGoals` sans filtre ; patch + test |
| 3 | edge | Largeur mesurée près du bord droit, liste élargie une fois à gauche, par-dessus le menu | medium | `--menu-*` hérités du menu avant la mesure ; patch + test |
| 4 | blind | Sommet fixe : un va-et-vient dans la zone garde la liste sans fin, contre la Design Note | low | patch (sommet qui suit le pointeur) + test |
| 5 | blind | Sommet ancien réutilisé après un passage dans la liste ou une ouverture au clavier | low | patch (remis à zéro à l'entrée dans la liste et à l'ouverture avec focus) |
| 6 | blind | Tests en vrais délais, marges étroites, contraires à la tâche « minuteurs simulés » | medium | risque d'instabilité en CI ; patch (minuteurs simulés) |
| 7 | blind | `SUBMENU_INSET` et `row.top - 7` recopient le CSS | low | patch (mesure de la première ligne, dans le code et dans `verify:drag`) |
| 8 | blind | Bloc CSS dupliqué de `.card-menu` | low | patch (sélecteur commun) |
| 9 | blind | Manuel muet sur la fermeture | low | patch (doc) |
| 10 | blind | Tests manquants (démontage pendant l'attente) | low | patch (test) |
| 11 | edge, blind | Écriture qui démarre liste ouverte : liste non replacée ou cachée, focus perdu | low | rejeté : aucune écriture ne part menu ouvert (tout geste sur le board le ferme) ; garde sans état démontré |
| 12 | edge | Écriture qui démarre pendant l'attente de 150 ms | low | rejeté : même raison que 11 |
| 13 | edge | Aucun côté ne convient (fenêtre très étroite) : la liste chevauche le menu | low | rejeté : fenêtre de moins de 500 px environ pour un board Jira, ajout de branche |
| 14 | edge | Menu principal qui défile, ou objectifs modifiés liste ouverte : liste non replacée | low | rejeté : menu de trois actions, objectifs relus seulement après une écriture |
| 15 | blind | `aria-controls` absent, `aria-expanded` sans focus en survol | low | rejeté : déjà écarté en 3.1 (ligne 20), comportement des menus du système |
| 16 | blind | `verify:drag` : bord droit ouvert par script, ni zoom ni bas de fenêtre en vrai Chrome | low | rejeté : géométrie couverte par les tests unitaires, survol et fermeture réels |
| 17 | blind | Tests stylet, « aucun objectif » au survol, réouverture | low | rejeté : même chemin que la souris, ou que le cas « écriture en cours » (`blocked`) |
| 18 | blind | Lien privé vers la maquette dans la partie figée | low | rejeté : correction de la spec elle-même |
| 19 | blind | `_bmad-output/forge/` non suivi dans l'arbre | false | hors du diff ; laissé hors du commit |

## Design Notes

Le délai de 300 ms est un plafond hors de la zone : une suite de mouvements ne le repousse pas, sinon un pointeur qui bouge sur « Mettre en top priorité » garderait le sous-menu ouvert. Dans la zone, chaque mouvement le relance.

## Verification

**Commands:**
- `npm run check` -- expected: vert
- `npm run verify:jira` -- expected: vert
- `npm run verify:drag` -- expected: vert, nouveaux contrôles du menu de carte compris
