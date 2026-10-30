# Intégration Jira et contrats API

Hébergement de la vue dans Jira, parcours natifs et lectures Jira. Écritures : [sécurité](securite.md) ;
autres références : [index technique](index.md).

## Intégration dans la page Jira

[`worker`](../../src/integration/worker.ts) compile vers `jira-worker.js`, enregistre
[`bootstrap`](../../src/integration/bootstrap.ts) (`jira-bootstrap.js`) sur les sites autorisés et
injecte [`injectBoard`](../../src/integration/injectBoard.ts) sur l'adresse marquée `sprintGoals=1`.
Le parcours natif utilise des étapes explicites : attente de fiche, sélection de transition,
attente de formulaire, formulaire affiché et fermeture. Ses helpers restent internes à la fonction
injectée ; un test reconstruit la fonction depuis son texte pour vérifier cette autonomie.

À l'installation, `launcher.html?bienvenue=1` demande une adresse et la permission du site au clic.
L'icône reconnaît l'onglet via `activeTab` ; hors board, le lanceur propose la dernière adresse.
Lancement et retour à Jira rechargent avec `location.assign` en ajoutant/retirant `sprintGoals=1` :
conserver ce rechargement, `pushState` seul échouait sur le site réel. L'URL marquée est partageable.
Jira reste chargé derrière la vue. Changement de board : identifiant et clé projet envoyés à l'hôte,
qui construit une route moderne sur sa propre origine ; sans clé projet, affichage sur place avec
avertissement. Après rechargement de l'extension, recharger aussi Jira pour remplacer le script injecté.

Le bouton compact (58 × 34 px, icône et poignée séparées) flotte dans une racine Shadow DOM et suit
la navigation interne. Nom accessible et infobulle remplacent le libellé visible. Sa poignée accepte
souris/toucher (seuil 5 px), flèches 10 px ou Maj+flèches 1 px. Échap, interruption du pointeur ou
redimensionnement pendant le geste annulent sans sauvegarde. Stockage au relâchement ou à chaque pas
clavier : ratios `{x,y}` bornés à 0–1 de la course du viewport visuel, dimensions du bouton et marges
4 px déduites, pour permettre le placement dans un espace libre de l'en-tête Jira. Défaut : 96 px
de la droite, 28 px du bas, bornés à la fenêtre. Zoom, plein écran
et redimensionnement adaptent l'affichage sans réécrire le choix ; synchronisation entre onglets,
lecture initiale tardive sans écraser un geste. Valeur illisible = défaut. Aucun appel Jira ajouté.

[`embeddingGuard`](../../src/integration/embeddingGuard.ts) exige un parent unique, son origine égale au
site normalisé `jiraHost`, une URL `jiraBoard` valide et la permission Chrome **avant le modèle métier**.
Ouverture directe, cadre imbriqué et autre origine refusés. [`embedded`](../../src/integration/embedded.ts)
et l'hôte vérifient origine et fenêtre source dans les deux sens ; l'hôte valide aussi les identifiants.

| Message | Sens et effet |
|---|---|
| `sprint-goals:open-issue` | Vue → hôte : fiche complète ou formulaire de transition |
| `sprint-goals:open-board` | Vue → hôte : navigation construite, aucune URL arbitraire acceptée |
| `sprint-goals:close` | Vue → hôte : retour à Jira |
| `sprint-goals:refresh` | Hôte → vue : fermeture, déblocage et relecture |

Un clic carte ouvre la fiche native complète dans une enveloppe transparente occupant le viewport
de l'onglet. Jira conserve ainsi ses propres dimensions, marges, en-tête et défilements des colonnes,
y compris après redimensionnement. Ne pas imposer position, hauteur ou `overflow` au panneau :
cela change le contexte de ses zones de défilement. Le board encadré est masqué par `visibility`,
sans déplacer les éléments ; les portails de menus/dialogues restent visibles dans le viewport.
Détection par Fermer et lien exact du ticket : dialogue natif prioritaire, repli géométrique pour
les panneaux latéraux. Un panneau remplacé est reconnu à nouveau sans accumuler de styles.
Pour une transition avec écran/champs requis, statut et transitions sont relus puis la fiche charge
cachée. L'hôte ouvre son menu et clique seulement une correspondance **unique** du nom, ou du nom
suivi du statut d'arrivée ; accents, espaces et ponctuation normalisés, aucun préfixe approximatif.
Le formulaire moderne ou classique dans son iframe est isolé par visibilité, dans le même viewport
que Jira. Ses dimensions, son en-tête, son pied et ses défilements restent natifs : aucune réécriture
de position, hauteur ou `overflow`, ni redimensionnement de l'iframe classique. L'attente d'une taille
stable et du chargement des iframes sert seulement à reconnaître la fenêtre avant de l'afficher.
L'utilisateur seul remplit, valide ou annule. L'extension ne réalise aucune écriture du déplacement,
ne saisit aucun champ et ne reprend pas automatiquement Goal/rang après fermeture.
Pendant l'ouverture, nouveaux déplacements et changement de board sont bloqués jusqu'au message
vérifié de fermeture. Choix ambigu : fiche montrée sans clic ; non reconnue à 12 s : Jira visible
tel quel ; cadre inaccessible à 20 s : fermeture et erreur. Traces console préfixées « Sprint Goals ».
Aucun formulaire local de secours ; ne pas réintroduire `/secure/CommentAssignIssue!default.jspa`,
inutilisable lors de l'essai réel. Le DOM et la politique d'iframe de Jira restent des dépendances.

