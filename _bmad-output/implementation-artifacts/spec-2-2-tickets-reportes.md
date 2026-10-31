---
title: 'Story 2.2 — Voir les tickets reportés du sprint précédent'
type: 'feature'
created: '2026-10-31'
status: 'done'
baseline_commit: '9de5c952dfba350be0c765a3c2b677ae5c9ecb92'
route: 'dispatch'
review_loop_iteration: 1
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Au démarrage d'un sprint, rien ne montre quels tickets ont été reportés du sprint précédent du board : la charge héritée reste invisible.

**Approach:** Reconnaître, à partir de l'historique du champ Sprint et des sprints clos du ticket (`closedSprints`, champ documenté de la même réponse, ajouté aux champs demandés : aucune requête supplémentaire), les tickets entrés dans un sprint actif du board par report d'un sprint clos du board ; les présenter par un filtre rapide « Reportés », à côté de « Bloqués » et « Ajoutés », qui affiche leur nombre et ne garde que ces cartes.

## Boundaries & Constraints

**Décision (délégation de Denis, 31/10/2026, après revue) :** l'historique seul ne distingue pas un report d'un ajout depuis le backlog d'un ticket déjà passé par un sprint clos (même entrée `from "41"` → `to "41,43"`). Le report exige donc que le sprint clos conservé ait été clôturé au moment de l'entrée, d'après `closedSprints` du ticket.

