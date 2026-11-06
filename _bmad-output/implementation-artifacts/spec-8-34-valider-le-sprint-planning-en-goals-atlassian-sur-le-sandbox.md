---
title: 'Story 8.34 — Valider le Sprint Planning en Goals Atlassian sur le sandbox'
type: 'chore'
created: '2026-11-06'
status: 'done'
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
- [x] Préalables -- `dist/` à jour copié, Chrome d'essai ouvert, Denis connecté et site autorisé ; état des sprints relu (17309 actif, 17310 futur).
- [x] Étapes 0 à 7 -- jouer, relire Jira, consigner le constat ci-dessous.
- [x] Défauts -- une story ou un correctif par défaut dans `epics.md` et `backlog.md` ; décision sur 8.11 préparée.

**Acceptance Criteria:**
- Given le constat consigné, when Denis le relit, then chaque étape a son résultat (conforme, défaut et sa suite) et les coûts sont chiffrés.

## Constat

Essai du 06/11/2026, extension 0.50.3 (copie de `dist/`), Chrome visible sur profil temporaire piloté par CDP, interface en anglais. Relecture par le MCP en lecture seule et, pour les propriétés de sprint (illisibles par le MCP), par un `GET` en lecture seule depuis la page Jira. Coûts : `PerformanceResourceTiming` du cadre de la vue.

**0 Bascule — conforme, constat O5.** Denis passe le board en Goals Atlassian et lie lui-même ses trois Goals à des tickets de 17309. Board relu en Goals : MOUSQ1-16 « Test For Denis » 1/9, MOUSQ1-17 « Goal 2 » 0/3, MOUSQ1-18 « Goal 3 » 0/3, tous visibles à la première lecture (8.25). **O5 :** avertissement permanent « Atlassian Goals partially loaded… the Atlassian schema does not expose a usable Goal → issue link » : l'introspection ne trouve pas de lien `workItems` exploitable sur le sandbox ; les liens viennent du seul champ Goals des tickets (`customfield_12924`), le board reste juste. Au planning, conséquence : « What was already delivered could not be read in full » et, au report, « Goals were only partly read ».

**1 Ouverture — conforme.** Planning sur 17310 « Accueil-26T2.9 » ; même avertissement. Le compte rendu de la clôture de 8.27 reste affiché au-dessus du sprint préparé (O3 de 8.10, toujours ouvert).

**2 Goals — conforme.** Recherche par nom (« Test For », « Goal 2 », « Goal 3 ») puis épinglage : `atlassianGoalIds` de 17310 = les trois ARI attendus ; aucun Goal créé. Retrait des trois épinglages (« Unpin … ») : `atlassianGoalIds: []`.

**3 Tickets — conforme, défaut D5.**
- CLIENT-7121 du backlog sur « Test For Denis » (menu de carte) : relu dans 17310, champ Goals = MOUSQ1-16 ; 21 requêtes, sans avis de non-confirmation (8.26).
- Lot CLIENT-5800 et CLIENT-5294 (Cmd+clic) sur « Goal 2 » : une seule E9, champ Goals = MOUSQ1-17 pour les deux ; 21 requêtes.
- « Send to a goal › Goal 3 » sur CLIENT-7121 : champ Goals remplacé (MOUSQ1-18 seul) ; 16 requêtes.
- **D5 (moyen) : renvoi groupé au backlog, un ticket resté à son ancienne place sans avis.** Lot de trois (CLIENT-7121, -5800, -5294), « Remove from sprint › Send back to the backlog » : E10 appliquée (les trois sans sprint dans Jira, 19 requêtes), mais CLIENT-5800 reste affiché dans « Goal 2 » et absent du backlog, sans l'avis « pas encore relus » de 8.26 ; juste après « Refresh ». Champ Goals des tickets conservé (attendu : le retrait ne délie pas).

**4 Avancement — conforme, O5.** Barres par état selon les colonnes du board ; déjà livré signalé incomplet (O5). **O4 confirmé :** le Sprint Board compte les sous-tâches (« Test For Denis » 1/9 : CLIENT-9968, -9967, -9970, -9971 sont des sous-tâches), le planning non (2 tickets).

**5 Clôture de 17309 — conforme.** Bouton cliqué après 2,7 s, fenêtre isolée 1,8 s plus tard ; destination « Accueil-26T2.9 », Confluence et Rovo décochées (Confluence non cochée par défaut cette fois) ; « Complete sprint », popin refermée seule en ~5 s. Report : Goal 2, Goal 3 et Test For Denis « Carried over to Accueil-26T2.9 », avec leurs tickets ; avis « Goals were only partly read » (O5). Jira : 17309 clos, `atlassianGoalIds` de 17310 = les trois Goals, écrits 4 s après la validation.

**6 Démarrage de 17310 — conforme.** Fenêtre isolée 1,5 s après le clic ; 52 tickets, « Sprint goal » vide (mode Goals : rien d'écrit dans le texte). « Start », `Jira a quitté la page du sprint, popin refermée` ~1 s après. Jira : 17310 actif (06/11 → 20/11). Sprint Board : « Accueil-26T2.9 active », les trois Goals, « Carried over (52) ».

**7 Retour en texte — conforme.** Board relu en texte : 17310 sans objectif (texte du sprint vide), « No goals on this sprint ». Propriétés intactes : 17308 (6 objectifs, 12 liens), 17309 (4 objectifs, 7 liens, 2 Goals épinglés par Denis).

**Synthèse.** Le planning en Goals Atlassian est conforme sur le fond : recherche, épinglage et retrait, ticket, lot et changement de Goal, clôture avec report des Goals non atteints, démarrage, retour en texte sans perte. Suites : D5 → story 8.35 (moyen) ; O5 (`workItems` inexploitable sur le sandbox, déjà livré et report signalés incomplets) et O4 (sous-tâches comptées sur le board seulement) → backlog, à investiguer. Ni D5 ni O5 ne faussent Jira ; constat favorable à 8.11 sous réserve de D5 et de la décision sur les droits.

**État laissé dans le sandbox.** Board 3013 en source texte. 17309 clos ; 17310 « Accueil-26T2.9 » actif, Goals MOUSQ1-16, -17, -18 épinglés, 52 tickets. CLIENT-7121, -5800 et -5294 dans le backlog, champ Goals conservé (MOUSQ1-18, -17, -17).
