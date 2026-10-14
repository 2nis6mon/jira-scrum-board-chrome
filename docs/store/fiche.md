# Fiche Chrome Web Store — Sprint Goals Board pour Jira

Textes à copier dans le tableau de bord développeur. Paquet :
`release/sprint-goals-board-<version>.zip`, produit par `npm run package`, sans le champ `key`.
Cette fiche prépare une soumission ; elle ne confirme aucune publication.
Le paquet désactive Sprint Planning, réservé aux essais locaux depuis `dist/`.

## Fiche du produit

- **Langue principale** : français.
- **Nom** : Sprint Goals Board pour Jira.
- **Résumé** : Boards Scrum et Kanban Jira Cloud : swimlanes par objectif, Build et RUN configurables, glisser-déposer et Daily.
- **Catégorie** : Productivité → Workflow et planification.

**Description** :

```text
Retrouvez vos tickets Scrum et Kanban par objectif, directement dans leur page Jira Cloud.

Sprint Goals Board affiche une swimlane par objectif, Build pour les tickets sans objectif et des groupes par type, comme RUN ou OPS. En Scrum, les tickets viennent des sprints actifs ; en Kanban, du board et de son sous-filtre.

• Suivez l'avancement des objectifs et épinglez des Goals même sans ticket : au sprint en Scrum, au board en Kanban.
• Déplacez les cartes pour changer statut, rang ou objectif. Les fiches et formulaires de transition restent ceux de Jira.
• Retrouvez les sous-tâches avec leur story, les blocages et les compteurs du sprint.
• Filtrez par personne, type, parent, statut ou label, avec recherche et filtres rapides Jira.
• Animez la Daily en plein écran, une swimlane à la fois, avec minuteur réglable et cartes déplaçables.
• Projetez le board agrandi en mode présentation.
• Réglez le board en glissant-déposant : ordre et noms des swimlanes, groupes de types, couleurs, champs des cartes et Daily, partagés avec l'équipe. Les modifications sont enregistrées dans Jira et réservées aux personnes qui peuvent modifier le board.

L'extension utilise votre session Jira, directement depuis le navigateur. Aucun serveur de l'éditeur ni mesure d'audience. L'accès est demandé pour le seul site choisi ; les écritures suivent vos actions.

À l'installation, autorisez votre site Jira. Sur son board, l'icône de l'extension ou le bouton « Sprint Goals » ouvre la vue intégrée. « Retour à Jira » retrouve le board habituel.

Compatible avec les boards Scrum et Kanban de Jira Cloud (*.atlassian.net). Goals Atlassian dans les deux modes ; lecture du texte du Sprint Goal en Scrum uniquement.

Jira et Atlassian sont des marques d'Atlassian. Cette extension n'est ni développée ni approuvée par Atlassian.
```

- **Icône** : `public/icons/icon-128.png`.
- **Captures** : `docs/store/captures/*.png`, 1280 × 800, données fictives : board, famille,
  objectifs, Daily, présentation. Captures existantes issues de Scrum 0.22.7 ; actualisables par
  `npm run store:screenshots`.
- **Assistance — contact** : `denis.simon.consulting@gmail.com`.

## Confidentialité et permissions

**Objectif unique** : Afficher les tickets d'un board Scrum ou Kanban Jira Cloud en swimlanes
par objectif et permettre de modifier leur statut, leur rang et leur objectif depuis ce board.

**`storage`** : Conserver localement le site Jira, les boards et leurs réglages d'affichage,
les préférences personnelles, le journal des écritures et des mesures techniques de chargement.
Ce stockage n'est pas synchronisé vers un service de l'éditeur.

**`declarativeNetRequestWithHostAccess`** : Adapter l'en-tête Origin des seuls POST émis par
l'extension vers l'URL exacte `https://<site autorisé>/gateway/api/graphql`, pour éviter le refus
CORS de la passerelle Goals Atlassian. La règle de session limite l'initiateur à l'identifiant
de l'extension ; elle ne touche ni les requêtes des pages web ni les autres sites. Le diagnostic
choisit le retrait de l'en-tête ou son remplacement par l'origine du site.

**Hôte facultatif — `https://*.atlassian.net/*`** : Lire et mettre à jour le board via les API
REST et GraphQL de son site Jira Cloud. Aucun site n'est autorisé à l'installation ; Chrome
demande l'accès au seul site choisi (`https://son-site.atlassian.net/*`). La déconnexion le retire.

**`activeTab`** : Lire l'adresse de l'onglet lors du clic sur l'icône pour reconnaître le board
Jira et éviter sa saisie. Ce droit n'injecte aucun script ; l'accès au site est demandé séparément.

**`scripting`** : Afficher le bouton Sprint Goals sur les boards autorisés et installer la vue
intégrée quand l'URL contient `sprintGoals=1`. Le script ouvre aussi les fiches et formulaires
natifs Jira, sans les remplir ni les valider. La vue refuse de démarrer hors du parent Jira autorisé.

**Code distant** : Non. Tout le code est inclus dans le paquet ; `script-src 'self'` interdit
les scripts extérieurs.

**Utilisation des données — catégories à déclarer** :

- ☑ Informations personnelles : noms affichés et identifiants Jira du compte connecté,
  des personnes assignées et de l'auteur des réglages partagés.
- ☑ Contenu du site Web : tickets Jira, résumés, statuts et champs affichés.
- ☐ Autres catégories : santé, finances, authentification, communications personnelles,
  localisation, historique Web et activité de l'utilisateur.

**Certifications** :

- ☑ Je ne vends ni ne transfère les données des utilisateurs à des tiers, en dehors des cas d'utilisation approuvés.
- ☑ Je n'utilise ni ne transfère les données des utilisateurs à des fins sans rapport avec l'objectif unique de mon article.
- ☑ Je n'utilise ni ne transfère les données des utilisateurs pour déterminer leur solvabilité ou à des fins de prêt.

**URL de confidentialité** : <https://2nis6mon.github.io/sprint-goals-privacy/>.

## Distribution et mises à jour

Choix de distribution : **Public**, gratuit, toutes régions sauf restriction souhaitée.
Pour soumettre une mise à jour, suivre la livraison du [guide développeur](../../DEVELOPER.md),
puis envoyer le nouveau ZIP dans l'onglet du paquet du Store.

L'identifiant Store diffère de celui du paquet de développement : il faut reconnecter le site.
Les préférences locales ne suivent pas ; les réglages partagés reviennent depuis Jira.
