---
title: 'Story 8.19 — Le même menu de carte dans le planning et sur le board'
type: 'feature'
created: '2026-11-02'
status: 'done'
baseline_commit: 'e5df32745c3da7619782f7195874217e8a53356b'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-8-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Le menu de carte du board (`CardMenu.tsx`, sous-menu « Envoyer vers un goal › ») et celui du planning (`<details>` à plat) diffèrent à l’écran et au clavier ; le planning n’a ni top / basse priorité ni sous-menu pour les sprints, le board n’a pas la pastille de couleur des objectifs.

**Approach:** Un seul composant de menu flottant (survol, clavier, Échap, sous-menus), utilisé par les deux écrans avec leurs propres actions : pastille de couleur des objectifs partout ; dans le planning, sous-menu des destinations de sprint et top / basse priorité (E2).

**Décisions de Denis (02/11/2026) :** top / basse priorité = tête ou fin de la swimlane de l’objectif dans le sprint en préparation, « Sans objectif » compris ; mêmes écritures qu’aujourd’hui, aucune nouvelle.

## Boundaries & Constraints

**Always:** une fonction de `core` par intention (`rankPlanningIssue`) : sprint et rang relus avant E2, une seule tentative (réponse 207 lue), relecture de l’ordre ; porte du board ; textes en `t()` en, es ; menu accessible (rôles `menu`/`menuitem`, flèches, Début/Fin, Droite/Gauche, Entrée/Espace, Échap et Tab referment et rendent le focus).

**Never:** nouvelle écriture ; top / basse priorité en mode lot ou sur une carte d’une source ; changer les actions du board.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Top priorité | carte 3e de sa swimlane | une E2 avant le 1er ticket de la swimlane, relue | — |
| Déjà en tête / fin | 1re (ou dernière) de sa swimlane | action désactivée avec sa raison | — |
| Seule dans sa swimlane | un seul ticket | top et basse désactivées | — |
| Ordre changé dans Jira | référence plus dans le sprint | rien n’est écrit, avis, relecture | — |
| Rang non relu | E2 acceptée, ordre relu différent | partiel, sans rejeu | avis |
| Source ou lot | carte du backlog, sélection de 2 | pas de top / basse | — |
| Destinations | carte du sprint en préparation | sous-menu « Retirer du sprint › » : backlog, autres sprints futurs | — |

</frozen-after-approval>

## Code Map

- `src/app/views/ActionMenu.tsx` (nouveau) -- menu flottant commun, tiré de `board/CardMenu.tsx` (placement `placeAtPoint`/`placeBeside`, zone de tolérance `inCorridor`, délais d’ouverture et de fermeture, clavier).
- `src/app/views/board/CardMenu.tsx` -- devient l’adaptateur du board : actions de `cardMenuOptions`, pastille de couleur.
- `src/core/cardMenu.ts` (`goalTargets`) + `src/app/model/BoardTypes.ts` (`CardMenuOptions`) -- couleur de chaque objectif.
- `src/core/sprintPlanning.ts` -- `rankPlanningIssue` (relit sprint et ordre, `rankIssue` de `boardWrites.ts`, relit l’ordre), étape `ranked` ; `src/core/reasons.ts` -- refus `rankChanged`.
- `src/app/model/PlanningModel.ts`, `PlanningTypes.ts` -- `rankOptions(key)` (raisons `first`, `last`, `writing`), `rankIssue(key, edge)` ; swimlane = tickets du sprint en préparation du même objectif, ordre de Jira.
- `src/app/model/coreText.ts` -- étape, refus.
- `src/app/views/planning/PlanningView.tsx` -- `CardMenu` (`<details>`) remplacé par un bouton ⋯ et `ActionMenu` (clic droit, Maj+F10, Menu inchangés).
- Styles `app.css` (pastille, titre de lot), `planning.css` ; i18n en, es.
- Tests : `tests/app/CardMenu.test.tsx` (board), `tests/app/PlanningView.test.tsx`, `tests/app/PlanningModel.test.ts`, `tests/core/sprintPlanning.test.ts`, `tests/core/cardMenu.test.ts`, `tests/app/coreText.test.ts` ; `scripts/verify-planning.mjs`, `scripts/verify-jira*.mjs` si le menu y est piloté.

## Tasks & Acceptance

**Execution:**
- [x] `core` + tests -- `rankPlanningIssue`, couleur des objectifs.
- [x] Modèle du planning + tests -- options et geste de rang.
- [x] `ActionMenu`, adaptateurs board et planning, styles, i18n + tests.
- [x] Bancs Chrome, docs (`securite.md` E2 dans le planning, `invariants.md`), CHANGELOG, version 0.48.0, `sprint-status.yaml`, backlog.

**Acceptance Criteria:**
- Given les tests du menu du board (3.1, 3.2) et du planning (8.4, 8.13, 8.15), when le composant est partagé, then ils passent, et aucune écriture nouvelle n’apparaît.
- Given le paquet, when il est construit, then rien du planning n’y figure.

## Implementation Notes

- Implémenté directement (mode autonome). `ActionMenu` reprend le comportement du menu du board (placement, délais, zone de tolérance, clavier) pour un nombre quelconque de sous-menus ; il écoute la fermeture (clic ailleurs, défilement, redimensionnement) dès l'ouverture, en effet de mise en page, avec le dernier `onClose` reçu.
- Planning : le `<details>` de la carte devient un bouton ⋯ (`aria-haspopup`, `aria-expanded`) ; le menu est rendu à côté de la carte (pas dedans), pour ne pas déclencher sa sélection ni son glissé. `placeDetailsAtPoint` (`floatingMenu.ts`), devenu inutile, est retiré avec son test.
- Classement : la référence (premier ou dernier autre ticket de la swimlane) est calculée par le modèle sur les tickets affichés du sprint en préparation ; `rankPlanningIssue` relit sprint et ordre, réutilise `rankIssue` (réponse 207 lue) et l'échec de relecture `planningIssueUnconfirmed`. Nouveau refus `rankChanged` ; étape `ranked`.
- Banc `planningFixture` : route de rang globale (réordonne le catalogue).

## Spec Change Log

## Review Triage Log

Passe 1, faite sans sous-agent :
- Le menu rendu dans la carte déclencherait sélection et glissé. — medium, patch : menu rendu à côté de la carte (`<>` autour de l'`article`).
- Une fermeture par défilement juste après l'ouverture était manquée (écoute posée après le rendu, puis réabonnée à chaque rendu). — medium, patch : écoute en `useLayoutEffect` unique, dernier `onClose` lu par une référence (test « refermé par un défilement »).
- Maj+F10 dans un menu ouvert n'est plus empêché comme avant (le menu n'est plus dans la carte). — false : le `contextmenu` qui suit est empêché par le menu, qui ne se rouvre ni ne se déplace (test).
- Classement contre une référence filtrée par la recherche. — false : la swimlane est prise filtres ignorés, comme sur le board.
- Pas de raison « seule dans sa swimlane » distincte. — low, rejeté : seule, la carte est à la fois première et dernière ; les deux actions sont désactivées avec « Déjà en tête » / « Déjà en fin ».

## Verification

**Commands:**
- `npm run check`, `npm run verify:jira`, `npm run verify:planning`, `npm run verify:planning:package`, `npm run verify:i18n` -- verts
