# Scrum Board — application macOS pour piloter un sprint Jira par ses objectifs

Application macOS **native et autonome**. Aucun serveur, aucune base de données, aucune
installation technique. Chaque utilisateur se connecte avec **son propre compte Jira et
son propre jeton d'API**, stocké dans le **trousseau macOS**.

Jira reste la source de vérité. L'application n'est qu'une meilleure interface de
pilotage de sprint — en particulier autour des **objectifs**, invisibles ou presque
dans un Scrum Board Jira classique.

---

## Les objectifs de sprint

L'application sait travailler avec **deux sources d'objectifs**, réglables dans
*Administration → Objectifs*. Détail des vérifications et sources dans
[`docs/ATLASSIAN-API-CAPABILITIES.md`](docs/ATLASSIAN-API-CAPABILITIES.md).

### Mode « Goals Atlassian » (par défaut)

Les objectifs sont de **vrais objets Goal Atlassian**, ceux que votre organisation
utilise déjà. Atlassian a publié en janvier 2026 des API GraphQL officielles pour les
Goals, accessibles avec **le même jeton d'API** que le reste de l'application.

| Besoin | Mécanisme |
|---|---|
| Lister les Goals | `goals_search`, pagination suivie jusqu'au bout |
| Lire un Goal | `goals_byIds` — nom, clé, statut, propriétaire |
| **Tickets rattachés à un Goal** | `workItems` sur le Goal, complété par le champ Goals du ticket |
| Endpoint | `https://{site}.atlassian.net/gateway/api/graphql` |

Conséquence : **le rattachement ticket↔objectif n'est plus une donnée de
l'application**. C'est le lien Jira natif, posé dans Jira, visible dans Jira,
que l'application se contente de lire.

Le schéma exposé variant selon les instances, l'application **découvre les champs
disponibles par introspection GraphQL** au lieu de les supposer : une instance au
schéma différent dégrade l'affichage plutôt que d'échouer en bloc. Un diagnostic
dans *Administration → Objectifs* affiche l'endpoint, l'identifiant de site, les
champs détectés et la réponse brute en cas de problème.

### Les objectifs sont déduits des tickets

Les Goals se rattachent aux **tickets**, pas aux sprints — c'est le modèle
Atlassian. Les objectifs d'un sprint sont donc **déduits** de ses tickets, par deux
lectures combinées :

1. **Goal → tickets**, via le champ `workItems` de l'API Goals. Lecture de référence,
   indépendante du format du champ côté ticket.
2. **Ticket → Goals**, via le champ Jira porté par le ticket. Permet de découvrir des
   objectifs que le board ne connaît pas encore.

Sont retenus les objectifs ayant au moins un ticket dans le sprint, plus ceux
explicitement épinglés.

Conséquence : **aucun rattachement n'est stocké par l'application**. Un Goal apparaît
sur le board dès qu'un ticket lui est lié dans Jira, et disparaît quand plus aucun ne
l'est. Le champ est repéré par son nom ou son type, jamais codé en dur.

En début de sprint, un objectif sans ticket serait invisible. On peut donc
**épingler** un Goal depuis Administration : il s'affiche alors même sans ticket
rattaché. Cet épinglage — la seule donnée applicative qui subsiste — est enregistré
dans la propriété d'entité du sprint et référence de vrais objets Goal.

### Mode « texte du sprint » (repli, lecture seule)

Les objectifs sont les lignes du champ `goal` natif du sprint, **en lecture seule**.
Le rattachement ticket↔objectif est stocké dans la propriété d'entité du sprint.

L'application bascule **automatiquement** sur ce mode si les Goals ne répondent pas
à votre compte, en affichant la cause plutôt qu'un board vide.

---

## Ce que l'application écrit dans Jira — et rien d'autre

| Action | Écrit dans Jira |
|---|---|
| 🎯 Composer les objectifs du sprint | Propriété d'entité du sprint (sélection de Goals) |
| 🔗 Rattacher un ticket à un objectif | `goals_linkWorkItem` — lien Jira natif |
| 🔄 Déplacer une carte entre colonnes | Transition de workflow Jira |
| 📊 Réordonner une carte dans une colonne | `PUT /rest/agile/1.0/issue/rank` — rang du board |

### Le champ « objectif » du sprint n'est jamais réécrit

