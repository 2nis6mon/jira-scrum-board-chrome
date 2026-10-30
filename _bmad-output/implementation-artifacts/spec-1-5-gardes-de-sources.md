---
title: 'Story 1.5 — Les gardes de sources vérifient le sens des dépendances'
type: 'refactor'
created: '2026-10-30'
status: 'done'
baseline_commit: 'e5aab08a54ff1f7648fcad8393eba4d6bf4b1927'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `src/jira/transport.ts` importe `src/core/loadTrace.ts` (dépendance `jira → core` interdite par AD-1), et `tests/guards/sources.test.ts` ne vérifie ni ce sens ni la racine de composition (`JiraTransport`, `JiraClient`, `GoalsClient`, `AuditLog` construits seulement dans `AppModel`, `BoardModel`, `DiagnosticModel`).

**Approach:** Déplacer le contrat d'observation des lectures dans `src/jira/loadTrace.ts` et mettre à jour ses importeurs, puis encoder dans les gardes : `src/jira/` n'importe jamais `src/core/` (ni `app`, `integration`, déjà couvert), et `new JiraTransport|JiraClient|GoalsClient|AuditLog(` n'apparaît que dans les trois modèles racines.

## Boundaries & Constraints

**Always:** comportement identique (déplacement de fichier, imports) ; le message d'échec d'une garde nomme le fichier fautif ; aucune exception tolérée dans la garde `jira → core` ; tests sous `tests/` uniquement.

**Never:** changer l'API de `LoadTrace` ; ajouter une liste d'exceptions ; toucher aux autres gardes au-delà de leur extension.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Code livré | après déplacement | toutes les gardes passent | N/A |
| Import `jira → core` ajouté | `src/jira/x.ts` importe `../core/y` | la garde échoue en nommant `src/jira/x.ts` | N/A |
| Construction hors racine | `new JiraClient(` dans un service | la garde échoue en nommant le fichier | N/A |

</frozen-after-approval>

## Code Map

- `src/core/loadTrace.ts` → `src/jira/loadTrace.ts` (git mv) ; importeurs : `src/jira/transport.ts`, `src/core/boardSync.ts`, `src/app/model/LoadDiagnostics.ts`, `src/app/services/BoardLoadingService.ts`, `src/app/views/LoadDiagnosticsView.tsx`, `tests/core/boardSync.test.ts`, `tests/jira/transport.test.ts`. Vérifier que `src/jira/loadTrace.ts` n'importe rien de `core`.
- `tests/guards/sources.test.ts` -- la garde « interdit aux couches métier et Jira de dépendre de l'interface » (l. ~128) : ajouter une garde `src/jira/` → pas de cible `^src/core/` ; ajouter une garde de racine de composition (`/new\s+(JiraTransport|JiraClient|GoalsClient|AuditLog)\s*\(/` seulement dans `src/app/model/AppModel.ts`, `BoardModel.ts`, `DiagnosticModel.ts`). Les échecs doivent produire un message `${file} → ${target}` comme les gardes voisines.
- Démonstration d'échec : un test de la garde elle-même sur des sources fictives en mémoire (fonction de garde extraite et appliquée à `[{file, code}]`), pour prouver qu'elle échoue en nommant le fichier sans modifier `src/`.
- `ARCHITECTURE-SPINE.md` -- retirer les deux écarts AD-1 ; mettre à jour le lien `LoadTrace` si cité ; `docs/technique/` si `core/loadTrace.ts` y est cité ; `CHANGELOG.md` sous 0.36.2.

## Tasks & Acceptance

**Execution:**
- [x] `src/jira/loadTrace.ts` et ses importeurs -- déplacer le contrat -- AD-1
- [x] `tests/guards/sources.test.ts` -- gardes `jira → core` et racine de composition, avec démonstration d'échec sur sources fictives -- CAP-8
- [x] documents -- spine, docs/technique, changelog -- traçabilité

**Acceptance Criteria:**
- Given `grep -r "core/loadTrace" src tests docs`, when lancé, then aucun résultat.

## Implementation Notes

## Spec Change Log

## Review Triage Log

| # | Constat | Verdict | Preuve / route |
|---|---------|---------|----------------|
| 1 | Import d'effet de bord et import de répertoire `../core` échappent à la garde | medium | L'expression ne reconnaît que `from` et `import(` ; cible `^src/core/` exige la barre ; patch |
| 2 | `new JiraClient<T>(` non reconnu | low | Correction directe de l'expression ; patch |
| 3 | Garde `core|jira → app|integration` dupliquant l'expression | low | Réécriture directe avec l'utilitaire ; patch |
| 4 | Libellés français de mesure (`LOAD_PHASE_LABELS`, `LOAD_SPAN_LABELS`) entrés dans `src/jira/` | medium | Phrases d'interface dans la couche Jira, contraire à AD-1 ; patch (retour côté `app`) |
| 5 | `src/jira/diagnostics.ts` importe `../i18n` | medium | Antérieur à la story ; defer |
| 6 | Contournement par alias, sous-classe ou `Reflect.construct` | low | Rejeté : improbable, correctif non direct |
| 7 | Retrait des commentaires non démontré sur sources fictives | low | Rejeté : traitement partagé déjà exercé par les vraies sources |
| 8 | Pas de table racine → classes autorisées | low | Rejeté : hors de l'intention (racine de composition commune) |
| 9 | Entrée du CHANGELOG trop interne | low | Rejeté : cohérent avec les entrées 0.36.2 des stories précédentes |
| 10 | Spec sans traces de vérification | false | Contrôles relancés avant `done` |

## Verification

**Commands:**
- `npm run check` -- expected: vert
- `npm run verify:loading` -- expected: vert
- `npm run verify:jira` -- expected: vert
