# Audit de sécurité — Sprint Goals Board pour Jira 0.14.0 (extension Chrome)

> **Suivi (0.14.1)** — S1 est corrigé et couvert par des tests (`tests/jira/site.test.ts`,
> `tests/guards/sources.test.ts`). Les autres constats sont des informations : risques
> structurels ou choix assumés, détaillés plus bas. Correctifs en fin de document.

Date : 19 septembre 2026 · Périmètre : commit `c785ea0` (0.14.0), extension construite par
`vite build`. Lot 6d de l'étape 6, sur le modèle de l'audit de l'app Mac
([`reference-app-mac/SECURITY-AUDIT-app-mac.md`](reference-app-mac/SECURITY-AUDIT-app-mac.md)).

## Méthode et limites

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

Aucune vulnérabilité critique, élevée ou moyenne identifiée. Aucun secret dans le code ni dans
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
| E6 | Publier les réglages d'équipe | `PUT /rest/agile/1.0/board/{id}/properties/com.scrumboardmac.boardsettings.v1` | « Publier pour l'équipe… » puis confirmation |

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
- l'absence de toute porte d'entrée : pas de script de contenu, pas de ressource accessible aux
  sites (`web_accessible_resources`), pas de `externally_connectable`, aucun écouteur de messages.

Une faille d'injection dans la page de l'extension serait grave pour cette raison. Aucune n'a été
trouvée (voir 2.3).

### 2.2 Permissions et surface d'exposition

- À l'installation : `storage` et `declarativeNetRequestWithHostAccess` (validée le 18/09/2026).
  Aucune permission d'hôte : l'accès à **un** site `https://<site>.atlassian.net/*` est demandé à
  la connexion, et rendu à la déconnexion.
- CSP des pages de l'extension :
  `default-src 'self'; script-src 'self'; object-src 'none'; style-src 'self'; img-src 'self' blob: data:; connect-src https://*.atlassian.net; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`.
  - Aucune page web ne peut encadrer l'extension (`frame-ancestors 'none'`, aucune ressource
    exposée).
  - Aucun formulaire n'est envoyé.
  - Aucune ressource externe n'est chargée.
- Service worker : il ouvre la page du board, ou y revient. Aucune requête réseau, aucun état,
  aucun écouteur de messages.

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
| Liens vers Jira | `https://<site>/browse/<clé encodée>`, ou l'adresse du board sur le site. Tous ouvrent un nouvel onglet avec `rel="noopener noreferrer"` (garde-fou depuis 0.14.1). ✅ |
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
- **Propriété du board** (E6) : réglages d'équipe (colonnes, types, labels, couleurs, ordre des
  swimlanes, objectifs masqués, champs des cartes, règles de couleur et leur JQL), date de
  publication. **S6** : elle contient aussi le nom affiché et l'identifiant de compte de la
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