Ce champ appartient à l'équipe : elle y écrit ce qu'elle veut depuis Jira.
L'application le **lit** — c'est la source du mode texte — mais ne l'écrit jamais.
La méthode d'écriture a été retirée du client pour que cela ne puisse pas revenir
par inadvertance, et un test le vérifie à chaque exécution.

**Tout le reste est en lecture seule.** Résumé, description, assignee, priorité,
story points, labels, commentaires, création/suppression de tickets, gestion des
sprints : cela reste dans Jira.

### Le classement suit celui de Jira

Les tickets s'affichent dans l'ordre que Jira renvoie, c'est-à-dire leur **rang**.
Un glisser-déposer vertical dans une colonne écrit ce rang, exactement comme le
ferait Jira : déposer sur une carte place le ticket juste avant elle, déposer sous
la dernière l'envoie à la fin. Une ligne indique où la carte va tomber.

Le rang est **global au board** : réordonner ici déplace aussi le ticket dans le
backlog Jira. L'opération exige la permission *Planifier les tickets* ; sans elle,
Jira répond 403 et l'application l'affiche sans rien casser. Un dépôt qui ne change
pas la position n'écrit rien.

### Le déplacement d'une carte n'est jamais simulé

```
Glisser-déposer
      ↓
Relecture du ticket dans Jira        ← détection de conflit
      ↓
Lecture des transitions autorisées
      ↓
POST de la transition Jira
      ↓
204 confirmé par Jira
      ↓
Re-synchronisation, puis affichage
```

La carte **ne bouge pas** tant que Jira n'a pas confirmé. En cas de refus, elle reste
en place et le message explique pourquoi.

**Transitions multiples** : l'application n'enchaîne **pas** automatiquement plusieurs
transitions. Jira n'expose les transitions que depuis le statut courant ; le graphe
complet du workflow demande des droits d'administration. Enchaîner à l'aveugle
risquerait de laisser un ticket coincé dans un statut intermédiaire. Quand aucune
transition directe n'existe, l'application affiche **ce que Jira autorise réellement**
et vous laisse choisir.

---

## Plusieurs boards

Le sélecteur en haut à gauche de l'en-tête gère plusieurs boards **du même site Jira**,
directement depuis le board :

