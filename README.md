# Sprint Goals Board pour Jira — extension Chrome

**Le board Scrum que Jira n'offre pas : une swimlane par Sprint Goal, créée automatiquement.**
Le board Jira range les tickets par colonne, sans montrer à quel objectif du sprint chacun
contribue. Ici, chaque Sprint Goal devient sa propre swimlane, avec ses tickets et son
avancement, dès l'ouverture du board — sans rien configurer. Les tickets sans objectif restent
visibles dans *Build*, le RUN à part. Jira reste la source de vérité.

Version Chrome de l'app macOS « Scrum Board », projet distinct dont il reprend la spécification
([`docs/reference-app-mac/PROMPT.md`](docs/reference-app-mac/PROMPT.md)).

> **État : 0.10.2 — réglages locaux terminés (étape 5), mise en page de l'app Mac.** Board du
> sprint actif organisé par Goals Atlassian (lus par l'API GraphQL), Build et RUN ; filtres, recherche et filtres rapides
> du board Jira ; glisser-déposer qui écrit dans Jira : transition, rang, et lien natif
> ticket↔Goal ; épinglage de Goals au sprint, gardé dans le navigateur si Jira le refuse ; ordre,
> repli, couleur et masquage des swimlanes ; barre latérale (board, vues, swimlanes, administration) ;
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

Ces droits sont verrouillés par [`tests/manifest.test.ts`](tests/manifest.test.ts).

## Utiliser

1. Clic sur l'icône de l'extension : le board s'ouvre dans un onglet.
2. Saisir l'adresse du site (`societe.atlassian.net`) et accepter la demande d'accès de Chrome.
   Il faut être connecté à Jira dans un onglet de ce navigateur.
3. Coller l'adresse du board Jira (celle de la barre d'adresse quand le board est ouvert).

Le board affiche les tickets des **sprints actifs**, regroupés par objectif, puis *Build*
(tickets sans objectif) et *RUN* (types classés RUN, présents dans le sprint). Un clic sur une
carte ouvre le ticket dans Jira, dans un nouvel onglet. La flèche ronde de l'en-tête relit Jira.

- **Barre latérale** (reprise de l'app Mac) : le board affiché, dont le menu ouvre le board dans
  Jira, relit colonnes et types, épingle des Goals ou change de board ; les vues *Board* et
  *Sprint Health* (emplacement réservé, pas encore construit) ; les swimlanes dans l'ordre du
  board, avec leur avancement — un clic y mène (en la dépliant), un glissé les réordonne, sur le
  board comme dans la barre ; et *Administration* en pied de barre. Le bouton en haut à gauche
  de l'en-tête masque la barre. Sa bordure droite se tire (curseur ↔) pour l'élargir ou la
  rétrécir, de 200 px à la moitié de la fenêtre ; flèches du clavier quand elle a le focus,
  double-clic pour revenir à la largeur par défaut. La largeur est gardée dans ce navigateur.
- **Œil d'un objectif** (barre latérale) : ouvert, il se ferme au survol, et un clic masque
  l'objectif du board (ses tickets passent dans *Build*) ; l'objectif passe alors dans *Masqués du
  board*, œil fermé, qui s'ouvre au survol et le réaffiche d'un clic. Réglage de ce navigateur.

**Glisser-déposer** — une carte déposée dans une case peut entraîner, dans cet ordre :

1. **rattachement** à l'objectif du bloc (ou détachement, dans *Build*) :
   - **Goals Atlassian** : lien NATIF ticket↔Goal (`goals_linkWorkItem` / `goals_unlinkWorkItem`),
     visible dans Jira ; l'ancien Goal est détaché d'abord, et si Atlassian refuse, rien d'autre
     n'est fait (le ticket ne se retrouve pas lié à deux Goals) ;
   - **texte du sprint** (repli) : le lien est enregistré dans la propriété du sprint partagée avec
     l'app Mac ;
2. **transition** vers la colonne — le ticket est relu dans Jira juste avant ; s'il a changé, rien
   n'est écrit ; sans transition directe, une fenêtre montre celles que Jira propose ;
3. **rang** — déposée devant une carte, elle est classée juste avant (rang du board Jira).

Chaque écriture attend la confirmation de Jira avant la suivante ; la carte ne bouge qu'à la
relecture du board. Aucune écriture n'est rejouée : si Jira ne répond pas, le board est relu et
le bandeau le dit. Chaque tentative est notée dans le **journal** (*Administration → Diagnostic*).

- **Cartes** : type, clé, drapeau Jira et priorité à droite, résumé sur deux lignes au plus (en
  entier au survol), story points, initiales de l'assigné. Le parent est un badge à son titre,
  d'une couleur propre à ce parent : tous ses tickets la partagent, deux parents ne l'ont jamais
  en commun (0.9.1). Les champs choisis dans les réglages sont des badges, un par valeur, le nom
  du champ au survol. Le statut n'est pas écrit : la colonne le dit. Badges *Bloqué* (lien « est
  bloqué par », détail au survol), bugs liés, *Ajouté* en cours de sprint, jours dans la colonne
  au-delà du seuil. Les icônes de type et de priorité
  sont téléchargées depuis le site avec la session ; les avatars ne le sont pas (ils sont
  hébergés hors du site) : on affiche les initiales.
