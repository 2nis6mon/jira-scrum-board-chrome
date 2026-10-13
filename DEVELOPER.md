# Guide développeur — Sprint Goals Board pour Jira

Référence technique **0.31.0**, 13 octobre 2026 : architecture, contrats, sécurité et travaux ouverts.
Un seul produit : l'extension Chrome intégrée dans Jira Cloud. Le mode autonome et l'application
Mac sont abandonnés. [CLAUDE.md](CLAUDE.md) porte les règles de contribution ; le
[manuel](docs/manuel-utilisateur.md) décrit l'utilisation et le [changelog](CHANGELOG.md) les livraisons.

Accès direct : [intégration Jira](#integration-jira), [API](#contrats-api),
[données persistantes](#donnees-persistantes), [sécurité](#securite),
[travaux restants](#travaux-restants).

## Architecture et chargement

| Emplacement | Responsabilité |
|---|---|
| `board.html`, `launcher.html` | Vue Preact intégrée ; lanceur/bienvenue sans lecture de tickets |
| `public/manifest.json` | Permissions, CSP, identité et entrées compilées |
| `src/app/`, `src/app/platform/` | Modèles/vues/styles ; adaptateurs Chrome injectés |
| `src/core/`, `src/jira/` | Métier sans DOM ni Chrome ; transport et contrats Jira |
| `src/integration/` | Lanceur, worker, script de contenu, iframe et popins natives |
| `tests/support/`, `tests/harness/` | Faux services et banc visuel, absents de la distribution |
| `scripts/`, `.run/` | Contrôles navigateur, distribution et configurations IntelliJ partagées |

[`AppModel`](src/app/model/AppModel.ts) pilote connexion et présentation ;
[`BoardModel`](src/app/model/BoardModel.ts) reste la façade des vues : signaux, état visuel,
filtres et méthodes publiques. Trois services dans `src/app/services/` portent les opérations :

| Service | Responsabilité |
|---|---|
| `BoardLoadingService` | Synchronisation, relance des lectures concurrentes, résultats périmés, types observés et diagnostic |
| `BoardMovementService` | Commandes transition → Goal → rang, délégation native, erreurs partielles et journal |
| `BoardSettingsService` | Écritures de réglages en file, conflits, permissions et épinglage Scrum/Kanban |

Leurs ports décrivent les seuls états et effets nécessaires ; ils n'importent ni `BoardModel`,
ni les vues, ni Preact, ni le DOM ou Chrome. Les types communs sont dans `BoardTypes.ts`, réexportés
par la façade pour conserver les imports existants. Les adaptateurs réels sont assemblés dans
le constructeur du modèle ; les tests peuvent fournir des états ordinaires et des services fictifs.

`boardSync` lit le périmètre, `boardIssue` assemble les cartes, `boardLayout`/`boardBlocks` les
répartissent ; `pendingMove` projette les déplacements. `dropPlan` prépare l'intention et
`boardWrites` l'exécute après relecture. `teamSettings` gère le partage, `boardStore` la copie locale
et le board actif par origine, `auditLog` les écritures. `DiagnosticModel` teste les capacités Jira.

L'ouverture relit structure, statuts et champs, sans parcourir l'historique pour recenser les types.
Les types connus du même site/board et ceux des réglages partagés restent présents même sans ticket.
[`issueTypeDiscovery`](src/core/issueTypeDiscovery.ts) les complète depuis les tickets utiles,
avant les Goals et l'assemblage : catégories, comptage des bugs et groupes choisis sont conservés ;
seuls les types nouveaux sans choix partagé reçoivent un défaut. Les métadonnées sont mémorisées
localement dès lecture des tickets, même si les Goals échouent ensuite, sans écriture Jira.
La relecture explicite de structure conserve le recensement exhaustif et paginé.

[`LoadDiagnostics`](src/app/model/LoadDiagnostics.ts) et `LoadTrace` mesurent les phases et lectures
sans appel réseau supplémentaire ; écritures et images sont exclues. Horloge monotone, départ à
la navigation du document de l'extension (navigation Jira précédente hors mesure), rendu estimé
après deux frames. Les durées parallèles ne s'additionnent pas ; une relecture de structure pendant
la synchronisation prolonge la mesure. **Depuis 0.29.2, aucun indicateur ni accès à la popin dans Jira.**
La vue subsiste uniquement sur le banc `?scenario=board-chargement` ; `verify:loading` contrôle
copie, historique, fermeture et format étroit, avec captures dans `.vite/`.

## Invariants fonctionnels

### Périmètres, Goals et cartes

- Scrum réunit sans doublon les tickets de tous les sprints actifs retenus par le filtre du board.
  Un sprint actif sans ticket du board est omis ; si tous sont vides, le premier reste affiché.
  Le premier sprint affiché par date de début porte l'épinglage et le mode texte ; les dates
  d'entrée de chaque ticket restent celles de son sprint. Les textes de plusieurs sprints ne sont pas agrégés.
- Le texte `sprint.goal` est la source par défaut d'un nouveau Scrum ; les choix existants ou
  partagés sont conservés. Les Goals Atlassian sont optionnels ; leur échec permet un repli texte explicite.
  **Le champ natif Sprint Goal n'est jamais écrit.**
- Kanban utilise le périmètre du board et `subQuery.query`, avec ses statuts mappés : aucun faux
  sprint, lecture séparée du backlog ou âge limite local des tickets terminés. `snapshot.sprint=null`
  et `activeSprints=[]` n'indiquent pas un board vide. Filtres rapides et couleurs JQL gardent ce
  sous-filtre, sans clause sprint. Un statut absent de la structure locale reste compté et signalé
  comme non mappé ; la relecture de structure permet de replacer sa carte.
- Kanban exige les Goals Atlassian. Si leur lecture est inexploitable, la photographie précédente
  reste affichée avec l'erreur : aucun repli qui placerait à tort tous les tickets dans Build.
  `boardPinnedGoalIds` est partagé sur le board, sans propriété de sprint, et exige son droit d'édition.
- Un ticket lié à plusieurs Goals suit le premier Goal résolu. Après la première lecture, un Goal
  nouvellement découvert par un ticket arrive masqué ; ses tickets restent dans Build jusqu'à réaffichage.
  Les objectifs épinglés peuvent rester vides. Un Goal vide n'est jamais atteint ; sinon tous ses
  tickets doivent être dans la dernière colonne visible. Le vert est réservé à cet état.
- Une seule série de colonnes pour toutes les swimlanes. Un type est `GOAL`, `SWIMLANE` ou `IGNORED`.
  [`normalizeSwimlanes`](src/core/boardConfiguration.ts) garantit une seule swimlane par type :
  groupe créé avec son premier type, retiré avec le dernier ; nom vide = noms des types réunis.
  Les lignes sans ticket affiché disparaissent, sauf les objectifs vides. Une carte d'une swimlane
  par type ne se dépose que dans cette swimlane.
- Les sous-tâches gardent leur carte et leurs compteurs ; sans Goal propre, elles héritent de celui
  du parent. Si celui-ci est présent, elles suivent son bloc, y compris une swimlane par type.
  Filtres carte par carte, WIP en tickets, `columnLoad` sur toutes les swimlanes. Survol de famille
  seulement avec au moins deux cartes visibles et hors glissé ; jauge et alerte des sous-tâches
  utilisent ces données, sans lecture Jira supplémentaire.
- « Ajouté en cours de sprint » rejoue l'historique Sprint jusqu'au démarrage, ou utilise la date
  de création sans changement de sprint ; sans historique, aucun indicateur (`sprintScope`).
  L'en-tête/filtres/colonnes restent fixes ; le Goal courant reste sous les colonnes, sur toute
  la largeur logique. Les Goals atteints sont verts ; le compteur porte sur les Goals visibles.

### Déplacements, présentation et réglages

- Même colonne : aucun changement de statut. Autre colonne : seuls les statuts accessibles
  acceptent le dépôt ; transition ambiguë = choix demandé. Ordre : **transition → Goal → rang**.
  Arrêt au premier échec, réussite partielle indiquée, aucun rollback automatique.
  La carte projetée est visuelle ; les compteurs restent ceux confirmés par Jira. Repère rouge
  pour les erreurs, aucune confirmation verte. Les formulaires suivent le parcours natif ci-dessous.
- Daily : une swimlane affichée à la fois dans l'ordre du board, sans objectifs masqués ni lignes
  sans ticket visible ; filtres et replis personnels inchangés. Déplacements possibles, sans
  changement de Goal par glissé. Minuteur global fondé sur l'heure de départ, pauses exclues,
  sans arrêt ni son à échéance ; orange les deux dernières minutes puis dépassement rouge.
  Durée partagée `dailyMinutes` : 15 min par défaut, bornée à 1–120. `dailyStockLimit` : trois
  premières cartes par première colonne, dépliage temporaire par swimlane. Recharger termine la séance.
- Daily et présentation demandent le plein écran au clic (`allow="fullscreen"` sur l'iframe,
  aucune permission Chrome). Un refus laisse la Daily utilisable. Sortir du plein écran termine
  la présentation via `fullscreenchange`, mais laisse la Daily active. Présentation : en-tête et
  barre latérale masqués, filtres conservés ; commandes détaillées dans le manuel.
- `SPRINT_HEALTH_ENABLED` dans `BoardView.tsx` reste désactivé. `DIAGNOSTIC_ENABLED` dans
  `DiagnosticView.tsx` reste actif, notamment pour le renvoi « Invalid CORS request » ; le désactiver
  retire l'entrée Diagnostic du menu « Site Jira » (site et déconnexion restent).
- Réglages du board ([`settings/`](src/app/views/settings/SettingsView.tsx), 0.31.0) : vue
  `settings` à onglets Board, Objectifs, Champs et Couleurs des cartes, ouverte depuis le board
  (en-tête, barre latérale, menu du board, menu ⋯ d'une swimlane) ; le pied de barre « Site Jira »
  garde diagnostic et déconnexion. Glisser-déposer HTML5 à types de données propres
  (`application/x-sprint-goals-settings-*`), sans effet sur les glissés du board, avec un équivalent
  clavier ou menu pour chaque geste ; `verify:settings` les rejoue dans Chromium. La liste des
  swimlanes est la sous-suite hors objectifs de `blockOrder` (`settingsLaneOrder`,
  [`reorder`](src/core/reorder.ts)) : y déplacer Build ou une swimlane par type ne change jamais
  l'ordre relatif des objectifs, réglé sur le board. Un dépôt sans effet n'écrit rien.
- Colonnes telles que Jira les déclare (noms, limites WIP) ; seules celles sans statut sont
  écartées. Bloqué = lien Jira « est bloqué par » uniquement. Les personnalisations de colonnes et
  labels de blocage d'avant 0.31.0 ne sont plus lues (voir Données persistantes).
- Les réglages partagés sont relus à chaque chargement ; chaque geste de modification est écrit
  immédiatement après relecture et fusion avec la version des collègues. Un calcul automatique
  n'écrit jamais seul. Une modification non enregistrée est perdue à la prochaine lecture.
  Sans `canEdit` ou après refus Jira, les réglages du board disparaissent (entrées et vue) ; le menu
  « Site Jira » reste ; repli des lignes personnel.
- Déconnexion confirmée : permission Chrome rendue, boards/réglages locaux du site et historique
  de chargement effacés. Les préférences personnelles ne sont jamais publiées ni synchronisées entre postes.

<a id="integration-jira"></a>
## Intégration Jira

[`worker`](src/integration/worker.ts) compile vers `jira-worker.js`, enregistre
[`bootstrap`](src/integration/bootstrap.ts) (`jira-bootstrap.js`) sur les sites autorisés et
injecte [`injectBoard`](src/integration/injectBoard.ts) sur l'adresse marquée `sprintGoals=1`.
`injectBoard` est copié via `executeScript` : aucun import ni état extérieur ; `bootstrap` n'a pas d'import.
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

Le bouton flotte dans une racine Shadow DOM et suit la navigation interne. Sa poignée accepte
souris/toucher (seuil 5 px), flèches 10 px ou Maj+flèches 1 px. Échap, interruption du pointeur ou
redimensionnement pendant le geste annulent sans sauvegarde. Stockage au relâchement ou à chaque pas
clavier : ratios `{x,y}` bornés à 0–1 de la course du viewport visuel, dimensions du bouton et marges
12 px déduites. Défaut : 96 px de la droite, 28 px du bas, bornés à la fenêtre. Zoom, plein écran
et redimensionnement adaptent l'affichage sans réécrire le choix ; synchronisation entre onglets,
lecture initiale tardive sans écraser un geste. Valeur illisible = défaut. Aucun appel Jira ajouté.

[`embeddingGuard`](src/integration/embeddingGuard.ts) exige un parent unique, son origine égale au
site normalisé `jiraHost`, une URL `jiraBoard` valide et la permission Chrome **avant le modèle métier**.
Ouverture directe, cadre imbriqué et autre origine refusés. [`embedded`](src/integration/embedded.ts)
et l'hôte vérifient origine et fenêtre source dans les deux sens ; l'hôte valide aussi les identifiants.

| Message | Sens et effet |
|---|---|
| `sprint-goals:open-issue` | Vue → hôte : fiche complète ou formulaire de transition |
| `sprint-goals:open-board` | Vue → hôte : navigation construite, aucune URL arbitraire acceptée |
| `sprint-goals:close` | Vue → hôte : retour à Jira |
| `sprint-goals:refresh` | Hôte → vue : fermeture, déblocage et relecture |

Un clic carte ouvre la fiche native complète : largeur 1 280 px bornée à la fenêtre, marges 16–60 px.
Pour une transition avec écran/champs requis, statut et transitions sont relus puis la fiche charge
cachée. L'hôte ouvre son menu et clique seulement une correspondance **unique** du nom, ou du nom
suivi du statut d'arrivée ; accents, espaces et ponctuation normalisés, aucun préfixe approximatif.
Le formulaire moderne ou classique dans son iframe est isolé, dimensionné avec marge 16 px ;
l'utilisateur seul remplit, valide ou annule. L'extension ne réalise aucune écriture du déplacement,
ne saisit aucun champ et ne reprend pas automatiquement Goal/rang après fermeture.
Pendant l'ouverture, nouveaux déplacements et changement de board sont bloqués jusqu'au message
vérifié de fermeture. Choix ambigu : fiche montrée sans clic ; non reconnue à 12 s : Jira visible
tel quel ; cadre inaccessible à 20 s : fermeture et erreur. Traces console préfixées « Sprint Goals ».
Aucun formulaire local de secours ; ne pas réintroduire `/secure/CommentAssignIssue!default.jspa`,
inutilisable lors de l'essai réel. Le DOM et la politique d'iframe de Jira restent des dépendances.

<a id="contrats-api"></a>
## Contrats API

Ces contrats décrivent le code, sans certifier toutes les capacités Atlassian. Vérifier toute
évolution d'API avant implémentation ; les fixtures ne garantissent ni champ GraphQL ni écran réel.
[`transport.ts`](src/jira/transport.ts) est le seul appelant de `fetch` : session navigateur
(`credentials: include`), site HTTPS autorisé, sans jeton/mot de passe, redirections refusées.

| Lecture | Endpoint / contrat |
|---|---|
| Utilisateur | `GET /rest/api/3/myself` |
| Recherche/droit du board | `GET /rest/agile/1.0/board`, dont `expand=permissions` |
| Structure | `GET /rest/agile/1.0/board/{id}` et `/{id}/configuration` |
| Sprints actifs | `GET /rest/agile/1.0/board/{id}/sprint` |
| Tickets Scrum | `GET /rest/agile/1.0/board/{board}/sprint/{sprint}/issue` ; jamais le sprint seul |
| Tickets Kanban / filtres JQL | `GET /rest/agile/1.0/board/{id}/issue` |
| Transitions / statut courant | `GET /rest/api/3/issue/{key}/transitions?expand=transitions.fields` ; `GET /rest/api/3/issue/{key}?fields=status` |
| Métadonnées et propriétés | Champs, statuts, types observés, filtres rapides et propriétés : [`client.ts`](src/jira/client.ts) |

Pagination des tickets complète jusqu'à 5 000, erreur explicite au-delà ; aucune troncature silencieuse.
Le filtre Scrum par board est contractuel, à constater sur l'instance réelle. `sprint.goal` est une
chaîne découpée en objectifs texte ; ses identifiants/liens vivent dans une propriété, distincts des Goals Atlassian.

[`goals.ts`](src/jira/goals.ts) utilise `/gateway/api/graphql` sur le site autorisé. Types, sélections,
variantes de `workItems` et pagination sont découverts par introspection, jamais devinés.
La façade conserve ses opérations publiques ; `goals/schema.ts` isole l'introspection et son cache,
`goals/decode.ts` décode les réponses sans accès réseau. Les lectures de champs rejetées sont retirées
du cache ; une découverte des liens `workItems` interrompue peut reprendre lors d'une lecture ultérieure.
`goals_search` emploie `containerId`, `searchString` (TQL), `after`, `first`, `sort` selon le schéma,
avec conteneur résolu depuis le site ; `goals_byIds` reçoit `goalIds`. Les références des tickets
complètent épinglages et recherche. Liens Goal → tickets paginés si arguments et `pageInfo` exploitables.
Une page de 100 liens sans pagination exploitable est incomplète ; recherche/liens bornés à 20 pages,
curseur incohérent ou limite signalés. Kanban peut se rabattre sur le champ Goals présent dans **chaque
ticket classé par objectif**, même `null` ; s'il manque et que les liens GraphQL sont incomplets,
la lecture échoue. Les mutations admises sont E3/E4 ci-dessous (`goalId`, `workItemId`, résultat
`success`/`errors`). Pas de création/modification de Goal. Les POST GraphQL de lecture et
`/rest/api/3/jql/parse` ne sont pas des écritures métier ; le chemin lecture refuse `mutation`/`subscription`.

Références : [boards](https://developer.atlassian.com/cloud/jira/software/rest/api-group-board/),
[sprints](https://developer.atlassian.com/cloud/jira/software/rest/api-group-sprint/),
[propriétés d'entité](https://developer.atlassian.com/cloud/jira/platform/jira-entity-properties/),
[tickets/transitions](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/).

<a id="donnees-persistantes"></a>
## Données persistantes

| Propriété Jira | Contenu |
|---|---|
| `com.scrumboardmac.sprintgoals.v1` | Objectifs texte, liens ticket → objectif, Goals épinglés Scrum, métadonnées |
| `com.scrumboardmac.boardsettings.v1` | Réglages partagés, swimlanes, Goals épinglés Kanban |
| `com.scrumboardmac.diagnostic` | Test d'écriture demandé, relu puis supprimé |

Préserver ces noms et les identifiants ; relecture avant modification, conflits refusés, données
illisibles jamais écrasées, clés inconnues conservées, limite client 32 Ko. Références de format :
[`sprintGoals.ts`](src/core/sprintGoals.ts), [`teamSettings.ts`](src/core/teamSettings.ts) et leurs tests.
Les anciennes valeurs `SCRUM`/`KANBAN`, `showKanbanSection`, `kanbanSectionLabel`,
`dailyKanbanStockLimit` restent compatibles ; retrait seulement avec migration et décision sur les
anciennes installations. Valeurs absentes : défauts compatibles, pas de perte des données.
Depuis 0.31.0, `scrumColumns`, `kanbanColumns` et `blockedLabels` ne sont plus lus : clés inconnues,
ils sont réécrits tels quels pour les versions précédentes, qui exigent les colonnes ; un premier
document reçoit celles de Jira. Localement, masquage et noms de colonnes enregistrés sont ignorés.

| Clé `chrome.storage.local` | Contenu |
|---|---|
| `connection.v1`, `launcher.v1` | Site connecté ; dernière adresse de board |
| `boards.v1`, `interface.v1` | Boards/configuration/sélection par site ; préférences de présentation |
| `jira-button-position.v1:<origine Jira>` | Position personnelle commune aux boards d'un site |
| `dismissedNotices.v1`, `graphqlOrigin.v1` | Avis fermés par site/board ; variante Origin du site |
| `audit.v1` | Au plus 500 écritures de l'extension : clés des tickets, résultat, erreurs, aucun cookie ni saisie native |
| `loadDiagnostics.v1` | Cinq chargements, 500 segments chacun ; troncature comptée |

Les mesures de chargement ne stockent que version/date, type du board, compteurs, temps et catégories
fermées : aucun nom, URL, JQL, identifiant Jira, en-tête, corps ou message brut. Identifiants de
rapports/appels locaux à la mesure, décodeur strict, stockage non bloquant. Historique par onglet,
relu à l'ouverture, sans consolidation entre onglets simultanés : ils peuvent se remplacer.
Le diagnostic de capacités et les erreurs ordinaires peuvent contenir des informations Jira :
relire leur rapport avant partage. Aucun envoi automatique ni `storage.sync`.
La clé publique du manifest conserve l'identité de développement `efhpkdoiimdggndnfcgdoaniobdcmokb`.
Garder aussi les identifiants DOM/scripts historiques contenant `direct`, nécessaires à la reconnaissance
d'une intégration déjà injectée ; ils ne désignent pas un second mode.

<a id="securite"></a>
## Sécurité

Consolidation de l'audit initial du 19 septembre 2026 (`c785ea0`) et des correctifs, sans nouvel audit
indépendant, test d'intrusion ni validation des workflows réels. Aucun serveur tiers ni télémétrie.

| Permission / frontière | Restriction |
|---|---|
| Hôtes | HTTPS `*.atlassian.net` ; permission du site demandée au clic, aucune accordée d'office |
| `storage`, `activeTab` | Stockage local ; adresse de l'onglet seulement au clic de l'icône |
| `scripting` | Bouton sur sites autorisés, vue sur URL marquée |
| `declarativeNetRequestWithHostAccess` | Règle de session retirant/remplaçant Origin uniquement sur POST de l'extension, `initiatorDomains: [id]`, URL exacte `\|https://<site>/gateway/api/graphql\|` ; jamais les pages web |
| CSP / ressources exposées | Scripts/styles locaux, `object-src 'none'`, connexions Atlassian ; `board.html`, `assets/*`, `icons/*` accessibles à `https://*.atlassian.net/*`, encadrement limité aux mêmes sites, aucun code distant |

Contrôles de parent/source décrits dans [l'intégration](#integration-jira). Liens Goals : HTTPS sur
domaines Atlassian validés, sans identifiants ni port ; images contrôlées, avatars externes non téléchargés.
Données rendues en texte Preact, liens externes `noopener noreferrer`. Nouvelle permission, hôte,
écriture ou évolution CSP : décision produit explicite, contrat vérifié, inventaire et tests actualisés.

### Inventaire fermé des écritures

[`writes.ts`](src/jira/writes.ts) est la référence exhaustive des écritures du transport de l'extension.

| ID | Opération / contrat | Geste |
|---|---|---|
| E1 | `POST /rest/api/3/issue/{clé}/transitions`, seul `transition.id`, sans formulaire | Dépôt autre colonne / choix explicite |
| E2 | `PUT /rest/agile/1.0/issue/rank` | Dépôt avant/après un ticket |
| E3 | `goals_linkWorkItem` | Dépôt vers un Goal |
| E4 | `goals_unlinkWorkItem` | Dépôt vers Build / changement de Goal |
| E5 | `PUT /rest/agile/1.0/sprint/{id}/properties/com.scrumboardmac.sprintgoals.v1` | Épinglage Scrum / lien en mode texte |
| E6 | `PUT /rest/agile/1.0/board/{id}/properties/com.scrumboardmac.boardsettings.v1` | Réglage explicite, dont épinglage Kanban |
| E7 | `PUT` puis `DELETE /rest/agile/1.0/sprint/{id}/properties/com.scrumboardmac.diagnostic` | Test demandé dans Diagnostic |

Une tentative par écriture POST/PUT/DELETE ; relecture après résultat incertain, jamais de succès
avant confirmation. Lectures rejouables seulement sur erreur transitoire. E1 relit statut/transitions ;
E3/E4 s'arrêtent si le détachement échoue, annoncent le succès partiel si seul le nouveau lien échoue,
sans rollback. E5/E6 appliquent les protections de propriétés ci-dessus et les droits Jira.
Les réglages partagés, IDs de Goals et métadonnées d'auteur (nom/compte) sont visibles aux lecteurs
Jira de l'entité ; préférences personnelles exclues. Aucun champ natif de sprint/board n'est écrit ;
aucune création/suppression de ticket, modification de workflow, création de Goal ou démarrage de sprint.
Les formulaires et fiches **Jira natifs** gardent les droits et actions de Jira : leurs requêtes et
saisies sont hors du transport et du journal de l'extension, qui ne les remplit ni ne les valide.

### Constats conservés

| ID | Constat et état |
|---|---|
| S1 | URL de Goal insuffisamment bornée : corrigé, domaines Atlassian validés et tests de liens |
| S2 | Réglages/JQL des collègues exécutés avec la session du lecteur : choix produit, `canEdit`, relecture/conflits ; filtre du board appliqué par l'API |
| S3 | Restriction JQL syntaxique contournable par parenthèses déséquilibrées : lecture limitée au board et filtrage local, volume supplémentaire encore possible |
| S4 | Session avec droits de l'utilisateur : risque structurel, inventaire borné côté extension ; fiche native conserve les droits Jira |
| S5 | CSP de connexion plus large que le site connecté : site contrôlé dans transport et plateforme |
| S6 | Auteur des réglages enregistré : choix assumé, visible aux lecteurs du board |
| S7 | Identité/distribution : clé privée ignorée, archive vérifiée ; compilation et publication distinctes |
| S8 | Origin GraphQL modifié : règle bornée à initiateur, méthode et URL exacte |
| S9 | Hébergement par un autre site Atlassian : corrigé, parent/origine/permission validés avant modèle |
| S10 | Transition voisine cliquée : correspondance unique nom/statut, sinon fiche rendue sans clic |
| S11 | Dépendance au DOM Jira : risque structurel, délais/repli visible/fixtures ; validation réelle nécessaire |
| S12 | Navigation étrangère/forgée : origine/source et identifiants contrôlés ; URL construite par l'hôte |

## Développement, contrôles et livraison

Node >= 22.12 ; dépendances exactes dans `package-lock.json`, scripts d'installation désactivés par
`.npmrc`. `npm ci`, puis `npm run check` (typage, lint, tests, build). Un seul paquet intégré `dist/` ;
`npm run watch` le reconstruit. `.run/` partagé, `.idea/` et préférences personnelles ignorées.
`.gitattributes` impose les fins de ligne LF pour conserver le même format dans chaque clone.

| Commande | Contrôle / résultat |
|---|---|
| `npm run test` / `test:watch` | Tests Vitest |
| `npm run typecheck` / `lint` / `format` | TypeScript / contrôles et formatage Biome |
| `npm run harness` | Banc fictif, port 5199 |
| `npm run verify:load` | Chargement, bienvenue, permissions, lanceur |
| `npm run verify:jira` / `verify:transition` | Hébergement, messages forgés, navigation, fiche et formulaire seul, ambiguïté, absence de validation automatique, fermeture |
| `npm run verify:drag` / `verify:button` | Gestes ; bouton et stockage Chrome, zoom/redimensionnement/plein écran |
| `npm run verify:settings` | Glissés des réglages : swimlanes, types, champs et règles de couleur |
| `npm run verify:loading` | Diagnostic de chargement du banc fictif |
| `npm run package` | Archive `release/sprint-goals-board-<version>.zip` vérifiée |
| `npm run store:screenshots` | Captures fictives du Store |

Les vérifications navigateur interceptent Jira dans un profil temporaire vierge ; `CHROME_PATH`
choisit l'exécutable. `verify:button` autorise deux hôtes fictifs dans une copie temporaire du paquet,
sans changer manifest distribué ni profil utilisateur. Aucun accès à la session réelle sans autorisation.
Pour préserver un `dist/` en essai : construire avec `npx vite build --outDir <dossier>`, puis lancer
`node scripts/verify-jira.mjs` ou `verify-load.mjs` avec `EXTENSION_DIR=<dossier>` dans l'environnement.
Les anciens alias `*:jira-direct-test` et `JIRA_DIRECT_DIST` restent retirés.

[Le workflow GitHub](.github/workflows/validation.yml) exécute les contrôles à chaque push sur
`main` ou `codex/**` et sur les demandes de fusion vers `main` : typage, style, tests, compilation,
intégration Jira, glisser-déposer (board et réglages), diagnostic du banc et paquet. Il utilise une machine Windows,
Node 24 et Chrome for Testing 155.0.8059.39 téléchargé depuis la distribution officielle Google.
Profil temporaire et uniquement Jira fictif : aucune session ou donnée Jira réelle n'est nécessaire.

Garde-fous : [`sources.test.ts`](tests/guards/sources.test.ts) (réseau/couches/mutations/fixtures),
[`manifest.test.ts`](tests/manifest.test.ts) (permissions/CSP),
[`writes.test.ts`](tests/jira/writes.test.ts) (inventaire), tests transport/modèle (conflits,
échecs/retry/délégation native), `tests/integration/` (hôte et refus avant démarrage).
Les tests de services couvrent leurs ports isolément ; les tests du modèle gardent la composition
réelle. `BoardModel.concurrency.test.ts` contrôle en particulier une réponse de l'ancien board
après changement et une lecture de réglages dépassée par une écriture plus récente. Les gardes
de sources empêchent le retour de dépendances vers les vues depuis les couches métier et Jira.
Ces contrôles ne valident pas les workflows réels. Un ancien `npm audit` ne garantit pas les dépendances
actuelles : le relancer lors d'une revue de distribution ; prévoir une revue indépendante avant diffusion large.

Git et identité : appliquer [CLAUDE.md](CLAUDE.md), branche `codex/...`, push des commits cohérents,
`main` uniquement sur demande. Avant commit : `npm run check`, `npm run verify:jira`, revue du diff
et des non-suivis ; versions `package.json`, `package-lock.json`, `public/manifest.json` cohérentes,
documentation et changelog à jour. `dist/`, `release/`, profils, cookies, captures Jira et clé privée
`.secrets/extension-key.pem` hors Git. Le paquet Store retire la clé publique de développement
(identifiant potentiellement différent) et refuse secrets, sources de tests et source maps.
Fiche : [docs/store/fiche.md](docs/store/fiche.md). Politique : [docs/privacy/index.html](docs/privacy/index.html),
à recopier si modifiée dans `2nis6mon/sprint-goals-privacy` publié via GitHub Pages.
Préparer une archive ne la publie pas sur le Store.

<a id="travaux-restants"></a>
## Travaux restants

### Fiabilité et distribution

- [ ] Workflows réels : Time Spent, Story Points, Resolution, commentaires, plusieurs champs,
  widgets tiers ; validation et annulation. Améliorer le diagnostic des formulaires non reconnus sans données sensibles.
- [ ] Schémas Goals réels : plus de 100 liens, absence de `workItems`, champ Goals manquant ;
  contrôler pagination et signalement des résultats incomplets déjà implémentés.
- [ ] Réglages/conflits sur deux postes, avec et sans `canEdit` ; volumes importants et limites WIP réelles.
- [ ] Routes des boards gérés par l'équipe, changement de board et placement du bouton sur les dispositions Jira.
- [ ] Étudier les lectures Software « enhanced » avant de remplacer les endpoints Agile ; préserver filtre, sprints et pagination.
- [ ] Confirmer publication et canal de mise à jour ; fiche, empaquetage et politique existent.
- [ ] Actualiser captures Store/manuel à la prochaine évolution visuelle ; revue de sécurité indépendante avant diffusion large.

### Pistes produit à décider

- [ ] Export/import JSON validé avec aperçu des différences.
- [ ] Préférences personnelles entre postes : propriété utilisateur Jira = nouvelle écriture à autoriser ; `storage.sync` exclu.
- [ ] WIP en points et minimums de colonne ; présentation des sources Goals selon capacités du site.
- [ ] Déploiement IT via `storage.managed` si besoin ; déplacement clavier si la décision d'abandon est réouverte.

**Sprint Planning demandé, non implémenté.** Définir sprint futur, source des objectifs, capacité et
frontière préparation/démarrage. Ajouter des tickets au sprint, le démarrer ou créer des Goals
introduit de nouvelles écritures à autoriser et documenter séparément. Sprint Goal natif reste en lecture seule.
