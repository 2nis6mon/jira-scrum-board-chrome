---
title: 'Story 3.1 — Ouvrir le menu d''un ticket et l''envoyer vers un goal'
type: 'feature'
created: '2026-10-31'
status: 'done'
baseline_commit: 'ca3d145d9cfa5520bf94776afd7be09602918d26'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Rattacher un ticket à un objectif exige de le glisser à travers le board, lent sur un grand board en Daily ou en affinage.

**Approach:** Un clic droit (ou Maj+F10, touche Menu) sur une carte ouvre un menu de l'extension ; « Envoyer vers un goal » liste les objectifs visibles du board et rattache le ticket par le même chemin que le dépôt (`dropIssue` → porte d'écriture → `executeMove`), sans changer de colonne ni de rang.

## Boundaries & Constraints

**Décisions (délégation de Denis, 31/10/2026, mode autonome) :** en présentation, aucune action n'est désactivée (le glissé y est permis), seul le placement tient compte du zoom ; en Daily, « Envoyer vers un goal » est désactivé avec sa raison ; une écriture en cours (ticket en attente, choix de transition, formulaire natif ouvert) désactive toutes les actions avec leur raison. « Retirer du goal » renvoie le ticket dans sa destination par défaut (swimlane de son type, sinon Build). Les objectifs proposés sont ceux non masqués du board, dans l'ordre des swimlanes, préfixés de leur sprint comme les swimlanes ; un objectif masqué n'est pas proposé, et le ticket rattaché à un objectif masqué n'a pas « Retirer du goal » (comme le glissé, qui ne le détache pas).

**Always:** menu rendu par l'extension (`role="menu"`, `menuitem`, `aria-haspopup`/`aria-expanded` pour la liste des objectifs, `aria-disabled` + raison visible) ; Flèches haut/bas, Début/Fin, Entrée/Espace, Flèche droite/gauche (liste/retour) ; Échap, Tab, clic ailleurs, défilement, redimensionnement ou action ferment le menu et rendent le focus à la carte ; menu fermé si le ticket disparaît du board. État d'ouverture dans `BoardModel` (signal), la vue n'affecte aucun signal. Une seule tentative ; échec ou incertitude : avis et repère « Déplacement à vérifier » de `dropIssue`, board relu. Libellés FR/EN/ES.

**Never:** aucune nouvelle écriture, endpoint, droit ou variante de séquence ; pas de « top/basse priorité » (story 3.2) ; menu du navigateur conservé hors des cartes ; aucune donnée fictive dans `src/`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Envoi | ticket de Build, objectif G choisi | une écriture de rattachement (E5 texte ou E3/E4 Atlassian), colonne et rang inchangés, board relu | N/A |
| Retrait | ticket sous G, « Retirer du goal » | détachement, ticket dans sa destination par défaut | N/A |
| Liste | ticket sous G, objectifs G, H, I | H, I, puis « Retirer du goal » | N/A |
| Aucun autre objectif | board sans objectif, ticket sans objectif | action désactivée « Aucun objectif où l'envoyer » | N/A |
| Daily | menu ouvert en Daily | action désactivée « Pas de changement d'objectif pendant la daily » | N/A |
| Écriture en cours | un ticket en attente | actions désactivées « Une écriture est en cours » ; aucune écriture | N/A |
| Échec Jira | rattachement refusé (403) | avis d'erreur, repère sur la carte, pas de nouvelle tentative | board relu |
| Clavier | focus sur la carte, Maj+F10 | menu ouvert près de la carte, focus sur le premier élément actif | N/A |

</frozen-after-approval>

## Code Map

