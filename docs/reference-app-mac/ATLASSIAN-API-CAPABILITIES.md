# Capacités réelles de l'API Atlassian — vérification préalable

Document de vérification exigé par le cahier des charges (§7 « Vérification des API
Atlassian » et §6 des limites « Ne pas inventer une API manquante pour les Sprint Goals »).

Chaque ligne ci-dessous a été vérifiée sur la documentation officielle Atlassian
(developer.atlassian.com / docs.atlassian.com), aux dates indiquées. **Aucun endpoint
de ce document n'a été inventé.** Ce qui n'existe pas est déclaré comme n'existant pas.

Vérifié le : 17/09/2026. Cible : **Jira Cloud**, API `agile/1.0` + `api/3`.

---

## 1. Le point dur : les « Sprint Goals » au pluriel n'existent pas dans l'API

Le cahier des charges suppose que Jira possède déjà des Sprint Goals multiples,
structurés, associables aux tickets, et qu'il suffit de mieux les afficher.

**Cette prémisse est inexacte.** Vérification faite :

| Capacité attendue | Réalité de l'API | Statut |
|---|---|---|
| Lire les Sprint Goals | `GET /rest/agile/1.0/sprint/{id}` expose `goal` — **une seule chaîne de texte libre** | ⚠️ Partiel |
| Plusieurs Goals par sprint | Aucun objet Goal. Aucun tableau. Un seul champ texte | ❌ Inexistant |
| Créer / modifier un Goal | Écriture possible **du champ texte** via `POST /rest/agile/1.0/sprint/{id}` | ⚠️ Partiel |
| Supprimer un Goal | Aucun objet à supprimer — on vide/réécrit le texte | ⚠️ Partiel |
| Associer un ticket à un Goal | **Aucun endpoint. Aucun champ. N'existe pas.** | ❌ Inexistant |

Endpoints sprint réellement exposés, vérifiés un par un :

```
POST   /rest/agile/1.0/sprint                       créer
GET    /rest/agile/1.0/sprint/{id}                  lire
PUT    /rest/agile/1.0/sprint/{id}                  remplacer
POST   /rest/agile/1.0/sprint/{id}                  mise à jour partielle
DEL    /rest/agile/1.0/sprint/{id}                  supprimer
GET    /rest/agile/1.0/sprint/{id}/issue            tickets du sprint
GET    /rest/agile/1.0/sprint/{id}/properties       clés de propriétés
GET    /rest/agile/1.0/sprint/{id}/properties/{key} lire une propriété
PUT    /rest/agile/1.0/sprint/{id}/properties/{key} écrire une propriété
DEL    /rest/agile/1.0/sprint/{id}/properties/{key} supprimer une propriété
```

Il n'existe **aucun** endpoint de la forme `/sprint/{id}/goals`.

### La feature « Goals » de Jira est autre chose — et elle est exploitable

> **Correction du 17/09/2026.** Une première analyse avait classé cette feature
> BLOCKED au motif que son API n'était pas publiée. **C'était faux.** Atlassian a
> publié en **janvier 2026** des API GraphQL officielles pour Goals et Projects.
> Le verdict est révisé ci-dessous.

