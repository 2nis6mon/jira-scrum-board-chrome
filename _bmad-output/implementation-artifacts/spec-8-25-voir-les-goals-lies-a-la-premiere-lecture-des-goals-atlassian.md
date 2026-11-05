---
title: 'Story 8.25 — Voir les Goals liés à la première lecture des Goals Atlassian'
type: 'bugfix'
created: '2026-11-05'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-8-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Un board qui passe de la source texte aux Goals Atlassian, ou sort d'un repli en texte, masque à la première lecture des Goals tous les Goals liés à ses tickets : `knownGoalIds` (`BoardLoadingService.ts`) compte les objectifs texte et `goalColorIndex`, si bien que la grâce de la première lecture est consommée par la lecture en texte.

**Approach:** La première lecture des Goals Atlassian, même après une lecture en texte, se comporte comme une première lecture : aucun Goal lié, épinglé ou non, n'est ajouté à `hiddenGoalIds`. Les lectures suivantes masquent comme aujourd'hui un Goal inconnu, non épinglé, introduit par un ticket. Un Goal épinglé au board Kanban pendant une lecture n'est pas masqué, vérifié par un test (épinglage relu dans `latest`). Aucune écriture dans Jira ; les préférences restent locales.

</frozen-after-approval>

## Implementation Notes

- `core/atlassianGoals.ts` : `isAtlassianGoalId` (identifiant ARI `ari:…`, tel que le renvoie l'API Goals ; les objectifs texte ont un UUID tiré par l'extension).
- `BoardLoadingService.ts` : la grâce de la première lecture vaut tant qu'aucun identifiant connu (`goalColorIndex`, lecture précédente) n'est un Goal Atlassian, au lieu de « aucun objectif connu ». Ce critère couvre aussi un rechargement de la page après une session en texte, que la seule origine de la lecture précédente (en mémoire) aurait manqué.
- Choix fait seul : reconnaître un Goal Atlassian à son ARI plutôt que de mémoriser localement « Goals déjà lus », qui aurait ajouté un champ persistant aux préférences.
- Tests : `BoardModel.goals.test.ts` (repli texte par refus CORS, puis Goals lisibles : rien masqué ; lecture suivante : le Goal neuf est masqué), échoue sans le correctif ; `BoardModel.kanban.test.ts` (épinglage au board pendant la requête Goals d'une lecture : pas masqué), échoue si l'épinglage est lu dans la configuration de départ.
- Docs : `invariants.md`, `CHANGELOG.md`, version 0.50.1. Aucun nouveau texte.
- Vérifications : `npm run check` (2039 tests), `verify:jira` verts.

## Review Triage Log

Relecture faite sans sous-agent (rythme de l'Epic 8).

| # | Constat | Verdict | Suite |
|---|---------|---------|-------|
| 1 | Un objectif texte d'un ancien format dont l'identifiant commencerait par `ari:` consommerait la grâce. | false | Les identifiants texte sont tirés par l'extension (`crypto.randomUUID`), jamais un ARI. |
| 2 | Un board dont tous les Goals connus ont disparu garde ses Goals Atlassian en `goalColorIndex` : la lecture suivante n'est pas une première lecture. | false | Voulu : les couleurs gardent la mémoire des Goals déjà vus, comme avant ; seule la lecture en texte ne compte plus. |