- `src/app/model/BoardModel.ts:965-1080` -- `dropIssue` : chemin unique réutilisé (plan `resolveDrop`, rang `#rankFor` → `none` pour une carte arrivant en fin de cellule, porte, `sync`, `moveFeedback`). Ajouter `cardMenu` (signal `{ issueKey, x, y } | null`), `openCardMenu`, `closeCardMenu`, `cardMenuOptions(issueKey, { daily })`, `sendToGoal(issueKey, goalId | null)` qui ferme le menu puis appelle `dropIssue({ issueKey, block, columnId: issue.columnId, beforeKey: null })`.
- `src/core/cardMenu.ts` (nouveau) -- fonction pure `goalTargets(snapshot, configuration, issue)` → `{ goals: { id, title, sprintName }[], canDetach }`, ordre `resolveBlocks`, objectifs non masqués sauf `displayedGoalId(issue)`. `defaultBlock(issue)`.
- `src/core/boardLayout.ts:100-105` -- extraire le calcul du préfixe de sprint (`sprintNameOf`) en fonction exportée réutilisée par `cardMenu.ts`.
- `src/app/views/board/CardMenu.tsx` (nouveau) -- menu positionné (`position: fixed`), deux vues (actions / objectifs), clavier, fermeture et retour du focus (`[data-issue-key]` de la carte).
- `src/app/views/board/floatingMenu.ts` -- `placeAtPoint(panel, point, viewport)` : bornes de la fenêtre, division par `cssZoom` (présentation).
- `src/app/views/board/IssueCard.tsx` -- prop `onContextMenu` (clic droit ; Maj+F10 et touche Menu par `keydown`, coordonnées de la carte).
- `src/app/views/board/BoardView.tsx:1087,1473-1500` -- `BoardGrid` passe `onContextMenu` aux cartes et rend `CardMenu` avec `daily`.
- `src/app/styles/app.css` -- styles `.card-menu` sur le modèle de `.menu-panel`.
- `src/i18n/board.ts`, `src/i18n/es/board.ts` -- libellés.
- Ne pas toucher : `core/boardMove.ts`, `BoardMovementService`, `writes.ts`.

## Tasks & Acceptance

**Execution:**
- [x] `src/core/boardLayout.ts`, `src/core/cardMenu.ts` -- cibles du menu, pures -- testables sans DOM.
- [x] `src/app/model/BoardModel.ts` -- état du menu, options, `sendToGoal` -- un seul chemin d'écriture.
- [x] `src/app/views/board/floatingMenu.ts`, `CardMenu.tsx`, `IssueCard.tsx`, `BoardView.tsx`, `app.css` -- menu accessible.
- [x] `src/i18n/board.ts`, `src/i18n/es/board.ts` -- libellés EN/ES.
- [x] `tests/core/cardMenu.test.ts`, `tests/app/BoardModel.cardMenu.test.ts`, `tests/app/CardMenu.test.tsx`, `tests/app/floatingMenu.test.ts` -- matrice, écritures exactes, clavier et focus.
- [x] `CHANGELOG.md`, `docs/manuel-utilisateur.md`, versions (0.39.0) -- livraison.

**Acceptance Criteria:**
- Given une carte, when clic droit, then le menu de l'extension s'ouvre au pointeur et le menu du navigateur est empêché.
- Given le menu ouvert, when Échap ou clic ailleurs, then il se ferme et la carte a le focus.
- Given un envoi réussi, then la seule écriture est celle du rattachement et le board est relu.

## Implementation Notes

