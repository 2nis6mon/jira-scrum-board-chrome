---
title: 'Story 8.14 — Filtrer le planning comme la page du sprint'
type: 'feature'
created: '2026-11-02'
status: 'done'
baseline_commit: 'af1e1dac76b3d7cb5b4a3bdafd2a6576406b4f22'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-8-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Le planning n'a qu'une recherche par clé et résumé (essai du 02/11, point 1). Un PO ne peut donc pas retrouver les tickets d'une personne, d'un type ou d'un parent.

**Approach:** Ajouter la barre de filtres de la page du sprint, avec les mêmes composants et les mêmes règles, appliquée au sprint en préparation et à la colonne « Où sont les tickets ». Les filtres rapides du board Jira sont évalués par Jira sur le périmètre du planning.

**Décisions de Denis (02/11/2026) :**
- Menus identiques à la page du sprint : Personne, Type, Parent, Statut, Label. Priorité et Composant ne sont pas repris, car ils ont été retirés en 0.14.2 ; `epics.md` (story 8.14) sera aligné.
- La pastille « Bloqués » est proposée, avec la règle du board (`isBlockedByLink`). « Ajoutés » et « Reportés » ne le sont pas.

## Boundaries & Constraints

**Always:**
- Lecture seule. Le JQL des filtres rapides est évalué par Jira (`boardIssues`), jamais interprété localement, et plusieurs filtres se combinent en intersection.
- Les totaux des objectifs et la charge du sprint restent calculés sans filtre, comme avec la recherche actuelle.
- Les filtres du planning sont distincts de ceux du board : ils sont vidés au changement de board, comme `search`.
- Textes en `t()`, avec leurs entrées en et es.

**Never:** pas de menu Priorité, Composant, Sprint ni Objectif ; pas de pastille « Ajoutés » ni « Reportés » ; aucune écriture ; pas de modification des filtres de la page du sprint.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Menu Personne | une personne ou « Non assigné » | swimlanes, « Sans objectif » et sources réduites à ses tickets ; totaux et charge inchangés | — |
| Combinaison | Type + Statut + recherche | intersection | — |
| Options | tickets du sprint et des sources | valeurs réellement présentes avec leur nombre, comme `filterOptions` | — |
| Bloqués | pastille active | seuls les tickets bloqués par un lien | — |
| Filtre rapide Jira | un filtre actif | tickets retenus par Jira, parmi ceux qui sont affichés | — |
| Deux filtres rapides | deux actifs | intersection | — |
| JQL refusé | Jira renvoie une erreur | filtres rapides désactivés, avis traduit, autres filtres gardés | une seule lecture, sans rejeu |
| Réinitialiser | des filtres actifs | compteur « Réinitialiser (n) », tout est vidé | — |
| Changement de board | filtres actifs | vidés | — |

</frozen-after-approval>

## Code Map

