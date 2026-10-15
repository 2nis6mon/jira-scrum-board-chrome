# Fiche Chrome Web Store — Sprint Goals Board pour Jira

Dossier de publication actualisé le **15 octobre 2026**, pour la version **0.34.9**.
Les textes ci-dessous décrivent le paquet de distribution. Ils ne confirment ni une soumission,
ni une approbation de Google. Mettre à jour l’article existant
[`pepbknjnielcbfcoefcdmadmomapicgp`](https://chromewebstore.google.com/detail/sprint-goals-board-pour-j/pepbknjnielcbfcoefcdmadmomapicgp?hl=fr)
depuis le compte éditeur habituel.

## Fiche du produit à copier

- **Langue principale** : français.
- **Nom** : Sprint Goals Board pour Jira.
- **Résumé** : Boards Scrum et Kanban Jira Cloud : swimlanes par objectif, Build et RUN configurables, glisser-déposer et Daily.
- **Catégorie proposée** : Productivité → Workflow et planification, selon les choix du tableau de bord.
- **Contact d'assistance** : `denis.simon.consulting@gmail.com`.
- **Site du projet** : `https://2nis6mon.github.io/jira-scrum-board-chrome/`, à renseigner après
  sa publication GitHub Pages. Ne pas utiliser l’adresse du dépôt privé dans la fiche publique.
- **Politique de confidentialité** : <https://2nis6mon.github.io/sprint-goals-privacy/>.

**Description** :

```text
Organisez vos boards Scrum et Kanban par objectif, directement dans Jira Cloud.

Sprint Goals Board donne une place centrale aux résultats attendus. Chaque objectif possède sa swimlane et sa progression. Un ticket rattaché à un objectif visible y apparaît en priorité ; les autres rejoignent Build ou une swimlane par type, comme RUN ou OPS.

• Scrum : retrouvez les tickets des sprints actifs et les objectifs issus du texte Sprint Goal ou des Goals Atlassian.
• Kanban : retrouvez les tickets du filtre et du sous-filtre du board, avec leurs Goals Atlassian.
• Gardez visibles les Goals épinglés même sans ticket. Les lignes Build, RUN et OPS vides disparaissent.
• Personnalisez les swimlanes par type : nom, ordre et visibilité. Depuis le groupe Default des réglages, répartissez les types vers leurs swimlanes.
• Déplacez les cartes pour changer leur statut, leur rang ou leur objectif. Lorsqu'un statut propose plusieurs transitions, la première disponible dans l'ordre Jira est utilisée. Les statuts différents restent des choix distincts.
• Ouvrez les fiches et les formulaires de transition natifs Jira, avec leur présentation et leur défilement. Vous gardez la main sur les champs et la validation des formulaires.
• Retrouvez les sous-tâches avec leur parent et filtrez par personne, type, parent, statut ou label, avec recherche et filtres rapides Jira.
• Créez des règles de couleur JQL : suggestions issues de Jira, vérification de la requête et aperçu avant application. La première règle correspondante détermine la couleur.
• Animez la Daily en plein écran, une swimlane à la fois, avec minuteur réglable et cartes déplaçables. Le mode présentation affiche aussi le board agrandi.
• Partagez les réglages du board dans Jira : swimlanes, objectifs, champs et couleurs des cartes, Daily. Leur modification exige le droit de modifier le board ; les préférences personnelles restent locales.

L'extension utilise votre session Jira dans le navigateur. Elle n'a pas de serveur de collecte ni de mesure d'audience. Elle demande l'accès au seul site Jira que vous choisissez ; les modifications métier suivent vos actions et vos droits Jira.

Après installation, autorisez votre site Jira Cloud et ouvrez un board. L'icône de l'extension ou le bouton « Sprint Goals » ouvre la vue intégrée. « Retour à Jira » retrouve le board habituel.

Nécessite Chrome 116 ou supérieur, un compte Jira Cloud connecté et l'accès à un board Scrum ou Kanban sur un domaine *.atlassian.net. Les Goals disponibles dépendent des droits et des fonctions exposées par votre site Atlassian. L'extension ne crée ni sprint ni Goal Atlassian.

Jira et Atlassian sont des marques d'Atlassian. Cette extension n'est ni développée ni approuvée par Atlassian.
```

Sprint Planning reste expérimental et **absent du paquet distribué**. Ne pas le présenter dans
la fiche publique ni dans ses captures. Les swimlanes sont organisées par **type**, pas par JQL ;
la saisie JQL assistée concerne les **couleurs des cartes**.

## Images à téléverser

Dans l'article existant, ouvrir **Store listing → Graphic assets**. Remplacer l'icône et les
anciennes images avec les fichiers ci-dessous ; chaque image se téléverse dans son champ dédié.

Les cinq captures montrent l'interface compilée en mode `package`, dans un banc de démonstration
Jira avec des données fictives, en **1280 × 800, PNG RGB 24 bits opaque**. Elles sont produites
directement par Chrome, sans transparence ni marge ajoutée. Sprint Planning y est désactivé
à la compilation.
Le [manifeste des captures](captures/captures.json) consigne la version, les contrôles et les empreintes des images.
Dans **Screenshots**, téléverser les cinq captures dans cet ordre :

| Fichier dans `docs/store/captures/` | Sujet et légende proposée |
| --- | --- |
| [01-board.png](captures/01-board.png) | Scrum : les objectifs et leur progression au centre du board. |
| [02-kanban.png](captures/02-kanban.png) | Kanban : les Goals et les tickets du board, sans sprint. |
| [03-swimlanes.png](captures/03-swimlanes.png) | Réglages : répartir les types entre Default, RUN et OPS. |
| [04-couleurs.png](captures/04-couleurs.png) | Couleurs des cartes : écrire et vérifier une règle JQL avec l'aide de Jira. |
| [05-daily.png](captures/05-daily.png) | Daily : parcourir les objectifs en plein écran avec l'équipe. |

| Fichier dans `docs/store/` | Champ du tableau de bord | Format |
| --- | --- | --- |
| [icon-128.png](icon-128.png) | **Store icon**, obligatoire | PNG transparent de **128 × 128** ; dessin de **96 × 96**, centré avec **16 px transparents** de chaque côté. |
| [promo-440x280.png](promo-440x280.png) | **Small promo tile**, obligatoire | PNG opaque de **440 × 280**. |
| [promo-1400x560.png](promo-1400x560.png) | **Marquee promo tile**, facultatif | PNG opaque de **1400 × 560**. |

L'icône Store est identique à `public/icons/icon-128.png`, incluse dans le paquet de l'extension.
Le Store accepte une à cinq captures, en 1280 × 800 ou 640 × 400 ; ce dossier fournit les cinq
au format recommandé 1280 × 800. Les promotions sont des compositions dédiées à la marque.
[Formats officiels](https://developer.chrome.com/docs/webstore/images) et
[champs de la fiche](https://developer.chrome.com/docs/webstore/cws-dashboard-listing),
consultés le 15 octobre 2026.

Pour cette livraison, `release/chrome-store-rebranding-0.34.9/` regroupe les huit PNG et
`LIRE-MOI.txt`. L'archive `release/chrome-store-rebranding-0.34.9.zip` facilite leur transfert :
l'extraire pour sélectionner les images dans les champs ci-dessus. Le paquet de l'extension
à téléverser dans **Package** est indiqué dans la procédure ci-dessous.

## Confidentialité et permissions à renseigner

**Objectif unique** : Afficher et utiliser un board Scrum ou Kanban Jira Cloud organisé en
swimlanes par objectif : consulter et filtrer ses tickets, modifier leur statut, leur rang ou
leur rattachement et partager les réglages d'affichage du board.

| Permission | Justification à copier |
| --- | --- |
| `storage` | Conserver sur cet appareil le site et les boards Jira choisis, une copie des réglages, les préférences personnelles, un journal local des modifications et des mesures techniques de chargement. Aucun stockage synchronisé ni serveur de l'éditeur. |
| `activeTab` | Reconnaître l'adresse du board dans l'onglet actif après le clic sur l'icône, afin d'ouvrir la vue dans Jira sans ressaisir cette adresse. Aucun suivi général de navigation. |
| `scripting` | Afficher le bouton Sprint Goals et la vue intégrée sur le site Jira autorisé. Ouvrir les fiches et formulaires natifs Jira et, après un déplacement de carte, sélectionner la transition prévue. Aucun remplissage ni validation automatique de formulaire. |
| `declarativeNetRequestWithHostAccess` | Adapter l'en-tête Origin des seuls POST dont l'initiateur est cette extension vers l'URL exacte `https://<site autorisé>/gateway/api/graphql`. Cette règle de session permet les échanges Goals Atlassian ; elle ne modifie pas les requêtes des pages web ni celles des autres sites. |
| Hôte facultatif `https://*.atlassian.net/*` | Lire le board, les tickets et les Goals et effectuer les modifications demandées via les API du site Jira Cloud choisi. Aucun site n'est accordé à l'installation ; Chrome demande l'accès à `https://<site choisi>.atlassian.net/*` à la connexion. La déconnexion retire cet accès. |

**Code distant — réponse proposée : Non.** Le code de l'extension est inclus dans le ZIP et sa
CSP impose `script-src 'self'`. Les fiches et formulaires natifs s'ouvrent comme pages Jira dans
un cadre de la page Jira hôte : leur code et leurs ressources sont fournis par Jira et ses apps,
pas exécutés comme du code téléchargé dans le contexte de l'extension.

**Données traitées — déclaration proposée d'après le code** :

| Catégorie du Store | Traitement à déclarer |
| --- | --- |
| Informations personnelles | Nom affiché et identifiant du compte connecté, des personnes assignées et de l'auteur des derniers réglages partagés. |
| Contenu du site Web | Tickets, objectifs, champs affichés, réglages, requêtes JQL et suggestions Jira. La validation et les suggestions envoient la saisie au site Jira pendant l'édition ; seules les règles appliquées sont enregistrées comme réglages partagés. |
| Historique Web | Accès ponctuel à l'URL de l'onglet actif pour reconnaître Jira ; conservation locale des adresses des boards choisis. Aucun historique général des sites visités. |
| Activité de l'utilisateur | Journal local des modifications réalisées depuis l'extension et mesures locales de chargement. Aucun suivi général des clics, frappes ou déplacements de souris ; aucun envoi automatique à l'éditeur. |

L'extension ne demande ni ne lit de mot de passe, jeton ou valeur de cookie. Le navigateur joint
la session Jira aux requêtes autorisées ; l'extension ne stocke pas ces secrets. Elle ne recherche
pas de données de santé, de paiement, de localisation ou de communications personnelles ; les
champs métier choisis restent du contenu Jira.

Les déclarations s'appliquent aussi au traitement local. Comparer ces choix aux définitions du
formulaire lors de la soumission et à la politique publique : ne pas déclarer « aucune donnée ».
[Confidentialité du tableau de bord](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy)
et [FAQ sur les données, y compris le stockage local](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq),
consultées le 14 octobre 2026.

**Attestations à relire et à confirmer par l'éditeur dans le Store** — aucune case n'a été
soumise par la préparation de ce dossier :

- Absence de vente ou de transfert de données en dehors des usages autorisés.
- Utilisation limitée à l'objectif déclaré de l'extension.
- Absence d'utilisation pour l'évaluation de solvabilité ou le prêt.

Les données et réglages enregistrés dans Jira restent accessibles aux personnes autorisées
dans Jira. Une fiche native conserve les traitements du site Jira et de ses apps. Un rapport
transmis volontairement à l'assistance peut être lu pour traiter la demande.

## Instructions pour l'équipe de revue

Préparer un **site Jira Cloud de test**, des données fictives et un compte de test ayant accès
aux boards Scrum et Kanban. Les réglages nécessitent le droit de modifier le board ; les
déplacements nécessitent les droits Jira correspondants. Prévoir des Goals accessibles, un
sprint actif, quelques tickets et une transition avec formulaire. Fournir l'adresse du site,
les deux boards et le moyen de connexion **uniquement dans l'onglet privé Test instructions**,
jamais dans ce dépôt ou la description publique. Les coordonnées réelles de cet environnement
restent à compléter par l'éditeur ; aucune n'est inventée ici.
[Onglet officiel Test instructions](https://developer.chrome.com/docs/webstore/cws-dashboard-test-instructions).

Texte de parcours à copier, après avoir renseigné l'environnement dans cet onglet :

```text
1. Connectez-vous au site Jira Cloud de test avec le compte fourni. L'extension réutilise la session Jira ; elle ne demande aucun jeton API.
2. Installez le paquet soumis. Dans l'écran de bienvenue, autorisez le site Jira de test, puis ouvrez le board Scrum fourni.
3. Cliquez sur « Sprint Goals » dans Jira ou sur l'icône de l'extension. La vue s'affiche dans la page Jira. L'ouverture directe de board.html hors de Jira est volontairement refusée.
4. Vérifiez les objectifs, les tickets, la recherche et les filtres. Cliquez sur un ticket : sa fiche Jira native s'ouvre. Fermez-la pour revenir au board actualisé.
5. Déplacez un ticket de test vers une autre colonne. Sans formulaire, la transition est appliquée avec les droits du compte. Si Jira exige un formulaire, remplissez-le et validez-le vous-même ; l'extension ne le fait pas.
6. Dans le menu du nom du board, ouvrez « Réglages de ce board ». Vérifiez les swimlanes par type. Dans « Couleurs des cartes », saisissez une règle JQL, utilisez ses suggestions et sa validation, examinez l'aperçu puis appliquez une règle valide.
7. Revenez au board et lancez « Daily » en haut à droite. Parcourez les swimlanes, puis terminez la Daily.
8. Ouvrez le board Kanban fourni et contrôlez la vue des tickets et des Goals sans sprint. « Retour à Jira » retrouve le board natif.
9. Sprint Planning est désactivé dans le paquet distribué : aucun lien ni réglage ne l'active.
```

## Première publication ou mise à jour

1. Préparer et vérifier la livraison avec le [guide développeur](../../DEVELOPER.md), puis
   `npm run package`. Téléverser **`release/sprint-goals-board-0.34.9.zip`** ; ne jamais zipper
   `dist/`, qui active Sprint Planning. Le script construit en mode `package` et retire le champ
   public `key`. Le ZIP doit contenir `manifest.json` à sa racine.
2. Vérifier que la politique publique correspond à [la version locale](../privacy/index.html).
   Le 14 octobre 2026, sa lecture distante n'a pas pu être vérifiée depuis l'environnement de
   préparation. La mise à jour du fichier local ne publie pas le site GitHub Pages : contrôler
   l'URL publique et y déployer la politique corrigée avant la soumission si nécessaire.
3. Pour une **première publication**, ouvrir le tableau de bord développeur Chrome avec le
   compte éditeur, créer un nouvel article et téléverser le ZIP. Compléter fiche, images,
   confidentialité, instructions de test et distribution.
   [Procédure officielle](https://developer.chrome.com/docs/webstore/publish).
4. Pour une **mise à jour**, ouvrir l'article existant, puis **Package → Upload New Package**.
   Sa version doit être supérieure à celle déjà publiée. Remplacer les anciens textes et images,
   vérifier les déclarations puis soumettre la mise à jour à la revue.
   [Procédure officielle de mise à jour](https://developer.chrome.com/docs/webstore/update).
5. Distribution proposée : **Public**, gratuit, régions choisies par l'éditeur. Contrôler les
   champs requis du tableau de bord, puis soumettre. Choisir une publication automatique après
   approbation ou différée selon le calendrier voulu. Une soumission n'est pas une publication.

Le Store attribue l'identifiant de l'article. Une installation Store et une installation locale
peuvent avoir des identifiants différents : reconnecter Jira si nécessaire. Les réglages
partagés sont relus depuis Jira ; les préférences locales ne migrent pas entre identifiants.
