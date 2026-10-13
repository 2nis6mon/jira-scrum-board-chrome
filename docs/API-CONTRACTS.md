# Contrats API et données persistées

Ce document décrit les contrats employés par le code actuel. Il remplace les copies de
spécifications de l'application Mac retirée ; il ne constitue pas une nouvelle certification
de toutes les capacités Atlassian. Tout changement d'API doit être vérifié avant implémentation.

## Session et transport

Jira Cloud `https://<site>.atlassian.net`, autorisé explicitement dans Chrome. Le transport emploie
la session du navigateur (`credentials: include`), sans jeton ni mot de passe. Redirections
refusées, lectures bornées et écritures tentées une seule fois. La passerelle GraphQL utilise la
règle Origin étroitement définie dans [l'audit](SECURITY-AUDIT.md).

## REST utilisé par le board

| Besoin | Contrat / source |
|---|---|
| Site et utilisateur | `GET /rest/api/3/myself` ; `src/jira/site.ts`, `client.ts` |
| Recherche et droit du board | `GET /rest/agile/1.0/board`, dont `expand=permissions` |
| Colonnes, statuts, estimation, sous-filtre | `GET /rest/agile/1.0/board/{id}/configuration` |
| Sprints actifs | `GET /rest/agile/1.0/board/{id}/sprint` |
| Tickets Scrum limités au board | `GET /rest/agile/1.0/board/{board}/sprint/{sprint}/issue` |
| Tickets Kanban / filtres JQL | `GET /rest/agile/1.0/board/{id}/issue` |
| Transitions courantes | `GET /rest/api/3/issue/{key}/transitions?expand=transitions.fields` |
| Statut avant transition | `GET /rest/api/3/issue/{key}?fields=status` |
| Écritures de l'extension | Inventaire fermé dans `src/jira/writes.ts`, E1–E7 dans l'audit |

`client.ts` lit aussi les champs, types, statuts, filtres rapides et propriétés d'entité.
Les tickets sont paginés jusqu'à 5 000 ; au-delà, erreur explicite. Kanban ajoute le sous-filtre
et les statuts mappés, sans inventer de sprint ni de limite d'âge. Scrum réunit les sprints actifs
sans doublon. Le remplacement des endpoints Agile de lecture fait partie du backlog.

Le champ `sprint.goal` est une seule chaîne. Le mode texte la découpe en objectifs et ne la
réécrit jamais ; les identifiants et liens sont conservés dans une propriété de sprint.
Ces objectifs sont distincts des objets Goals Atlassian liés nativement aux tickets.

## GraphQL Goals

La passerelle est `/gateway/api/graphql` sur le site autorisé. `src/jira/goals.ts` découvre
les types et champs par introspection, notamment les variantes de `workItems` et de pagination.
Le type et les sélections d'objets ne doivent pas être devinés.

- `goals_search` : recherche avec `containerId`, `searchString` (TQL), `after`, `first` et `sort`
  selon le schéma ; le conteneur est résolu depuis le site.
- `goals_byIds` utilise `goalIds`. Les références découvertes par le champ Goals des tickets
  complètent les identifiants épinglés et les résultats de recherche.
- `workItems` : liens Goal → tickets, lecture par pages si les arguments et `pageInfo` le
  permettent. Une page de 100 liens sans pagination exploitable est signalée comme incomplète.
- Recherche et liens bornés à 20 pages ; curseur incohérent ou borne atteinte signalés.
- Sans liens GraphQL complets, Kanban peut utiliser le champ Goals de chaque ticket classé par
  objectif (y compris `null`, qui signifie aucun lien). Si le champ manque, la lecture échoue
  plutôt que de déplacer les tickets dans Build par erreur.
- Mutations autorisées : `goals_linkWorkItem` et `goals_unlinkWorkItem`, entrée `goalId` et
  `workItemId`, résultat `success` et `errors`. Pas de création ni de modification de Goal.

## Formats à préserver

| Propriété Jira | Contenu |
|---|---|
| `com.scrumboardmac.sprintgoals.v1` | Objectifs texte, liens ticket → objectif, Goals Atlassian épinglés, métadonnées |
| `com.scrumboardmac.boardsettings.v1` | Réglages partagés, swimlanes et Goals épinglés au Kanban |
| `com.scrumboardmac.diagnostic` | Test explicite d'écriture, relu puis supprimé |

Le préfixe est historique, les données sont actives. Ne pas renommer sans migration. Les
propriétés sont limitées à 32 Ko par le client ; elles sont relues avant modification, les clés
inconnues préservées et les conflits refusés. Les encodeurs/décodeurs de `sprintGoals.ts` et
`teamSettings.ts` sont la référence du format, couverte par leurs tests.

Les anciennes valeurs `SCRUM`/`KANBAN`, `scrumColumns`, `kanbanColumns`, `showKanbanSection`,
`kanbanSectionLabel` et `dailyKanbanStockLimit` restent prises en charge dans les propriétés
partagées. Leur suppression exige une migration et une décision concernant les anciennes
installations ; le nettoyage du code ne les retire pas.

Le diagnostic de chargement n'ajoute aucun contrat réseau. Son historique local
`loadDiagnostics.v1` conserve au plus cinq rapports : version, date, type Scrum/Kanban,
comptages, durées et segments de phases/lectures/attentes. Les segments sont bornés à 500 ;
la troncature est comptée. Le décodeur n'accepte que les catégories fermées et nombres attendus,
sans URL, ressource, corps de réponse ou identifiant Jira. Les identifiants de rapports et
d'appels sont locaux à la mesure. Ce stockage reste indépendant des propriétés Jira.

## Références de contrat

- [Jira Software : boards](https://developer.atlassian.com/cloud/jira/software/rest/api-group-board/)
- [Jira Software : sprints](https://developer.atlassian.com/cloud/jira/software/rest/api-group-sprint/)
- [Propriétés d'entité Jira](https://developer.atlassian.com/cloud/jira/platform/jira-entity-properties/)
- [Jira Platform : tickets et transitions](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/)

Les tests locaux vérifient le code et les fixtures de schéma. Ils ne garantissent pas la
présence d'un champ GraphQL ni d'un écran sur chaque instance Jira.
