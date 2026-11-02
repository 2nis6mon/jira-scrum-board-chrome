---
title: 'Stories 8.12 et 8.13 — Carte du planning : type, priorité, statut et menu au clic droit'
type: 'feature'
created: '2026-11-02'
status: 'done'
baseline_commit: 'f73fb826b42310020607e55391156bec9faa9cec'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-8-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Lors de l'essai du 02/11 (points 3 à 5), on a relevé trois manques sur la carte du planning. Elle montre seulement la lettre du type, sans icône Jira ni priorité. Le statut n'apparaît qu'en consultation. Et son menu ne s'ouvre que par le petit bouton ⋯, alors que la carte du board s'ouvre aussi au clic droit.

**Approach:** On réutilise sur la carte du planning ce qu'a déjà la carte du board. `JiraIcon` et `board.images` donnent les icônes du type et de la priorité. Une pastille de statut teintée selon sa catégorie s'affiche sur toutes les cartes. Le menu ⋯ existant s'ouvre au point du clic droit, ou sous la carte avec la touche Menu ou Maj+F10. Une seule spec couvre les deux stories, car elles modifient le même composant (décision de Denis du 02/11/2026).

## Boundaries & Constraints

**Always:**
- Aucune nouvelle lecture Jira : `issuetype.iconUrl`, `priority` et `status.statusCategory` sont déjà dans `BASE_FIELDS` (`src/jira/client.ts`).
- Le menu ouvert au clic droit est le même composant que ⋯ : mêmes entrées, mêmes écritures (8.4) et mêmes désactivations pendant `gesturesDisabled`.
- Chaque texte visible passe par `t()`, avec ses entrées dans les catalogues en et es.

**Never:**
- Aucune écriture nouvelle.
- Aucun menu de l'extension sur une carte en consultation. Le menu natif du navigateur y reste.
- Pas de refonte de `CardMenu.tsx` du board ni de `BoardModel.cardMenu` : le planning garde son menu `<details>`.
- Pas de nouveau droit, hôte ou dépendance.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Icônes chargées | type et priorité avec `iconUrl` | `<img class="jira-icon">` du type à gauche de la clé, priorité dans `card-marks` | — |
| Image absente | `iconUrl` null ou téléchargement échoué | lettre du type (repli de `JiraIcon`) | — |
| Sans priorité | `priority` null | aucune icône de priorité | — |
| Statut | catégorie `new` / `indeterminate` / `done` / inconnue | pastille avec le nom du statut, `data-status-category` gris / bleu / vert / neutre, sur toutes les cartes | — |
| Clic droit, carte prenable | sprint en préparation ou source | menu par défaut empêché, panneau ⋯ ouvert au point du pointeur, ramené dans la fenêtre | — |
| Menu ou Maj+F10 | focus dans la carte (clé ou ⋯) | même menu, sous le coin gauche de la carte | — |
| Échap ou action | menu ouvert au clic droit | menu fermé, focus rendu à l'élément de la carte qui l'avait, sinon au ⋯ | — |
| Carte en consultation | clic droit | aucun menu de l'extension, `preventDefault` non appelé | — |
| Geste en cours | clic droit | menu ouvert, entrées désactivées comme pour ⋯ | — |

</frozen-after-approval>

## Code Map

- `src/app/views/planning/PlanningView.tsx` -- `PlanningCard` (l. ~1095) remplace la lettre du type par `JiraIcon` et ajoute la priorité et la pastille de statut. Il gère aussi `onContextMenu` et `onKeyDown` (ContextMenu, Maj+F10) sur l'`<article>` quand la carte n'est pas en consultation. `CardMenu` (l. ~1197) accepte une demande d'ouverture au point, ouvre son `<details>` et place le panneau. Le badge `fields.status.name` réservé à la consultation (l. ~1165) est retiré au profit de la pastille commune. Le prop `images` est passé de `PlanningView` aux cartes.
- `src/app/views/board/JiraIcon.tsx` -- à réutiliser tel quel.
- `src/app/views/board/IssueCard.tsx` -- modèle à imiter : distinction pointeur/clavier (`event.button === 2 || clientX/clientY ≠ 0`) et `belowCard`. À ne pas modifier.
- `src/app/views/board/floatingMenu.ts` -- `placeAtPoint(panel, point)` pose `--menu-left` et `--menu-top` ; `placeFloatingMenu` pose `--menu-top` et `--menu-right` depuis le `summary`. Ouvert au point, le panneau doit ignorer `--menu-right` : ajouter un attribut, par exemple `data-at-point`, et le style correspondant.
- `src/app/App.tsx` (l. ~177) -- passe `images={board.images}` à `PlanningView`. La fermeture au clic extérieur (`details[open]`, l. ~85) couvre déjà le menu.
- `src/app/styles/planning.css` -- pastille de statut (`--done`, `--in-progress`, gris), placement au point de `details.planning-card-menu .menu-panel`.
- `src/app/styles/app.css` (l. ~2733) -- `details.lane-menu .menu-panel` en `position: fixed` ; `details.lane-menu:not([data-placed])` est caché tant que le menu n'est pas placé.
- `tests/app/PlanningView.test.tsx` -- `setup()` monte la vue : ajouter `images` (`new ImageCache(...)` sans téléchargement) et les nouveaux cas.

