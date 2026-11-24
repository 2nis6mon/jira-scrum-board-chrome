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

### Review Findings

Revue du 06/11/2026 (`bmad-code-review`, quatre relecteurs en sous-agents, mode full), commit `14bccbf`.

- [x] [Review][Patch] (décision de Denis, 06/11/2026 : garder le comportement et documenter la limite dans le CHANGELOG et `invariants.md`) Grâce non renouvelée après un passage en texte si le board a déjà vu des Goals Atlassian — `knownGoalIds` reprend `goalColorIndex`, jamais élagué et fusionné avec la propriété partagée du board (`src/core/teamSettings.ts:206`). Un board Atlassian → texte (ou repli) → Atlassian, ou dont un collègue a publié des couleurs de Goals, ne refait pas de première lecture : les Goals liés pendant la période en texte arrivent masqués, symptôme que décrit la story. Le CHANGELOG annonce la correction sans cette limite. Choix : garder et documenter la limite, ou fonder la grâce sur l'origine de la lecture précédente (avec le cas du rechargement de page à traiter).
- [x] [Review][Patch] Un Goal Atlassian identifié par sa clé (`GOAL-42`) n'est pas reconnu : la grâce ne se consomme jamais et plus aucun Goal neuf n'est masqué sur un site dont le champ Goals renvoie des clés ; `isAtlassianGoalId` contredit `looksLikeGoalIdentifier` (ARI contenant `goal`, ou clé), deux définitions du même identifiant ; sans test unitaire ni test avec `goalsFieldId` [src/core/atlassianGoals.ts:12, src/app/services/BoardLoadingService.ts:191, src/jira/models.ts:446]
- [x] [Review][Patch] Tests manquants pour le premier critère : source texte configurée puis bascule vers les Goals Atlassian, et rechargement de la page après une session en texte (nouveau `BoardModel` sur des préférences sans ARI) [tests/app/BoardModel.goals.test.ts]
- [x] [Review][Patch] Phrase de `invariants.md` qui se lit à l'envers (« Après la première lecture … (tant qu'aucun Goal Atlassian … n'est connu) »), ligne d'environ 150 colonnes, renvoi « story 8.25, 0.50.1 » qui recopie le changelog [docs/technique/invariants.md:61]
- [x] [Review][Patch] Commentaire inexact : les objectifs texte ont un identifiant `text-<sprintId>-<hash>` (`stableGoalIds`) ou un UUID (`newId`), pas seulement un UUID [src/core/atlassianGoals.ts:9]
- [x] [Review][Patch] Second rôle de `goalColorIndex` (mémoire des Goals Atlassian déjà lus) non écrit : une remise à zéro ou un élagage des couleurs changerait le masquage sans bruit [src/app/services/BoardLoadingService.ts:173]

Rejetés :
- Test Kanban sans vrai geste d'épinglage ni lecteur réellement retenu, sans contrôle d'absence d'écriture (low) : le relecteur Verification Gap a muté `latest` en `configuration` et le test échoue bien ; ordre vérifié, gain faible pour un test plus lourd.
- Statut `done` de la spec contre `review` du suivi, 8.25 encore « restante » dans `epic-8-context.md` et `backlog.md` (low) : convention de la route oneshot ; le suivi se met à jour à la fin de cette revue.
- `DEVELOPER.md` et `docs/API-CONTRACTS.md` non mis à jour (false) : ces fichiers n'existent plus sur cette branche (documentation dans `docs/technique/`) ; le manque réel est couvert par le constat sur `goalColorIndex`.