- **Changer de board** — liste des boards enregistrés (`⌃1` … `⌃9`, menu *Boards*).
- **Ajouter un board par son adresse** — collez l'URL Jira du board ; sa structure
  (colonnes, statuts, types, champ d'estimation) est lue dans Jira. Un board d'un autre
  site est refusé. Une adresse déjà enregistrée rouvre le board sans perdre ses réglages.
- **Ouvrir dans Jira**, **Copier l'adresse**, **Relire colonnes et types depuis Jira**.
- **Retirer de l'application** — efface les réglages locaux de ce board, après
  confirmation. Rien n'est supprimé dans Jira.

Chaque board possède **son propre espace de configuration** : colonnes et types, source
et Goals associés au board, règles de couleur, ordre et masquage des blocs, libellé
*Build*, seuils, rafraîchissement, sprint sélectionné. Les filtres sont remis à zéro au
changement de board. Le board unique d'une version antérieure est repris tel quel.

## Organisation de l'écran

- **Barre latérale** (248 pt, repliable par `⌃⌘S`) : sélecteur de board, navigation
  *Board* / *Sprint Health*, liste des **objectifs du sprint**, blocs *Build* et *RUN*,
  section repliable **« Masqués du board »**, et *Administration* en pied de barre.
  Cliquer un objectif fait défiler le board jusqu'à sa swimlane.
- **En-tête** : sprint, état, dates, jours restants, avancement en points, et compteurs
  cliquables — *bloqués* et *ajoutés* activent le filtre correspondant, *dans Build* fait
  défiler jusqu'au bloc.
- **Barre de filtres**, puis un **bandeau de colonnes unique** en haut du board.
  Chaque colonne garde un fond discret sur toute la hauteur de la swimlane, même vide ;
  pendant qu'on glisse une carte, les colonnes où elle peut aller s'affichent en pointillés.
  Pendant qu'on glisse un objectif, sa swimlane se réduit à son bandeau.
- **Apparence claire** imposée pour l'instant ; le jeu de couleurs sombre viendra plus tard.

## Organisation du board

- **Largeur adaptative** — les colonnes se partagent toute la largeur de la fenêtre : le
  board tient à l'écran sans défilement horizontal. Elles ne rétrécissent pas sous
  150 pt (190 pt en mode présentation) ; en deçà, le défilement horizontal reprend.

- **Ordre des swimlanes, entièrement manuel** — objectifs, *Build* et *RUN* se déplacent
  par glisser-déposer, par l'en-tête de swimlane ou par la ligne de la barre latérale
  (poignée à six points), qui suit l'ordre du board. Une ligne d'insertion marque la cible,
  dans les deux vues à la fois (couleur de l'objectif, gris pour Build et RUN). Après le
  dépôt, un bandeau *Ordre modifié · Annuler* ; `⌘Z` annule aussi. Au clavier,
  `⌥⌘↑` / `⌥⌘↓` déplacent l'objectif sélectionné. L'ordre est **propre à ce Mac** : rien
  n'est écrit dans Jira. Un nouvel objectif se place après le dernier objectif.
- **Couleur des objectifs** — attribuée automatiquement, modifiable par clic droit sur la
  swimlane ou dans *Administration → Objectifs*. Mémorisée **sur ce Mac, par board** : un
  objectif garde sa couleur d'un sprint à l'autre. Rien n'est écrit dans Jira. La couleur
  d'un objectif n'apparaît que sur son anneau, la teinte de sa ligne et sa barre ; un
  statut (bloqué, ajouté…) s'affiche toujours avec son icône et son libellé.
- **Glisser une carte d'un bloc à l'autre** — déposer une carte dans le bloc d'un objectif
  la **rattache à cet objectif** ; la déposer dans *Build* la détache. Si la colonne
  d'arrivée diffère, la transition de statut est faite ensuite. Chaque écriture est
  confirmée par Jira avant d'être affichée.
- **Swimlanes vides** — sans filtre, tous les blocs sont affichés, même vides (un objectif
  sans ticket doit se voir). Dès qu'un filtre est actif, les blocs sans ticket retenu
  disparaissent. Le bloc RUN n'apparaît que si le sprint contient des tickets RUN.
- **Plier / déplier** — le chevron de chaque en-tête replie le bloc, comme une swimlane
  Jira ; l'état est mémorisé par board. Clic droit sur un en-tête : *Tout replier* /
  *Tout déplier*.
- **Masquer un objectif** — clic droit sur son en-tête → *Masquer cet objectif du board*.
  Sa swimlane disparaît, mais **ses tickets restent visibles dans le bloc Build**, avec
  l'étiquette de leur objectif ; les y déplacer ne les détache pas dans Jira. Rien n'est
  supprimé dans Jira et les tickets restent comptés dans les indicateurs. L'objectif rejoint
  la section *Masqués du board* de la barre latérale ; l'œil barré le réaffiche, un objectif
  à la fois.
- **Bloc Build** — les tickets du sprint non rattachés à un objectif. Le libellé est
  modifiable dans *Administration*.
- **Choisir les objectifs** — *Administration → Objectifs* : associer des Goals Atlassian
  au board et les épingler au sprint. Les Goals eux-mêmes se créent dans Atlassian.

## Filtres rapides du board Jira

Les filtres rapides définis sur votre board Jira sont récupérés et proposés dans la barre
de filtres, distingués visuellement des filtres de l'application.

Leur JQL est **évalué par Jira**, jamais interprété localement : l'application demande à
Jira la liste des tickets correspondants et restreint l'affichage à ceux-ci. Plusieurs
filtres actifs se combinent en intersection. Si Jira rejette un JQL, le filtre est
désactivé et l'erreur affichée plutôt que d'appliquer un résultat partiel.

## Changement de périmètre du sprint

Les tickets entrés dans le sprint **après son démarrage** portent l'étiquette **« ajouté »**
et, par défaut, un fond de carte bleu (règle de couleur modifiable). Ils sont comptés dans
l'en-tête et dans *Sprint Health*.

L'information vient du changelog Jira : on cherche l'entrée où le sprint apparaît dans
`toString` sans être dans `fromString`, et on compare sa date à `activatedDate` du sprint.
Quand Jira ne fournit pas cet historique, **rien n'est affiché** — aucune estimation n'est
faite.

## RUN

Le bloc **RUN** du board montre les tickets RUN réellement dans le sprint. Il n'apparaît
que si le sprint en contient. Les types classés RUN se règlent par board, dans
*Administration*.

## Couleur de fond des cartes

*Administration → Couleurs* : chaque règle associe un **JQL** à une couleur, par exemple
`"Priorité incident" = P2`. Le JQL est évalué **par Jira** à chaque synchronisation,
restreint aux sprints actifs ; l'application ne l'interprète pas.
Si Jira refuse la requête, son message s'affiche sous la règle et celle-ci est ignorée.
**L'ordre de la liste est l'ordre de priorité** : quand plusieurs règles s'appliquent à un
ticket, la plus haute l'emporte. La règle intégrée « Ajouté en cours de sprint » (bleue
par défaut, sans JQL) figure dans la même liste et se place avec les flèches comme les
autres ; elle peut être suspendue ou changer de couleur. Coût : une à
deux requêtes de lecture par règle active et par synchronisation.

## Bugs rattachés à un ticket

Une carte dont le ticket porte des **bugs liés** (lien Jira, quel que soit son sens, ou
sous-tâche) affiche une pastille coccinelle : rouge avec le nombre de bugs **ouverts** et
leurs clés sous le titre, verte quand tous sont terminés. L'infobulle et la fiche du
ticket listent chaque bug avec son statut. Les types comptés comme « bug » se règlent dans
*Administration → Board → Types de tickets* ; par défaut, ceux dont le nom contient
« bug », « bogue », « anomalie » ou « defect ». Un type d'un autre projet, inconnu du
board, est jugé sur son nom.

## Ouvrir un ticket

Un clic sur une carte ouvre la **page Jira du ticket dans l'application**, via une vue web
intégrée.

> Le jeton d'API n'authentifie pas une session web. La première ouverture demande donc de
> se connecter à Jira dans cette fenêtre, comme dans un navigateur. La session est ensuite
> conservée, y compris entre deux lancements. Aucune donnée saisie là n'est lue par
> l'application : c'est la page Jira qui s'exécute.

Le ticket s'affiche dans un **panneau qui imite une fenêtre macOS, à l'intérieur de
l'application** : barre de titre portant la clé et le résumé, pastille rouge pour fermer,
pastille verte pour agrandir le panneau jusqu'aux bords de l'application — rien ne s'ouvre
à l'extérieur. Au repos, le panneau occupe 65 % de la largeur de la fenêtre, sans dépasser
2000 pt, et garde une forme constante. Sous la barre, uniquement la page Jira. Un double-clic sur la barre agrandit
aussi, `Échap` ferme, et le clic sur le fond assombri ne ferme pas, pour ne pas perdre une
connexion en cours de saisie. *Précédent* et *Recharger* restent accessibles par le menu
contextuel de la page et par le balayage à deux doigts.

> **Clé de sécurité / passkey : impossible dans la vue intégrée.** macOS réserve WebAuthn
> pour un site quelconque aux applications titulaires de l'habilitation
> `com.apple.developer.web-browser.public-key-credential`, qu'Apple n'accorde qu'aux
> navigateurs web. Si votre compte Atlassian impose cette validation en deux étapes, la
> connexion ne peut pas aboutir ici : un bandeau le signale ; l'icône de la barre de titre
> ouvre le ticket dans le navigateur. Mot de passe et code à usage unique (TOTP) ne sont pas
> concernés.

Quand la page ne s'affiche pas — hors ligne, proxy, connexion impossible — le panneau le
dit et propose *Réessayer*. Il n'y a pas de fiche de repli.

## Installation

**Prérequis** : macOS 14 (Sonoma) ou plus récent · un compte **Jira Cloud**.

Deux formats sont produits, au choix :

- **`ScrumBoard-2.2.0.pkg`** — double-cliquer, suivre l'installeur. Rien à monter ni à
  éjecter ; à la fin, macOS propose de placer le programme d'installation dans la
  corbeille. Demande le mot de passe administrateur (écriture dans */Applications*).
  Le paquet n'est pas signé (pas de certificat *Developer ID Installer*).
- **`ScrumBoard-2.2.0.dmg`** — ouvrir, glisser **Scrum Board** dans *Applications*, puis
  éjecter le volume et supprimer le fichier soi-même.

Puis lancer l'application.

> **Première ouverture** : l'application fournie ici est signée en *ad hoc*, pas
> notarisée par Apple (voir [Distribution](#distribution)).
>
> - **Si vous avez construit l'application vous-même** (`scripts/build-app.sh`), le
>   fichier n'a pas d'attribut de quarantaine : elle s'ouvre normalement, sans
>   avertissement.
> - **Si vous avez téléchargé le DMG**, macOS lui ajoute l'attribut de quarantaine et
>   Gatekeeper la bloque. Depuis macOS 15, **le « clic droit → Ouvrir » ne fonctionne
>   plus** pour ce cas. Il faut lancer l'application une fois, puis aller dans
>   **Réglages Système → Confidentialité et sécurité** et cliquer sur
>   **« Ouvrir quand même »**.
>
>   Alternative en ligne de commande, qui retire l'attribut de quarantaine :
>
>   ```bash
>   xattr -dr com.apple.quarantine "/Applications/Scrum Board.app"
>   ```
>
> Une fois l'application notarisée avec un certificat *Developer ID*, aucune de ces
> étapes n'est nécessaire.

### Créer votre jeton d'API Jira

1. Ouvrir <https://id.atlassian.com/manage-profile/security/api-tokens>
2. **Create API token**, lui donner un nom (par exemple « Scrum Board macOS »)
3. Copier le jeton — il n'est affiché qu'une fois

### Premier démarrage

| Étape | Ce qui est demandé |
|---|---|
| 1 | Adresse Jira (`societe.atlassian.net`), e-mail du compte, jeton d'API |
| 2 | **Tester la connexion** — vérifie le compte avant d'enregistrer quoi que ce soit |
| 3 | URL de votre Scrum Board, par exemple `https://societe.atlassian.net/jira/software/c/projects/ABC/boards/123` |
| 4 | **Détecter le board** — colonnes, statuts, sprints, types et champ d'estimation sont lus dans Jira |

Le classement Scrum / RUN est proposé d'après le nom des types de tickets
(« Anomalie », « Bug », « Incident »… → RUN) et reste ajustable dans *Administration*.

---

## Utilisation

### Vues

- Chaque carte porte l'**icône du type de ticket**, téléchargée depuis Jira avec
  authentification — sans en-tête, ces URL ne renvoient rien. En repli, un symbole
  déduit du nom du type plutôt qu'une icône muette.
- **Filtres rapides** réduits à deux : *Bloqués* et *Ajoutés* (tickets ajoutés après le
  démarrage du sprint).
  Les autres critères — personne, type, priorité, objectif, statut, label — gardent
  leurs menus dédiés.
- **Périmètre fixe** — le board affiche les tickets de **tous les sprints actifs** du board,
  réunis. Il n'y a pas de sélecteur de sprint : les sprints terminés et futurs ne sont pas
  consultables. Sans sprint actif, le board le dit et reste vide.
- **Board** (par objectifs, seule vue du board) · **Sprint Health** : indicateurs,
  avancement par objectif, changement de périmètre, charge par colonne, composition du
  sprint, tickets à surveiller. Les filtres de la barre s'y appliquent.
- **Administration** — *Board*, *Objectifs*, *Couleurs des cartes* et *Journal* des
  écritures Jira.
- **Mode présentation** — barre latérale repliée et cartes agrandies pour un écran de
  réunion ; en-tête et barre de filtres restent disponibles.

### Raccourcis

| Raccourci | Action |
|---|---|
| `⌘R` | Actualiser depuis Jira |
| `⌘F` | Rechercher |
| `⌘1` · `⌘2` | Board · Sprint Health |
| `⌘,` | Administration |
| `⌃⌘S` | Masquer / afficher la barre latérale |
| `⌥⌘↑` · `⌥⌘↓` | Monter / descendre l'objectif sélectionné |
| `⌘Z` | Annuler un changement d'ordre des swimlanes |
| `⇧⌘P` | Mode présentation |
| `⇧⌘R` | Réinitialiser les filtres |

### Indicateurs

Tous sont des **comptages directs** sur les données Jira. Aucun score de risque
n'est calculé.

- **Bloqué** — lien Jira natif *« est bloqué par »* (un bloqueur terminé ne compte plus),
  complété si vous le souhaitez par des labels configurés
  — au survol d'une carte bloquée, une bulle liste ses bloquants (clé, résumé, statut,
  colonne et assigné s'ils sont sur le board) ; un clic ouvre le bloquant dans le panneau Jira
- **Parent** — l'epic ou le ticket parent s'affiche toujours sur la carte, et le filtre
  *Parent* de la barre de filtres ne garde que ses enfants (ou les tickets *Sans parent*)
- **Champs des cartes** — Administration › *Champs des cartes* : jusqu'à 3 champs parmi
  Fix version, Affects version, Labels, Composants et un champ personnalisé Jira, affichés
  sous le titre. Réglage local, lecture seule ; seuls les champs choisis sont demandés à Jira
- **Drapeau** — champ Jira *Flagged* (« Ajouter un drapeau » sur le board Jira) : un
  drapeau rouge suit la clé du ticket. Signal distinct de *Bloqué*, en lecture seule ;
  le champ est repéré par son nom (*Flagged* / *Signalé*)
- **Vieillissant** — jours depuis le dernier changement de statut, lu dans le
  `changelog`. Si Jira ne le fournit pas, rien n'est affiché plutôt qu'une estimation
- **WIP** — limites `min`/`max` natives des colonnes du board Jira
- **Story points** — champ déclaré par le board (`estimation.field.fieldId`).
  Sans estimation, la progression s'exprime en nombre de tickets uniquement

---

## Sécurité

- Le jeton est enregistré dans le **trousseau macOS**
  (`kSecAttrAccessibleWhenUnlockedThisDeviceOnly`, sans synchronisation iCloud)
- Il n'est jamais écrit dans un fichier, une préférence ou un journal
- Les échanges se font uniquement en **HTTPS**, directement avec votre instance Jira —
  aucun serveur intermédiaire
- Les préférences locales ne contiennent aucun secret
- Le journal technique enregistre les transitions pour le diagnostic, **sans aucun secret**
- Les permissions Jira de votre compte sont respectées telles quelles : une action
  refusée par Jira est affichée comme refusée

---

## Construire depuis les sources

```bash
swift test               # 171 tests
./scripts/build-app.sh   # → dist/Scrum Board.app (universel arm64 + x86_64)
./scripts/make-dmg.sh    # → dist/ScrumBoard-2.2.0.dmg
./scripts/make-pkg.sh    # → dist/ScrumBoard-2.2.0.pkg
```

Prérequis : Xcode 15+ (développé avec Xcode 26.6 / Swift 6.3), macOS 14+.

### Signature et trousseau

Le script choisit automatiquement une identité de signature, par ordre de préférence :
*Developer ID Application*, puis *Apple Development*, puis ad hoc.

Ce choix n'est pas cosmétique. macOS lie l'entrée du trousseau à l'identité de
l'application : **avec une signature ad hoc, qui change à chaque build, chaque nouvelle
version se voit refuser l'accès au jeton enregistré par la précédente.** Avec un
certificat — même un simple certificat de développement — le Team ID est stable et le
jeton est conservé d'une version à l'autre.

Si l'application affiche malgré tout « Le trousseau a refusé l'accès au jeton
enregistré », c'est ce cas de figure : ressaisissez le jeton une fois, il sera
réenregistré pour la nouvelle signature.

En cas de fenêtre vide au lancement après une mise à jour, l'état de fenêtres restauré
par macOS peut être en cause :

```bash
rm -rf ~/Library/"Saved Application State"/com.scrumboardmac.app.savedState
```

### Distribution

Le script produit par défaut une signature **ad hoc**, suffisante en local mais
**pas pour une diffusion**. Pour distribuer à votre équipe :

```bash
export SIGN_IDENTITY="Developer ID Application: Votre Société (TEAMID)"
./scripts/build-app.sh && ./scripts/make-dmg.sh

xcrun notarytool submit dist/ScrumBoard-2.2.0.dmg \
  --apple-id "vous@societe.com" --team-id "TEAMID" \
  --password "<mot-de-passe-application>" --wait

xcrun stapler staple dist/ScrumBoard-2.2.0.dmg
```

Il faut pour cela un compte **Apple Developer Program** (99 $/an) et un certificat
*Developer ID Application*.

---

## État de vérification — ce qui a été testé, et ce qui ne l'a pas été

Distinction volontairement explicite.

### ✅ Vérifié sur cette machine

- Compilation, binaire universel arm64 + x86_64, signature, bundle `.app`, DMG
- **256 tests automatisés** au vert
- Lancement réel de l'application et affichage de l'écran de connexion
- Les appels Jira sont validés contre des **réponses simulées calquées sur la
  documentation Atlassian** : en-tête d'authentification, chemins, paramètres,
  corps envoyés, décodage, correspondance des codes d'erreur (400/401/403/404/429/5xx),
  limite de 32 Ko des propriétés d'entité, aller-retour complet des objectifs
- Logique métier : réconciliation des objectifs, résolution des transitions,
  filtres, progression, classement Scrum/RUN, détection du blocage

### ⚠️ Non vérifié — nécessite votre instance Jira

Le développement s'est fait **sans accès à une instance Jira** : les credentials sont
personnels et ne sont pas partagés. La lecture du board a été constatée fonctionnelle
lors d'un essai mené par l'utilisateur sur une instance Jira Cloud réelle (board, sprint
actif, objectifs, colonnes, tickets, story points et indicateurs affichés correctement).

Constaté par l'utilisateur sur son instance : lecture des Goals Atlassian, affichage des
tickets sous leur objectif, rattachement ticket↔Goal depuis la fiche du ticket
(mutations `goals_linkWorkItem` / `goals_unlinkWorkItem`), lecture/écriture/suppression de
la propriété de sprint.

**Les points suivants restent à valider :**

- Exécution d'une vraie transition de workflow
- Récupération et application des filtres rapides du board
- Détection du changement de périmètre sur un sprint ayant réellement évolué
- Connexion à Jira dans la vue web intégrée par mot de passe / TOTP (la connexion par
  clé de sécurité y est impossible, voir *Ouvrir un ticket*)
- Rattachement d'un ticket à un objectif par glisser-déposer entre blocs (1.6.3)
- Écriture du rang (réordonnancement) et permission « Planifier les tickets » (1.8.0)
- Nouvelle interface (2.0.0) : mise en page vérifiée par rendu d'images avec des données
  fictives, pas sur ton instance ; glisser-déposer et raccourcis non essayés en vrai
- Gestion de plusieurs boards et largeur adaptative des colonnes (1.7.0) — **rendu non
  vérifié visuellement** : l'application n'est pas lancée connectée pendant le développement
- Règles de couleur JQL, pastille des bugs liés (1.6.4) — en
  particulier la présence de `issuetype` dans les liens renvoyés par votre instance
- Stockage dans le trousseau depuis l'application signée

### ❌ Non réalisé, et pourquoi

| Point | Raison |
|---|---|
| Notarisation Apple | Aucun certificat *Developer ID Application* sur la machine de build — seul un certificat *Apple Development* est présent |
| Connexion par clé de sécurité / passkey dans la vue web intégrée | Habilitation Apple réservée aux navigateurs web — voir *Ouvrir un ticket* |
| Jira Server / Data Center | Ciblage Jira Cloud pour la V1 (`/rest/api/3`, jeton d'API). Le client est isolé, l'ajout est une évolution |
| Enchaînement automatique de transitions | Le graphe de workflow n'est pas accessible sans droits d'administration — voir plus haut |
| Mise à jour automatique de l'application | Reporté |

---

## Architecture

```
Sources/
  JiraKit/           Client HTTP Jira, modèles, erreurs, résolution des transitions
  ScrumBoardCore/    Trousseau, configuration du board, objectifs, filtres, audit
  ScrumBoardApp/     Interface SwiftUI
  JiraTestSupport/   Rejeu de réponses Jira — tests uniquement, jamais lié à l'app
```

Rien n'est codé en dur : projet, colonnes, statuts, types, champs et objectifs
proviennent tous de votre instance Jira. La configuration est portée par `BoardConfiguration`,
ce qui laisse la porte ouverte à plusieurs boards.

---

## Documentation

- [`docs/ATLASSIAN-API-CAPABILITIES.md`](docs/ATLASSIAN-API-CAPABILITIES.md) —
  vérification endpoint par endpoint, avec sources, et classification
  MUST HAVE / SHOULD HAVE / PHASE 2 / BLOCKED
