# Sprint Goals Board pour Jira — extension Chrome

**Le board Scrum que Jira n'offre pas : une swimlane par Sprint Goal, créée automatiquement.**
Le board Jira range les tickets par colonne, sans montrer à quel objectif du sprint chacun
contribue. Ici, chaque Sprint Goal devient sa propre swimlane, avec ses tickets et son
avancement, dès l'ouverture du board — sans rien configurer. Les tickets sans objectif restent
visibles dans *Build*, le RUN à part. Jira reste la source de vérité.

Un Goal dont tous les tickets des sprints actifs sont dans la dernière colonne visible du
board reçoit une coche, une bordure et un fond verts. Dans la barre latérale, sa ligne devient
verte avec un trait vertical à gauche, sans coche ni barre d’avancement. Les filtres ne changent pas ce calcul ; un Goal vide n’est pas atteint.
Le vert est réservé à cet indicateur : la palette propose neuf couleurs, dont le bleu ardoise,
le rose et l’ambre. Les anciens choix vert et sarcelle deviennent respectivement ardoise et rose.
Ce repère disparaît si un ticket quitte la dernière colonne et ne modifie aucun statut Atlassian.

Pendant le défilement du board, l’en-tête du sprint, les filtres et les noms des colonnes restent
visibles. Le bandeau d’un Goal reste sous les colonnes jusqu’à la fin de sa swimlane, puis le Goal
suivant le pousse et prend sa place.

L’en-tête indique le nombre de Goals atteints sur le nombre de Goals visibles. Les bandeaux des
swimlanes restent concentrés sur leur titre, le nombre de tickets et leur progression : épinglage,
statut Atlassian et lien d’ouverture ne sont plus affichés à cet endroit.

Les bandeaux des swimlanes couvrent toutes les colonnes, même lorsque le board défile
horizontalement. Si un ticket nouvellement lu introduit un Goal encore inconnu du board, ce Goal
est ajouté dans « Goals masqués » et le ticket reste dans Build. Le Goal peut ensuite être
réaffiché depuis cette section, sans modifier son rattachement dans Jira.

**Compatible uniquement avec les boards Scrum Jira. Les boards Kanban ne sont pas pris en charge.**

Version Chrome de l'app macOS « Scrum Board », projet distinct dont il reprend la spécification
([`docs/reference-app-mac/PROMPT.md`](docs/reference-app-mac/PROMPT.md)).

