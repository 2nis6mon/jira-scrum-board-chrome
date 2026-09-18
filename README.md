# Scrum Board — extension Chrome

Pilote un sprint Jira Cloud par ses objectifs, depuis un onglet Chrome. Jira reste la source de
vérité. Projet distinct de l'app macOS du même nom, dont il reprend la spécification
([`docs/reference-app-mac/PROMPT.md`](docs/reference-app-mac/PROMPT.md)).

> **État : étape 3 — board en lecture seule.** Connexion à un site `*.atlassian.net` avec la
> session Jira du navigateur ; board du sprint actif par objectifs, Build et RUN ; filtres et
> recherche ; diagnostic de connexion. Les objectifs viennent du **texte du sprint** : les Goals
> Atlassian ne sont pas encore lus (voir *Limites*). Aucune écriture dans Jira hors du test
> d'écriture du diagnostic.

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
| À l'installation | `storage` uniquement. **Aucun accès à aucun site.** |
| À la connexion | Chrome demande l'accès à **un seul** site `https://….atlassian.net`, celui que vous saisissez. « Se déconnecter » rend cet accès. |
| Authentification | La session Jira déjà ouverte dans Chrome. L'extension ne demande et ne voit ni mot de passe ni jeton. |
| Politique de sécurité | Scripts de l'extension uniquement ; connexions limitées à `*.atlassian.net` ; aucune image ni style distant |
| Absents | Scripts injectés dans les pages, permissions `cookies`, `tabs`, `scripting`, `webRequest` |

Ces droits sont verrouillés par [`tests/manifest.test.ts`](tests/manifest.test.ts).

## Utiliser

1. Clic sur l'icône de l'extension : le board s'ouvre dans un onglet.
2. Saisir l'adresse du site (`societe.atlassian.net`) et accepter la demande d'accès de Chrome.
   Il faut être connecté à Jira dans un onglet de ce navigateur.
3. Coller l'adresse du board Jira (celle de la barre d'adresse quand le board est ouvert).

Le board affiche les tickets des **sprints actifs**, regroupés par objectif, puis *Build*
(tickets sans objectif) et *RUN* (types classés RUN, présents dans le sprint). Un clic sur une
carte ouvre le ticket dans Jira, dans un nouvel onglet. *Actualiser* relit Jira ; rien n'est
modifié.

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

- **Goals Atlassian non lus.** Leur API passe par la passerelle GraphQL d'Atlassian, qui refuse
  les requêtes de l'extension : `{"code":403,"message":"Invalid CORS request"}` (constaté sur
  instance réelle, extension 0.2.1). La cause est l'en-tête `Origin: chrome-extension://…` que
  Chrome ajoute ; l'API REST de Jira, elle, l'accepte. Tant que ce point n'est pas réglé, les
  objectifs sont les lignes du champ « Objectif » du sprint, en lecture seule, et le board le dit.
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

- Types, lint, 378 tests, construction.
- Chargement réel dans Chrome 153 (sans interface, profil temporaire vierge) : manifest accepté,
  identifiant conforme, service worker, formulaire de connexion sans erreur, hôte hors
  `*.atlassian.net` refusé sans rien enregistrer, aucune permission d'hôte à l'installation,
  `fetch` vers un hôte tiers bloqué par la CSP, variable CSS posée par script acceptée par la CSP.
- Contre un **faux Jira de test** : requêtes émises (session, un seul hôte, pas de redirection,
  aucune écriture rejouée), décodage des réponses, découverte du board, synchronisation (sprints
  actifs réunis, Scrum / RUN, objectifs du texte du sprint et liens de la propriété de sprint),
  mise en page, filtres, WIP, perte de session et coupure réseau, stockage local.
- Rendu du board, des filtres et des bandeaux par captures d'écran du banc d'essai (données
  fictives), en 1440 et 900 px de large.
- Logique métier portée de l'app Mac avec ses cas de test transcrits.

### ✅ Constaté par l'utilisateur sur son instance (extension 0.2.0 et 0.2.1)

- Session du navigateur reconnue par Jira pour les requêtes de l'extension.
- POST de lecture REST, puis PUT / relecture / DELETE d'une propriété de sprint : acceptés sans
  en-tête particulier.
- Passerelle GraphQL : refus `Invalid CORS request`, avec ou sans `X-Atlassian-Token: no-check`.

### ⚠️ Non vérifié — nécessite votre instance Jira

- Le board 0.3.0 lui-même : découverte de votre board, affichage de votre sprint, repérage du
  champ drapeau, icônes de type et de priorité, texte du sprint découpé en objectifs.
- Les volumes réels (pagination au-delà de 100 tickets, plusieurs sprints actifs).
