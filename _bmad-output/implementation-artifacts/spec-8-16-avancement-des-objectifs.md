---
title: 'Story 8.16 — Voir l’avancement de chaque objectif'
type: 'feature'
created: '2026-11-02'
status: 'done'
baseline_commit: 'ec860aac990d12c8de3ca642fbee988ef6663e4b'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-8-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Essai du 02/11/2026 (point 6) : une équipe qui reprend un objectif reporté, ou un Goal sur plusieurs sprints, ne voit pas où il en est ni ce qui a déjà été livré. Elle dimensionne donc mal ce qui reste.

**Approach:** L’en-tête de chaque swimlane du planning montre la répartition de ses tickets (à faire, en cours, terminé), en tickets et en points, dans la grammaire de l’avancement de la page du sprint. Il indique à part le déjà livré avant ce sprint, sans jamais le compter dans la charge.

**Décisions (mode autonome, 02/11/2026) :**
- Répartition par catégorie de statut Jira (`statusCategory` : à faire, en cours, terminé ; catégorie inconnue = à faire), la teinte déjà utilisée sur la carte du planning ; filtres ignorés, comme les totaux.
- Grammaire de la page du sprint : « n/N terminés · x/y pts » et sa barre, puis trois pastilles teintées (à faire, en cours, terminé) ; un board sans champ d’estimation compte en tickets.
- Texte : remontée des sprints clos du board, du plus récent au plus ancien, tant que l’identifiant de l’objectif figure dans leur propriété (un report renommé `<id>-<sprint>` est suivi), 10 sprints relus au plus ; tickets terminés (catégorie) rattachés, comptés une fois.
- Goals Atlassian : tickets des `workItems` du Goal hors du sprint en préparation, lus parmi les tickets du board par JQL `key in (…) AND statusCategory = Done`, par paquets de 50.
- Lecture partielle (échec, limite atteinte, `workItems` partiels) : une seule mention « lecture incomplète » sous les swimlanes, jamais une erreur du planning.
- Coût : lectures faites au chargement et quand les objectifs (ou leurs `workItems`) changent, avec un cache des sprints clos vidé à l’actualisation ; jamais après un geste qui ne change pas les objectifs.

## Boundaries & Constraints

**Always:** lectures seules ; déjà livré jamais compté dans la charge ni dans les totaux de l’objectif ; textes en `t()` en, es.

**Never:** aucune écriture ; pas de lecture du changelog des tickets ; pas de modification de la page du sprint.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Répartition | 1 ticket à faire (3 pts), 1 en cours (5 pts) | à faire 1·3, en cours 1·5, terminé 0 | — |
| Texte reporté | `g-pay` dans les sprints 41 et 40, tickets terminés ABC-150 (3), ABC-140 (5), ABC-151 en cours | Déjà livré : 2 tickets · 8 pts ; charge inchangée | — |
| Chaîne rompue | sprint 39 sans `g-pay` | tickets du 39 non lus | — |
| Report renommé | `g-pay-43` dans le sprint 43 | suivi jusqu’à `g-pay` | — |
| Limite | plus de 10 sprints portant l’objectif | lecture incomplète signalée | — |
| Goal Atlassian | `workItems` ABC-210 (sprint), ABC-160 terminé | Déjà livré : 1 ticket · 8 pts | JQL refusé : incomplet |
| `workItems` partiels | réserve du client Goals | lecture incomplète signalée | — |
| Geste sans changement d’objectif | ticket posé | aucune relecture des sprints clos | — |

</frozen-after-approval>

## Code Map

- `src/core/planningProgress.ts` (nouveau) -- `progressCategory`, `textGoalHistory` (cache `ClosedSprintCache`), `atlassianGoalHistory`, `MAX_HISTORY_SPRINTS`.
- `src/core/atlassianGoals.ts` -- `AtlassianSprintGoals.workItems` (facultatif) exposé, sans changer le reste.
- `src/app/model/PlanningModel.ts` -- `lanes` : `progress`, `delivered`, `deliveredIncomplete` ; `goalHistory`, `#readHistory` après `#read` (clé objectifs + `workItems`) ; caches vidés à `refresh`/`reset`/changement de sprint.
- `src/app/model/PlanningTypes.ts` -- `PlanningLane` et `PlanningTally`.
- `src/app/views/planning/PlanningView.tsx` -- `LaneProgress` dans l’en-tête de `GoalLane` ; mention unique « lecture incomplète ».
- `src/app/styles/planning.css` -- pastilles et déjà livré.
- `tests/core/planningProgress.test.ts`, `tests/app/PlanningModel.test.ts`, `tests/app/PlanningView.test.tsx`, `tests/support/planningFixture.ts` (option `closedSprints`).

## Tasks & Acceptance

**Execution:**
- [x] `src/core/planningProgress.ts` + tests -- matrice au niveau `core`.
- [x] Modèle, types, vue, styles + tests -- répartition, déjà livré, mention incomplète, absence de relecture après un geste.
- [x] `src/i18n/*` -- textes en, es.
- [x] `docs/technique/integration-jira.md`, `CHANGELOG.md`, version 0.44.0, `sprint-status.yaml`.

**Acceptance Criteria:**
- Given un objectif sans historique, when la swimlane s’affiche, then aucune mention « déjà livré ».
- Given le paquet, when il est construit, then rien du planning n’y figure (`verify:planning:package`).

## Implementation Notes

- Implémenté directement (mode autonome, sous-agents non demandés). Spec écrite avec les décisions ci-dessus avant la revue.
- Les tickets d’un sprint clos ne sont lus que si un objectif suivi y figure avec des liens (lecture paresseuse, mise en cache).
- Risque : une clé de `workItems` invisible ou supprimée peut faire refuser tout son paquet JQL par Jira ; l’historique est alors signalé incomplet. Coût réel et volumes à mesurer en 8.10.

## Spec Change Log

## Review Triage Log

Passe 1, faite sans sous-agent (chasse aveugle, cas limites, trous de vérification) :
- Pastilles de répartition avec `aria-label` sur un `span` (attribut non pris en charge, refusé par le lint). — low, patch : nombre caché aux lecteurs d'écran et libellé en texte masqué.
- Tickets d'un sprint clos lus même quand la chaîne de l'objectif s'y arrête. — medium, patch : lecture paresseuse, seulement si un objectif suivi y figure avec des liens (test « sprint 39 non lu »).
- Une clé de `workItems` invisible peut faire refuser tout un paquet JQL. — low, rejeté : l'historique est alors signalé incomplet, sans erreur ; volume à constater en 8.10.
- Avancement calculé par catégorie de statut, alors que le report d'objectifs juge « terminé » par la dernière colonne. — low, rejeté : décision consignée (même teinte que la carte du planning) ; écart possible seulement pour un statut terminé hors de la dernière colonne.
- Historique non relu après un geste qui ne change pas les objectifs. — false : voulu (sprints clos immuables), testé.

## Verification

Résultats : `npm run check` (1 888 tests), `verify:jira`, `verify:planning`, `verify:planning:package`, `verify:i18n` verts.


**Commands:**
- `npm run check` -- vert
- `npm run verify:jira`, `npm run verify:planning`, `npm run verify:planning:package`, `npm run verify:i18n` -- verts