> **État : 0.19.15 (paquet autonome) et 0.19.15.2 (prototype d'ouverture directe dans Jira, voir
> plus bas).** Point d'entrée pour reprendre le projet : [`DEVELOPER.md`](DEVELOPER.md). Étape 6 :
> santé du sprint (6a), plusieurs boards (6b), audit de sécurité (6d,
> [`docs/SECURITY-AUDIT.md`](docs/SECURITY-AUDIT.md)), empaquetage (6e) à venir. Board du
> sprint actif organisé par Goals Atlassian (lus par l'API GraphQL), Build et RUN ; filtres, recherche et filtres rapides
> du board Jira ; glisser-déposer qui écrit dans Jira : transition, rang, et lien natif
> ticket↔Goal ; épinglage de Goals au sprint, gardé dans le navigateur si Jira le refuse ; ordre,
> repli, couleur et masquage des swimlanes ; barre latérale (board, vue Sprint, swimlanes, administration) ;
> administration (colonnes, types, affichage, rafraîchissement automatique,
> source des objectifs, champs et couleurs des cartes, diagnostic, déconnexion). Repli
> automatique et expliqué sur le texte du sprint si les Goals ne répondent pas.

## Installer l'extension (mode développeur)

```bash
npm ci
```

```bash
npm run build
```

Puis dans Chrome : `chrome://extensions` → activer **Mode développeur** → **Charger l'extension
non empaquetée** → choisir le dossier `dist/`. Un clic sur l'icône de l'extension ouvre le board
dans un onglet (ou y revient s'il est déjà ouvert).

Après une reconstruction, cliquer sur la flèche de rechargement de la carte de l'extension.

L'icône est celle de l'app Mac (`public/icons/`, tirée de `ScrumBoard.iconset` en 16, 32, 48,
64 et 128 px).

L'identifiant de l'extension est figé (`efhpkdoiimdggndnfcgdoaniobdcmokb`) par le champ `key` du
manifest : déplacer le dossier ne fait pas perdre les réglages locaux.

## Ce que l'extension a le droit de faire

| | |
|---|---|
| À l'installation | `storage` et `declarativeNetRequestWithHostAccess`. **Aucun accès à aucun site.** |
| Règle d'en-tête | Une seule règle de session : retire (ou remplace par l'adresse du site) l'en-tête `Origin` des **seules requêtes de l'extension**, en POST, vers l'adresse exacte `https://<site>/gateway/api/graphql`. Posée à la connexion, retirée à la déconnexion. Les pages web ne sont pas touchées. |
| À la connexion | Chrome demande l'accès à **un seul** site `https://….atlassian.net`, celui que vous saisissez. « Se déconnecter » rend cet accès. |
| Authentification | La session Jira déjà ouverte dans Chrome. L'extension ne demande et ne voit ni mot de passe ni jeton. |
| Politique de sécurité | Scripts de l'extension uniquement ; connexions limitées à `*.atlassian.net` ; aucune image ni style distant |
| Absents | Scripts injectés dans les pages, permissions `cookies`, `tabs`, `scripting`, `webRequest`, règles `declarativeNetRequest` statiques |

Ces droits sont verrouillés par [`tests/manifest.test.ts`](tests/manifest.test.ts). L'audit de
sécurité de l'extension (0.14.1, lot 6d) est dans [`docs/SECURITY-AUDIT.md`](docs/SECURITY-AUDIT.md) :
inventaire des écritures, fuites possibles, constats et correctifs.

## Utiliser

1. Clic sur l'icône de l'extension : le board s'ouvre dans un onglet.
2. Saisir l'adresse du site (`societe.atlassian.net`) et accepter la demande d'accès de Chrome.
   Il faut être connecté à Jira dans un onglet de ce navigateur.
3. Saisir tout ou partie du nom du board Scrum et sélectionner un des cinq premiers résultats accessibles.

Le board affiche les tickets des **sprints actifs**, regroupés par objectif, puis *Build*
(tickets sans objectif) et *RUN* (types classés RUN, présents dans le sprint). Un clic sur une
carte ouvre le ticket dans Jira, dans un nouvel onglet. La flèche ronde de l'en-tête relit Jira.

- **Barre latérale** (reprise de l'app Mac) : le board affiché et son menu — les boards
  enregistrés pour ce site (un clic bascule de l'un à l'autre, chacun avec ses réglages), l'ajout
  d'un board par son nom, l'ouverture dans Jira, la relecture des colonnes et types,
  l'épinglage de Goals, et le retrait d'un board (après confirmation ; ses réglages dans ce
  navigateur sont effacés, rien dans Jira). Le dernier board affiché revient à l'ouverture ; la vue
  *Sprint* (les swimlanes, et la santé du sprint dans un panneau) ; les swimlanes dans l'ordre du
  board, avec leur avancement — un clic y mène (en la dépliant), un glissé les réordonne, sur le
  board comme dans la barre ; et *Administration* en pied de barre. Son bouton déplie ses sections
  au-dessus de lui, dans la barre (réglages du board, Diagnostic, site et déconnexion) ; un second
  clic, ou le choix d'une autre entrée, les replie et ramène au sprint (0.19.12). Le bouton en haut à gauche
  de l'en-tête masque la barre. Sa bordure droite se tire (curseur ↔) pour l'élargir ou la
  rétrécir, de 200 px à la moitié de la fenêtre ; flèches du clavier quand elle a le focus,
  double-clic pour revenir à la largeur par défaut. La largeur est gardée dans ce navigateur.
- **Mode présentation** (0.15.0) : le bouton à icône de chevalet, au bout de l'en-tête, masque la
  barre latérale, l'en-tête et le panneau Santé ; restent les filtres et le board, agrandis d'un
  quart pour être lisibles à distance (0.15.1 ; les colonnes s'élargissent d'autant, le board
  défile donc horizontalement plus tôt). Une bulle
  « Échap pour revenir » flotte cinq secondes en bas de l'écran ; le bouton *Quitter*, au bout de
  la barre de filtres, reste toujours affiché. Échap referme d'abord un menu ou une fenêtre
  ouverts, et efface d'abord une recherche remplie. Le mode n'est pas gardé : une réouverture
  repart en mode normal, la barre latérale dans l'état où on l'avait laissée.
- **Santé du sprint** (0.11.0, portée de Sprint Health du Mac ; panneau depuis 0.14.0) : le bouton
  à icône (tracé de pouls) de l'en-tête, à côté de la flèche ronde, déplie ou replie un panneau
  entre les filtres et les swimlanes ; l'état du panneau est gardé dans ce navigateur. Des
  comptages directs sur les tickets lus dans Jira,
  filtres de la barre appliqués, sans score ni projection. Indicateurs (story points livrés,
  tickets terminés, bloqués, périmètre ajouté), avancement par objectif, changement de périmètre
  (tickets entrés après le démarrage, si Jira fournit l'historique), charge par colonne avec les
  limites WIP (charge réelle, filtres ignorés), composition du sprint, tickets à surveiller
  (bloqués ou sans changement de statut au-delà du seuil ; la clé ouvre Jira). Lecture seule.
- **Œil d'un objectif** (barre latérale) : ouvert, il se ferme au survol, et un clic masque
  l'objectif du board (ses tickets passent dans *Build*) ; l'objectif passe alors dans *Masqués du
  board*, œil fermé, qui s'ouvre au survol et le réaffiche d'un clic. Réglage de ce navigateur.

**Glisser-déposer (0.16.0)** :

- **Même colonne** : le statut ne change jamais. Seuls l'objectif et le rang peuvent changer.
- **Autre colonne** : pendant le glissé, les statuts accessibles apparaissent comme des zones
  de dépôt. Choisir le statut en déposant la carte dans sa zone. Une colonne inaccessible est
  grisée et refuse le dépôt ; une lecture en cours ou en échec est indiquée séparément.
- **Plusieurs transitions vers le statut choisi** : une fenêtre demande quelle action effectuer.
  Annuler ne modifie ni le statut, ni l'objectif, ni le rang.
- **Écran de transition ou champs obligatoires** : indication « À compléter dans Jira », puis
  message avec accès au ticket ; aucune partie du déplacement n'est écrite dans ce cas.
- **Rang** : dans la même colonne, classement devant une carte ou en fin de case comme auparavant.
  Dans une autre colonne, une position près du bord supérieur d'une carte affiche la ligne
  d'insertion ; sinon, déposer dans une zone de statut conserve le rang global.

Le statut et les transitions sont relus avant l'écriture, y compris après le choix dans la
fenêtre. Un conflit ou une destination devenue inaccessible arrête le déplacement.
Les opérations sont exécutées dans cet ordre : **transition → objectif → rang**.
Le Goal Atlassian est détaché puis rattaché par ses liens natifs ; en mode texte, l'association
est écrite dans la propriété du sprint partagée avec l'app Mac.

Chaque écriture attend la confirmation de Jira avant la suivante ; la carte ne bouge qu'à la
relecture du board. Une réussite partielle est signalée, sans retour arrière automatique.
Aucune écriture incertaine n'est rejouée. Chaque tentative est notée dans le **journal**
(*Administration → Diagnostic*).

- **Cartes** : type, clé (toujours sur une ligne ; carte plus compacte en colonne étroite, « … »
  en dernier recours, clé entière au survol), drapeau Jira et priorité à droite, résumé sur deux
  lignes au plus (en entier au survol). Le parent est un badge à son titre,
  d'une couleur propre à ce parent : tous ses tickets la partagent, deux parents ne l'ont jamais
  en commun (0.9.1). Les champs choisis dans les réglages sont des badges, un par valeur, le nom
  du champ au survol. Le statut n'est pas écrit : la colonne le dit. Dernière ligne (0.10.4) :
  les alertes en pastilles à icône — bloqué (détail au survol), bugs liés (nombre), ajouté en
  cours de sprint, jours sans changement de statut au-delà du seuil —, puis story points et
  initiales de l'assigné, toujours à droite. Les icônes de type et de priorité
  sont téléchargées depuis le site avec la session ; les avatars ne le sont pas (ils sont
  hébergés hors du site) : on affiche les initiales.
- **En-tête** : sprint (badge *actif*), dates, jours restants, avancement en story points (en
  tickets si le board n'estime pas) et pourcentage, compteurs *bloqués* et *ajoutés* (cliquables :
  ils filtrent) et *dans Build* (mène au bloc), heure de la dernière lecture de Jira.
- **Filtres**, chacun avec son icône : recherche (clé, résumé, personne, type, label, parent),
  *Bloqués*, *Ajoutés*, filtres rapides Jira, puis menus Personne, Type, Parent, Statut, Label
  (Priorité, Objectif et Composant retirés en 0.14.2, à la demande de Denis). Un clic sur le titre
  d'un objectif n'affiche que lui ; un second clic rétablit tout.
- **Filtres rapides Jira** : ceux définis sur le board Jira, en boutons (leur JQL au survol).
  Jira évalue lui-même leur JQL, restreint aux sprints actifs ; plusieurs filtres actifs se
  combinent, comme dans Jira. Un JQL que Jira refuse désactive les filtres rapides, et le bandeau
  le dit. Lecture seule.
- **Colonnes** : celles du board Jira, avec leur limite WIP (en rouge au-delà, filtres ou non).
  Elles se partagent la largeur, sans descendre sous 170 px (150 sur le Mac) : en dessous, le
  board défile horizontalement.
- **Swimlanes** : la poignée (⠿) à gauche de l'en-tête se glisse pour placer la swimlane
  (objectif, Build ou RUN) où l'on veut ; la flèche replie ou déplie ; le menu *⋯* la monte ou la
  descend (alternative au clavier), replie ou déplie tout, change la couleur d'un objectif ou le masque (ses
  tickets passent dans *Build* ; la barre latérale permet de le réafficher). Ces réglages restent
  dans ce navigateur et ne changent rien dans Jira.
- **Épingler des Goals au sprint** (menu du board, dans la barre latérale) : choisir, parmi les Goals du site, ceux qui
  s'affichent même sans ticket rattaché. La sélection se compose dans la fenêtre (filtre local,
  sans requête pendant la frappe) et n'est écrite qu'au clic sur *Enregistrer dans Jira*.
- **Administration** (pied de la barre latérale). Réglages de ce navigateur et de ce board ; seule
  leur part d'équipe peut être publiée dans Jira (voir *Réglages d'équipe*) :
  - *Réglages d'équipe* (0.13.0) : colonnes, types, labels de blocage, nom de Build, seuil de
    vieillissement, source des objectifs et Goals du board, couleurs des objectifs, ordre des
    swimlanes, objectifs masqués, champs et règles de couleur des cartes, partagés avec l'équipe
    par une propriété du board dans Jira. *Publier pour l'équipe…* les écrit, après confirmation
    (il faut pouvoir modifier le board dans Jira). Chacun les reçoit à l'actualisation suivante :
    appliqués d'office s'il n'a rien modifié de son côté (ou s'il vient d'ajouter le board),
    proposés sinon (*Appliquer* / *Garder les miens*). Le contenu publié est affiché tel que relu
    dans Jira. Les réglages personnels (swimlanes repliées, filtres, rafraîchissement, largeur de
    la barre) ne sont jamais publiés.
  - *Board* : colonnes Scrum et RUN (affichées, nom, limite WIP), types de tickets (Scrum, RUN,
    ignoré ; « bug »), section RUN, nom du bloc Build, seuil « vieillissant », labels de blocage,
    rafraîchissement automatique (1, 2 ou 5 min, lecture seule, suspendu pendant un geste),
    réinitialisation de l'ordre des swimlanes. Chaque modification est enregistrée aussitôt : une
    case ou une liste dès qu'on la change, un champ texte quand on le valide (Entrée ou sortie du
    champ) ; une saisie refusée reste affichée avec son message, Échap revient à la valeur
    enregistrée. Classement des types, bugs et labels de blocage font relire le board dans Jira.
  - *Objectifs* : source (Goals Atlassian ou texte du sprint), Goals associés au board, accès à
    l'épinglage, couleur et visibilité de chaque objectif.
  - *Champs des cartes* : jusqu'à trois champs sous le titre (versions, labels, composants, ou
    champ personnalisé cherché parmi ceux de votre Jira).
  - *Couleurs des cartes* : des règles « un JQL, une couleur de fond », par ordre de priorité, et
    la règle intégrée « Ajouté en cours de sprint ». Jira évalue chaque JQL à chaque actualisation,
    restreint aux sprints actifs ; un JQL refusé est signalé sous sa règle, sans bloquer les
    autres. Lecture seule.
  Puis *Diagnostic* : ce que Jira répond réellement aux requêtes de l'extension ; et
  *Se déconnecter*, qui rend l'accès au site à Chrome et oublie ses boards et réglages.

