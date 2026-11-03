---
title: 'Story 8.26 — Confirmer un geste du planning malgré le délai d''indexation de Jira'
type: 'bugfix'
created: '2026-11-03'
status: 'done'
baseline_commit: '094fcc6aeed34698f2913d061b084c4330bed0f4'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-8-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Sur un vrai Jira (essai 8.10), la route des tickets du board relue juste après une E9, une E2 ou une E10 ne montre pas encore le changement (~1 s, variable par ticket) : 7 gestes sur 7 annoncés « Écriture non confirmée » alors qu'appliqués, lien vers l'objectif (E5) jamais écrit, ticket affiché dans le backlog et le sprint, « À refaire » demandé pour des tickets déjà ajoutés.

**Approach:** Après l'écriture, relire la même route à intervalles bornés jusqu'à voir le changement, puis poursuivre le geste ; sans jamais rejouer l'écriture. Une relecture du planning ne montre jamais un ticket du sprint en préparation ailleurs. Si le changement reste invisible, l'avis dit que Jira a reçu l'écriture sans la montrer encore, au lieu de « À refaire ».

## Boundaries & Constraints

**Always:** une seule tentative par écriture ; relectures seules (aucun nouvel endpoint, aucune nouvelle écriture) ; attente injectée (`core` sans minuterie, `PlanningContext.wait` existant) ; durée totale bornée de l'ordre de quelques secondes ; textes en clés de catalogue fr/en/es.

**Never:** rejouer E9, E2, E10 ou E5 ; toucher l'estimation (E11), les gestes E5/E8 seuls, la clôture (8.18) ou le Sprint Board ; masquer un ticket du sprint en préparation.

## I/O & Edge-Case Matrix

| Scénario | Jira relu après l'écriture | Résultat attendu |
|---|---|---|
| Ajout d'un ticket sur un objectif (E9 puis E5) | 1re relecture sans le ticket, 2e avec | `done` (`issueAdded`, `issueLinked`), une seule E9, une seule E5 |
| Lot de 3 (E9 puis E5) | un ticket relu tout de suite, les deux autres à la relecture suivante | `done`, tous confirmés, une seule E9 |
| Retrait vers le backlog ou un autre sprint futur (E10 / E9) | le ticket reste lu dans le sprint en préparation, puis disparaît | `done` (`issueMoved`), une seule écriture |
| Top ou basse priorité (E2) | ancien ordre relu, puis le nouveau | `done` (`ranked`), une seule E2 |
| Changement jamais relu | toutes les relectures bornées sans le changement | `partial` `planningIssueUnconfirmed` ; avis « Jira a reçu… ne le montre pas encore », sans « À refaire » pour ces tickets ; aucune écriture rejouée |
| Relecture du planning en retard | backlog (ou autre sprint futur) lit encore un ticket déjà relu dans le sprint en préparation | le ticket n'apparaît que dans le sprint en préparation |

</frozen-after-approval>

## Code Map

- `src/core/sprintPlanning.ts` -- relecture unique après écriture : `placePlanningIssue` (l. ~558-561, E9), `removePlanningIssue` (l. ~648-663, E9/E10, lit sprint préparé et destination), `placePlanningIssues` (l. ~773-785, E9 du lot, `added` alimente `confirmedKeys`), `removePlanningIssues` (l. ~928-945), `rankPlanningIssue` (l. ~1029-1038, `order()` relu). `loadSprintPlanning` (l. 120-202) : backlog et autres sprints futurs à dédoublonner contre `sprintIssues`. `runIntention`, `CoreError` : inchangés.
- `src/app/model/PlanningModel.ts` -- appels l. ~936, 966, 1073, 1115, 1218 : leur passer `wait: this.context.wait` ; `PlanningContext.wait` (l. 117) déjà fourni par `BoardModel` (`setTimeout`) et par les tests.
- `src/app/model/coreText.ts` -- `planningIssueUnconfirmed` (l. ~145) et `planningBatchMessage` (l. 337-349, « À refaire ») : nouvelles formulations.
- `src/i18n/messages.ts` et `src/i18n/es/` -- nouvelles clés (anglais, espagnol, paramètres).
- `tests/core/sprintPlanning.test.ts`, `tests/app/coreText.test.ts`, `tests/app/PlanningModel.test.ts` -- tests existants des cas « non confirmé » à adapter (relectures répétées).
- `docs/technique/integration-jira.md:143` -- note du constat 8.10 ; à compléter par la règle de relecture.

## Tasks & Acceptance