Une fonctionnalité Atlassian nommée **Goals** existe (champ « Goals » sur un work
item, issue d'Atlassian Home / Focus). Ce sont des objectifs **stratégiques
d'organisation** : ils ne sont pas rattachés à un sprint, et leur disponibilité
dépend de l'édition souscrite.

Mais ils sont désormais accessibles par API, avec **les mêmes identifiants que le
reste de l'application** :

| Besoin | Mécanisme vérifié |
|---|---|
| Endpoint | `https://{site}.atlassian.net/gateway/api/graphql` |
| Authentification | Basic `email:jeton d'API` — identique au client REST |
| Lister / chercher des Goals | `goals_search(containerId, searchString, sort, after, first)` — `searchString` est une requête **TQL** (ex. `status = on_track`) |
| Lire un Goal | `goals_byId`, `goals_byIds`, `goals_byKey` |
| Hiérarchie | `goals_fullHierarchySearch` |
| Types et statuts | `goals_goalTypes`, `goals_goalStatuses` |
| Quotas | 10 000 points/minute/utilisateur, HTTP 429 + en-tête `RETRY-AFTER` |

Et surtout, côté Jira :

| Besoin | Mécanisme vérifié |
|---|---|
| Tickets rattachés à un Goal | **JQL `goals = <id>`** — le champ Goals est interrogeable en JQL |
| Application au board | `GET /rest/agile/1.0/board/{id}/issue?jql=goals = …` |

**Conséquence majeure : le rattachement ticket↔objectif n'a plus besoin d'être
stocké par l'application.** C'est un lien Jira natif, posé et visible dans Jira,
que l'application se contente de lire via JQL.

Ce qui reste sans équivalent natif : **Jira ne sait pas qu'un sprint « a » des
Goals.** Les Goals sont au niveau organisation, les sprints au niveau board. La
sélection « ces Goals sont les objectifs de ce sprint » reste donc une donnée
applicative — mais elle référence de **vrais objets Goal**, pas du texte inventé,
et elle est stockée dans Jira via la propriété d'entité du sprint.

### Schéma relevé par introspection sur une instance Jira Cloud (17/09/2026)

Le nom du type n'est pas « Goal » : la chaîne `goals_search` → `edges` → `node`
mène à **`TownsquareGoal`**. Deviner le nom produisait une introspection vide.

| Champ | Nature réelle | Sélection émise |
|---|---|---|
| `id`, `key`, `name`, `url` | SCALAR | directe |
| `isArchived`, `startDate` | SCALAR | directe |
| `status` | OBJECT `TownsquareStatus` | `status { value }` |
| `targetDate` | OBJECT `TownsquareTargetDate` | `targetDate { label }` |
| `owner` | **INTERFACE** `User` | `owner { name }` |

Deux pièges : `targetDate` n'est pas un scalaire, et `owner` est une **interface**,
pas un objet — ne traiter que `OBJECT` faisait disparaître le propriétaire.

Arguments réels de `goals_search` : `searchString: String`, `containerId: ID`,
`after: String`, `first: Int`, `sort: TownsquareGoalSortEnum`.
ARI de site accepté : `ari:cloud:goal::site/{cloudId}`.

### Le lien Goal↔ticket se lit dans les deux sens

**Sens de référence — Goal → tickets.** Le type des objectifs expose un champ
`workItems` donnant les tickets rattachés. C'est la lecture fiable : elle ne dépend
pas du format, non documenté, du champ Goals côté ticket.

```
goals_byIds(goalIds: [...]) { id workItems { edges { node { key } } } }
```

La forme de `workItems` — connexion `edges { node }` ou liste `nodes` — et le champ
portant la clé Jira sont découverts par introspection.

**Sens complémentaire — ticket → Goals.**

Les Goals se rattachent aux **tickets**, jamais à un sprint. Le lien est aussi porté
par un champ Jira sur le work item, repéré par son nom (« Goals ») ou par son type.
Il sert à découvrir des objectifs que le board ne connaît pas encore.

```
GET /rest/agile/1.0/sprint/{id}/issue?fields=…,<champ Goals>
```

Les objectifs d'un sprint en sont **déduits** : ensemble distinct des Goals référencés
par ses tickets. Le format de la valeur n'étant pas documenté, la lecture accepte un
tableau de chaînes, un tableau d'objets `{id}` ou une valeur unique, et ne retient que
ce qui est un ARI de Goal ou une clé `ABC-123`.

Corrections relevées au passage : `goals_byIds` attend l'argument **`goalIds`**,
pas `ids`.

### Mutations de rattachement — disponibles

```
goals_linkWorkItem(input: TownsquareGoalsLinkWorkItemInput!)
goals_unlinkWorkItem(input: TownsquareGoalsUnlinkWorkItemInput!)
  input   : { goalId: ID, workItemId: ID }
  payload : { success: Boolean, errors: MutationError { message }, goal, workItem }
```

L'application peut donc **poser et retirer le lien ticket↔Goal**, qui reste un lien
Jira natif. Le gabarit de `workItemId` n'étant pas documenté, l'ARI
`ari:cloud:jira:{cloudId}:issue/{issueId}` est essayé en premier, puis l'identifiant brut.

Non vérifié : ces mutations n'ont pas été exécutées — les déclencher aurait modifié
des données réelles. Leur signature est relevée du schéma, leur effet reste à confirmer.

---

## 2. Le mécanisme natif qui rend la fonctionnalité réalisable

**Jira Entity Properties** — API officielle, documentée, versionnée.

```
GET/PUT/DEL /rest/agile/1.0/sprint/{sprintId}/properties/{propertyKey}
```

Caractéristiques vérifiées :

- la valeur doit être un **objet JSON valide** ;
- taille maximale **32 Ko** par propriété ;
- écriture soumise à la **permission d'édition de l'entité** ;
- lecture soumise à la **permission de lecture de l'entité** ;
- la donnée est stockée **dans Jira**, côté serveur Atlassian.

C'est le mécanisme prévu par Atlassian pour attacher des données structurées à une
entité Jira. **Ce n'est pas une base parallèle** : la donnée vit dans Jira, est
partagée par toute l'équipe, survit à la réinstallation de l'application, et suit
les permissions Jira.

---

## 3. Conception retenue pour les Sprint Goals

Deux supports **tous deux dans Jira**, aucun stockage métier local :

**a. Titres des objectifs → champ natif `sprint.goal`, en LECTURE SEULE**

Le champ texte natif est lu et découpé en plusieurs objectifs (une ligne = un
objectif — convention déjà répandue dans les équipes). Il n'est **jamais réécrit** :
ce champ appartient à l'équipe, qui y met ce qu'elle veut depuis Jira.

> Une version antérieure y recopiait les objectifs de l'application, ce qui écrasait
> le texte rédigé par l'équipe. `POST /rest/agile/1.0/sprint/{id}` a été retiré du
> client ; un test vérifie qu'aucune opération ne cible cet endpoint.

**b. Structure et liens ticket↔objectif → propriété d'entité du sprint**

Clé : `com.scrumboardmac.sprintgoals.v1`

```json
{
  "version": 1,
  "goals": [
    { "id": "uuid", "title": "…", "color": "indigo", "position": 0 }
  ],
  "links": { "ABC-123": "uuid" },
  "updatedAt": "2026-09-17T09:42:00Z",
  "updatedBy": "accountId"
}
```

Le champ texte fait foi pour les **titres** ; la propriété porte les **identifiants
stables, l'ordre et les rattachements**. Une réconciliation est faite à chaque
synchronisation si quelqu'un a modifié le texte directement dans Jira.

**Limitation assumée et affichée dans l'application** : le rattachement
ticket↔objectif n'a pas d'équivalent natif dans l'interface Jira. Il est stocké dans
Jira via les entity properties, mais reste visible uniquement depuis cette
application. Ce point est indiqué à l'utilisateur dans l'écran Administration.

**Permission** : l'écriture d'une propriété de sprint exige le droit d'édition du
sprint (« Manage Sprints »). Un compte sans ce droit reçoit un 403 — l'application
affiche alors un message explicite et **ne simule aucune écriture locale**.

---

## 4. Classification des fonctionnalités

### MUST HAVE — vérifiées disponibles

| Fonctionnalité | Endpoint vérifié |
|---|---|
| Authentification Cloud | Basic `email:api_token` + `GET /rest/api/3/myself` |
| Détection du board | `GET /rest/agile/1.0/board/{id}` |
| Colonnes → statuts | `GET /rest/agile/1.0/board/{id}/configuration` → `columnConfig.columns[].statuses[].id` |
| Limites WIP natives | même réponse → `columns[].min` / `columns[].max` |
| Champ Story Points | même réponse → `estimation.field.fieldId` |
| Sprints | `GET /rest/agile/1.0/board/{id}/sprint?state=active,future,closed` |
| Tickets du sprint | `GET /rest/agile/1.0/sprint/{id}/issue` |
| Tickets RUN | `GET /rest/agile/1.0/board/{id}/issue?jql=…` |
| Transitions disponibles | `GET /rest/api/3/issue/{key}/transitions?expand=transitions.fields` |
| Exécuter une transition | `POST /rest/api/3/issue/{key}/transitions` — corps `{"transition":{"id":"…"}}` → **204** |
| Types de tickets | `GET /rest/api/3/issue/createmeta` / champs des issues |
| Statuts du projet | `GET /rest/api/3/project/{key}/statuses` |

### SHOULD HAVE

- Aging (calculé depuis `changelog`, via `expand=changelog`)
- Sprint Health (agrégats calculés localement, aucune donnée inventée)

### PHASE 2

- Jira Server / Data Center (`/rest/api/2`, auth PAT Bearer)
- Multi-board simultané
- Auto-update de l'application

### BLOCKED — déclaré non réalisable, non simulé

| Fonctionnalité | Raison |
|---|---|
| Goals Atlassian (Home / Focus) | API GraphQL non publiée dans la surface REST documentée, conditionnée à l'édition |
| Objets Sprint Goal natifs multiples | N'existent pas dans l'API Jira |
| Lien natif ticket↔sprint goal visible dans Jira | Aucun champ Jira ne le porte |
| Notarisation Apple | Certificat « Developer ID Application » absent de la machine de build |

---

## 5. Champ « bloqué »

Jira n'a pas de champ standard « blocked ». Sources réellement disponibles :

- `fields.status` — un statut nommé « Blocked » s'il existe dans le workflow ;
- `fields.issuelinks` avec `type.inward == "is blocked by"` — **lien natif standard** ;
- `fields.labels` contenant un label convenu par l'équipe.

L'application utilise les liens `is blocked by` (natif) et, en complément
configurable, un label. Aucune heuristique inventée.

---

## Sources

- https://developer.atlassian.com/cloud/jira/software/rest/api-group-sprint/
- https://developer.atlassian.com/cloud/jira/software/rest/api-group-board/
- https://developer.atlassian.com/cloud/jira/platform/jira-entity-properties/
- https://developer.atlassian.com/cloud/jira/software/jira-entity-properties/
- https://docs.atlassian.com/jira-software/REST/9.0.0/
- https://support.atlassian.com/jira-software-cloud/docs/link-issues-to-goals-in-the-issue-view/