## Objectifs

- **Goals Atlassian** (par défaut) : les objectifs d'un sprint sont déduits de ses tickets — Goals
  qui listent ces tickets (`workItems`), complétés par le champ « Goals » des tickets — plus les
  Goals **épinglés** au sprint, affichés en premier, dans l'ordre d'épinglage. Statut déclaré
  dans Atlassian et lien vers le Goal dans l'en-tête de la swimlane. Le schéma de l'API est
  découvert par introspection, comme sur l'app Mac.
- Jira n'a aucune relation native entre un sprint et un Goal : l'épinglage est enregistré dans la
  propriété du sprint `com.scrumboardmac.sprintgoals.v1`, **partagée avec l'app Mac** (même
  format ; un Goal épinglé d'un côté apparaît de l'autre).
- **Texte du sprint** (repli) : les lignes du champ « Objectif » du sprint, en lecture seule. Le
  board s'y rabat, en le disant, si la passerelle GraphQL ne répond pas.

## Limites

- **Passerelle GraphQL et en-tête `Origin`.** La passerelle d'Atlassian refuse l'en-tête
  `Origin: chrome-extension://…` que Chrome ajoute, et aussi son absence. Sur l'instance essayée,
  elle n'accepte que l'adresse du site : c'est la variante posée par défaut, pour les seules
  requêtes de l'extension vers la passerelle. *Administration → Diagnostic* re-teste les variantes.
