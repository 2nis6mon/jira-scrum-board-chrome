---
title: 'Story 8.35 — Relire chaque ticket d''un lot renvoyé au backlog'
type: 'bugfix'
created: '2026-11-06'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-8-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Essai 8.34 (D5) : trois tickets renvoyés ensemble au backlog, E10 appliquée pour les trois, mais CLIENT-5800 est resté affiché dans sa swimlane, absent du backlog, sans l'avis « pas encore relu » de 8.26, jusqu'à l'actualisation.

**Approach:** Après un retrait confirmé (lot ou ticket seul, vers le backlog ou un autre sprint futur), la relecture du planning qui suit doit elle aussi ne plus voir les tickets dans le sprint en préparation. Tant qu'elle les y voit, elle est refaite avec les délais de 8.26 ; au terme, les tickets encore affichés sont annoncés « pas encore relus à leur nouvelle place », sans nouvelle écriture. Un test reproduit un lecteur en retard pour un seul ticket du lot ; l'essai sur le sandbox rejouera le renvoi de trois tickets.

</frozen-after-approval>

## Implementation Notes

- Cause lue dans le code, non prouvée sur Jira : `removePlanningIssues` (`src/core/sprintPlanning.ts`) confirme un ticket dès qu'une lecture de la route du sprint en préparation ne le contient plus ; `#batchGesture` (`src/app/model/PlanningModel.ts`) n'annonce alors rien et relit le planning une seule fois. Si cette relecture tombe encore sur une réponse en retard (indexation non monotone), le ticket réapparaît à son ancienne place sans avis. Seule explication compatible avec le constat (aucun avis, ticket dans la swimlane et absent du backlog).
- `src/app/model/PlanningModel.ts` : `#rereadAfterMove` relit le planning, puis le refait avec `READ_BACK_DELAYS_MS` tant que le sprint en préparation contient un ticket dont le retrait est confirmé ; `#gesture` (ticket seul, `removeIssue`) et `#batchGesture` (lot, `removeIssues`) l'appellent. Les tickets encore montrés au terme passent dans l'avis « pas encore relus » (`unseenOutcome`, `planningBatchMessage`), sans écriture. Placements et rang inchangés (choix fait seul : constat seulement sur un retrait).
- Tests (`tests/app/PlanningModel.test.ts`) : lot dont un ticket est relu en retard puis parti, lot dont un ticket reste montré, lot vers un autre sprint futur, ticket seul ; les trois premiers ajoutés échouent sur l'ancien modèle.
- Docs : `integration-jira.md` (règle de relecture), `invariants.md`, `CHANGELOG.md`, version 0.50.4.
- Vérifications : typage, Biome, 2052 tests, `verify:planning`, `verify:i18n`, `verify:jira` verts. Renvoi de trois tickets à rejouer sur le sandbox.

## Review Triage Log

Revue Blind Hunter (sous-agent, sans contexte) sur le diff non commité.

| Constat | Verdict | Suite |
|---|---|---|
| Avis contradictoire : « Étapes confirmées : ticket retiré du sprint » puis « pas encore relu » | medium, réel | patch : `issueMoved` retiré de `confirmed` ; test `not.toContain("confirmé")` |
| Lot déjà arrêté (`partial`) : sa cause remplacée par « pas encore relu » | low, réel | patch : un résultat `partial` garde sa cause |
| Journal écrit avant la relecture : tickets en retard notés confirmés | low, rejeté | Jira a appliqué et `core` a relu l'écriture ; seul l'affichage est en retard |
| Provenance effacée avant la relecture supplémentaire | low, rejeté | n'importe que si `core` s'est trompé, cas non montré possible |
| Sablier jusqu'à ~11 s, non documenté | low, réel | patch : documenté dans `integration-jira.md` |
| Destination « autre sprint futur » non testée | low, réel | patch : test ajouté |
| Autres tests (échec de relecture, geste périmé, placement sans attente) | low, rejeté | chemins inchangés ou couverts par les tests existants |
| Aide de test qui lit par le faux Jira, `describe` de 8.15 | low, rejeté | lecture GET non comptée comme écriture ; placement cosmétique |
| Paramètre booléen d'un côté, liste de l'autre | low, rejeté | forme dictée par chaque geste (clé connue ou résultat du lot) |
| Seul le premier ticket en retard nommé dans la phrase | low, rejeté | la liste « Pas encore relus » les nomme tous |
| Spec sans tâches ni critères | false | route oneshot : intention et notes seulement |
| Version livrée mais suivi en cours, essai à venir | low, réel | patch : CHANGELOG dit l'essai à refaire ; suivi mis à jour en fin de workflow |
| Invariant du ticket seul et cas d'échec non écrits | low, réel | patch : puce dédiée et phrase sur l'échec |
| `.claude/launch.json` non suivi | false | fichier personnel de Denis, non commité |
