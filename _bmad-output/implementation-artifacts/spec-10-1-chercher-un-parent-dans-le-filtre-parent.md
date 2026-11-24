---
title: 'Story 10.1 : chercher un parent dans le filtre Parent'
type: 'feature'
created: '2026-11-24'
status: 'done'
route: 'dispatch'
baseline_commit: '74ce8573b499db56cf7304f2ec85dfc601e1b201'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-10-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** quand un sprint compte beaucoup de parents, il faut parcourir toute la liste du menu Parent (Sprint Board et Sprint Planning) pour trouver le bon.

**Approach:** un champ de recherche en tête du seul menu Parent filtre la liste affichée par clé ou résumé, accents et casse ignorés (règle de la recherche du board) ; la sélection et le filtrage du board ne changent pas.

## Boundaries & Constraints

**Always:** recherche sur le libellé de l'option (`CLE · résumé`) avec `searchNeedle`/`foldText` ; nombre de tickets par parent inchangé ; « Sans parent » toujours affiché, hors recherche ; un parent coché que le texte ne trouve pas disparaît de la liste sans se décocher, le badge du bouton le compte toujours (Denis, 24/11/2026) ; champ vidé à chaque fermeture du menu, sélection conservée ; focus dans le champ à l'ouverture ; champ nommé pour les lecteurs d'écran, nombre de résultats annoncé ; textes FR/EN/ES.

**Never:** recherche dans les menus Personne, Type, Statut, Label ou Sprint (Denis, 24/11/2026) ; nouvelle lecture ou écriture Jira ; changement de `core/filters.ts` ou des filtres du modèle ; signal pour le texte tapé (état local du menu).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Recherche | parents `ABC-90 · Activation MFA`, `ABC-91 · Paiement` ; texte « mfa » | seul ABC-90 affiché, avec son nombre | N/A |
| Accents, clé | texte « ACTIVATION », puis « abc-91 », puis « paiément » | ABC-90 ; ABC-91 ; ABC-91 | N/A |
| Sans résultat | texte « zzz » | « Aucun résultat » ; « Sans parent » toujours là | N/A |
| Coché caché | ABC-91 coché, texte « mfa » | ABC-91 absent de la liste, toujours dans le filtre, badge à 1 | N/A |
| Réouverture | texte « mfa », menu fermé puis rouvert | champ vide, liste complète, sélection inchangée | N/A |
| Échap | champ rempli ; puis champ vide | efface le texte ; puis ferme le menu, focus sur son bouton | N/A |

</frozen-after-approval>

## Code Map

- `src/app/views/board/FilterMenu.tsx` -- composant partagé (`<details name="filter-menu">`, badge `activeCount`, option `extra`) ; le `<details>` n'est pas démonté à la fermeture.
- `src/app/views/board/BoardView.tsx:751` et `src/app/views/planning/PlanningView.tsx:220` -- les deux menus Parent, seuls à recevoir la recherche.
- `src/core/filters.ts:241` `searchNeedle` et `src/core/text.ts` `foldText` -- correspondance à réutiliser ; `src/core/boardLayout.ts:315` construit déjà le libellé `CLE · résumé`.
- `src/app/App.tsx:105-124` (présentation) et `BoardView.tsx:524` (daily) -- Échap global ferme le premier `details[open]` ; un `preventDefault` dans le champ l'en empêche (le gestionnaire de la daily ignore déjà les champs de saisie).
- `src/app/views/planning/PlanningView.tsx:66` -- écoute `toggle` en capture pour garder le panneau à l'écran : ne pas casser.
- `src/app/styles/app.css:743-786` -- styles du panneau et des options ; `.visually-hidden` existe.
- `src/i18n/board.ts` et `src/i18n/es/board.ts` -- catalogues des libellés du board.
- `tests/app/PlanningView.test.tsx:1478` -- sélectionne les cases par `querySelectorAll("input")[index]` : un champ de recherche décalerait les index.
- `scripts/verify-planning.mjs:341` -- sélectionne `.filter-option` dans le menu Personne : non concerné.
- `docs/manuel-utilisateur.md:109`, `docs/user-guide.en.md:99`, `docs/user-guide.es.md:103` -- phrase des filtres à compléter.

## Tasks & Acceptance

