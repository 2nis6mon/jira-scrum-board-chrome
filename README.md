# Scrum Board — extension Chrome

Pilote un sprint Jira Cloud par ses objectifs, depuis un onglet Chrome. Jira reste la source de
vérité. Projet distinct de l'app macOS du même nom, dont il reprend la spécification
([`docs/reference-app-mac/PROMPT.md`](docs/reference-app-mac/PROMPT.md)).

> **État : 0.4.0 — board et glisser-déposer.** Board du sprint actif par objectifs, Build et
> RUN ; filtres et recherche ; glisser-déposer qui écrit dans Jira (transition, rang, rattachement
> aux objectifs du texte du sprint) ; diagnostic de connexion. Les Goals Atlassian ne sont pas
> encore lus : la 0.4.0 teste, dans le diagnostic, la parade à leur refus (voir *Limites*).

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
carte ouvre le ticket dans Jira, dans un nouvel onglet. *Actualiser* relit Jira.

**Glisser-déposer** — une carte déposée dans une case peut entraîner, dans cet ordre :

1. **rattachement** à l'objectif du bloc (ou détachement, dans *Build*) — objectifs du texte du
   sprint : le lien est enregistré dans la propriété du sprint partagée avec l'app Mac ;
2. **transition** vers la colonne — le ticket est relu dans Jira juste avant ; s'il a changé, rien
   n'est écrit ; sans transition directe, une fenêtre montre celles que Jira propose ;
3. **rang** — déposée devant une carte, elle est classée juste avant (rang du board Jira).

Chaque écriture attend la confirmation de Jira avant la suivante ; la carte ne bouge qu'à la
relecture du board. Aucune écriture n'est rejouée : si Jira ne répond pas, le board est relu et
le bandeau le dit. Chaque tentative est notée dans le **journal** (onglet *Diagnostic*).

- **Cartes** : type, clé, drapeau Jira (⚑), priorité, résumé, parent, story points, initiales de
  l'assigné ; badges *Bloqué* (lien « est bloqué par », détail au survol), bugs liés, *Ajouté*
  en cours de sprint, jours dans la colonne au-delà du seuil. Les icônes de type et de priorité
  sont téléchargées depuis le site avec la session ; les avatars ne le sont pas (ils sont
  hébergés hors du site) : on affiche les initiales.
- **En-tête** : sprint, dates, jours restants, avancement en tickets et en points, compteurs
  *bloqués*, *ajoutés*, *sans objectif* (cliquables : ils filtrent), RUN.
- **Filtres** : recherche (clé, résumé, personne, type, label, parent), *Bloqués*, *Ajoutés*,
  et menus Personne, Objectif, Type, Priorité, Statut, Label, Composant, Parent. Un clic sur le
  titre d'un objectif n'affiche que lui ; un second clic rétablit tout.
- **Colonnes** : celles du board Jira, avec leur limite WIP (en rouge au-delà, filtres ou non).
- **Diagnostic** (en-tête) : ce que Jira répond réellement aux requêtes de l'extension.

## Limites

- **Goals Atlassian non lus.** Leur API passe par la passerelle GraphQL d'Atlassian, qui a
  refusé les requêtes de l'extension : `{"code":403,"message":"Invalid CORS request"}` (constaté
  sur instance réelle, extension 0.2.1). La cause est l'en-tête `Origin: chrome-extension://…` que
  Chrome ajoute ; l'API REST de Jira, elle, l'accepte. La 0.4.0 pose une règle qui retire cet
  en-tête pour les seules requêtes de l'extension vers la passerelle, et le diagnostic dit quelle
  variante la passerelle accepte. La lecture des Goals viendra ensuite ; d'ici là, les objectifs
  sont les lignes du champ « Objectif » du sprint.
- Le rattachement à un Goal Atlassian (mutations GraphQL) n'est pas encore disponible.
- Déplacer une carte se fait à la souris uniquement pour l'instant.
- Un seul board à la fois ; réglages (ordre des swimlanes, couleurs, champs des cartes, règles
  de couleur) pas encore modifiables depuis l'interface.

## Ce que l'extension écrit dans Jira

À cette étape, **une seule écriture existe**, et uniquement sur le bouton « Tester l'écriture » :
`PUT` puis `DELETE` de la propriété technique `com.scrumboardmac.diagnostic` du sprint actif.
Elle est invisible dans Jira, ne touche ni ticket ni champ du sprint, et est supprimée aussitôt.
C'est le même test que « Tester l'enregistrement » de l'app Mac.

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

Banc d'essai visuel sur <http://localhost:5199/?scenario=ok> (`ok`, `xsrf`, `refuse`, `session`,
`deconnecte`) : l'interface réelle branchée sur le faux Jira des tests. Données fictives,
réservé au développement, jamais inclus dans `dist/`.

## État de vérification

### ✅ Vérifié sur cette machine

- Types, lint, 452 tests, construction.
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
- Endpoints d'écriture vérifiés dans les spécifications OpenAPI publiées par Atlassian.

### ✅ Constaté par l'utilisateur sur son instance (0.2.0, 0.2.1)

- Session du navigateur reconnue par Jira pour les requêtes de l'extension.
- POST de lecture REST, puis PUT / relecture / DELETE d'une propriété de sprint : acceptés sans
  en-tête particulier.
- Passerelle GraphQL : refus `Invalid CORS request`, avec ou sans `X-Atlassian-Token: no-check`.

### ⚠️ Non vérifié — nécessite votre instance Jira

- Le board sur votre sprint (0.3.0) et le glisser-déposer (0.4.0) : transition réelle, rang et
  permission « Planifier les tickets », rattachement dans la propriété du sprint.
- La réponse de la passerelle GraphQL avec l'en-tête `Origin` retiré ou remplacé (diagnostic 0.4.0).
- Les volumes réels (pagination au-delà de 100 tickets, plusieurs sprints actifs).