- Si Jira refuse d'enregistrer l'épinglage faute de droits, la sélection peut être gardée dans ce
  navigateur : elle n'est partagée avec personne, et ne sert que tant que Jira n'a aucune
  sélection pour ce sprint. Un bandeau le rappelle, avec « Réessayer dans Jira » et « Oublier ».
- Déplacer une carte se fait à la souris uniquement pour l'instant.

## Ce que l'extension écrit dans Jira

Cinq catégories, rien d'autre, chacune sur un geste explicite :

| Écriture | Geste | Requête |
|---|---|---|
| Transition d'un ticket | glisser-déposer vers un statut d'une autre colonne ; avec écran de transition, après « Valider la transition » (champs de l'écran, commentaire, temps passé, Story Points dans le même POST, 0.19.0–0.19.1) | `POST /rest/api/3/issue/{clé}/transitions` |
| Rang d'un ticket | glisser-déposer devant une carte | `PUT /rest/agile/1.0/issue/rank` |
| Lien ticket↔Goal | glisser-déposer vers un Goal ou vers *Build* | mutations GraphQL `goals_linkWorkItem` / `goals_unlinkWorkItem` |
| Propriété du sprint | épinglage de Goals ; rattachement en mode texte du sprint | `PUT /rest/agile/1.0/sprint/{id}/properties/com.scrumboardmac.sprintgoals.v1` |
| Propriété du board (0.13.0) | *Publier pour l'équipe…* dans l'administration | `PUT /rest/agile/1.0/board/{id}/properties/com.scrumboardmac.boardsettings.v1` |

S'y ajoute le test du *Diagnostic*, sur son bouton seulement : `PUT` puis `DELETE` de la propriété
technique `com.scrumboardmac.diagnostic`, invisible dans Jira et supprimée aussitôt.

Le champ « Objectif » du sprint n'est **jamais** écrit. La propriété du sprint est relue juste
avant chaque écriture et seule la partie concernée change : ce que l'app Mac y a mis est gardé,
y compris les clés que l'extension ne connaît pas. Si cette relecture échoue, ou si les Goals
épinglés ont changé dans Jira depuis leur affichage, rien n'est écrit.

L'inventaire des écritures est [`src/jira/writes.ts`](src/jira/writes.ts) : le transport ne sait
émettre que ce que ce fichier décrit. Aucune écriture n'est jamais rejouée.

## Développer

```bash
npm run check
```

Types, lint, tests et construction.

```bash
npm run verify:load
```

Construit puis charge `dist/` dans un Chrome sans interface, sur un **profil temporaire vierge** :
contrôle l'identifiant, le service worker, le rendu, les permissions accordées et le blocage par
la CSP d'une connexion hors `*.atlassian.net`. Aucune requête vers Jira.

```bash
npm run watch
```

Reconstruit `dist/` à chaque modification.

```bash
npm run harness
```

```bash
npm run verify:drag
npm run verify:transition
```

Vrais gestes de glisser-déposer et formulaire de transition dans Chrome, sur le faux Jira et un
profil temporaire vierge.

```bash
npm run verify:jira-direct-test
```

Construit le prototype d'ouverture directe dans `dist/` puis le vérifie dans
Chrome (faux Jira, profil vierge). Pour ne pas écraser un paquet d'essai en cours d'utilisation :
`npx vite build --mode jira-direct-test --outDir <dossier>` puis
`JIRA_DIRECT_DIST=<dossier> node scripts/verify-jira-direct-test.mjs`.

Banc d'essai visuel sur <http://localhost:5199/?scenario=board> (scénarios listés en tête de
[`tests/harness/harness.tsx`](tests/harness/harness.tsx), dont `board-goals` et `board-epingle`) :
l'interface réelle branchée sur le faux Jira des tests. Données fictives, réservé au
développement, jamais inclus dans `dist/`.