- `src/core/filters.ts` -- `BoardFilters` et `applyFilters`, qui lit `BoardIssue`. Extraire un prédicat sur `JiraIssue` (champs, `isBlockedByLink`, `jiraQuickFilterKeys`), utilisé par `applyFilters` et par le planning. Le comportement du board ne change pas.
- `src/core/boardLayout.ts` -- `filterOptions(snapshot)`. Extraire le décompte sur une liste de `JiraIssue` (personnes, non assignés, types, statuts, labels, parents, sans parent), réutilisé par le planning.
- `src/core/jql.ts` -- `inBoardScope` / `inActiveSprints`. Ajouter un périmètre du planning, par exemple `inPlanningScope(jql, sprintIds)` = `(base) AND (sprint in (ids) OR sprint is EMPTY OR sprint in closedSprints())`, où `ids` réunit le sprint préparé, les autres sprints futurs et les sprints actifs. Les fonctions `closedSprints()` et `is EMPTY` sont du JQL standard de Jira Software : les vérifier dans la documentation Atlassian avant de coder. Le résultat est croisé avec les clés affichées.
- `src/core/jiraQuickFilters.ts` -- `quickFilterKeys` : permettre ce périmètre par une option, sans changer l'appel du board.
- `src/app/model/PlanningModel.ts` -- `#matches` (l. ~188) ne lit que `search`. Ajouter un signal `filters` (sous-ensemble de `BoardFilters`), `filterOptions`, `setFilters`, `toggleBlocked`, `toggleJiraQuickFilter` (avec un compteur de génération, comme `#applyJiraQuickFilters` du board, l. ~762), `applyingQuickFilters` et `resetFilters`. Les vider avec `search` (l. ~963).
- `src/app/model/PlanningTypes.ts` -- `PlanningViewModel` : ajouter ces membres.
- `src/app/model/BoardModel.ts` (l. ~403) -- contexte du planning : ajouter `jiraQuickFilters: () => this.jiraQuickFilters.value`. Le lecteur est déjà `this.#client`.
- `src/app/views/board/BoardView.tsx` (l. ~663-850) -- `FilterBar` et `JiraQuickFilters`, liés à `BoardModel`. Réutiliser `FilterMenu` et les classes `chip`, `chip-jira` et `filter-reset`. Ne pas modifier la barre du board.
- `src/app/views/board/FilterMenu.tsx` -- composant à réutiliser tel quel.
- `src/app/views/planning/PlanningView.tsx` (l. ~75-90) -- recherche `/`. Ajouter la barre à côté, dans l'en-tête.
- `tests/app/PlanningModel.test.ts`, `tests/app/PlanningView.test.tsx`, `tests/core/filters.test.ts`, `tests/core/jql.test.ts`, `tests/core/jiraQuickFilters.test.ts`.

## Tasks & Acceptance

**Execution:**
- [x] `src/core/filters.ts`, `src/core/boardLayout.ts`, `src/core/jql.ts`, `src/core/jiraQuickFilters.ts` + tests -- prédicat et options sur `JiraIssue`, périmètre JQL du planning. Les tests existants du board restent verts sans modification.
- [x] `src/app/model/PlanningModel.ts`, `PlanningTypes.ts`, `BoardModel.ts` + `tests/app/PlanningModel.test.ts` -- état des filtres et application aux swimlanes, à « Sans objectif » et aux sections ; filtres rapides Jira ; un test par ligne de la matrice.
- [x] `src/app/views/planning/PlanningView.tsx`, `src/app/styles/planning.css` + `tests/app/PlanningView.test.tsx` -- barre de filtres, ses menus, « Bloqués » et filtres rapides, compteur et « Réinitialiser » ; à 390 px, la barre passe à la ligne sans débordement.
- [x] `src/i18n/*.ts`, `src/i18n/es/*.ts` -- nouveaux textes.
- [x] `scripts/verify-planning.mjs` -- dans Chrome réel, un menu Personne et un filtre rapide Jira réduisent les cartes, les totaux ne changent pas, et la barre ne déborde pas à 640 ni à 390 px.
- [x] `_bmad-output/planning-artifacts/epics.md` (story 8.14 : menus alignés, « Bloqués » proposé), `CHANGELOG.md`, version 0.43.0 (`package.json`, `package-lock.json`, `public/manifest.json`), `docs/technique/integration-jira.md` (périmètre JQL du planning).

**Acceptance Criteria:**
- Given un filtre actif, when j'ajoute un ticket filtré à un objectif, then le geste écrit comme avant (8.4) et la carte reste visible tant qu'elle correspond au filtre.
- Given le paquet (`npm run package`), when il est construit, then rien du planning n'y figure (`verify:planning:package`).

## Implementation Notes

- Implémentation par un sous-agent. `matchesIssue` et `issueFilterOptions` sont extraits dans `core` ; `applyFilters` et `filterOptions` du board les appellent, sans changement de comportement. `inPlanningScope` et `quickFilterKeys({ scope: "planning" })` sont ajoutés. Le modèle a `filters`, `filterOptions`, `toggleJiraQuickFilter` (compteur de génération), `resetFilters`, et les filtres sont vidés au changement de board.
- Syntaxe JQL vérifiée sur les pages Atlassian (champ Sprint : `IS`, `IN` ; `closedSprints()` : `IN`, `NOT IN`) ; un ticket revenu d'un sprint clos n'est pas retrouvé par `sprint is EMPTY`, d'où `closedSprints()`.
- Hors spec : un menu de filtre ouvert près du bord droit est décalé pour rester à l'écran à 640 px (le board a le même défaut, non corrigé).
- Aucune nouvelle clé i18n. Le banc fictif (`tests/harness/harness.tsx`) répond au JQL du planning.
- Risque : `sprint in closedSprints()` peut ramener beaucoup de tickets sur un board ancien (au-delà de 5 000, lecture en échec et avis) : à mesurer en 8.10.
- Audit de la matrice : 9 lignes couvertes dans `tests/app/PlanningModel.test.ts`, lancées et vertes.
- Correctifs de revue (passe 1) : réévaluation des filtres rapides après chaque relecture, branche des sprints clos limitée à `statusCategory != Done`, messages vides et indicateur « visibles / total », recherche à la règle du board (placeholder du board repris), invariants, tests de réévaluation et de branchement des menus. Vérification complète verte (1848 tests).

