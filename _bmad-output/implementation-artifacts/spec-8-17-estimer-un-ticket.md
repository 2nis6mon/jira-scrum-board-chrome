---
title: 'Story 8.17 — Estimer un ticket pendant la séance'
type: 'feature'
created: '2026-11-02'
status: 'done'
baseline_commit: 'f75e328cd65f47f24e1b13c3d1f7f6ef7ad54b24'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-8-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Essai du 02/11/2026 (point 7) : pour chiffrer ses stories en séance, l’équipe ouvre chaque fiche, et la charge du sprint ne se met à jour qu’après.

**Approach:** Saisir l’estimation directement sur la carte du planning. Elle est écrite par une nouvelle écriture E11 dans le champ d’estimation du board, puis relue.

**Décisions :**
- Denis, 02/11/2026 : écrire l’estimation depuis le planning (option « saisie sur la carte »).
- Contrat vérifié dans l’OpenAPI officielle de Jira Software (02/11/2026) : `PUT /rest/agile/1.0/issue/{clé}/estimation?boardId=`, corps `{"value": "<chaîne>"}`, 200 avec `fieldId` et `value` ; `GET` même chemin pour relire. Le champ est celui du board ; Jira l’écrit « même s’il n’est pas sur l’écran » (pas de lecture `editmeta`), 403 sans droit de modifier le ticket. Le candidat `PUT /rest/api/3/issue/{clé}` est écarté.
- Mode autonome : seul un champ personnalisé (`customfield_…`, story points) se modifie ici. Le temps estimé (secondes, durées « 1w 2d ») reste à la fiche. Valeur : nombre de 0 à 10 000. Une saisie vide n’efface pas l’estimation (rien n’est écrit).
- « Champ non modifiable pour ce ticket » : constaté par le refus de Jira au geste (403 ou 400), dit par l’avis sans annoncer de réussite ; la fiche native reste le recours.

## Boundaries & Constraints

**Always:** une fonction de `core` par intention (`estimatePlanningIssue`) ; estimation et champ relus avant E11, rien n’est écrit s’ils ont changé ; une seule tentative, relecture de confirmation ; porte du board ; E11 dans `jira/writes.ts`, `securite.md`, la règle « Écritures métier » d’AGENTS.md ; textes en `t()` en, es.

**Never:** aucune autre écriture sur le ticket ; pas d’estimation sur une carte en consultation ; pas de suppression d’estimation.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Saisie validée | « ? », 3, Entrée | une E11 `{"value":"3"}`, relue, carte et charge à 3 | — |
| Estimation changée dans Jira | affichée 2, Jira 13 | rien n’est écrit, avis, page relue | — |
| Valeur inchangée | 2 → 2 | rien n’est lu ni écrit | — |
| Échap / vide | saisie annulée | rien n’est écrit | — |
| Sans champ, temps estimé, consultation | board ou carte | valeur affichée, non modifiable | — |
| Champ de Jira différent | `fieldId` relu ≠ champ du board | rien n’est écrit | — |
| Écriture non relue | E11 acceptée, valeur relue différente | partiel, sans rejeu | avis |
| Hors bornes | −1, 10 001, NaN | refus avant toute lecture ou écriture | — |

</frozen-after-approval>

## Code Map

- `src/jira/writes.ts` -- `issue.estimation` (E11), `isEstimateValue`.
- `src/jira/client.ts` -- `issueEstimation(clé, board)`.
- `src/core/sprintPlanning.ts` -- `canEstimateWith`, `estimatePlanningIssue`, étape `estimate` ; `src/core/reasons.ts` -- `estimateChanged`, `estimateUnavailable`, `invalidEstimate`, `planningEstimateUnconfirmed`.
- `src/app/model/coreText.ts`, `PlanningModel.ts` (`canEstimate`, `estimateIssue`), `PlanningTypes.ts`.
- `src/app/views/planning/PlanningView.tsx` -- `CardEstimate` (bouton puis champ ; la carte ne se glisse pas pendant la saisie) ; `planning.css`.
- Tests : `tests/jira/writes.test.ts`, `tests/guards/sources.test.ts`, `tests/app/BoardWriteGate.test.ts`, `tests/jira/client.planning.test.ts`, `tests/core/sprintPlanning.test.ts`, `tests/app/PlanningModel.test.ts`, `tests/app/PlanningView.test.tsx`, `tests/app/coreText.test.ts` ; banc `planningFixture` (ressource d’estimation du board 7) ; `scripts/verify-planning.mjs`.

## Tasks & Acceptance

**Execution:**
- [x] Inventaire, client, `core` + tests exhaustifs et garde de sources.
- [x] Modèle, textes, vue, styles + tests.
- [x] `scripts/verify-planning.mjs` -- estimation saisie dans Chrome réel, E11 seule, valeur relue.
- [x] `docs/technique/securite.md` (E11), `integration-jira.md`, `index.md`, AGENTS.md, `CHANGELOG.md`, version 0.46.0, `sprint-status.yaml`.

**Acceptance Criteria:**
- Given le paquet, when il est construit, then rien du planning n’y figure (`verify:planning:package`).

## Implementation Notes

- Implémenté directement (mode autonome, sous-agents non demandés).
- Le banc fictif copie désormais ses tickets à chaque création : une estimation écrite ne fuit plus d’un test à l’autre.

## Spec Change Log

## Review Triage Log

Passe 1, faite sans sous-agent (chasse aveugle, cas limites, trous de vérification) :
- Estimation écrite par le banc fictif partagée entre tests (objets du catalogue mutés). — medium (trou de vérification), patch : catalogue copié à chaque banc.
- Chemin littéral `${…}` dans le garde de sources signalé par le lint. — low, patch : exception commentée, le texte est voulu.
- Champ ouvert pendant qu'un autre geste commence : la validation est ignorée sans avis. — low, rejeté : cas rare (les gestes durent quelques centaines de millisecondes), la valeur de Jira reste affichée.
- Pas de lecture `editmeta` pour savoir si le champ est modifiable avant d'ouvrir la saisie. — false : l'OpenAPI dit que Jira écrit le champ d'estimation même hors écran ; un refus (403/400) est dit au geste, sans rejeu.
- Temps estimé affiché en secondes comme des points. — low, rejeté : comportement antérieur (charge du planning), hors de la story ; non modifiable ici.

## Verification

Résultats : `npm run check` (1 940 tests), `verify:jira`, `verify:planning` (estimation réelle dans Chrome), `verify:planning:package`, `verify:i18n` verts.

**Commands:**
- `npm run check`, `npm run verify:jira`, `npm run verify:planning`, `npm run verify:planning:package`, `npm run verify:i18n` -- verts