## État de vérification

### ✅ Vérifié sur cette machine

- Types, lint, 759 tests, construction (0.19.9).
- Chargement réel dans Chrome 153 (sans interface, profil temporaire vierge) : manifest accepté,
  identifiant conforme, permissions `storage` et `declarativeNetRequestWithHostAccess` seules,
  aucun hôte accordé à l'installation, formulaire de connexion sans erreur, hôte hors
  `*.atlassian.net` refusé, `fetch` vers un hôte tiers bloqué par la CSP, règle `Origin` acceptée
  par Chrome sous sa forme exacte.
- Règle `Origin` dans Chrome 153, avec une extension d'essai et un serveur local (sans Jira) :
  l'en-tête est retiré ou remplacé pour les POST de l'extension vers l'adresse exacte de la
  passerelle ; il reste intact pour une page web tierce visant la même adresse, pour une autre
  adresse du site et pour une adresse qui prolonge celle de la passerelle.
- Contre un **faux Jira de test** : requêtes émises, décodage, découverte du board,
  synchronisation, filtres, WIP, erreurs ; glisser-déposer (rattachement, transition, rang, conflit,
  choix de transition, champs obligatoires, refus, issue incertaine, dépôts ignorés), aucune
  écriture rejouée, journal.
- Glisser-déposer dans Chrome sur le banc d'essai (événements simulés sur les vraies vues, faux
  Jira) ; rendu du board, des bandeaux et de la fenêtre de choix par captures d'écran.
- Endpoints d'écriture REST vérifiés dans les spécifications OpenAPI publiées par Atlassian.
- API Goals contre une **fausse passerelle** calquée sur le schéma relevé par l'app Mac sur
  instance réelle (`TownsquareGoal`, `owner` en INTERFACE, `targetDate` composite) : découverte
  du schéma, recherche paginée, lecture par identifiants, lien Goal → tickets, mutations (forme
  de l'entrée, ARI puis identifiant brut après refus explicite seulement, jamais de nouvelle
  tentative sur issue incertaine), repli sur le texte du sprint, glisser-déposer entre Goals.
