# Audit de sécurité — Sprint Goals Board pour Jira

> **Suivi (0.26.0, 09/10/2026)** — Trois changements, aucun hôte ni écriture nouveaux.
> (1) Permission `activeTab`, choisie par Denis plutôt qu'un accès à `*.atlassian.net` dès
> l'installation : au clic sur l'icône, le lanceur lit l'adresse du seul onglet courant pour
> reconnaître son board ; l'accès au site reste demandé sur un clic. (2) Le script de contenu
> affiche un bouton flottant sur les boards des sites autorisés ; son clic ne fait qu'ajouter
> `sprintGoals=1` à l'adresse courante. (3) Nouveau message `sprint-goals:open-board` de la vue
> vers la page hôte : voir S12 en fin de document.
>
> **Suivi (0.25.0, 09/10/2026)** — À la demande de Denis, l'intégration Jira devient le mode
> unique. Le manifest source reprend les droits du mode intégré déjà utilisé : `scripting`,
> ressources exposées limitées à `board.html`, `assets/*` et `icons/*`, et encadrement limité à
> `https://*.atlassian.net`. Aucun nouvel hôte ni catégorie d'écriture. Le lanceur demande une URL
> de board et l'autorisation Chrome du site, puis ouvre la page Jira ; il ne lit aucun ticket.
> Toute vue métier est bloquée hors de la page Jira de premier niveau autorisée, y compris une
> ouverture directe de `board.html`, un cadre imbriqué ou un autre site Atlassian. Les sections
> 2.1, 2.2 et le suivi S9 ci-dessous décrivent cette surface actuelle. Les résultats datés de
> l'audit initial et des versions précédentes restent historiques ; aucun essai sur le vrai Jira
> de l'utilisateur n'est revendiqué pour cette évolution.

> **Suivi (0.24.0, 01/10/2026)** — Support Kanban : E6 contient aussi `boardPinnedGoalIds`,
> les identifiants des Goals épinglés au board, visibles par les personnes pouvant lire le board.
> L'épinglage utilise le même droit `canEdit`, la relecture et le contrôle de conflit des réglages
> partagés ; une seule écriture par geste explicite. E5 n'est pas utilisée en Kanban. Les lectures
> restent sur le site Jira autorisé ; le sous-filtre Kanban est exécuté par Jira. Aucune permission,
> aucun hôte, aucune catégorie d'écriture supplémentaire. Pas d'essai sur le vrai Jira de l'utilisateur.

> **Suivi (0.22.0, 24/09/2026)** — E6 n'est plus écrite par « Publier pour l'équipe » mais à
> chaque modification d'un réglage du board par l'utilisateur (demande de Denis) : même propriété,
> même contenu, relue avant chaque écriture, une seule tentative, conflit détecté. Nouvelle
> lecture : droit `canEdit` du board. Aucune nouvelle permission, aucun nouvel hôte.

> **Suivi (0.14.1)** — S1 est corrigé et couvert par des tests (`tests/jira/site.test.ts`,
> `tests/guards/sources.test.ts`). Les autres constats sont des informations : risques
> structurels ou choix assumés, détaillés plus bas. Correctifs en fin de document.

Audit initial : 19 septembre 2026 · Périmètre : commit `c785ea0` (0.14.0), extension construite par
`vite build`. Lot 6d de l'étape 6, sur le modèle de l'audit de l'app Mac
([`reference-app-mac/SECURITY-AUDIT-app-mac.md`](reference-app-mac/SECURITY-AUDIT-app-mac.md)).

## Méthode et limites de l'audit initial

- **Revue statique exhaustive** de `src/` : tous les points de sortie réseau, toutes les méthodes
  HTTP autres que GET, toutes les mutations GraphQL, le stockage, le rendu des données reçues de
  Jira (texte, liens, images, styles), le manifest, la CSP, la règle `declarativeNetRequest` et le
  service worker.
