# Sécurité — Sprint Goals Board pour Jira

Périmètre documentaire : **0.28.1**, 12 octobre 2026, mode intégré dans Jira.
Ce document consolide l'audit initial du 19 septembre 2026 (`c785ea0`) et ses correctifs.
Il décrit les garanties du code et les risques connus, sans revendiquer un nouvel audit
indépendant, un test d'intrusion ou une vérification des workflows Jira réels.

## Surface et permissions

- Session Jira du navigateur ; aucun mot de passe, jeton, serveur tiers ou télémétrie.
- Hôtes admis : sites HTTPS `*.atlassian.net`, permission d'un site demandée sur un clic.
- `storage` : préférences et journal dans `chrome.storage.local`, jamais `storage.sync`.
- `activeTab` : adresse de l'onglet courant lorsque l'utilisateur clique sur l'icône.
- `scripting` : script sur les sites autorisés, bouton d'ouverture et vue sur une URL marquée.
- `declarativeNetRequestWithHostAccess` : une règle de session retire ou remplace Origin pour
  les seuls POST de l'extension (`initiatorDomains: [id]`) vers l'URL exacte
  `|https://<site>/gateway/api/graphql|`. Elle ne vise aucune requête des pages web.
- CSP : scripts/styles locaux, `object-src 'none'`, connexions limitées à Atlassian ; ressources
  `board.html`, `assets/*` et `icons/*` exposées à `https://*.atlassian.net/*`, encadrement limité
  aux mêmes sites. Aucun code distant.

Le lanceur ne lit aucun ticket. Avant toute vue métier, `embeddingGuard.ts` contrôle le parent
unique, son origine égale à celle du board et l'autorisation Chrome. Ouverture directe, parent
d'un autre site et cadres imbriqués sont refusés.

Les messages entre hôte et vue vérifient origine et fenêtre source. L'hôte valide clé du ticket,
transition, identifiant de board et clé projet. Il construit les URLs sur sa propre origine,
sans accepter d'URL de navigation arbitraire. Les parcours sont décrits dans
[integration-jira.md](integration-jira.md).

## Inventaire des écritures

`src/jira/writes.ts` est l'inventaire fermé des écritures REST et GraphQL émises par le transport
de l'extension. `transport.ts` est le seul appelant de `fetch`.

| ID | Opération | Contrat | Geste |
|---|---|---|---|
| E1 | Transition sans formulaire | `POST /rest/api/3/issue/{clé}/transitions`, seul `transition.id` | Dépôt dans une autre colonne / choix explicite |
| E2 | Rang | `PUT /rest/agile/1.0/issue/rank` | Dépôt avant ou après un ticket |
| E3 | Rattachement Goal | `goals_linkWorkItem` | Dépôt vers un Goal |
| E4 | Détachement Goal | `goals_unlinkWorkItem` | Dépôt vers Build ou changement de Goal |
| E5 | Objectifs du sprint | `PUT /rest/agile/1.0/sprint/{id}/properties/com.scrumboardmac.sprintgoals.v1` | Épinglage Scrum / rattachement en mode texte |
| E6 | Réglages du board | `PUT /rest/agile/1.0/board/{id}/properties/com.scrumboardmac.boardsettings.v1` | Modification explicite d'un réglage, dont épinglage Kanban |
| E7 | Diagnostic d'écriture | `PUT` puis `DELETE` de la propriété de sprint `com.scrumboardmac.diagnostic` | Test demandé dans Diagnostic |

Les propriétés ne modifient aucun champ du sprint ni du board. Le champ « Sprint Goal » n'est
jamais écrit. Aucun chemin de création/suppression de ticket, modification de workflow,
démarrage de sprint ou création de Goal n'existe dans cet inventaire.

**Frontière Jira natif.** Lorsqu'une transition exige un formulaire, l'extension demande son
ouverture à l'hôte et n'effectue aucune écriture du déplacement. Jira affiche les champs,
valide et envoie lui-même la saisie de l'utilisateur (temps passé, points, résolution, etc.).
Ces requêtes natives et les modifications depuis une fiche Jira sont en dehors du transport
et du journal de l'extension. Le nettoyage retire le formulaire local et sa sérialisation,
mais ne limite pas les actions proposées par Jira à l'utilisateur dans sa propre fiche.

Les POST de lecture GraphQL et `/rest/api/3/jql/parse` ne sont pas des écritures métier.
Le transport n'admet pas de document GraphQL `mutation` ou `subscription` par le chemin de lecture.

## Garanties d'exécution et de données

- Une tentative par POST/PUT/DELETE d'écriture ; relecture après réponse incertaine. Les lectures
  peuvent être rejouées sur erreur transitoire. Les redirections sont refusées.