## Tasks & Acceptance

**Execution:**
- [x] `src/app/views/planning/PlanningView.tsx`, `src/app/App.tsx` -- prop `images`, icônes, pastille de statut, ouverture du menu au clic droit et au clavier.
- [x] `src/app/styles/planning.css` (et `app.css` si besoin) -- pastille teintée, panneau placé au point.
- [x] `src/i18n/*.ts`, `src/i18n/es/*.ts` -- libellés nouveaux, s'il y en a (par exemple l'info-bulle « Statut Jira »).
- [x] `tests/app/PlanningView.test.tsx` -- un cas par ligne de la matrice : icônes ou lettre, priorité absente, catégories, clic droit au point, Maj+F10 et touche Menu, Échap et focus rendu, consultation sans menu, geste en cours.
- [x] `scripts/verify-planning.mjs` -- dans Chrome réel, un clic droit sur une carte du sprint ouvre le menu à l'écran, et une carte en consultation n'en ouvre aucun.
- [x] `CHANGELOG.md`, `package.json`, `package-lock.json`, `public/manifest.json` -- version 0.42.2. `docs/technique/` seulement s'il décrit la carte du planning.

**Acceptance Criteria:**
- Given une carte du planning, when elle s'affiche, then on voit l'icône du type, la priorité si elle existe et le statut teinté selon sa catégorie, quelle que soit sa place.
- Given une carte prenable, when je choisis une entrée du menu ouvert au clic droit, then le modèle reçoit le même appel (`placeIssue` ou `removeIssue`) que depuis ⋯.
- Given le paquet (`npm run package`), when il est construit, then rien du planning n'y figure (`verify:planning:package`).

## Implementation Notes

- Implémentation par un sous-agent. Le prop `images` va de `PlanningView` à `PlanningCard` à travers tous les composants intermédiaires. `CardMenu` expose une ref `openAt({point, returnFocus})`. Nouvelle fonction `placeDetailsAtPoint` dans `floatingMenu.ts`, qui marque le panneau `data-at-point` ; `placeFloatingMenu` retire ce marqueur, si bien qu'un menu rouvert par ⋯ retrouve sa place. La fermeture au défilement et au redimensionnement est factorisée dans `closeOnMove`.
- Écart assumé avec la Code Map : le vert de « terminé » est écrit en dur (`#e3f4e8` / `#166534`). Le jeton `--done` est un bleu ardoise, et la matrice demande du vert.
- Changement voulu : une action choisie depuis ⋯ rend aussi le focus au ⋯. Avant, il se perdait.
- Les vraies icônes Jira ne sont pas observables sur le banc fictif, qui ne fournit pas d'images : à confirmer pendant l'essai 8.10.
- Audit de la matrice : 9 cas dans `tests/app/PlanningView.test.tsx` et 1 dans `tests/app/floatingMenu.test.ts`, lancés et verts.
- Correctifs de revue (passe 1) appliqués : garde `inOpenMenu`, `preventScroll`, focus rendu après une fermeture indirecte (y compris pour un menu ouvert par ⋯ : un clic hors du menu sur une zone non focalisable rend le focus au ⋯), info-bulle « Statut Jira : {name} », tests (a)-(c), Maj+F10 et touche Menu dans `verify-planning`. Vérification complète verte (1802 tests).

## Spec Change Log

## Review Triage Log

