# Fiche Chrome Web Store — Sprint Goals Board pour Jira

Textes prêts à coller dans le tableau de bord développeur du Chrome Web Store, onglet par onglet.
Paquet à envoyer : `release/sprint-goals-board-<version>.zip`, produit par `npm run package`
(paquet autonome, sans le champ `key`, sans les droits du prototype d'ouverture dans Jira).

## Onglet « Fiche Play Store » (Store listing)

**Langue principale** : français.

**Nom** (repris du manifest) : Sprint Goals Board pour Jira

**Résumé** (repris du manifest, 132 caractères au plus) :

> Boards Scrum et Kanban Jira Cloud : swimlanes par objectif, Build et RUN configurables, glisser-déposer et Daily.

**Catégorie** : Productivité → Workflow et planification.

**Description** :

```
Voyez vos boards Scrum et Kanban Jira par objectif.

Sprint Goals Board pour Jira affiche les tickets de votre board Scrum ou Kanban Jira Cloud en swimlanes par objectif. En Scrum, le périmètre est celui des sprints actifs ; en Kanban, celui du board et de son sous-filtre. Chaque ticket rejoint automatiquement la swimlane de son objectif ; ceux qui n'en ont pas restent dans « Build », les autres (support, anomalies de production, demandes…) dans des swimlanes par type de ticket, que vous composez et nommez comme vous voulez.

POUR L'ÉQUIPE
• Une swimlane par objectif, avec son avancement, et l'objectif en vert quand tous ses tickets sont terminés.
• Glisser-déposer : changez le statut d'un ticket, son ordre ou son objectif en le déplaçant. Les formulaires de transition de Jira (commentaire, temps passé, story points…) s'ouvrent quand il le faut.
• Sous-tâches rangées avec leur story ; survolez une story pour voir toute sa famille.
• Compteurs du sprint : points terminés, Goals atteints, tickets bloqués ou ajoutés en cours de sprint.
• Goals épinglés au sprint : un objectif a sa swimlane avant même d'avoir des tickets.
• Filtres : personne, type, parent, statut, label, recherche, filtres rapides de votre board Jira.

POUR LA DAILY ET LES REVUES
• Mode Daily, bouton « ▶ Daily » : plein écran, une swimlane à la fois, Précédent / Suivant, minuteur réglable. Dans chaque swimlane, la colonne de départ est plafonnée aux premières cartes, dépliable d'un clic. Les tickets restent déplaçables pour faire les mises à jour en direct.
• Mode présentation : plein écran, board agrandi, lisible à distance.

UN MÊME BOARD POUR TOUTE L'ÉQUIPE
• Ordre et couleurs des swimlanes, colonnes, champs des cartes, règles de couleur en JQL, durée de la daily.
• Enregistrés automatiquement dans une propriété de votre board Jira, et repris à chaque chargement : toute l'équipe voit le même board.
• Seules les personnes qui peuvent modifier le board dans Jira peuvent changer ces réglages.

CONFIDENTIALITÉ
• L'extension parle directement à votre Jira, depuis votre navigateur, avec votre propre session.
• Aucun serveur de l'éditeur, aucune mesure d'audience, aucune donnée transmise à un tiers.
• Accès demandé uniquement pour le site Jira que vous choisissez, au moment de la connexion.
• Rien n'est écrit dans Jira sans un geste de votre part.

Pour Jira Cloud (*.atlassian.net), boards Scrum et Kanban. Goals Atlassian dans les deux modes, texte du Sprint Goal en Scrum uniquement.

Jira et Atlassian sont des marques d'Atlassian. Cette extension n'est ni développée ni approuvée par Atlassian.
```

**Icône** : `public/icons/icon-128.png` (déjà dans le paquet).

**Captures d'écran** : `docs/store/captures/*.png` (1280 × 800, données fictives du banc d'essai),
régénérées par `npm run store:screenshots` : board, famille d'une story, objectifs du sprint dans
l'administration, Daily, présentation.

**Site web / assistance** : l'adresse de contact `denis.simon.consulting@gmail.com`.

## Onglet « Confidentialité » (Privacy practices)

**Objectif unique** (Single purpose) :

```
Afficher les tickets d'un board Scrum ou Kanban Jira Cloud en swimlanes par objectif, et permettre à l'utilisateur de le mettre à jour (statut, ordre, objectif des tickets) depuis ce board.
```

**Justification de `storage`** :

```
Garder dans le navigateur de l'utilisateur l'adresse de son site Jira, les boards qu'il a ajoutés et leurs réglages d'affichage (ordre et couleurs des swimlanes, colonnes, champs des cartes), ainsi qu'un journal local des écritures faites dans Jira. Rien n'est synchronisé ni transmis ailleurs.
```

**Justification de `declarativeNetRequestWithHostAccess`** :

```
Une seule règle de session : pour les requêtes POST émises par l'extension elle-même (initiatorDomains limité à son identifiant) vers l'adresse exacte https://<site de l'utilisateur>/gateway/api/graphql, l'en-tête Origin est retiré ou remplacé par l'adresse du site (variante retenue par le diagnostic de l'extension). Sans cela, la passerelle GraphQL d'Atlassian refuse les requêtes de l'extension (403 « Invalid CORS request ») et les Goals Atlassian du sprint ne peuvent pas être lus. La règle ne touche aucune requête de page web ni aucun autre site.
```

**Justification de l'autorisation d'hôte** (`optional_host_permissions: https://*.atlassian.net/*`) :

```
L'extension lit et met à jour le board Jira Cloud de l'utilisateur par l'API REST de Jira et la passerelle GraphQL de son site. L'accès est optionnel : aucun site n'est autorisé à l'installation ; l'utilisateur saisit l'adresse de son site Jira et Chrome lui demande l'accès à CE seul site (https://son-site.atlassian.net/*). L'accès est rendu à la déconnexion.
```

**Code distant** : Non, je n'utilise pas de code distant. Tout le code est dans le paquet ; la
politique de sécurité (`script-src 'self'`) interdit tout script extérieur.

**Utilisation des données** — cases à cocher (données que l'extension manipule) :

- ☑ Informations permettant d'identifier personnellement l'utilisateur : nom affiché et
  identifiant de compte Jira (utilisateur connecté, personnes assignées, auteur de la dernière
  modification des réglages du board).
- ☑ Contenu du site Web : contenu des tickets Jira (résumés, statuts, champs affichés).
- ☐ Toutes les autres catégories (santé, finances, authentification, communications personnelles,
  localisation, historique Web, activité de l'utilisateur).

Les trois certifications à cocher :

- ☑ Je ne vends ni ne transfère les données des utilisateurs à des tiers, en dehors des cas d'utilisation approuvés.
- ☑ Je n'utilise ni ne transfère les données des utilisateurs à des fins sans rapport avec l'objectif unique de mon article.
- ☑ Je n'utilise ni ne transfère les données des utilisateurs pour déterminer leur solvabilité ou à des fins de prêt.

**Règles de confidentialité (URL)** : https://2nis6mon.github.io/sprint-goals-privacy/

## Onglet « Distribution »

- Visibilité : **Public**.
- Régions : toutes (ou à restreindre selon votre choix).
- Prix : gratuit.

## Après la publication

- L'identifiant du Store diffère de celui du paquet de développement : c'est une autre extension.
  Il faut s'y reconnecter ; les préférences locales ne suivent pas, les réglages du board,
  enregistrés dans Jira, reviennent d'eux-mêmes.
- Mise à jour : augmenter la version (`package.json` et `public/manifest.json`), `npm run package`,
  envoyer le nouveau zip dans l'onglet « Package ».
