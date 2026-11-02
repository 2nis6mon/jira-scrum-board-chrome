---
title: 'Story 8.15 — Déplacer plusieurs tickets ensemble'
type: 'feature'
created: '2026-11-02'
status: 'done'
baseline_commit: '7d1cd321ac00dfafaf96e460bdcf5e11cbbbff5e'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-8-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Essai du 02/11/2026 (point 2) : pour répartir un lot de tickets, le Scrum Master répète le même glisser-déposer dix fois.

**Approach:** Sélectionner plusieurs cartes et les poser d’un seul geste (glissé, ou menu de l’une d’elles) sur un objectif, « Sans objectif », le backlog ou un autre sprint futur. Le lot part en une seule écriture par étape.

**Décisions (mode autonome, 02/11/2026) :**
- Ctrl+clic (Cmd+clic sur macOS) ajoute ou retire ; Maj+clic prend la plage depuis le dernier ticket cliqué, dans la même section (sinon il agit comme Ctrl+clic). Clic simple : inchangé. Ctrl+clic sur la clé sélectionne au lieu d’ouvrir la fiche.
- Le nombre s’affiche dans la barre des filtres (« 2 tickets sélectionnés », bouton « Vider la sélection ») ; Échap vide la sélection hors d’un champ, d’un menu ou d’une fenêtre ouverts.
- Une carte sélectionnée emmène toute la sélection ; une carte hors sélection part seule. Un lot ne quitte le sprint en préparation (backlog, autre sprint) que s’il y est tout entier ; sinon ces choix n’apparaissent pas.
- Menu d’une carte sélectionnée : en tête, « N tickets sélectionnés », aucun objectif désactivé (un lot n’a pas d’objectif courant).
- Lot confirmé : la sélection est vidée. Échec : l’avis dit les tickets confirmés et ceux à refaire, et ces derniers restent sélectionnés. Une entrée de journal par lot, avec ses clés.
- Un seul ticket passe par les gestes existants (`placeIssue`, `removeIssue`), sans changement.

## Boundaries & Constraints

**Always:** une fonction de `core` par intention (AD-2) : `placePlanningIssues`, `removePlanningIssues` ; porte d’écriture du board ; une seule tentative par écriture ; contrôles (sprint futur, tickets disponibles, hors sprint actif, liens inchangés) avant la première écriture ; textes en `t()` en, es.

**Never:** aucune nouvelle écriture ni nouvel endpoint ; pas de sélection d’une carte en consultation ; pas de déplacement d’un ticket du sprint actif.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Lot vers un objectif texte | 2 tickets du backlog + 1 du sprint | une E9 (2 clés), une E5 (3 liens) | — |
| Lot vers le backlog | 3 tickets du sprint | une E10 (3 clés) | — |
| Lot vers un autre sprint | 2 tickets du sprint | une E9 vers ce sprint | — |
| Plus de 50 | 51 clés | refus, avis, aucune écriture | — |
| Ticket indisponible | une sous-tâche dans le lot | refus du lot entier | rien écrit |
| Lien changé | lien d’un ticket modifié dans Jira | refus avant E9, ticket nommé | rien écrit |
| E5 en échec après E9 | 403 sur la propriété | partiel : ajout confirmé, tous à refaire, sélection gardée | aucune écriture rejouée |
| Goals Atlassian | 2e lien en échec | 1er confirmé, 2e et 3e à refaire | arrêt au premier échec |
| Sélection | Ctrl+clic, Maj+clic, carte en consultation, Échap | ajout/retrait, plage, ignorée, vidée | — |

</frozen-after-approval>

## Code Map

- `src/core/sprintPlanning.ts` -- `PLANNING_BATCH_LIMIT`, `PlanningBatchOutcome`, `PlanningBatchTarget`, `placePlanningIssues`, `removePlanningIssues`, `textBatchUpdate` (repli de `withTextGoalLink` sur chaque clé), `changedLinkKey`.
- `src/core/reasons.ts` -- refus `batchTooLarge`.
- `src/app/model/coreText.ts` -- `planningBatchMessage`, `planningBatchJournalMessage`.
- `src/app/model/PlanningModel.ts` -- `selection`, `toggleSelection`, `extendSelection`, `clearSelection`, `placeIssues`, `removeIssues`, `#batchGesture`, élagage de la sélection à chaque relecture.
- `src/app/views/planning/PlanningView.tsx` -- `SelectionChip`, `gestureKeys`, clés séparées par des espaces dans le glissé, `placeKeys`/`removeKeys`, menu de lot.
- Tests : `tests/core/sprintPlanning.test.ts`, `tests/app/PlanningModel.test.ts`, `tests/app/PlanningView.test.tsx`, `tests/app/coreText.test.ts`, `scripts/verify-planning.mjs` (Ctrl+clic et glissé réels dans Chrome).

## Tasks & Acceptance

**Execution:**
- [x] `core` + tests -- chaque ligne de la matrice.
- [x] Modèle, textes, vue, styles + tests -- sélection, lot, avis, journal.
- [x] `scripts/verify-planning.mjs` -- Ctrl+clic sur deux cartes réelles, un glissé, une E9 puis une E5.
- [x] `docs/technique/invariants.md`, `CHANGELOG.md`, version 0.45.0, `sprint-status.yaml`.

**Acceptance Criteria:**
- Given un lot d’un seul ticket, when il est posé, then le geste est celui d’une carte (inchangé).
- Given le paquet, when il est construit, then rien du planning n’y figure.

## Implementation Notes

- Implémenté directement (mode autonome, sous-agents non demandés).
- La porte du board refusant un lot (autre écriture en cours) garde la sélection.
- Pas de sélection au clavier (la story ne demande que les clics) : noté au backlog différé.

## Spec Change Log

## Review Triage Log

Passe 1, faite sans sous-agent (chasse aveugle, cas limites, trous de vérification) :
- Conflit de lien d'un lot signalé sur le premier ticket du lot, pas sur celui qui a changé. — low, patch : `changedLinkKey` nomme le ticket dont le lien relu diffère (test).
- Assertion de test écrite par calcul (`slice`) au lieu de la valeur attendue. — low, patch.
- Test « sélection élaguée » qui ne provoquait aucun élagage. — low, patch : renommé en « la sélection survit aux relectures » ; l'élagage reste couvert par le filtre `selectable` (cartes en consultation).
- Ticket sélectionné puis masqué par un filtre : part avec le lot. — maybe-false, medium non vérifié : différé (deferred-work.md), à constater en 8.10.
- Pas de sélection au clavier. — low, différé : hors de la story.
- Ctrl+clic sur macOS ouvre le menu contextuel (clic droit). — false : la story prévoit Cmd+clic sur macOS, géré par `metaKey`.

## Verification

Résultats : `npm run check` (1 909 tests), `verify:jira`, `verify:planning` (scénario de lot réel), `verify:planning:package`, `verify:i18n` verts.

**Commands:**
- `npm run check`, `npm run verify:jira`, `npm run verify:planning`, `npm run verify:planning:package`, `npm run verify:i18n` -- verts