- **Contrôles automatiques existants**, relancés : garde-fous sur les sources
  (`tests/guards/sources.test.ts`), inventaire des écritures (`tests/jira/writes.test.ts`),
  manifest (`tests/manifest.test.ts`), et `npm run verify:load`, qui charge l'extension construite
  dans un Chrome temporaire vierge sans contacter Jira (permissions accordées, CSP, absence de
  script en ligne, refus d'un hôte hors `*.atlassian.net`).
- **Paquet construit inspecté** : liste des fichiers, adresses présentes dans le code, absence
  des données du banc d'essai et des tests.
- **Historique Git complet** (31 commits) : recherche de secrets, de clés privées, et de tout
  hôte `*.atlassian.net` réel.
- `npm audit` (19/09/2026) : 0 vulnérabilité connue.

Ce qui **n'a pas** été fait : test d'intrusion, essai contre votre instance Jira (exclu par les
règles du projet : c'est vous qui installez et validez), interception du trafic réel. Cet audit
est réalisé par l'auteur du code : il ne remplace pas une revue indépendante.

## Synthèse

| # | Constat | Gravité | État |
|---|---|---|---|
| S1 | Le lien « Ouvrir le Goal » acceptait toute adresse `https://`. Or cette adresse peut venir de la propriété du sprint, écrite par d'autres outils. | Faible | **Corrigé en 0.14.1** |
| S2 | Qui peut modifier le board publie des réglages que l'extension applique d'office chez les collègues sans modification locale. Parmi eux, des règles JQL évaluées avec la session de chacun. | Information | Choix assumé, atténué |
| S3 | La restriction « sprints actifs » d'un JQL de règle de couleur est syntaxique : une parenthèse fermante en trop en sort. | Information | Effet borné au board |
| S4 | L'extension agit avec la session du navigateur, donc avec tous vos droits Jira. La limite à cinq catégories d'écriture n'est garantie que par son code. | Information | Structurel |
| S5 | La CSP `connect-src https://*.atlassian.net` est plus large que le site connecté. | Information | Structurel |
| S6 | La publication des réglages d'équipe écrit le nom et l'identifiant de compte de son auteur dans la propriété du board. | Information | Choix assumé |
| S7 | L'extension est chargée « non empaquetée ». Sa clé privée (`.secrets/extension-key.pem`) est un fichier local. | Information | Lot 6e |
| S8 | La règle `Origin` fait passer les requêtes de l'extension pour des requêtes du site auprès de la passerelle GraphQL. | Information | Validée, bornée |

Au périmètre de l'audit initial, aucune vulnérabilité critique, élevée ou moyenne identifiée. Aucun secret dans le code ni dans
l'historique Git. Aucune donnée réelle de votre organisation dans le dépôt : les seuls hôtes
présents sont fictifs (`acme`, `autre`, `societe`, `site`, `votre-societe`, `b`, `verification`).

---

## 1. Inventaire exhaustif des écritures dans Jira / Atlassian

Une écriture ne peut naître que d'un cas du type `JiraWrite` ou `GraphqlWrite`
(`src/jira/writes.ts`). Les garde-fous vérifient à chaque exécution des tests trois choses :
- aucun autre fichier ne nomme une méthode HTTP d'écriture ;
- aucun autre fichier n'appelle `fetch` ;
- aucun autre fichier ne déclare de mutation GraphQL.

Il n'existe **aucune autre écriture** que celles-ci.

### Écritures métier

| # | Opération | Appel | Geste de l'utilisateur |
|---|---|---|---|
| E1 | Changer le statut d'un ticket | `POST /rest/api/3/issue/{clé}/transitions`, corps `{"transition":{"id"}}`, avec `fields`, `update.comment` et `update.worklog` si formulaire validé (0.19.1) | Déposer une carte dans une autre colonne ; choisir une transition dans la fenêtre proposée quand aucune n'est directe |
| E2 | Classer un ticket (rang du board) | `PUT /rest/agile/1.0/issue/rank` | Déposer une carte au-dessus d'une autre |
| E3 | Rattacher un ticket à un Goal | mutation `goals_linkWorkItem` | Déposer une carte dans la swimlane d'un Goal |
| E4 | Détacher un ticket de son Goal | mutation `goals_unlinkWorkItem` | Déposer une carte dans *Build* ; implicite avant E3 quand le ticket change de Goal |
| E5 | Enregistrer les objectifs du sprint | `PUT /rest/agile/1.0/sprint/{id}/properties/com.scrumboardmac.sprintgoals.v1` | « Épingler des Goals au sprint… » ; en mode « texte du sprint », déposer une carte dans la swimlane d'un objectif |
| E6 | Enregistrer les réglages du board (partagés) | `PUT /rest/agile/1.0/board/{id}/properties/com.scrumboardmac.boardsettings.v1` | Depuis 0.22.0 : chaque modification d'un réglage du board par l'utilisateur (administration, ordre, couleur ou masquage d'une swimlane) ; jamais un changement automatique ni une préférence personnelle. Avant 0.22.0 : « Publier pour l'équipe… » puis confirmation |

### Écriture technique (diagnostic)

| # | Opération | Appel | Geste |
|---|---|---|---|
| E7 | Test d'écriture | `PUT` puis `DELETE /rest/agile/1.0/sprint/{id}/properties/com.scrumboardmac.diagnostic` | Administration → Diagnostic → test d'écriture, seulement |

E5, E6 et E7 écrivent des **propriétés d'entité** : ce sont des données techniques, invisibles
dans l'interface de Jira, limitées à 32 Ko, dont la clé commence par `com.scrumboardmac.`. Elles
ne modifient aucun champ du sprint ni du board.

### Ce que l'extension ne peut pas écrire

Vérifié par l'absence de code, et par le typage de l'inventaire. L'extension ne peut pas :
- créer ou supprimer un ticket, ou le modifier hors des champs de sa transition validée ;
- écrire une pièce jointe, modifier/supprimer un commentaire ou un worklog existant ;
- ajouter un commentaire ou du temps indépendamment d’une transition validée ;
- changer une assignation, une priorité ou une estimation absente du formulaire de transition ;
- modifier un sprint : contenu, dates, état, et **champ « Sprint Goal »**. Aucun chemin
  `/rest/agile/1.0/sprint/{id}` sans `/properties/`, et un garde-fou le vérifie ;
- créer, modifier ou supprimer un Goal ;
- modifier un board, un filtre ou un workflow ;
- émettre un `PATCH`.

Les autres `POST` sont des lectures :
- `/rest/api/3/jql/parse`, pour le diagnostic, sur une liste fermée dans le transport ;
- les requêtes GraphQL `query`. Le transport refuse tout document qui contient `mutation` ou
  `subscription`.

### Garde-fous constatés sur les écritures

- Aucune écriture sans geste explicite. L'actualisation, automatique ou manuelle, ne fait que
  lire. Une nouvelle version des réglages d'équipe s'applique dans le navigateur, sans écrire dans
  Jira.
- **Une seule tentative** pour toute écriture (`JiraTransport.write`, `graphqlWrite`). Si Jira ne
  répond pas, l'issue est notée « incertaine » et l'extension relit Jira.
- E1 : le ticket est relu avant la transition. Si son statut a changé dans Jira, rien n'est
  écrit. Seules les transitions proposées par Jira sont utilisées, jamais enchaînées. Une
  transition avec écran demande un formulaire explicite (0.19.0) ; les champs non pris en charge ne sont pas écrits.
- E3/E4 : si le détachement de l'ancien Goal échoue, rien de plus n'est tenté. C'est l'équivalent
  du correctif C4 du Mac.
- E5/E6 : la propriété est relue avant chaque écriture.
  - L'écriture est refusée si le contenu a changé depuis l'affichage : la sélection épinglée a
    bougé, ou quelqu'un a publié entre-temps.
  - Une valeur illisible ou d'un format inconnu n'est jamais écrasée.
  - Les clés inconnues sont conservées.
  - La taille est contrôlée avant l'envoi.
- Un dépôt n'est traité que pour la carte dont le glissé a commencé sur ce board, et présente dans
  le board chargé. Un texte glissé depuis une autre page ne vise aucun ticket.
- Clés de ticket (`^[A-Z][A-Z0-9_]*-[1-9]\d*$`), identifiants de transition, de sprint et de
  board sont validés avant de former un chemin.
- Chaque écriture est consignée, réussie ou non, dans le journal local : Administration →
  Diagnostic.

---

## 2. Fuites possibles — analyse

### 2.1 Authentification

| Point | Constat |
|---|---|
| Secrets | Aucun. L'extension ne voit ni mot de passe ni jeton : elle utilise la session Jira du navigateur (`credentials: "include"`). Elle n'a pas la permission `cookies` et ne lit jamais `document.cookie` (garde-fou). ✅ |
| Destinataire | **Un seul hôte** : le site connecté. Le transport refuse toute URL dont l'origine diffère, avant l'envoi. Les images ne sont demandées qu'au même site. Pas de tiers, pas de télémétrie. ✅ |
| Redirections | Jamais suivies (`redirect: "manual"`) : une redirection est une erreur. ✅ |
| Référent | `referrerPolicy: "no-referrer"` sur toutes les requêtes. ✅ |
| Site | HTTPS et `*.atlassian.net` exigés, avec comparaison sur la frontière de libellé DNS, **avant** toute demande de permission ou requête. Identifiants, chemin, port et requête de l'adresse saisie sont abandonnés. C'est l'équivalent des correctifs C1 et C5 du Mac. ✅ |
| Déconnexion | « Se déconnecter » rend l'accès au site à Chrome, retire la règle `Origin` et efface l'adresse du site, ses boards, leurs réglages et le journal du site. La session Jira du navigateur n'est pas touchée : elle appartient à Chrome, pas à l'extension. Le constat C2 du Mac, une vue web intégrée, n'a donc pas d'équivalent. |

**S4 — portée de la session (information).** Toute requête de l'extension part avec vos cookies
Atlassian : elle agit avec l'ensemble de vos droits Jira. Rien, côté Atlassian, ne la limite aux
cinq catégories d'écriture. C'est l'équivalent du constat C7 du Mac. Ce qui protège :
- l'inventaire typé des écritures et les garde-fous des tests ;
- la CSP stricte des pages de l'extension (`script-src 'self'`, pas de script en ligne, pas
  d'`eval`), qui empêche l'exécution de code injecté ;
- le garde-fou d'hébergement du board avant toute lecture, les scripts de contenu limités au site
  autorisé et les messages vérifiés par origine et fenêtre source ; aucun `externally_connectable`.

Une faille d'injection dans la page de l'extension serait grave pour cette raison. Aucune n'a été
trouvée (voir 2.3).

### 2.2 Permissions et surface d'exposition

- À l'installation : `storage`, `declarativeNetRequestWithHostAccess`, `scripting` et, depuis
  0.26.0, `activeTab` (adresse et titre de l'onglet courant, seulement quand l'utilisateur clique
  l'icône, sans avertissement à l'installation ; le lanceur n'en lit que l'adresse et n'injecte
  rien par ce droit).
  Aucune permission d'hôte : l'accès à **un** site `https://<site>.atlassian.net/*` est demandé à
  la connexion, et rendu à la déconnexion.
- CSP des pages de l'extension :
  `default-src 'self'; script-src 'self'; object-src 'none'; style-src 'self'; img-src 'self' blob: data:; connect-src https://*.atlassian.net; base-uri 'none'; form-action 'none'; frame-ancestors https://*.atlassian.net`.
  - Seuls `board.html`, `assets/*` et `icons/*` sont exposés à `https://*.atlassian.net/*`.
    Le lanceur n'est pas une ressource exposée. Le board ne démarre que directement dans la page
    de premier niveau du site Jira annoncé, autorisé dans Chrome, pour un board de ce site.
    L'ouverture directe et les cadres imbriqués sont refusés avant toute lecture Jira.
  - Aucun formulaire n'est envoyé.
  - Aucune ressource externe n'est chargée.
- Le clic sur l'icône ouvre le lanceur : il rejoint automatiquement le board courant si son site
  est déjà autorisé. Sinon, un formulaire préremplit le board de l'onglet (reconnu par
  `activeTab`) ou le board mémorisé et permet de choisir une
  URL, puis de demander l'autorisation sur un clic. Le service worker enregistre les
  scripts de contenu sur le site autorisé. Sur une URL de board marquée
  `sprintGoals=1`, l'intégration injecte la vue et ouvre les fiches/formulaires natifs Jira.
  Les échanges avec la vue embarquée contrôlent l'origine et la fenêtre source.

**S5 (information).** `connect-src` autorise tous les sous-domaines d'`atlassian.net`. Une CSP
de manifest ne peut pas dépendre du site choisi à l'exécution. En pratique :
- le transport n'appelle que le site connecté ;
- Chrome n'accorde l'accès sans CORS qu'à ce site.

Si vous accordez vous-même « Sur tous les sites » dans `chrome://extensions`, le transport reste
limité au site connecté.

### 2.3 Données reçues de Jira et affichées

| Point | Constat |
|---|---|
| Texte | Preact échappe tout texte et tout attribut. Pas de `innerHTML` ni de `dangerouslySetInnerHTML` (garde-fou). ✅ |
| Styles | Seules des valeurs numériques calculées sont posées par script (teinte du parent, largeur de la barre, nombre de colonnes). Les couleurs de règle passent par un attribut `data-card-color` et une feuille de style fixe. ✅ |
| Images | Icônes de type et de priorité téléchargées par le transport, **même site seulement**, `image/*`, 256 Ko au plus, affichées en `blob:`. Aucun avatar externe n'est chargé. ✅ |
| Liens vers Jira | `https://<site>/browse/<clé encodée>`, ou l'adresse du board sur le site. Les cartes ouvrent la fiche native dans la page Jira ; les liens ouvrant un nouvel onglet gardent `rel="noopener noreferrer"`. |
| Lien d'un Goal | **S1**, ci-dessous. |
| Documents JSON | Propriété du sprint et réglages d'équipe : décodés champ par champ, version exigée. Une valeur inattendue est ignorée ou signalée, jamais exécutée. ✅ |

**S1 — lien « Ouvrir le Goal » (faible, corrigé).** L'adresse de la page d'un Goal vient de l'API
Goals d'Atlassian, ou du champ `atlassianURL` de la propriété du sprint, partagée avec l'app Mac.
L'extension n'acceptait que `https://`, ce qui écartait `javascript:`, mais **quel que soit le
site**. Quiconque peut écrire les propriétés du sprint, depuis un autre outil que l'extension,
pouvait donc faire pointer ce lien vers une page d'hameçonnage.

Correctif 0.14.1 : `atlassianLink` (`src/jira/site.ts`) n'accepte qu'une adresse `https://` sur
`atlassian.com` ou un sous-domaine d'`atlassian.com` ou d'`atlassian.net`, sur frontière de
libellé, sans identifiants ni port. Sinon, le lien n'est pas affiché. **À constater sur votre
instance** : si « Ouvrir le Goal » disparaît, l'API renvoie une adresse hors de ces domaines.

### 2.4 Données locales

| Clé de `chrome.storage.local` | Contenu | Risque |
|---|---|---|
| `connection.v1` | Adresse du site | Aucun secret |
| `launcher.v1` | Dernière URL du board choisie dans le lanceur | Identifie un site et un board ; aucune donnée de ticket |
| `boards.v1` | Par site : boards, leurs réglages, base des réglages d'équipe | Noms de colonnes, d'objectifs et de labels ; pas de secret |
| `audit.v1` | 500 dernières écritures : date, site, action, clé du ticket, statuts, résultat, détail d'erreur | Aucun nom de personne, aucun secret |
| `graphqlOrigin.v1` | Variante de l'en-tête `Origin` acceptée, par site | — |
| `interface.v1` | Largeur de la barre latérale, panneau Santé ouvert | — |

Le stockage d'une extension n'est lisible que par elle, dans ce profil Chrome. Il n'est jamais
synchronisé : un garde-fou interdit `storage.sync`. C'est l'équivalent, pour Chrome, du durcissement
C10 du Mac. « Copier le rapport » du diagnostic contient :
- la version de l'extension et l'agent utilisateur du navigateur ;
- le résultat des sondes, codes HTTP et extraits d'erreur de Jira compris.

Il ne contient ni nom, ni e-mail, ni cookie. C'est une action volontaire : relisez le rapport
avant de le coller ailleurs.

### 2.5 Données écrites dans Jira, lisibles par d'autres

- **Propriété du sprint** (E5) : identifiants et titres des objectifs épinglés, rattachements du
  mode texte, date et identifiant de compte de la dernière modification. C'est le format partagé
  avec le Mac. Lisible par qui voit le sprint.
- **Propriété du board** (E6) : réglages du board (colonnes, types, labels, couleurs, ordre des
  swimlanes, objectifs masqués, champs des cartes, règles de couleur et leur JQL, nom de Build,
  swimlanes par type — nom et types regroupés, 0.23.0 —, réglages de la daily), date de la dernière modification. Depuis 0.22.0, écrite à chaque
  modification d'un de ces réglages, sur la version relue juste avant, une seule tentative ; la
  lecture du droit `canEdit` (`GET /rest/agile/1.0/board?expand=permissions`) masque ces réglages
  à qui ne peut pas modifier le board, et un refus de Jira fait de même. **S6** : elle contient aussi le nom affiché et l'identifiant de compte de la
  personne qui publie. Ces informations sont visibles de toute façon dans Jira par les mêmes
  personnes. Rien de personnel ne s'y trouve : les réglages personnels n'y sont jamais écrits.

**S2 — confiance dans les réglages d'équipe (information).** Quiconque peut modifier le board
dans Jira peut publier des réglages. Chez un collègue qui n'a rien modifié localement, ils
s'appliquent à la prochaine actualisation. Ils peuvent notamment :
- renommer ou masquer des colonnes, masquer des objectifs ;
- ajouter des règles de couleur dont le JQL est évalué **avec la session de chaque collègue**.

Ces JQL ne peuvent que lire, sur les seuls tickets du board. Leurs résultats servent seulement
à colorer les cartes affichées et ne quittent pas le navigateur. Atténuations en place :
- bandeau « Réglages d'équipe appliqués » avec l'auteur et la date ;
- document publié consultable dans l'administration ;
- « Garder les miens » dès qu'on a ses propres réglages ;
- publication réservée à ceux qui peuvent modifier le board.

C'est le fonctionnement demandé. Il est à connaître : un réglage publié par erreur se propage,
et une nouvelle publication le corrige.

**S3 — restriction syntaxique des JQL (information).** Chaque règle de couleur est envoyée sous la
forme `(<JQL>) AND sprint in (<sprints actifs>)`. Une parenthèse fermante en trop dans le JQL,
par exemple `a = 1) OR (b = 2`, fait sortir de la restriction aux sprints actifs. Les effets :
- la lecture passe par `GET /rest/agile/1.0/board/{id}/issue`, donc reste limitée aux tickets
  du board, 5 000 au plus ;
- seuls les tickets affichés sont colorés ;
- aucune donnée ne sort du navigateur.

Il n'y a pas de fuite. Le seul effet est un volume de lecture plus grand à chaque actualisation.
Ajouter un contrôle des parenthèses est possible ; ce n'est pas nécessaire.

### 2.6 Règle `Origin` de la passerelle GraphQL

**S8 (information).** La passerelle `/gateway/api/graphql` rejette l'origine
`chrome-extension://…`. Une règle de session `declarativeNetRequest` remplace donc l'en-tête
`Origin` par l'adresse du site. Elle ne vise que :
- les requêtes **émises par l'extension** (`initiatorDomains: [identifiant]`) ;
- la méthode POST ;
- l'adresse exacte `|https://<site>/gateway/api/graphql|`.

Les pages web ne sont pas touchées : c'est vérifié dans Chrome avec une page tierce. Un garde-fou
confine l'API à `platform/chrome.ts` et la modification d'en-tête à `originRule.ts`. La règle
disparaît à la déconnexion et à la fermeture du navigateur ; elle est reposée à l'ouverture. Elle
contourne, pour la seule extension, un contrôle d'origine de la passerelle. C'est la parade
validée le 18/09/2026, après le diagnostic sur votre instance. Ne jamais l'élargir.

### 2.7 Chaîne de distribution

- Dépendances d'exécution : **deux**, `preact` 10.29.8 et `@preact/signals` 2.11.2, avec
  `@preact/signals-core`, en versions exactes.
  - `package-lock.json` versionné ; `.npmrc` : `save-exact`, `ignore-scripts`, donc aucun script
    d'installation exécuté.
  - Six dépendances de développement, absentes du paquet.
  - `npm audit` : 0 vulnérabilité.
- Paquet construit : `board.html`, un script, une feuille de style, le service worker, les icônes,
  le manifest.
  - Pas de carte de sources.
  - Aucune donnée du banc d'essai ni des tests : un garde-fou interdit leur import dans `src/`, et
    le paquet a été inspecté.
  - Les seules adresses présentes sont les exemples du formulaire (`votre-societe`, `societe`).
- **S7 (information)** : l'extension s'installe aujourd'hui « non empaquetée », en mode
  développeur.
  - `.secrets/extension-key.pem` fixe son identifiant. Elle est ignorée par Git et n'a jamais
    été commitée : c'est vérifié dans tout l'historique.
  - Qui la détient peut produire une extension de même identifiant. Gardez-en une copie hors de
    ce poste et ne la partagez pas.
  - Pour distribuer à l'équipe, le lot 6e devra choisir un canal de confiance : Chrome Web Store
    en diffusion privée ou non répertoriée, ou déploiement par politique d'entreprise.
- Données de test fictives uniquement. Le constat C9 du Mac n'a pas d'équivalent.

---

## 3. Correspondance avec l'audit de l'app Mac

| Mac | Extension |
|---|---|
| C1 hôte non restreint | `normalizeSiteUrl` : `*.atlassian.net` seul, avant toute requête ✅ |
| C2 session web gardée après déconnexion | Sans objet : pas de vue web intégrée, la session appartient au navigateur |
| C3 POST rejoué | Une seule tentative pour toute écriture, relecture si l'issue est incertaine ✅ |
| C4 échec du détachement ignoré | Arrêt et message si le détachement échoue ✅ |
| C5 test de domaine par suffixe | Frontière de libellé DNS (`isTrustedHost`, `atlassianLink`) ✅ |
| C6 schéma des images | Images du seul site connecté, même origine, HTTPS ✅ |
| C7 portée du jeton | S4 (session du navigateur) |
| C8 sandbox, notarisation | Pages d'extension isolées par Chrome ; distribution : S7 |
| C9 clés réelles dans les tests | Aucune ✅ |
| C10 journal lisible | Stockage propre à l'extension, sans nom de personne ✅ |

---

## 4. Recommandations, par priorité

1. **S1** — corrigé en 0.14.1. À constater : « Ouvrir le Goal » doit rester visible sur vos Goals.
2. **Avant de distribuer à l'équipe** (lot 6e) : un canal de confiance (S7) et une copie de
   sauvegarde de la clé privée.
3. **S2** — dire à l'équipe qui peut publier les réglages et comment corriger une publication.
   Évolution possible, à décider : lister dans le bandeau « appliqués » les familles de réglages
   modifiées.
4. **S3** — facultatif : refuser un JQL de règle aux parenthèses déséquilibrées.
5. Revue indépendante avant une diffusion large.

---

## 5. Correctifs livrés en 0.14.1

| # | Correctif |
|---|---|
| S1 | `atlassianLink` (`src/jira/site.ts`) : lien d'un Goal proposé seulement vers `atlassian.com` ou un sous-domaine d'`atlassian.com` ou d'`atlassian.net`, en HTTPS, sans identifiants ni port. Tests : `tests/jira/site.test.ts`. |
| — | Deux garde-fous dans `tests/guards/sources.test.ts` : tout `target="_blank"` porte `rel="noopener noreferrer"` ; aucun lien n'est formé directement à partir de `atlassianUrl`. |

Aucune écriture, permission, hôte ni relâchement de CSP nouveau.

## Extension E1 — écrans de transition (0.19.0)

Demande explicite de Denis : gérer automatiquement les champs des transitions dans l’outil.
Même endpoint E1, aucun nouveau droit/hôte : les champs modifiés et le commentaire éventuel
sont envoyés dans l’unique POST de transition. Aucun PUT de ticket ni POST de commentaire séparé.
Les champs autorisés, leurs opérations et leurs choix sont relus juste avant l’envoi. Les types
inconnus et widgets tiers ne sont pas sérialisés. Les champs de structure (statut, projet, type,
parent, sprint, sécurité) sont exclus de ce formulaire. Le temps de travail était exclu en
0.19.0 ; l’ajout de temps via `worklog` est autorisé depuis la 0.19.1 (ci-dessous).
Le statut est revalidé après la lecture des champs. Aucun champ non modifié n’est renvoyé.
Le commentaire est encodé en ADF de texte, jamais en HTML. Toutes les étiquettes et erreurs sont
rendues comme texte par Preact ; aucune URL de métadonnées n’est suivie.
Brouillon en mémoire ; le journal ne contient pas les valeurs saisies. En cas de résultat réseau
incertain, relecture sans nouvelle écriture, nouvelle soumission bloquée. Annuler avant validation
n’effectue aucune écriture. Une transition déjà acceptée n’est pas rejouée si le changement de
Goal ou de rang échoue ensuite. Tests : transitionFields, BoardModel.drop et verify:transition.


## Extension E1 — temps passé et Story Points (0.19.1)

Autorisation explicite de Denis le 20/09/2026 : étendre les écritures du formulaire aux champs
Time Spent et Story Points. Aucun nouveau chemin d’écriture, hôte ou droit Chrome.
`worklog` n’est accepté que si la transition fraîchement relue autorise `add`. La durée positive
avec unités explicites est envoyée par `update.worklog: [{add: {timeSpent, started}}]`, avec
l’heure de validation. Aucun historique de worklog n’est chargé ou réécrit et aucun cumul
`timespent` n’est envoyé. Jira gère les unités de jours/semaines et son ajustement du reste à faire.
Le widget `timetracking` (estimations) reste distinct et non pris en charge.
Les Story Points utilisent le type numérique Jira standard, sans identifiant de champ imposé.
Les nombres non finis et notations ambiguës sont refusés. Les valeurs inchangées sont omises.
Une annulation n’écrit rien ; un double clic ou une réponse réseau perdue ne rejoue pas la durée.
Sources : [contrat de transition et opérations de champs](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/),
[structure du worklog](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-worklogs/),
[exemple officiel de `update.worklog` dans Issue Update](https://docs.atlassian.com/software/jira/docs/api/REST/1000.1497.0/).
Tests unitaires, modèle et banc Chrome fictif ; validation Jira réel encore à effectuer.

## Intégration Jira — mode unique depuis 0.25.0

L'intégration a été introduite en 0.19.8.2 et durcie en 0.19.9.2. Depuis la décision du
09/10/2026, elle remplace le mode autonome. Son manifest est le manifest source et comprend :
- la permission `scripting` : un script de contenu sur le seul site autorisé, et l'injection de
  l'overlay sur une adresse de board suivie de `?sprintGoals=1`. Depuis 0.26.0, sur un board sans
  ce marqueur, il affiche un bouton flottant (racine fantôme, aucune lecture de la page) dont le
  clic ajoute le marqueur à l'adresse ; ailleurs, il ne fait rien ;
- `web_accessible_resources` : la page du board et ses ressources, exposées aux pages
  `https://*.atlassian.net/*` ;
- `frame-ancestors https://*.atlassian.net` pour les pages de l'extension ;
- des messages `postMessage` entre la page Jira hôte et la page du board encadrée, origine et
  fenêtre vérifiées, clés de ticket, identifiants de transition, identifiant de board et clé de
  projet validés.

L'ancienne absence de scripts de contenu et de ressources exposées concernait le mode autonome
historique. La section 2.2 décrit désormais la surface du paquet intégré.

| # | Constat | Gravité | État |
|---|---|---|---|
| S9 | La page du board, exposée à tout `*.atlassian.net` et encadrable par lui, pouvait être affichée par un autre site Atlassian (n'importe qui peut en créer un), chargée avec la session de l'utilisateur : glisser-déposer provoqué à son insu (écritures dans son Jira), et clé du ticket cliqué envoyée à la page hôte sans vérifier le site. | Moyenne | **Corrigé en 0.19.9.2** |
| S10 | Le clic automatique dans le menu de statut de Jira reconnaissait la transition par un libellé qui commence ou finit par son nom. Un élément voisin sans écran (« Démarrer la revue » pour « Revue ») pouvait être cliqué, et Jira l'exécutait aussitôt : une transition non voulue, hors de l'inventaire `writes.ts`. | Moyenne | **Correspondance stricte depuis 0.19.9.2, règle actuelle détaillée en 0.19.13.2 ci-dessous** |
| S11 | La reconnaissance de la fiche, du menu de statut et du formulaire dépend du DOM de Jira Cloud (rôles ARIA, libellés français et anglais). Une refonte d'Atlassian peut la mettre en défaut. | Information | Structurel, voir `DEVELOPER.md` §9 |

**S12 (0.26.0, information) — changement de board par la page hôte.** La vue demande à la page
Jira d'ouvrir un autre board par `sprint-goals:open-board`. Risque écarté : faire naviguer
l'onglet vers une adresse choisie par un tiers. La page hôte n'accepte le message que de son cadre
(`event.source`) et de l'origine de l'extension, exige un identifiant entier positif et une clé de
projet `^[A-Z][A-Z0-9_]*$`, ignore toute adresse reçue et forme elle-même
`/jira/software/c/projects/<clé>/boards/<id>?sprintGoals=1` sur sa propre origine. La vue n'envoie
le message que si le site connecté est celui de la page hôte. Une page Jira qui se poste le message
à elle-même est ignorée. Tests : `tests/experiment/hostBoardSwitch.test.ts`,
`tests/app/BoardModel.boards.test.ts` ; contrôle Chrome : `verify:jira` (messages forgés ignorés,
message valide suivi). Le bouton flottant, lui, n'ajoute qu'un paramètre à l'adresse courante :
une page pourrait le faire elle-même, et le garde-fou d'hébergement (S9) s'applique ensuite
inchangé.

**Suivi 0.26.4 — « Retour à Jira ».** Troisième message de la vue vers la page hôte,
`sprint-goals:close`, sans aucune donnée : la page hôte, après les mêmes contrôles de fenêtre et
d'origine, recharge sa propre adresse privée de `sprintGoals=1`. Aucune adresse n'est reçue.

**S9 — correctif.** `src/experiment/embeddingGuard.ts` (`embeddingTarget`) et `embeddedBoardTarget`
(`embedded.ts`), appelés dans `main.tsx` **avant tout rendu et toute lecture** : la page encadrée
ne démarre que si `location.ancestorOrigins` contient exactement une origine, égale à `jiraHost` et
au site normalisé, si `jiraBoard` est une adresse de board de ce site marquée `sprintGoals=1`, et si
ce site est autorisé dans Chrome. Sinon, elle affiche seulement « Sprint Goals ne s'affiche que dans
la page Jira de votre site connecté. » La clé d'un ticket cliqué n'est envoyée que si le site
connecté est celui de la page hôte. Depuis 0.25.0, aucun démarrage autonome ne contourne ce garde-fou.
Tests : `tests/experiment/embedding.test.ts` ; contrôle Chrome : `verify:jira` (alias historique
`verify:jira-direct-test`). Les résultats des exécutions sont consignés dans `DEVELOPER.md`.
Piste complémentaire non retenue faute d'essai : `use_dynamic_url` sur la ressource exposée
(l'adresse dynamique pourrait changer l'initiateur vu par la règle `Origin`).

**S10 — correctif.** `injectBoard.ts` ne clique que sur l'élément qui porte l'identifiant exact de
la transition (valeur d'attribut délimitée par des non-chiffres) et mentionne son nom, ou, sans
élément identifié, sur un unique libellé exactement égal au nom. Sinon, aucun clic : le menu reste
ouvert et l'utilisateur choisit (son propre geste). Chrome : `verify:jira-direct-test`, scénario
« transition ambiguë » (il échoue avec l'ancien code, qui cliquait l'élément voisin).

**0.19.14.2 — un seul chemin, celui du menu de statut.** L'essai par adresse directe est retiré :
sur le Jira Cloud de Denis il renvoyait une page vide, et lorsque Jira refusait d'encadrer cette
adresse, le cadre restait sur `about:blank` — la popin n'atteignait alors jamais son repli et
restait indéfiniment sur son message d'attente. Le comportement de 0.19.13.2 ci-dessous devient le
seul, avec deux garde-fous d'affichage (fiche non reconnue en 12 s : la page de Jira est montrée
telle quelle ; cadre inaccessible en 20 s : la popin se ferme et le dit) et une trace en console de
l'onglet. Aucun droit, aucune écriture, aucune règle de clic modifiés : S10 reste couvert par la
règle de 0.19.13.2.

**0.19.13.2 — le clic revient, encadré.** Sur le Jira Cloud de Denis, l'adresse directe renvoie une
page vide : la seule façon d'obtenir la fenêtre moderne de Jira reste de choisir la transition dans
son menu de statut. L'extension n'y clique que si le libellé d'un élément, comparé sans accents,
espaces, flèches ni ponctuation, vaut exactement le nom de la transition ou « nom + statut
d'arrivée » — le statut d'arrivée distingue deux transitions de même nom, dont l'une pourrait
s'exécuter sans écran. Sans correspondance certaine, aucun clic : le menu reste ouvert et
l'utilisateur choisit (S10 reste couvert à ce titre).

**0.19.11.2 — première tentative sans clic.** À la demande de Denis, une transition qui exige des
champs n'ouvre plus la fiche ni le menu de statut : la popin charge directement l'écran de cette
transition par identifiants, `/secure/CommentAssignIssue!default.jspa?id=<ticket>&action=<transition>`
(identifiants numériques validés par la page hôte). `!default` affiche le formulaire sans rien
exécuter ; la transition n'a lieu que si l'utilisateur le valide, dans l'interface de Jira. S10
devient sans objet : l'extension ne clique plus aucun élément de Jira, et ne peut donc plus
déclencher une transition voisine. Écart à noter (règle 8) : cette adresse de l'interface Jira est
documentée pour Data Center (communauté Atlassian, Jira 9.12), pas dans la documentation Cloud ; ce
n'est pas une écriture de l'extension (aucune requête émise par son transport), mais son existence
sur Cloud n'est constatée que par l'essai de Denis. Si Jira répond autre chose qu'un formulaire, sa
page est montrée telle quelle.

Non essayé sur Jira réel : l'écran de transition sur les workflows de Denis.