## Spec Change Log

## Review Triage Log

Passe 1 (chasse aveugle, cas limites, trous de vérification) :
- Clés des filtres rapides Jira non réévaluées après un geste (`#reread`) : un filtre qui dépend du sprint garde une carte déplacée qui n'y correspond plus, ce qui contredit le critère « visible tant qu'elle correspond ». — medium, patch.
- Réévaluation après `refresh()` / `selectSprint()` jamais testée. — medium (trou de vérification), patch : test.
- Branchement des menus Type, Parent, Statut, Label et des cases « Sans parent » / « Non assigné » non vérifié dans la vue. — medium (trou de vérification), patch : test par table.
- Messages de liste vide liés à la seule recherche : « ne correspond à la recherche » s'affiche alors qu'un filtre masque, et « Tous les tickets du sprint servent un objectif » est faux. — low, patch.
- Pas d'indicateur « visibles / total » comme `filter-result` sur le board. — low, patch.
- `sprint in closedSprints()` remonte tout l'historique : au-delà de 5 000 tickets, la lecture échoue et les filtres rapides sont désactivés sur un board ancien. — medium, patch : branche des sprints clos limitée à `statusCategory != Done` (le résultat reste croisé avec les cartes affichées).
- Règles des filtres du planning absentes de `invariants.md`. — low, patch.
- La recherche du planning n'applique pas la règle du board (`foldText`, personne, type, label) : « Elodie » ne trouve pas « Élodie ». — low, patch : même règle de recherche que le board, sur le ticket Jira.
- Compteurs : « Sans objectif » et les sections suivent les filtres, les objectifs non. — low, rejeté : comportement déjà en place avec la recherche ; l'indicateur « visibles / total » le rend lisible.
- Erreur réseau traitée comme un JQL refusé ; session perdue non signalée. — low, rejeté : même comportement que le board (`#applyJiraQuickFilters` de `BoardModel`).
- Identifiant de filtre rapide fantôme, JQL modifié sous le même identifiant, configuration nulle. — low, rejeté : cas rares (relecture de la structure), « Réinitialiser » les vide.
- Valeur cochée absente des nouvelles options après un changement de sprint. — low, rejeté : même comportement que le board avec `FilterMenu`.
- Barre et logique des filtres rapides recopiées du board. — low, rejeté : la barre du board ne devait pas changer, et `FilterMenu` est partagé ; risque de divergence noté pour l'harmonisation des menus (backlog).
- Panneau de filtre non replacé au redimensionnement ; fenêtre de moins de 236 px. — low, rejeté : le board a le même comportement, et la largeur est irréaliste.
- Type `PlanningFilters.quickFilters` trop large ; priorité et composant optionnels dans `IssueFilters`. — low, rejeté : `setFilters` filtre et la vérification de types du board reste assurée par `BoardFilters`.
- Scénario `board-planning-deux-actifs` du banc : le périmètre JQL n'inclut pas le sprint 45. — low, rejeté : ce scénario n'active aucun filtre rapide.
- Tests de vue minces pendant un geste. — low, rejeté : couvert par les tests du modèle.
- Chemin du filtre par composant du board sans test. — low, rejeté : antérieur au changement.

## Verification

**Commands:**
- `npm run check` -- vert
- `npm run verify:jira` -- vert
- `npm run verify:planning` et `npm run verify:planning:package` -- verts
- `npm run verify:i18n` -- vert
