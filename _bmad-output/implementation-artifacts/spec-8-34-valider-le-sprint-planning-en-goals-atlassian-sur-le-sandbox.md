---
title: 'Story 8.34 — Valider le Sprint Planning en Goals Atlassian sur le sandbox'
type: 'chore'
created: '2026-11-06'
status: 'ready-for-dev'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-8-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-8-10-valider-le-sprint-planning-sur-un-vrai-jira.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** L'essai 8.10 et celui de la 8.27 n'ont couvert que les objectifs texte. Les gestes propres aux Goals Atlassian (recherche, épinglage, liens par le champ Goals, avancement, report à la clôture) n'ont jamais été joués sur un vrai Jira, et 8.11 exige ce constat.

**Approach:** Jouer un cycle complet en Goals Atlassian sur le sandbox, consigner le constat étape par étape et transformer chaque défaut en story ou correctif, comme en 8.10.

**Décisions de Denis (06/11/2026) :**
- Board 3013 du sandbox `mousquetaires-sandbox-860`, que Denis passe lui-même en source « Goals Atlassian » dans les réglages au début, puis remet en texte à la fin.
- Goals épinglés : MOUSQ1-16 « Test For Denis », MOUSQ1-17 « Goal 2 », MOUSQ1-18 « Goal 3 » (à Denis). Aucun Goal créé.
- Cycle complet : 17310 « Accueil-26T2.9 » préparé, clôture de 17309 « Accueil-26T2.8 » (non terminés vers 17310), report des Goals non atteints, démarrage de 17310. Feu vert de Denis avant chaque geste irréversible.
- Même pilotage que l'essai de la 8.27 : Chrome visible sur profil temporaire piloté par CDP, extension copiée de `dist/` ; Denis se connecte et autorise le site lui-même ; relecture par le MCP en lecture seule.

</frozen-after-approval>

## Boundaries & Constraints

**Always:** sandbox seulement ; gestes par l'interface de l'extension et les fenêtres natives, comme un utilisateur ; une seule tentative par geste, relecture de Jira (MCP en lecture seule) après chaque écriture ; constat consigné ici au fil de l'essai ; clés de tickets, de Goals et noms de sprints seulement, aucune autre donnée réelle dans le dépôt.

**Never:** écrire dans Jira ou Goals hors de l'extension (MCP en lecture seule) ; prod `mousquetaires.atlassian.net` ; lire cookies, jetons ou identifiants ; créer un Goal ou un sprint ; corriger du code pendant l'essai.

## I/O & Edge-Case Matrix

| Étape | Geste | Attendu, vérifié dans Jira |
|---|---|---|
| 0 Bascule | Denis passe le board 3013 en Goals Atlassian (réglages) | propriété du board écrite une fois (E6) ; board relu en Goals ; première lecture sans Goal masqué (8.25) ; avis CORS éventuel relevé |
| 1 Ouverture | planning sur 17310 | Goals lus par la passerelle ; coût des lectures relevé |
| 2 Goals | recherche par nom, épinglage des trois Goals, retrait d'un épinglage | `sprintgoals.v1` de 17310 (`atlassianGoalIds`) ; aucun Goal créé |
| 3 Tickets | posés sur un Goal depuis le backlog et 17309, en lot ; changement de Goal | E9 puis E3 (E4 si le Goal manque au champ) ; champ Goals des tickets relu ; confirmation malgré l'indexation (8.26) |
| 4 Avancement | lecture des en-têtes | barres par état selon les colonnes du board ; `workItems` des Goals ; coût relevé |
| 5 Clôture | fenêtre native de 17309 (non terminés vers 17310), report | 17309 clos ; Goals non atteints épinglés sur 17310 ; compte rendu juste |
| 6 Démarrage | fenêtre native de 17310 | sprint actif ; Goals visibles sur le Sprint Board |
| 7 Retour | Denis remet le board en texte | objectifs texte relus sans perte ; propriété des sprints conservée |

## Code Map

- `src/core/atlassianGoals.ts`, `src/core/sprintPlanning.ts` -- lecture des Goals, épinglage, liens et report du planning.
- `src/app/model/PlanningModel.ts`, `src/app/services/BoardLoadingService.ts` -- gestes, relectures, première lecture des Goals.
- `docs/technique/integration-jira.md` -- contrats Goals (passerelle GraphQL, règle Origin, `workItems`, champ Goals).
- Pilote de l'essai : celui de la 8.27 (CDP par pipe, `Extensions.loadUnpacked`), dans le dossier de travail de la session, hors du dépôt.

## Tasks & Acceptance

**Execution:**
- [ ] Préalables -- `dist/` à jour copié, Chrome d'essai ouvert, Denis connecté et site autorisé ; état des sprints relu (17309 actif, 17310 futur).
- [ ] Étapes 0 à 7 -- jouer, relire Jira, consigner le constat ci-dessous.
- [ ] Défauts -- une story ou un correctif par défaut dans `epics.md` et `backlog.md` ; décision sur 8.11 préparée.

**Acceptance Criteria:**
- Given le constat consigné, when Denis le relit, then chaque étape a son résultat (conforme, défaut et sa suite) et les coûts sont chiffrés.

## Constat

À remplir pendant l'essai.