- Épinglage (0.6.0) contre le faux Jira : une seule écriture de la propriété, objectifs, liens et
  clés inconnues conservés, rien d'écrit si la relecture échoue ou si la sélection a changé
  entre-temps, refus de droits, issue incertaine, limite de 32 Ko ; fenêtre essayée dans Chrome
  sur le banc d'essai (`board-epingle`).
- Réglages de swimlanes (0.7.0) et filtres rapides Jira contre le faux Jira : lecture paginée des
  filtres, JQL restreint aux sprints actifs, intersection, refus de Jira ; rendu vérifié dans
  Chrome sur le banc d'essai. Endpoint `GET /rest/agile/1.0/board/{id}/quickfilter` vérifié dans
  la spécification OpenAPI de Jira Software.
- Page Réglages (0.8.0) contre le faux Jira : brouillon validé puis appliqué, brouillon périmé
  refusé, types ignorés, source des objectifs, champs de cartes demandés à Jira, rafraîchissement
  automatique (intervalle, pause pendant un geste, arrêt) ; rendu vérifié dans Chrome sur le banc
  d'essai.
- Couleurs des cartes et épinglage local (0.9.0) contre le faux Jira : JQL restreint aux sprints
  actifs, priorité des règles, JQL refusé, réévaluation à chaque actualisation ; sélection gardée
  après un refus de droits, prioritaire seulement sans sélection dans Jira, oubliée dès que Jira
  l'enregistre ; rendu vérifié dans Chrome sur le banc d'essai (`board-epingle-refus`).
- Carte revue (0.9.1) : couleur par parent (partagée, jamais en double, stable quand un parent
  plus récent arrive), champs en badges, drapeau près de la priorité, résumé coupé à deux lignes ;
  rendu vérifié dans Chrome sur le banc d'essai.
- Mise en page de l'app Mac (0.10.0) : barre latérale (swimlanes dans l'ordre du board, décomptes,
  clic qui déplie et amène à l'écran, glissé depuis la barre ou le board vers l'une ou l'autre,
  objectifs masqués), administration (réglages, diagnostic, déconnexion), en-tête et filtres à
  icônes ; vérifié dans Chrome sur le banc d'essai.
- Œil des objectifs et section Board enregistrée champ par champ (0.10.1) : masquer, réafficher,
  animation au survol, saisie refusée, Échap ; vérifié dans Chrome sur le banc d'essai.
- Largeur de la barre latérale (0.10.2) : glissé à la souris, bornes (200 px, moitié de la
  fenêtre), fenêtre rétrécie, clavier, double-clic ; vérifié dans Chrome sur le banc d'essai.
- Menu « ⋯ » d'une swimlane (0.10.3) : entier même sur la dernière swimlane d'un board replié,
  ouvert vers le haut dans une fenêtre basse ; vérifié dans Chrome sur le banc d'essai.
- Carte (0.10.4) : alertes, points et assigné sur une ligne ; clé sur une ligne ; vérifié dans
  Chrome sur le banc d'essai.
- Colonnes d'au moins 170 px (0.10.5) : colonnes au minimum, une clé à 5 chiffres
  (CLIENT-10114) tient en entier, drapeau et priorité compris ; vérifié dans Chrome.