- **En-tête** : sprint (badge *actif*), dates, jours restants, avancement en story points (en
  tickets si le board n'estime pas) et pourcentage, compteurs *bloqués* et *ajoutés* (cliquables :
  ils filtrent) et *dans Build* (mène au bloc), heure de la dernière lecture de Jira.
- **Filtres**, chacun avec son icône : recherche (clé, résumé, personne, type, label, parent),
  *Bloqués*, *Ajoutés*, filtres rapides Jira, puis menus Personne, Type, Parent, Priorité,
  Objectif, Statut, Label, Composant. Un clic sur le titre d'un objectif n'affiche que lui ; un
  second clic rétablit tout.
- **Filtres rapides Jira** : ceux définis sur le board Jira, en boutons (leur JQL au survol).
  Jira évalue lui-même leur JQL, restreint aux sprints actifs ; plusieurs filtres actifs se
  combinent, comme dans Jira. Un JQL que Jira refuse désactive les filtres rapides, et le bandeau
  le dit. Lecture seule.
- **Colonnes** : celles du board Jira, avec leur limite WIP (en rouge au-delà, filtres ou non).
- **Swimlanes** : la poignée (⠿) à gauche de l'en-tête se glisse pour placer la swimlane
  (objectif, Build ou RUN) où l'on veut ; la flèche replie ou déplie ; le menu *⋯* la monte ou la
  descend (alternative au clavier), replie ou déplie tout, change la couleur d'un objectif ou le masque (ses
  tickets passent dans *Build* ; la barre latérale permet de le réafficher). Ces réglages restent
  dans ce navigateur et ne changent rien dans Jira.
- **Épingler des Goals au sprint** (menu du board, dans la barre latérale) : choisir, parmi les Goals du site, ceux qui
  s'affichent même sans ticket rattaché. La sélection se compose dans la fenêtre (filtre local,
  sans requête pendant la frappe) et n'est écrite qu'au clic sur *Enregistrer dans Jira*.
- **Administration** (pied de la barre latérale). Réglages propres à ce navigateur et à ce board,
  jamais écrits dans Jira :
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
- Un seul board à la fois.

## Ce que l'extension écrit dans Jira

Quatre catégories, rien d'autre, chacune sur un geste explicite :

| Écriture | Geste | Requête |
|---|---|---|
| Transition d'un ticket | glisser-déposer vers une colonne | `POST /rest/api/3/issue/{clé}/transitions` |
| Rang d'un ticket | glisser-déposer devant une carte | `PUT /rest/agile/1.0/issue/rank` |
| Lien ticket↔Goal | glisser-déposer vers un Goal ou vers *Build* | mutations GraphQL `goals_linkWorkItem` / `goals_unlinkWorkItem` |
| Propriété du sprint | épinglage de Goals ; rattachement en mode texte du sprint | `PUT /rest/agile/1.0/sprint/{id}/properties/com.scrumboardmac.sprintgoals.v1` |

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

Banc d'essai visuel sur <http://localhost:5199/?scenario=board> (scénarios listés en tête de
[`tests/harness/harness.tsx`](tests/harness/harness.tsx), dont `board-goals` et `board-epingle`) :
l'interface réelle branchée sur le faux Jira des tests. Données fictives, réservé au
développement, jamais inclus dans `dist/`.

## État de vérification

### ✅ Vérifié sur cette machine

- Types, lint, 608 tests, construction.
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

### ✅ Constaté par l'utilisateur sur son instance (0.2.0, 0.2.1)

- Session du navigateur reconnue par Jira pour les requêtes de l'extension.
- POST de lecture REST, puis PUT / relecture / DELETE d'une propriété de sprint : acceptés sans
  en-tête particulier.
- Passerelle GraphQL : refus `Invalid CORS request`, avec ou sans `X-Atlassian-Token: no-check`
  (0.2.1) ; puis, avec la règle `Origin` (0.4.0) : refus si l'en-tête est retiré, **acceptée**
  s'il est remplacé par l'adresse du site (identifiant du site lu).

### ⚠️ Non vérifié — nécessite votre instance Jira

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