- `sendToGoal` réutilise `dropIssue` (colonne actuelle, `beforeKey: null` → rang `none`) : aucune séquence propre au menu. Il revérifie options, Daily et écriture en cours avant d'écrire.
- L'état d'ouverture est un signal privé de `BoardModel`, exposé par `cardMenu` (calculé : `null` dès que le ticket n'est plus affiché) ; la vue ne garde que la sous-liste dépliée (`useState`).
- `sprintNameOf` sorti de `buildBoardLayout` pour être partagé avec `core/cardMenu.ts`, sans changement de comportement.
- Revue : « Retirer du goal » exige que la destination par défaut soit affichée (swimlane du type non masquée), comme le glissé ; contexte Daily obligatoire dans `sendToGoal`.
- Non essayé dans un vrai Chrome : touche Menu/Maj+F10 et placement au zoom de présentation (tests sous happy-dom).

## Spec Change Log

- 31/10/2026, après la rétrospective (Denis) : en Daily, tout reste actif. « Envoyer vers un goal » n'est plus désactivé, la raison `daily` et le paramètre `{ daily }` de `cardMenuOptions`/`sendToGoal` sont retirés (0.41.0). Présentation confirmée : rien de désactivé. La décision de délégation sur la Daily, dans le bloc figé, est caduque.
## Review Triage Log

| # | Source | Constat | Verdict | Preuve / route |
|---|--------|---------|---------|----------------|
| 1 | verification-gap, blind | Flèche gauche au premier niveau sort tôt sans `preventDefault` : la Daily change d'étape | medium | `BoardView.tsx:494-523` écoute le document ; patch + test |
| 2 | verification-gap, blind | Touche Menu et `contextmenu` clavier non testés | low | aucun test `ContextMenu` ; patch (tests) |
| 3 | verification-gap | `transitionChoice` dans `#writing()` non testé | low | patch (test) |
| 4 | blind, edge | `sendToGoal` : contexte Daily par défaut à `false` | medium | 3.2 ajoutera des appelants qui divergeraient ; patch (paramètre obligatoire) |
| 5 | edge | `canDetach` vrai vers une swimlane de type masquée : carte cachée | medium | `swimlaneOfType` ne filtre pas `hidden` ; patch + test |
| 6 | edge | Fermeture par défilement : `focus()` refait défiler vers la carte | medium | patch (`preventScroll`) |
| 7 | edge | Panneau non replacé à l'ouverture de la liste | medium | patch |
| 8 | edge | Rejet de `sendToGoal` non géré | low | correction directe ; patch |
| 9 | edge | Ctrl+clic macOS / tactile ouvrent sous la carte | low | correction directe ; patch |
| 10 | blind | Raison `<p>` enfant direct de `role="menu"` | low | correction directe ; patch |
| 11 | blind | Test « masqué » sans objectif masqué | low | patch (test) |
| 12 | blind | Manuel : ligne trop longue, fermetures partielles, Échap en plein écran | low | patch (doc) |
| 13 | blind | Contexte d'epic contredit la décision « présentation » | low | 3.2 la relirait ; patch (doc) |
| 14 | blind | Rien dans `docs/technique/` | low | patch (invariants.md) |
| 15 | blind, edge | `columnId === null` : action active sans effet | false | le menu ne s'ouvre que sur une carte affichée (`#isShown`), donc dans une colonne |
| 16 | blind | Échap dans la sous-liste ferme tout | false | conforme à la spec (Échap ferme le menu) |
| 17 | blind | Statut spec ≠ sprint-status | false | sprint-status passe à `review` à l'étape de présentation |
| 18 | blind | Mélange « goal » / « objectif » | false | libellés d'action imposés par epics.md ; le reste de l'interface dit « objectif » |
| 19 | blind | Objectif actuel absent de la liste | false | exigé par la story (« sans le goal actuel ») |
| 20 | blind | Liens `aria-controls` absents, `aria-expanded` sur élément désactivé | low | rejeté : faible gêne, ajout de surface |
| 21 | blind | Tests Atlassian minces, résultat incertain non testé | low | rejeté : chemin `dropIssue` déjà couvert par `BoardModel.drop.test.ts` |
| 22 | blind | Clic ailleurs rend le focus à l'ancienne carte | low | rejeté : exigé par la spec ; le clic redonne ensuite le focus à sa cible |
| 23 | edge | Focus perdu si l'élément focalisé disparaît (relecture) | low | rejeté : rare (aucune écriture pendant le menu), ajout de garde |
| 24 | blind | Spec : sections vides, numéros de ligne périmés | low | rejeté : notes complétées ici ; Code Map indicatif |

## Verification

**Commands:**
- `npm run check` -- expected: vert
- `npm run verify:jira` -- expected: vert
- `npm run verify:i18n` -- expected: vert