## Contrats API

Ces contrats décrivent le code, sans certifier toutes les capacités Atlassian. Vérifier toute
évolution d'API avant implémentation ; les fixtures ne garantissent ni champ GraphQL ni écran réel.
[`transport.ts`](../../src/jira/transport.ts) utilise la session navigateur (`credentials: include`),
sans jeton ni mot de passe.

| Lecture | Endpoint / contrat |
|---|---|
| Utilisateur | `GET /rest/api/3/myself` |
| Recherche/droit du board | `GET /rest/agile/1.0/board`, dont `expand=permissions` |
| Structure | `GET /rest/agile/1.0/board/{id}` et `/{id}/configuration` |
| Sprints actifs/futurs | `GET /rest/agile/1.0/board/{id}/sprint`, filtre `state` ; `GET /rest/agile/1.0/sprint/{id}` pour relecture |
| Backlog du planning | `GET /rest/software/1.0/board/{id}/backlog`, pagination `nextPageToken` et `isLast`, limite 5 000 |
| Tickets Scrum | `GET /rest/agile/1.0/board/{board}/sprint/{sprint}/issue` ; jamais le sprint seul |
| Tickets Kanban / filtres rapides Jira | `GET /rest/agile/1.0/board/{id}/issue` |
| Validation JQL | `POST /rest/api/3/jql/parse?validation=strict` (lecture) |
| Suggestions JQL | `GET /rest/api/3/jql/autocompletedata` et `/jql/autocompletedata/suggestions` |
| Couleurs des cartes | `POST /rest/api/3/jql/match` (lecture, lots de 50 tickets / 10 requêtes) |
| Transitions / statut courant | `GET /rest/api/3/issue/{key}/transitions?expand=transitions.fields&sortByOpsBarAndStatus=true` ; `GET /rest/api/3/issue/{key}?fields=status` |
| Métadonnées et propriétés | Champs, statuts, types observés, filtres rapides et propriétés : [`client.ts`](../../src/jira/client.ts) |

Pagination des tickets complète jusqu'à 5 000, erreur explicite au-delà ; aucune troncature silencieuse.
Le filtre Scrum par board est contractuel, à constater sur l'instance réelle. `sprint.goal` est une
chaîne découpée en objectifs texte ; ses identifiants/liens vivent dans une propriété, distincts des Goals Atlassian.

[`goals.ts`](../../src/jira/goals.ts) utilise `/gateway/api/graphql` sur le site autorisé. Types, sélections,
variantes de `workItems` et pagination sont découverts par introspection, jamais devinés.
La façade conserve ses opérations publiques ; `goals/schema.ts` isole l'introspection et son cache,
`goals/decode.ts` décode les réponses sans accès réseau. Les lectures de champs rejetées sont retirées
du cache ; une découverte des liens `workItems` interrompue peut reprendre lors d'une lecture ultérieure.
`goals_search` emploie `containerId`, `searchString` (TQL), `after`, `first`, `sort` selon le schéma,
avec conteneur résolu depuis le site ; `goals_byIds` reçoit `goalIds`. Les références des tickets
complètent épinglages et recherche. Liens Goal → tickets paginés si arguments et `pageInfo` exploitables.
Une page de 100 liens sans pagination exploitable est incomplète ; recherche/liens bornés à 20 pages,
curseur incohérent ou limite signalés. Kanban peut se rabattre sur le champ Goals présent dans **chaque
ticket d'un type non ignoré**, même `null` ; s'il manque et que les liens GraphQL sont incomplets,
la lecture échoue. Les mutations admises sont E3/E4 de l'[inventaire des écritures](securite.md#inventaire-ferme-des-ecritures)
(`goalId`, `workItemId`, résultat `success`/`errors`). Pas de création/modification de Goal. Les POST GraphQL de lecture et
`/rest/api/3/jql/parse` et `/rest/api/3/jql/match` ne sont pas des écritures métier ;
le chemin lecture refuse `mutation`/`subscription`.

Références : [boards](https://developer.atlassian.com/cloud/jira/software/rest/api-group-board/),
[sprints](https://developer.atlassian.com/cloud/jira/software/rest/api-group-sprint/),
[propriétés d'entité](https://developer.atlassian.com/cloud/jira/platform/jira-entity-properties/),
[tickets/transitions](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/),
[validation et suggestions JQL](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-jql/),
[correspondance JQL](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-search/#api-rest-api-3-jql-match-post).