**Always:** règle de report : dans l'historique Sprint du ticket, la **dernière** entrée qui fait entrer le sprint S (S dans `to`, absent de `from`) ne retire aucun sprint (tout sprint de `from` reste dans `to`) et garde un autre sprint X présent dans `from` et `to` ; X figure dans `closedSprints` du ticket (par identifiant, ou par nom pour une entrée sans identifiants), avec une date de clôture (`completeDate`) à moins de `CARRY_OVER_WINDOW_MS` (constante dédiée, 10 min, décision de délégation après la revue 2 : une grosse clôture écrit son report en rafale au-delà de 2 min) de la date de l'entrée, et n'est pas d'un autre board (`originBoardId` absent ou égal au board, règle d'`isForeignSprint`). Identifiants `from`/`to` prioritaires, noms (`fromString`/`toString`) seulement si l'entrée n'a pas d'identifiants, comme `sprintScope`. S doit être un sprint du board (`isForeignSprint` faux). `closedSprints` absent ou illisible : non reporté. Le nombre du filtre réunit les reportés de tous les sprints du board, quels que soient les filtres actifs ; le filtre se combine avec les autres, dont **Sprint**. Libellés FR/EN/ES.

**Never:** aucune nouvelle requête Jira (seul `closedSprints` s'ajoute aux champs de la lecture des tickets de sprint) ; aucun compteur dans l'en-tête du sprint ; règles de l'indicateur « ajouté en cours de sprint » inchangées ; filtre absent en Kanban (comme « Ajoutés ») ; aucune écriture, aucun format persisté modifié.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Report classique | ticket de S=43 (board), entrée `from "41"` → `to "41,43"` ; `closedSprints` : 41 clôturé à moins de 2 min de l'entrée | reporté | N/A |
| Report après démarrage | même cas, 41 clôturé après le démarrage de 43 | reporté (et « ajouté » selon ses règles actuelles) | N/A |
| Remis depuis le backlog après un sprint clos | 41 clôturé le 01/10, entrée `from "41"` → `to "41,43"` le 10/10 | non reporté | N/A |
| Ajout depuis le backlog | entrée `from ""` → `to "43"` | non reporté | N/A |
| Déplacé d'un sprint ouvert | `from "40,44"` → `to "40,43"` (44 retiré) | non reporté | N/A |
| Sprint clos d'un autre board | X dans `closedSprints` avec `originBoardId` ≠ board | non reporté | N/A |
| `closedSprints` absent | champ non renvoyé ou illisible | non reporté | N/A |
| Reporté puis retiré et remis du backlog | dernière entrée dans 43 depuis `""` | non reporté | N/A |
| Sprint étranger affiché | ticket du sprint 77 (`originBoardId` ≠ board), même historique | non reporté | N/A |
| Sans historique | `changelog` null ou sans entrée Sprint | non reporté | N/A |
| Entrée sans identifiants | `fromString "Sprint 41"` → `toString "Sprint 41, Sprint 43"`, 41 clôturé à ce moment | reporté (par les noms) | N/A |
| Filtre actif, deux sprints du board | reportés dans 42 et 43, filtre Sprint = 43 | seules les cartes reportées de 43 ; nombre de la puce inchangé | N/A |
| Kanban, ou passage Scrum → Kanban avec le filtre actif | — | pas de filtre « Reportés », filtre retiré | N/A |

</frozen-after-approval>

## Code Map

- `src/jira/models.ts:147-215` -- `sprintScope` : modèle de lecture de l'historique (items `sprint`, `contains`, `byId`). Ajouter à côté une fonction pure `carriedOverInto({ changelog, sprintId, sprintName }): boolean`.
- `src/core/boardIssue.ts:440-490` -- construction de `BoardIssue` par sprint (`sprint`, `configuration.boardId`) : nouveau champ `carriedOver: boolean`, vrai seulement pour un sprint du board (`isForeignSprint` vient de `core/boardSync.ts:~500` ; le déplacer ou l'importer sans cycle). `SprintMetrics` (l. 210-225, 390-405) : `carriedOverCount` sur le modèle de `addedAfterStartCount` (non affiché dans l'en-tête).
- `src/core/filters.ts:9-11,159-163` -- `QuickFilter` += `"carriedOver"`, dans `QUICK_FILTERS` après `addedAfterStart` ; filtre `issue.carriedOver !== true` → exclu.
- `src/app/model/BoardModel.ts:420-428,680-690` -- retirer aussi `carriedOver` en Kanban (`setFilters`, `prepareFilters`).
- `src/app/views/board/BoardView.tsx:663-678` -- puce masquée en Kanban ; pour `carriedOver`, nombre affiché dans la puce (`<span class="chip-count">`) ; icône existante adaptée (voir `Icon.tsx`).
- `src/app/model/coreText.ts:313-321` -- `QUICK_FILTER_LABEL`/`QUICK_FILTER_HELP` : « Reportés », « Tickets reportés du sprint précédent du board » ; clés dans `src/i18n/messages.ts` et `src/i18n/es/messages.ts` (vérifier où sont les clés existantes « Ajoutés »).
- Fixtures de tests qui construisent `BoardIssue` à la main : ajouter `carriedOver: false` (compilation).
- `scripts/verify-*.mjs` : si un banc compte les puces de filtres rapides, l'adapter.
- `src/jira/models.ts:654-700` (`decodeIssueFields`) -- décoder `closedSprints` (tableau de sprints, décodeur de sprint existant avec `completeDate`, `originBoardId`) en `closedSprints: readonly JiraSprint[] | null` (`null` si absent ou illisible) ; `carriedOverInto` le reçoit.
- `src/core/boardSync.ts:226-245` -- `"closedSprints"` ajouté aux `extraFieldIds` de la seule lecture `sprintIssues` (Scrum). Contrat : `GET /rest/agile/1.0/board/{boardId}/sprint/{sprintId}/issue` renvoie « additional fields like: sprint, closedSprints, flagged and epic » (spécification OpenAPI Jira Software, vérifiée le 31/10/2026 ; l'exemple montre `completeDate`, pas `originBoardId`).
- `tests/support/` et `scripts/verify-jira.mjs` (Jira fictif) : renvoyer `closedSprints` là où un report est mis en scène.

## Tasks & Acceptance

**Execution:**
- [x] `src/jira/models.ts` -- `carriedOverInto` -- lecture pure de l'historique.
- [x] `src/core/boardIssue.ts`, `src/core/boardSync.ts` -- `carriedOver`, `carriedOverCount`, sprint du board seulement.
- [x] `src/core/filters.ts`, `src/app/model/BoardModel.ts` -- filtre rapide, retrait en Kanban.
- [x] `src/app/views/board/BoardView.tsx`, styles, `src/app/model/coreText.ts`, `src/i18n/` -- puce avec nombre, textes FR/EN/ES.
- [x] `tests/jira/models.test.ts`, `tests/core/boardIssue.test.ts`, `tests/core/filters.test.ts`, `tests/app/` (vue) -- matrice I/O.
- [x] `docs/manuel-utilisateur.md`, `docs/technique/invariants.md`, `CHANGELOG.md`, version 0.38.0 (`package.json`, `package-lock.json`, `public/manifest.json`).

**Acceptance Criteria:**
- Given un board Scrum avec des tickets reportés, when il se charge, then les requêtes Jira sont celles d'avant (même liste), seul le paramètre `fields` des tickets de sprint gagnant `closedSprints`.
- Given la puce « Reportés (N) », when je l'active, then seules les N cartes restent, et « Réinitialiser » la désactive comme les autres filtres rapides.

## Implementation Notes

- Règle : `carriedOverInto` (`src/jira/models.ts`) avec `CARRY_OVER_WINDOW_MS` (10 min, dans les deux sens : Jira peut écrire l'entrée juste avant de dater la clôture) ; `closedSprints` décodé dans `decodeIssueFields` (éléments illisibles ignorés, `null` si absent), demandé seulement par la lecture `sprintIssues` (Scrum). `isForeignSprint` était déjà dans `boardIssue.ts`.
- Filtre : `isSprintQuickFilter` regroupe « Ajoutés » et « Reportés » (retrait en Kanban, y compris au passage Scrum → Kanban) ; la puce « Reportés (N) » lit `sprintMetrics(...).carriedOverCount`.
- Contrat : `closedSprints` est documenté pour `GET /rest/agile/1.0/board/{boardId}/sprint/{sprintId}/issue` (OpenAPI Jira Software, 31/10/2026), endpoint marqué `deprecated` dans cette spécification ; l'exemple ne montre pas `originBoardId` (absent = sprint du board). Non vu dans une réponse réelle.
- Deux boucles de revue : la première a amendé la règle (faux positifs de l'historique seul), la seconde la fenêtre (2 → 10 min) et la couverture de tests.
- Vérification (31/10/2026) : `npm run check` (105 fichiers, 1576 tests, 1 ignoré), `verify:jira`, `verify:i18n`, `verify:settings`, codes de sortie 0. Le Jira fictif de `verify:jira` ne met en scène aucun report ; aucun essai réel.

## Spec Change Log

- **Revue 1 (31/10/2026)** — Déclencheur : edge (1, 2, 3, 11) et blind (1, 2, 3). La règle tirée du seul historique comptait comme reporté un ticket remis depuis le backlog après un sprint clos (`from "41"` → `to "41,43"`), un déplacement depuis un sprint ouvert quand un sprint clos restait dans le champ, et un report depuis un sprint clos d'un autre board. Amendé (intention, décision de délégation) : `closedSprints` demandé dans la même lecture, clôture de X à moins de `SPRINT_START_GRACE_MS` de l'entrée, aucun sprint retiré par l'entrée, X du board ; matrice complétée. État évité : un nombre « Reportés » gonflé par d'anciens tickets. **KEEP** : filtre rapide `carriedOver` et `isSprintQuickFilter`, retrait en Kanban, puce et icône, textes FR/EN/ES, champ `BoardIssue.carriedOver` réservé aux sprints du board, tests de vue et de filtres existants, docs et version 0.38.0. Le code n'est pas réécrit : seule la règle (`carriedOverInto`), le décodage et les champs demandés changent, avec les correctifs ci-dessous.

## Review Triage Log

| # | Source | Constat | Verdict | Preuve / route |
|---|--------|---------|---------|----------------|
| 1 | edge (1, 11), blind (1, 2) | Ticket remis depuis le backlog après un sprint clos compté comme reporté | high | Même entrée qu'un report ; jeux de test sans sprint clos conservé. intent_gap → spec amendée |
| 2 | edge (2) | Déplacement depuis un sprint ouvert (`from "40,44"` → `to "40,43"`) compté | medium | 40 conservé suffit à la règle. intent_gap (avec 1) |
| 3 | edge (3), blind (3) | Sprint clos d'un autre board compté | medium | Aucun contrôle de board sur X. intent_gap (avec 1) |
| 4 | edge (4, 5), blind (9) | Dates invalides, plusieurs items Sprint, noms avec virgule | low | Même lecture que `sprintScope` existant, cas non observés. rejeté |
| 5 | edge (7), blind (5) | Puce rendue « Reportés2 », doc annonçant « Reportés (N) » | low | `chip-count` sans séparateur ; correction directe. patch |
| 6 | edge (8), blind (7) | Couleurs codées en dur, pas de thème sombre | false | Aucun thème sombre dans les styles ; « Bloqués » est codé de même (`app.css:698`) |
| 7 | edge (9), blind (10) | Nombre ≠ cartes affichées avec d'autres filtres | false | Décision de l'intention : nombre de tous les sprints, quels que soient les filtres |
| 8 | edge (10) | `boardSync.ts` non modifié | false | `carriedOver` est posé dans `assembleBoardIssues`, seul constructeur de `BoardIssue` des sprints |
| 9 | blind (4), vg (other) | Nombre calculé deux fois (`SprintMetrics.carriedOverCount` inutilisé) | low | Deux sources pour le même nombre ; correction directe (la puce lit les métriques). patch |
| 10 | blind (6) | `invariants.md` : puce insérée au milieu d'une puce existante | low | Lignes de suite rattachées à « Reporté ». patch |
| 11 | vg (1) | Nombre de la puce jamais vérifié avec un autre filtre actif | medium | `Workspace.test.tsx` lit le nombre sans filtre. patch |
| 12 | vg (2), blind (8) | Passage Scrum → Kanban avec « Reportés » actif non testé | medium | Seul un clic en Kanban est testé. patch |
| 13 | blind (11) | `verify:i18n` non attesté | false | Lancé par l'implémentation ; relancé à la vérification finale |
| 14 | revue 2 — vg (1) | Passage Scrum → Kanban avec « Reportés » seul actif non testé | medium | Le test actif « Ajoutés » aussi : revenir à `.has("addedAfterStart")` reste vert. patch |
| 15 | revue 2 — blind (1, 2), edge (1) | Fenêtre de clôture empruntée à `SPRINT_START_GRACE_MS`, trop courte pour une grosse clôture, bornes non testées | medium | Report écrit en rafale (< 10 s pour 30 tickets) : quelques centaines de tickets approchent 2 min. Constante dédiée plus large, bornes testées. patch |
| 16 | revue 2 — blind (3) | Un seul sprint illisible met tout `closedSprints` à `null` | low | Correction directe : ignorer l'élément illisible. patch |
| 17 | revue 2 — blind (4) | Aucun test de bout en bout réponse Jira → `carriedOver` | medium | `boardSync.test.ts` ne vérifie que `fields`. patch |
| 18 | revue 2 — blind (6), edge (2) | Historique `expand=changelog` peut-être tronqué : « dernière entrée » fausse | maybe-false | Non décodé (`total`/`maxResults`) ; `sprintScope` a la même exposition. Se règle par un essai réel sur un ticket à plus de 100 historiques. defer |
| 19 | revue 2 — blind (5), edge (3, 4) | Noms avec virgule, homonymes, sprints renommés en lecture par noms | low | Repli rare, même lecture que `sprintScope`. rejeté |
| 20 | revue 2 — blind (7) | `sprintMetrics` recalculé dans `FilterBar` | low | Coût linéaire négligeable. rejeté |
| 21 | revue 2 — blind (8) | Infobulle muette sur le nombre indépendant des filtres ; cas « (0) » | low | Comportement décidé et documenté au manuel. rejeté |
| 22 | revue 2 — blind (9) | Pas de marqueur de carte ni de règle de couleur pour les reportés | low | Hors intention (filtre seulement) ; noté pour la rétrospective. rejeté |
| 23 | revue 2 — blind (10) | Couleurs codées en dur | false | Voir #6 |
| 24 | revue 2 — blind (11) | Ligne du manuel de 160 caractères | low | Correction directe. patch |
| 25 | revue 2 — blind (12) | `verify:i18n` non attesté | false | Voir #13 |
| 26 | revue 2 — edge (5) | Nombre pris sur `allIssues` et non sur les cartes rendues | false | `applyFilters` reçoit les mêmes tickets (objectifs + swimlanes) |

## Verification

**Commands:**
- `npm run check` -- tout vert.
- `npm run verify:jira` -- vert.
- `npm run verify:i18n` -- vert (nouveaux textes).