**Execution:**
- [x] `src/core/sprintPlanning.ts` -- délais exportés (`READ_BACK_DELAYS_MS`) et une aide de relecture « relire jusqu'à voir, sinon dernière lecture » ; option `wait` (défaut : aucune attente) dans les cinq gestes ; dédoublonnage dans `loadSprintPlanning` -- relire sans rejouer.
- [x] `src/app/model/PlanningModel.ts` -- transmettre `this.context.wait` aux cinq gestes -- vraies attentes dans l'extension.
- [x] `src/app/model/coreText.ts`, `src/i18n/messages.ts`, `src/i18n/es/messages.ts` -- avis du changement non relu et liste « Pas encore relus » au lieu de « À refaire » quand l'erreur est `planningIssueUnconfirmed` -- ne pas faire refaire un geste appliqué.
- [x] `tests/core/sprintPlanning.test.ts` -- un lecteur en retard d'une ou deux relectures pour chaque ligne de la matrice ; nombre d'écritures égal à un -- couverture de la matrice.
- [x] `tests/app/coreText.test.ts`, `tests/app/PlanningModel.test.ts` -- avis et `wait` transmis -- non-régression.
- [x] `docs/technique/integration-jira.md`, `CHANGELOG.md`, `package.json`, `package-lock.json`, `public/manifest.json` -- règle de relecture, version 0.48.6 -- livraison.

**Acceptance Criteria:**
- Given le correctif, when `npm run check`, `npm run verify:planning` et `npm run verify:i18n` sont lancés, then ils passent.
- Given un essai sur le sandbox avec l'autorisation de Denis, when un ticket est posé sur un objectif depuis le backlog, then il arrive sur cet objectif sans avis de non-confirmation (constat à faire après livraison).

## Implementation Notes

Choix faits seuls, à signaler à Denis :

- Sans `wait`, les relectures s'enchaînent sans délai (même nombre de lectures) ; le modèle passe toujours `context.wait`.
- `PlanningBatchOutcome.unseenKeys` (nouveau champ) : tickets dont E9/E10 a été reçue mais pas encore relue ; l'avis les classe « Pas encore relus à leur nouvelle place » et ils quittent la sélection. Dans un lot posé sur un objectif, un ticket relu dans le sprint mais dont le lien (E5) n'a pas été écrit reste « À refaire ».
- Geste unique non relu : l'avis n'a plus le préfixe « Écriture non confirmée » ; la cause dit « Jira a reçu l'écriture de X mais ne le montre pas encore à sa nouvelle place ; actualisez dans quelques instants », suivie de « Aucune écriture n'a été rejouée ».
- Rang : la confirmation exige aussi que le ticket soit relu dans le sprint (avant, un ticket absent passait pour « en tête »).
- Le dédoublonnage ne touche ni le reste à faire des sprints actifs ni le sprint en préparation.
- Vérifications : `npm run check` (2005 tests), `verify:planning`, `verify:i18n` et `verify:jira` verts. Le second critère (essai sur le sandbox) reste à faire après livraison.

## Spec Change Log

## Review Triage Log

Relecture faite sans sous-agent (mode de travail de Denis), sur le diff de `src/` et les tests.

| Constat | Verdict | Suite |
|---|---|---|
| `rankPlanningIssue` : `placed` donnait vrai pour un ticket absent de la relecture (index -1 en tête) | low, réel | patch : `ranked` exige le ticket et la référence |
| Transmission de `wait` au retrait et au rang non vérifiée au niveau du modèle | low, réel | patch : deux tests de `PlanningModel` (E10, E2 jamais relues) |
| Lot de retrait dont la relecture échoue après E10 : tickets classés « pas encore relus » | false | voulu : E10 reçue, rien à refaire ; une écriture en échec garde « À refaire » |
| Geste unique vers un objectif non relu : le lien E5 n'est pas écrit, l'avis ne le dit pas | low, rejeté | l'avis invite à actualiser ; le ticket réapparaît « Sans objectif » et se repose en un geste |
| Le geste garde la porte d'écriture jusqu'à ~5,5 s pendant les attentes | false | borné par la spec (« quelques secondes »), sablier affiché |

## Design Notes

Délais choisis seuls (invisibles hors du sablier) : `[500, 1000, 1500, 2500]` ms entre cinq lectures, ~5,5 s au plus, au-delà du ~1 s observé ; une lecture de plus par attente (route des tickets du sprint, et de la destination pour un retrait). Le dédoublonnage suit la règle Jira « un seul sprint ouvert par ticket » : la route du sprint en préparation fait foi. Un retrait relu avant le backlog peut faire disparaître un instant le ticket du backlog affiché ; il réapparaît à l'actualisation suivante.

## Verification

**Commands:**
- `npm run check` -- expected: typage, style et tests verts.
- `npm run verify:planning` -- expected: banc du planning vert (gestes inchangés sans retard).
- `npm run verify:i18n` -- expected: nouveaux avis présents en fr/en/es.
