---
title: 'Story 1.9 — Tous les interrupteurs de fonction au même endroit'
type: 'refactor'
created: '2026-10-30'
status: 'done'
baseline_commit: 'dc1ac8d4540ae15a032e523368e07509cb7135b1'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `SPRINT_HEALTH_ENABLED` (`src/app/views/board/BoardView.tsx`, `false`) et `DIAGNOSTIC_ENABLED` (`src/app/views/DiagnosticView.tsx`, `true`) sont déclarés dans des vues et ne gardent que l'affichage, alors que AD-5 exige une déclaration dans `app/featureFlags.ts`, fixée à la compilation, et une garde aux points d'entrée des modèles et services.

**Approach:** Déclarer les deux interrupteurs dans `src/app/featureFlags.ts` à côté de `SPRINT_PLANNING_ENABLED`, comme constantes de compilation identiques dans `dist/` et dans le paquet ; garder chaque point d'entrée de modèle ou service qui lit ou écrit pour la fonction ; un test de modes de compilation vérifie leur valeur dans les deux modes.

## Boundaries & Constraints

**Always:** comportement visible inchangé : diagnostic actif, santé du sprint masquée, dans `dist/` et dans le paquet ; décodage, conservation des formats et effacement des données jamais conditionnés ; `featureFlags.ts` n'importe rien de `src/` ; aucune activation par préférence, réglage ou URL.

**Never:** changer la valeur d'un interrupteur ; garder une écriture Jira derrière `DIAGNOSTIC_ENABLED` autrement que par l'arrêt du point d'entrée (E7 reste dans `jira/diagnostics.ts`) ; supprimer le code de la santé du sprint.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Build `dist` | `vite build --mode dist` | `SPRINT_HEALTH_ENABLED=false`, `DIAGNOSTIC_ENABLED=true` | N/A |
| Paquet | mode `package` | mêmes valeurs ; `SPRINT_PLANNING_ENABLED=false` inchangé | N/A |
| Santé désactivée | appel d'un point d'entrée santé du modèle | ne lit ni n'écrit rien | N/A |
| Diagnostic désactivé (valeur forcée dans un test) | `DiagnosticModel.run…` | ne lit ni n'écrit rien | N/A |

</frozen-after-approval>

## Code Map

- `src/app/featureFlags.ts` -- ajouter `__SPRINT_HEALTH_ENABLED__` et `__DIAGNOSTIC_ENABLED__` (constantes `declare` comme `__SPRINT_PLANNING_ENABLED__`) et leurs exports.
- `vite.config.ts` (et `vite.harness.config.ts`, `vitest` config si elles définissent `__SPRINT_PLANNING_ENABLED__`) -- `define` des deux nouvelles constantes pour chaque mode ; vérifier aussi `scripts/package.mjs` si le mode y est fixé.
- `src/app/views/board/BoardView.tsx` (l. ~64, 83, 375), `src/app/views/DiagnosticView.tsx` (l. ~15), `src/app/views/Sidebar.tsx` (l. ~10, 195) -- importer depuis `featureFlags.ts`.
- Points d'entrée à garder : méthodes de `BoardModel`/`AppModel` liées à la santé du sprint (`healthOpen`, calculs `core/sprintHealth.ts` appelés depuis un modèle) et méthodes de `src/app/model/DiagnosticModel.ts` qui lancent lectures/écritures ; `AppModel` qui ouvre la vue diagnostic.
- `tests/buildModes.test.ts` -- étendre le test existant (l. ~20) aux deux constantes, pour `dist` et `package`.
- `tests/app/App.test.tsx` (l. ~6), `tests/app/Workspace.test.tsx` (l. ~6) -- importer depuis `featureFlags.ts`.
- `tests/guards/sources.test.ts` -- garde : aucun `export const [A-Z_]+_ENABLED` hors de `src/app/featureFlags.ts`.
- `ARCHITECTURE-SPINE.md` -- retirer l'écart AD-5 ; `docs/technique/developpement.md` si les interrupteurs y sont listés ; `CHANGELOG.md` sous 0.36.2.

## Tasks & Acceptance

**Execution:**
- [x] `src/app/featureFlags.ts`, configurations Vite -- déclarer et définir -- AD-5
- [x] vues -- importer depuis `featureFlags.ts` -- AD-5
- [x] modèles -- garder les points d'entrée -- AD-5
- [x] `tests/buildModes.test.ts`, gardes, tests de modèle -- CAP-9
- [x] documents -- spine, développement, changelog

**Acceptance Criteria:**
- Given `npm run package` puis `npm run verify:planning:package`, when ils tournent, then ils passent.

## Implementation Notes

## Spec Change Log

## Review Triage Log

| # | Constat | Verdict | Preuve / route |
|---|---------|---------|----------------|
| 1 | Garde AD-5 étroite (`const` local, `let`, annotation) et sans contrôle du nombre trouvé | medium | Une constante locale dans une vue, cas corrigé par la story, passerait ; patch |
| 2 | Effacement du journal, diagnostic coupé, non testé | medium | Moitié « jamais conditionné » de l'exigence sans test ; patch |
| 3 | Modes `production` et inconnu absents du test des nouveaux interrupteurs | low | Ajout direct ; patch |
| 4 | invariants.md ne décrit pas le blocage des points d'entrée | low | Doc ; patch |
| 5 | Commentaires de `featureFlags.ts` avec historique daté | low | Doublon d'invariants.md ; patch direct |
| 6 | Message CORS qui renvoie au Diagnostic quand il est coupé | low | Rejeté : l'interrupteur vaut toujours vrai, cas hypothétique |
| 7 | `buildModes.test.ts` relit les littéraux écrits | low | Rejeté : vérifie la définition par mode ; le paquet est contrôlé par `verify:planning:package` |
| 8 | Test de vue de la santé jamais exécuté | low | Rejeté : `skipIf` antérieur à la story |
| 9 | `App.tsx` rend `DiagnosticView` sans garde propre | low | Rejeté : seul `showDiagnostic`, gardé, ouvre cette vue |
| 10 | `report()` non gardé | false | Fonction pure, sans lecture ni écriture |
| 11 | Spec sans traces | false | Contrôles relancés avant `done` |

## Verification

**Commands:**
- `npm run check` -- expected: vert
- `npm run verify:jira` -- expected: vert
- `npm run verify:planning:package` -- expected: vert