Passe 1 (chasse aveugle, cas limites, trous de vérification) :
- Touche Menu : Blink envoie le `contextmenu` au relâchement. Si aucune entrée n'est active (geste en cours), le focus est sur ⋯, hors de `.menu-panel`. Le menu se rouvre alors aux coordonnées de l'élément et `returnFocus` devient ⋯. — low, patch : ignorer tout `contextmenu` ou Maj+F10 dont la cible est dans le `details[open]` de la carte.
- `openAt` focalise sans `preventScroll` : un ⋯ à moitié hors de sa colonne fait défiler, et `closeOnMove` referme aussitôt le menu. — low, patch : `focus({ preventScroll: true })`.
- Fermeture par défilement, redimensionnement ou clic sur ⋯ : le focus n'est rendu que si `returnFocus` existe et que le focus est sur `body`. Il n'y a pas de repli sur ⋯ (`returnFocus` est presque toujours `null` après un clic droit), le focus resté sur une entrée masquée n'est pas traité, et aucun test ne couvre ce cas. — low, patch : repli sur ⋯, focus dans le panneau aussi traité, `preventScroll`, et un test de fermeture au défilement.
- Garde `inMenuPanel` non testée : un second Maj+F10, ou un `contextmenu` venu d'une entrée focalisée, n'est vérifié nulle part. — medium (trou de vérification, preuve du relecteur), patch : ajouter le test.
- Menu au clavier jamais joué dans Chrome réel : les tests unitaires fabriquent l'événement 0/0 attendu par le code. — medium (trou de vérification), patch : étape Maj+F10 dans `verify-planning.mjs`.
- L'info-bulle de la pastille dit « Statut Jira » sans le nom : un statut long et tronqué n'est lisible nulle part. — low, patch : `Statut Jira : {name}`.
- CHANGELOG « Aucune lecture Jira en plus » : les icônes absentes du cache sont téléchargées par `transport.fetchImage`, sur l'origine du site. — low, patch (formulation).
- CHANGELOG muet sur le focus rendu au ⋯ après une action. — low, patch.
- Second clic droit sur la carte, menu ouvert, focus sur une entrée : `returnFocus` devient une entrée masquée. — low, rejeté : dans Chrome, le `mousedown` sur une zone non focalisable de l'article ramène le focus sur `body` avant le `contextmenu`, donc `returnFocus` vaut `null` ; le cas clavier est couvert par la garde.
- Heuristique pointeur ou clavier fausse pour un `contextmenu` clavier aux coordonnées non nulles. — low, rejeté : le `keydown` traite d'abord Maj+F10 et Menu, et le `contextmenu` qui suit est filtré par la garde ; c'est la même heuristique que la carte du board.
- Deux menus ouverts au clavier (Tab vers une autre carte puis Maj+F10). — low, rejeté : le cas existe déjà avec ⋯ au clavier, et `name` sur `<details>` exige Chrome 120 alors que le minimum est 116.
- `openAt` sur un menu déjà ouvert par ⋯ non testé. — low, rejeté : chemin direct (`placeDetailsAtPoint` sans `toggle`), couvert par le banc.
- Heuristique et `belowCard` recopiées d'`IssueCard`. — low, rejeté : les factoriser touche `IssueCard`, hors de la Code Map ; risque de divergence noté.
- `handle.current` affecté au rendu, poignée périmée. — false : une carte sans `CardMenu` (consultation) n'a aucun gestionnaire qui appelle la poignée, et `openAt` sort si `details.current` est nul.
- Bornes 1441/961 en dur et écouteur `__contextMenus` jamais retiré dans le banc. — low, rejeté : la taille de fenêtre est fixée par le banc, et l'écouteur ne fait qu'enregistrer.
- `data-placed` et `--menu-left` laissés sur le panneau après `placeFloatingMenu`. — false : aucun sélecteur ni code ne les lit sans `data-at-point`.
- Le test « rouvert par son bouton » suppose un `toggle` synchrone (happy-dom). — low, rejeté : l'ordre réel est couvert par l'Échap du banc Chrome.

## Design Notes

L'état d'ouverture reste local à `CardMenu`, et le menu reste un `<details>`. Ouvert au point, il fixe `open = true`, marque le panneau `data-at-point` et appelle `placeAtPoint` dans `onToggle` à la place de `placeFloatingMenu`, en gardant la fermeture au défilement et au redimensionnement. `PlanningCard` relaie la demande par une ref ou un signal local, par exemple `menuRequest: {x, y, returnFocus} | null`.

Focus : à l'ouverture, il va à la première entrée active ; à la fermeture, il revient à l'élément mémorisé.

Pastille : `<span class="planning-status" data-status-category={key ?? "unknown"} title={t("Statut Jira")}>{name}</span>`.

## Verification

**Commands:**
- `npm run check` -- vert
- `npm run verify:jira` -- vert
- `npm run verify:planning` et `npm run verify:planning:package` -- verts
- `npm run verify:i18n` -- vert si de nouveaux textes sont ajoutés