**Execution:**
- [x] `src/app/views/board/FilterMenu.tsx` -- prop `searchable?: boolean` ; état local du texte ; à l'événement `toggle` : ouverture → focus du champ, fermeture → texte vidé ; champ `type="search"` en tête du panneau, avant `extra`, `aria-label` et placeholder ; options filtrées par `foldText(label).includes(searchNeedle(texte))` ; « Aucun résultat » quand le texte n'en trouve aucun ; zone `role="status"` masquée annonçant le nombre de parents affichés ; Échap dans le champ : efface le texte s'il y en a, sinon ferme le menu et rend le focus au `summary`, toujours avec `preventDefault` -- le composant reste unique pour les deux écrans.
- [x] `src/app/views/board/BoardView.tsx`, `src/app/views/planning/PlanningView.tsx` -- `searchable` sur le menu Parent seulement.
- [x] `src/app/styles/app.css` -- style du champ dans le panneau (pleine largeur, comme `.filter-search`).
- [x] `src/i18n/board.ts`, `src/i18n/es/board.ts` -- nouveaux textes (placeholder, nom du champ, « Aucun résultat », annonce du nombre).
- [x] `tests/app/FilterMenu.test.tsx` (nouveau) -- matrice I/O, champ absent sans `searchable`, focus à l'ouverture.
- [x] `tests/app/PlanningView.test.tsx`, `tests/app/App.test.tsx` -- cases sélectionnées par `input[type=checkbox]` ; menu Parent avec champ, autres menus sans, sur le board et le planning.
- [x] `docs/manuel-utilisateur.md`, `docs/user-guide.en.md`, `docs/user-guide.es.md` -- dire qu'on peut chercher un parent dans son menu.
- [x] `CHANGELOG.md`, `package.json`, `package-lock.json`, `public/manifest.json` -- version 0.55.0.

**Acceptance Criteria:**
- Given le Sprint Board ou le Sprint Planning, when j'ouvre les menus Personne, Type, Statut, Label ou Sprint, then aucun champ de recherche n'y apparaît.
- Given le menu Parent ouvert au clavier, when il s'ouvre, then le focus est dans le champ et un lecteur d'écran annonce son nom puis le nombre de parents affichés.
- Given une recherche en cours, when je coche ou décoche un parent trouvé, then le filtre change comme aujourd'hui.

## Implementation Notes

- Implémentation faite directement, sans sous-agent ; relecture faite seul selon les trois angles (relecture à froid, cas limites, preuves manquantes), sans sous-agent.
- Le champ reçoit `aria-describedby` vers la zone `role="status"` : le lecteur d'écran lit le nom du champ puis le nombre de résultats dès le focus, sans dépendre de l'annonce d'une zone vivante qui apparaît.
- Échap dans le champ : `preventDefault` et `stopPropagation`, comme le menu de clôture du planning.
- Ajout hors Code Map : `scripts/verify-planning.mjs` contrôle dans Chrome le menu Parent (seul à chercher, focus à l'ouverture, liste réduite, Échap en deux temps) et capture `planning-recherche-parent.png`.
- Le manuel ne cite pas Sprint Planning dans la phrase du board : `tests/site-guide.test.ts` l'interdit dans la page « Utiliser le board ».

## Spec Change Log

## Review Triage Log

| Constat | Verdict | Preuve | Suite |
|---|---|---|---|
| Focus à l'ouverture et Échap vérifiés seulement sous happy-dom (événement `toggle`, focus) | medium | Aucun contrôle en vrai navigateur avant la revue | patch : contrôle ajouté à `verify:planning`, vert |
| `top: -6px` du champ collant dépend du `padding` du panneau | low | Valeur liée à `.filter-menu-panel { padding: 6px }` ; rendu vérifié par capture | rejeté : cosmétique, peu probable |
| Texte indicatif « Clé ou résumé… » propre aux parents dans un composant partagé | false | Seul le menu Parent reçoit `searchable`, les autres menus sont exclus par l'intention | rejeté |
| `stopPropagation` sur Échap masque-t-il un gestionnaire global ? | false | Présentation et puce de sélection testent `defaultPrevented` ; la daily ignore les champs ; les autres écoutes sont des fenêtres modales | rejeté |
| Le board n'a pas de contrôle en vrai navigateur du menu Parent | low | Même composant que le planning, contrôlé dans Chrome ; présence vérifiée par `App.test.tsx` | rejeté |

## Verification

**Commands:**
- `npm run check` -- expected: types, Biome, tests et gardes verts.
- `npm run verify:jira` -- expected: vert.
- `npm run verify:i18n` -- expected: vert (textes FR/EN/ES).
- `npm run verify:planning` -- expected: vert, menu Parent compris.
