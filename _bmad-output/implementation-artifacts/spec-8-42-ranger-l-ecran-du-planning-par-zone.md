---
title: 'Story 8.42 : ranger l''écran du planning par zone avant les stories de droits'
type: 'refactor'
created: '2026-11-25'
status: 'done'
route: 'dispatch'
baseline_commit: '82a676095169b466d3f1872068db326ff0d2ee59'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-8-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `src/app/views/planning/PlanningView.tsx` fait 1 940 lignes (38 composants et fonctions), le fichier le plus modifié de l'Epic 8 ; chaque story relit tout, les numéros de ligne cités par les specs vieillissent (la 8.38 situe `PlanningCard` l. 1402, il est l. 1468) et deux sessions s'y gênent (rétrospective de l'Epic 8, constat A1).

**Approach:** déplacer chaque zone de l'écran dans son fichier du même dossier, sans changer une ligne de logique, avant la 8.38 qui touche la carte et son menu ; au passage, ne garder qu'une copie de `sameOrder` et de `sameIds` (constat A4). Décision de Denis du 25/11/2026 : `PlanningModel.ts` n'est pas découpé.

## Boundaries & Constraints

**Always:** déplacement pur — corps de fonctions, textes, classes CSS, attributs et ordre des éléments identiques ; seuls imports et exports changent. `PLANNING_DRAG_TYPE` et `PLANNING_SPRINT_DRAG_TYPE` restent importables depuis `PlanningView.tsx` (réexport). `import "../../styles/planning.css"` reste dans `PlanningView.tsx`. Aucun cycle d'import entre les nouveaux fichiers. Chaque fichier sous environ 600 lignes. Commentaires conservés avec leur code.

**Never:** découper `PlanningModel.ts` ou `PlanningTypes.ts` ; renommer un composant ; modifier une assertion de test existante (seuls des imports de test peuvent changer) ; changement visible, texte, écriture ou lecture Jira.

</frozen-after-approval>

## Code Map

Plan de rangement (lignes actuelles de `PlanningView.tsx`, dépendances relevées par script) :

- `PlanningView.tsx` (garde 44-164) -- `PlanningView` ; importe `PlanningFilters`, `keepFilterPanelInView`, `PlanningHeader`, `PlanningMessages`, `SourcesColumn`, `LanesColumn` ; réexporte les deux types de glisser ; garde l'import du CSS.
- `planningDrag.ts` (36-38, 722-786) -- `PLANNING_DRAG_TYPE`, `PLANNING_SPRINT_DRAG_TYPE`, `useDrop`, `placeKeys`, `removeKeys`, `sectionId` (utilisés par sources, objectifs, carte et menu).
- `planningText.ts` (322-326) -- `text(message)` (utilisé par en-tête, messages, objectifs).
- `PlanningFilters.tsx` (177-346) -- `PlanningFilters`, `filterResult`, `PlanningJiraQuickFilters`, `PANEL_MARGIN`, `keepFilterPanelInView` (exportés : filtres et `keepFilterPanelInView`).
- `PlanningHeader.tsx` (347-721) -- `PlanningHeader`, `CloseSprintMenu`, `SprintDates`, `velocityText`, `VelocityField`, `UnmappedNote`, `SprintLoad`, `PlanningMessages`.
- `SourcesColumn.tsx` (787-904) -- `SourcesColumn`, `SourceSection`, `canJoinSprint`.
- `PlanningLanes.tsx` (905-1455) -- `LanesColumn`, `CarryOverReportPanel`, `LaneCards`, `TypeLane`, `GoalLane`, `GoalTitle`, `AddGoal`, `PinGoal`, `UnassignedLane`.
- `PlanningCard.tsx` (165-176, 1456-1941) -- `gestureKeys`, `ownControl`, `STATUS_CATEGORIES`, `PlanningCard`, `CardEstimate`, `belowCard`, `inOpenMenu`, `PlanningCardMenu`, `rankReason`.
- Importeurs externes : `src/app/App.tsx:11`, `tests/app/PlanningView.test.tsx:20-24` (`PLANNING_DRAG_TYPE`, `PLANNING_SPRINT_DRAG_TYPE`, `PlanningView`), `tests/app/PlanningSprintSelect.test.tsx:6` -- inchangés grâce au réexport.
- `src/core/reorder.ts:41` -- `sameOrder` exporté, à réutiliser ; copies à retirer : `src/app/model/BoardModel.ts:1892` (`sameOrder`), `:1900` (`sameIdOrder`, identique, appelé l. 297), `src/core/pinnedGoals.ts:226` (`sameOrder`).
- `sameIds` identique dans `BoardModel.ts:1896` et `PlanningModel.ts:1705`, appelé pour `jiraQuickFilterIds` (`BoardModel.ts:796`, `PlanningModel.ts:723`) -- exporter une seule copie depuis `src/core/filters.ts` (ensembles d'identifiants de filtres rapides).
- `tests/guards/sources.test.ts` -- contrôle le sens des dépendances : `app/views` → `app/model`, `core` permis.
- `_bmad-output/implementation-artifacts/spec-8-38-gestes-d-un-ticket-desactives-sans-droit-sur-son-projet.md` -- sa Code Map cite `PlanningView.tsx` l. 1402-1860 : à pointer vers `PlanningCard.tsx`.

## Tasks & Acceptance

**Execution:**
- [x] `src/app/views/planning/planningDrag.ts`, `planningText.ts`, `PlanningFilters.tsx`, `PlanningHeader.tsx`, `SourcesColumn.tsx`, `PlanningLanes.tsx`, `PlanningCard.tsx` -- créer par déplacement selon la Code Map, exports minimaux -- un fichier par zone.
- [x] `src/app/views/planning/PlanningView.tsx` -- ne garder que `PlanningView`, ses imports, l'import CSS et le réexport des deux types -- point d'entrée inchangé.
- [x] `src/core/filters.ts` -- exporter `sameIds` ; `src/app/model/BoardModel.ts`, `src/app/model/PlanningModel.ts` -- l'importer, supprimer leurs copies.
- [x] `src/app/model/BoardModel.ts`, `src/core/pinnedGoals.ts` -- importer `sameOrder` de `src/core/reorder.ts`, supprimer `sameOrder` et `sameIdOrder` locaux.
- [x] `tests/core/filters.test.ts` -- test de `sameIds` (mêmes éléments dans un autre ordre, tailles différentes, ensembles vides).
- [x] `_bmad-output/implementation-artifacts/spec-8-38-…md` -- Code Map vers les nouveaux fichiers (texte hors bloc figé).
- [x] `CHANGELOG.md`, `package.json`, `package-lock.json`, `public/manifest.json` -- 0.55.1, entrée sans changement visible.

**Acceptance Criteria:**
- Given le diff de `src/app/views/planning/`, when on compare les corps déplacés à ceux de la base, then ils sont identiques (hors indentation éventuelle d'export) et aucun texte, classe ou attribut ne change.
- Given les tests et bancs, when ils tournent, then ils passent sans qu'aucune assertion change.
- Given les nouveaux fichiers, when on compte leurs lignes, then aucun ne dépasse environ 600 et aucun cycle d'import n'existe.

## Implementation Notes

- Fait directement, sans sous-agent ; Denis avait approuvé le plan (« oui », 25/11/2026), approbation de la spec non redemandée.
- Découpage fait par script (blocs de lignes déplacés tels quels, imports calculés par usage), puis Biome. Contrôle de pureté : le multiensemble des lignes de code (hors imports, au mot `export` près) est identique à l'original, sauf trois signatures que Biome a repliées.
- Biome trie les imports : `import "../../styles/planning.css"` passe avant les imports locaux. Aucun module importé ne charge de CSS ; les CSS construits (`board-*.css`, `launcher-*.css`) sont identiques octet pour octet à ceux de la base.
- Choix hors liste de l'epic : la quatrième copie de `sameOrder`, dans `src/core/pinnedGoals.ts`, est aussi retirée (même fonction, core → core).
- Imports locaux sans cycle : `PlanningView` → filtres, en-tête, objectifs, colonne de gauche, glisser ; objectifs et colonne de gauche → carte → glisser ; en-tête et objectifs → `planningText`.

## Spec Change Log

## Review Triage Log

Passe faite sans sous-agent (relecture à froid, cas limites, preuves manquantes) :
- `planningDrag.ts` porte aussi `placeKeys` et `removeKeys`, utilisés par le menu de carte (pas seulement le glisser). — low, rejeté : nom compris comme « gestes de déplacement », déplacement pur demandé.
- Ordre de l'import CSS changé par le tri de Biome. — false : CSS construits identiques à la base.
- `sameIdOrder` remplacé par `sameOrder` : même corps, même sens. — false.
- Réexport des types de glisser non testé. — false : `tests/app/PlanningView.test.tsx` les importe depuis `PlanningView.tsx` et passe.

## Verification

**Commands:**
- `npm run check` -- expected: types, Biome, tests, gardes de sources verts.
- `npm run verify:planning` et `npm run verify:drag` -- expected: verts (Chrome, banc fictif).
- `npm run verify:jira` -- expected: vert.

**Manual checks (if no CLI):**
- `git diff --stat` : `PlanningView.tsx` perd environ autant de lignes que les nouveaux fichiers en gagnent (plus les imports).