- Aucune écriture sans geste explicite ; pas de succès annoncé avant confirmation.
- Statut et transitions relus avant E1 ; mêmes colonnes sans transition ; choix ambigu demandé.
- E3/E4 : arrêt si le détachement échoue ; si le nouveau lien échoue après détachement confirmé,
  la réussite partielle est indiquée. Aucun rollback automatique.
- E5/E6 : relecture, contrôle des conflits, conservation des clés inconnues, limite de 32 Ko,
  refus d'écraser une donnée illisible. Les réglages nécessitent le droit de modifier le board.
- Les préférences personnelles ne sont jamais publiées. Les réglages partagés et les identifiants
  de Goals sont visibles aux personnes qui peuvent lire l'entité Jira ; leur auteur peut figurer
  dans les métadonnées (nom et identifiant de compte).
- Les clés `com.scrumboardmac.*` restent identiques pour conserver les données existantes.
- Les liens de Goals sont limités à HTTPS sur les domaines Atlassian validés, sans identifiants
  ni port. Les images sont contrôlées et les avatars externes ne sont pas téléchargés.
- Rendu des données sous forme de texte Preact, liens externes avec `noopener noreferrer`.
- Le journal local `audit.v1` conserve au plus 500 écritures de l'extension, leurs clés de tickets,
  résultat et erreurs ; pas de contenu saisi dans les formulaires natifs ni de cookie.
- Les erreurs et le rapport de diagnostic peuvent contenir des informations renvoyées par Jira :
  relire un rapport avant de le partager.

## Constats suivis

Les identifiants S sont conservés pour retrouver les correctifs dans Git.

| ID | Constat | État actuel |
|---|---|---|
| S1 | Adresse d'un Goal insuffisamment restreinte | Corrigé : domaines Atlassian validés, tests de liens |
| S2 | Réglages partagés appliqués chez les collègues ; JQL exécuté avec leur session | Choix produit : droit `canEdit`, relecture et conflits ; filtre du board toujours appliqué par l'API |
| S3 | Restriction JQL syntaxique contournable par parenthèses déséquilibrées | Lecture toujours limitée au board ; filtrage local des cartes ; volume supplémentaire possible |
| S4 | Session navigateur avec les droits de l'utilisateur | Structurel : inventaire de l'extension borné ; fiche Jira native garde les droits de Jira |
| S5 | CSP de connexion plus large que le seul site connecté | Contrôle du site dans le transport et la plateforme |
| S6 | Auteur des réglages enregistré dans Jira | Choix assumé ; visible aux lecteurs du board |
| S7 | Identité et canal de distribution | Clé privée ignorée, archive vérifiée ; publication distincte de la compilation |
| S8 | Modification de l'en-tête Origin pour GraphQL | Règle bornée à l'initiateur, la méthode et l'URL exacte |
| S9 | Hébergement du board par un autre site Atlassian | Corrigé : parent/origine/permission validés avant le modèle métier |
| S10 | Clic sur une transition voisine | Correspondance unique du libellé et du statut ; sinon fiche rendue sans clic |
| S11 | Dépendance au DOM de Jira Cloud | Risque structurel ; délais, repli visible, tests de fixtures et validation réelle nécessaire |
| S12 | Navigation demandée par une page étrangère ou URL forgée | Origine/source et identifiants contrôlés ; URL construite par l'hôte |

La correspondance des transitions retire accents, espaces et ponctuation pour comparer le nom
ou le nom suivi du statut d'arrivée. Elle ne repose pas sur un préfixe approximatif. L'extension
ne remplit ni ne valide le formulaire natif. Sans hôte utilisable, elle affiche une erreur et
ne reconstruit pas de formulaire de secours.

## Distribution et contrôles

Dépendances exactes dans `package-lock.json`, scripts d'installation désactivés par `.npmrc`.
Ne jamais committer la clé privée `.secrets/extension-key.pem`, les profils navigateur, cookies
ou captures de données Jira. Le manifest garde sa clé publique pour le développement ; l'archive
Store la retire et peut donc recevoir un autre identifiant.

- `tests/guards/sources.test.ts` : réseau, mutations, données fictives et isolation des couches.
- `tests/manifest.test.ts` : permissions, CSP et ressources exposées.
- `tests/jira/writes.test.ts` : inventaire exhaustif et chemins autorisés.
- Tests transport/modèle : erreurs, conflits, absence de retry, délégation native sans écriture.
- `tests/integration/` : lanceur, hôte, messages et refus avant démarrage.
- `npm run verify:load`, `npm run verify:jira` : profils vierges, pages fictives.
- `npm run package` : contrôle de l'archive (pas de secrets, sources de tests ou source maps).

Un résultat ancien de `npm audit` n'est pas une garantie sur les dépendances actuelles ; relancer
le contrôle lors d'une revue de distribution. Une revue indépendante reste recommandée avant
une diffusion large. Les validations de workflows et de volumes réels sont suivies dans [TODO.md](../TODO.md).