- Réglages d'équipe (0.13.0) contre le faux Jira : extraction et application (structure de
  Jira, colonnes inconnues ignorées, couleurs combinées), publication (une écriture, relecture,
  conflit, clés inconnues gardées, valeur illisible jamais écrasée, refus de droits), application
  d'office ou proposée, « Garder les miens » ; parcours vérifié dans Chrome sur le banc d'essai
  (publication, version d'un collègue appliquée, puis proposée après une modification locale).
- Plusieurs boards (0.12.0) contre le faux Jira : liste par nom, bascule (autre board relu dans
  Jira, réglages propres à chaque board, filtres remis à zéro), refus pendant une écriture, retrait
  (board suivant affiché, recherche proposée après le dernier), réouverture sur le dernier board ;
  un réglage enregistré ne change plus le board actif. Rendu et gestes vérifiés dans Chrome sur le
  banc d'essai (`board-multi`).
- Sprint Health (0.11.0) contre le faux Jira : comptages vérifiés à la main (points, tickets,
  bloqués, ajoutés, avancement par objectif, charge et WIP, composition, tickets à surveiller),
  filtres appliqués, historique absent signalé sans rien affirmer ; rendu vérifié dans Chrome sur
  le banc d'essai. En panneau (0.14.0) : ouverture et fermeture par l'en-tête et par le panneau,
  place entre les filtres et les swimlanes, état gardé et repris ; rendu vérifié dans Chrome.

### ✅ Constaté par l'utilisateur sur son instance (0.2.0, 0.2.1)

- Session du navigateur reconnue par Jira pour les requêtes de l'extension.
- POST de lecture REST, puis PUT / relecture / DELETE d'une propriété de sprint : acceptés sans
  en-tête particulier.
- Passerelle GraphQL : refus `Invalid CORS request`, avec ou sans `X-Atlassian-Token: no-check`
  (0.2.1) ; puis, avec la règle `Origin` (0.4.0) : refus si l'en-tête est retiré, **acceptée**
  s'il est remplacé par l'adresse du site (identifiant du site lu).

### ⚠️ Non vérifié — nécessite votre instance Jira

- Les réglages d'équipe (0.13.0) : lecture et écriture de la propriété du board sur votre Jira,
  droits nécessaires pour publier, et réception sur un second poste ou profil Chrome.
- Le board sur votre sprint (0.3.0) et le glisser-déposer (0.4.0) : transition réelle, rang et
  permission « Planifier les tickets », rattachement dans la propriété du sprint.
- La lecture des Goals de votre sprint (0.5.0) : `goals_search`, `goals_byIds`, `workItems` avec
  la session du navigateur, et le rattachement / détachement par glisser-déposer (mutations
  constatées sur le Mac, jamais émises depuis l'extension).
- L'épinglage (0.6.0) : liste des Goals de votre site, écriture de la propriété du sprint, et
  lecture croisée avec l'app Mac (un Goal épinglé d'un côté visible de l'autre).
- Les filtres rapides de votre board (0.7.0) et les règles de couleur (0.9.0) : l'évaluation de
  leur JQL restreint aux sprints actifs (`currentUser()`, champs personnalisés…).
- Les volumes réels (pagination au-delà de 100 tickets, plusieurs sprints actifs).
- Le lien « Ouvrir le Goal » (0.14.1) : il n'est plus proposé que vers `atlassian.com` ou un
  sous-domaine d'Atlassian ; s'il disparaît sur vos Goals, l'API renvoie une adresse hors de ces
  domaines.

### Recherche de boards et déconnexion (0.17.0)

La recherche interroge le site connecté après une pause de 300 ms dans la saisie et affiche au
maximum cinq boards Scrum. Jira filtre les résultats selon les droits de la session courante :
[documentation de GET /rest/agile/1.0/board](https://developer.atlassian.com/cloud/jira/software/rest/api-group-board/#api-rest-agile-1-0-board-get).
Le projet et l’identifiant distinguent les boards de même nom. Préciser la recherche pour trouver
d’autres résultats. Une réponse ancienne est ignorée si la saisie change.
La déconnexion demande confirmation avant de retirer l’accès au site et d’effacer ses réglages locaux.

### Repérage des déplacements (0.18.0)

Pendant un déplacement, la carte apparaît provisoirement à destination avec un contour bleu et
« Déplacement en cours… », jusqu’à la réponse et à la relecture de Jira. Les compteurs restent
basés sur les données confirmées. Le choix éventuel d’une transition reste obligatoire.
Après confirmation, la carte reprend son apparence habituelle (depuis 0.18.3).
Un refus ou une relecture impossible donne un repère rouge « Déplacement à vérifier » et le
message détaillé habituel. La projection est retirée : l’état relu dans Jira reprend la main.
En cas de réussite partielle, les changements déjà acceptés ne sont pas annulés dans Jira.

### Autocomplétion des boards (0.18.1)

Les cinq premières suggestions apparaissent directement sous le champ pendant la saisie.
Un clic choisit le board ; au clavier, les flèches parcourent les suggestions, Entrée valide
et Échap referme la liste. Le champ conserve le focus pendant la navigation.

### Sélection des boards (0.18.2)

L’ajout d’un board se fait uniquement par la recherche avec autocomplétion. La saisie d’URL a été retirée.

### Glisser-déposer dans toutes les swimlanes (0.18.3)

Les zones de statut et les messages d’indisponibilité se superposent aux colonnes sans agrandir
les lignes pendant le geste. Cela empêche les cartes des swimlanes suivantes de se décaler sous
le pointeur au démarrage du glissement. Si les statuts dépassent la hauteur disponible, leur
liste défile à l’intérieur de la colonne.
Le repère vert et son message de réussite sont supprimés. Seul un problème affiche un repère
rouge pendant quatre secondes, avec le message détaillé conservé dans le board.

`npm run verify:drag` contrôle les vrais gestes Chrome sur le premier Goal, le deuxième Goal
et Build, avec le Jira fictif du banc d’essai et un profil navigateur temporaire vierge.

### Écrans de transition (0.19.0)

Quand Jira expose un écran de transition, une fenêtre affiche ses champs avant toute écriture.
Les valeurs existantes et les valeurs par défaut lisibles sont préremplies. Seules les valeurs
modifiées sont envoyées avec la transition, après « Valider la transition ». Annuler ne change
ni le statut, ni le Goal, ni le rang. Après confirmation du statut, le reste du déplacement reprend.

Types pris en charge : texte, nombres, dates, date/heure, texte multiligne, labels, commentaire,
choix simples ou multiples lorsque Jira fournit la liste des valeurs (résolution, versions,
composants, utilisateurs, etc.). Le texte riche existant est conservé s’il n’est pas modifié ;
sa saisie de remplacement produit un document ADF en texte simple. Les widgets tiers, les listes
en cascade et les recherches distantes d’utilisateurs ne sont pas reproduits : leur présence
est signalée et un lien ouvre le ticket Jira. Un champ obligatoire non pris en charge et sans
valeur existante/par défaut bloque l’envoi.

Le statut, les métadonnées et les valeurs actuelles sont relus à la validation. Les erreurs
renvoyées par Jira restent affichées avec la saisie conservée. Une écriture à l’issue incertaine
n’est jamais rejouée ; le formulaire bloque une nouvelle soumission et le board est relu.
Les validateurs dont Jira n’expose pas les règles peuvent encore refuser l’envoi.
Aucune permission supplémentaire. Brouillon en mémoire seulement, sans stockage local.

Contrôle navigateur : `npm run verify:transition` (Jira fictif et profil Chrome vierge).
API : [Get transitions / Transition issue](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/),
`expand=transitions.fields`, envoi de `fields` et `update.comment` dans le POST de transition.


Depuis la 0.19.1, les **Story Points** utilisent le champ numérique identifié par les métadonnées
Jira (sans imposer son identifiant). Valeur actuelle préremplie, décimales avec point ou virgule.
Le **temps passé** est saisissable quand la transition expose `worklog` avec l’opération `add` :
« Temps passé à ajouter », par exemple `1h 30m`. Cette durée ajoute une entrée au journal de
travail, datée au moment de la validation ; elle ne remplace pas le cumul existant. Les unités
`w`, `d`, `h`, `m` sont explicites et Jira applique ses réglages de jours/semaines. Le reste à
faire suit le comportement de Jira ; l’extension n’impose pas un ajustement d’estimation.
Le journal existant ne préremplit jamais une nouvelle durée. Un temps obligatoire doit être
saisi même si le ticket contient déjà des heures. Un champ facultatif laissé vide n’est pas écrit.
Points, commentaire et `update.worklog` sont envoyés dans le même POST de transition ; aucun
appel séparé n’ajoute du temps avant la transition. En cas de réponse perdue, aucune relance
pour éviter un doublon. Les champs calculés (`timespent`) et le widget d’estimations
`timetracking` ne sont pas assimilés à une saisie de temps passé.

### Prototype d'ouverture directe dans Jira (0.19.8.2, durci en 0.19.9.2)

Paquet d'essai construit par `npm run build:jira-direct-test`, dans `dist/` comme le paquet
autonome et avec le même identifiant Chrome (donc le même stockage : site, board et réglages
conservés d'un paquet à l'autre). Il est décrit en détail dans [`DEVELOPER.md`](DEVELOPER.md) et
[`TEST-JIRA-DIRECT.md`](TEST-JIRA-DIRECT.md). Sur une adresse de board suivie de
`?sprintGoals=1`, le board Sprint Goals recouvre la page Jira ; un clic sur une carte ouvre la
fiche Jira dans une popin ; une transition qui exige des champs ouvre le formulaire Jira natif,
que l'utilisateur remplit et valide lui-même. Son manifest ajoute `scripting`, expose la page du
board aux sites `*.atlassian.net` et autorise leur `frame-ancestors` : rien de cela n'est reporté
dans le paquet autonome.

Durcissements de la 0.19.9.2 :

- **Page du board encadrée** : elle ne s'affiche et ne lit Jira que si elle est posée directement
  dans la page de premier niveau du site qu'elle annonce, pour un board de ce site, et si ce site
  est autorisé dans Chrome (`src/experiment/embeddingGuard.ts`). Sinon, elle n'affiche qu'un
  refus. Un autre site Atlassian (n'importe qui peut en créer un) ne peut donc plus afficher
  votre board dans sa page ni vous faire glisser des cartes à votre insu. Un clic sur une carte
  n'envoie la clé du ticket qu'à la page du site connecté.
Une transition du workflow qui exige des champs ouvre la **fenêtre native de Jira**, seule dans la
popin (0.19.15.2). Jira Cloud n'a aucune adresse qui serve cette fenêtre : elle est dessinée par
son application. L'extension charge donc la fiche du ticket sans la montrer, ouvre le menu de
statut de Jira et choisit la transition — uniquement si le libellé vaut exactement son nom, ou son
nom suivi du statut d'arrivée. Jira dessine alors sa fenêtre, que la popin isole et met à sa
taille. Sans correspondance certaine, rien n'est cliqué : la fiche vous est rendue, le menu reste
à votre main. C'est vous qui validez le formulaire ; valider ou annuler referme la popin et relit
le board.
À charger : `dist/`, après `npm run build:jira-direct-test` ; la barre latérale affiche alors
« Sprint Goals — test ouverture Jira » et une version en `.2`.

Vérifié dans Chrome (faux Jira, profil vierge) par `verify:jira-direct-test` : refus sans
autorisation du site, refus dans la page d'un autre site Atlassian, écran de transition ouvert
par identifiants, seul et à sa taille, jamais validé automatiquement, fermé par « Cancel ».
**Non essayé sur votre Jira** : l'adresse de l'écran de transition sur Jira Cloud.
