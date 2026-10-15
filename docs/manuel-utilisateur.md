# Sprint Goals Board pour Jira — manuel utilisateur

Ce guide explique comment installer l'extension, ajouter vos boards Jira et organiser le travail
par objectifs. Il s'adresse aux utilisateurs du board et aux personnes qui le configurent.

**Référence fonctionnelle : branche `main`, version 0.34.5, commit `c27606d`, vérifiée le 15 octobre 2026.**
Les captures utilisent cette version avec des données fictives. Les fonctions d'autres branches
ne sont pas décrites ici.

Sprint Goals Board fonctionne dans **Chrome, sur les boards Scrum et Kanban de Jira Cloud**
(`*.atlassian.net`), avec votre session Jira habituelle. Il affiche une autre vue d'un board
existant, dans sa page Jira. Vos droits Jira continuent de s'appliquer.

**Sprint Planning est absent du paquet Chrome Web Store.** Sa version expérimentale, disponible
uniquement dans une compilation locale `dist/`, est décrite en fin de guide.

## Sommaire

- [Installation](#installation)
- [Configuration du plugin](#configuration-du-plugin)
- [Ajouter un board depuis Jira](#ajouter-un-board-depuis-jira)
- [Ajouter un board depuis le plugin](#ajouter-un-board-depuis-le-plugin)
- [Utiliser le board](#utiliser-le-board)
- [Administration du board](#administration-du-board)
- [Daily et présentation](#daily-et-présentation)
- [Aide et dépannage](#aide-et-dépannage)
- [Annexe : Sprint Planning local](#annexe--sprint-planning-local)

## Installation

Vous devez pouvoir ouvrir votre board dans Jira avec votre compte habituel. L'administration
du board n'est pas nécessaire pour le consulter dans l'extension.

### Depuis le Chrome Web Store

1. Ouvrez la fiche **Sprint Goals Board pour Jira** sur le Chrome Web Store.
2. Cliquez sur **Ajouter à Google Chrome**, puis confirmez avec **Ajouter l'extension**.
3. Dans la barre d'outils Chrome, ouvrez le menu **Extensions** — l'icône puzzle — et épinglez
   l'extension pour la retrouver facilement.
4. Passez à la [configuration du plugin](#configuration-du-plugin).

Sur un poste géré par votre entreprise, l'installation peut dépendre de sa politique Chrome.
Voir l'[aide officielle de Chrome sur les extensions](https://support.google.com/chrome_webstore/answer/2664769?hl=fr).

### Depuis un dossier ou une archive fournie par votre équipe

1. Préparez un dossier permanent : décompressez l'archive
   `sprint-goals-board-<version>.zip`, ou utilisez le dossier `dist/` déjà compilé du projet.
2. Vérifiez que le dossier à sélectionner contient directement **`manifest.json`**.
3. Ouvrez `chrome://extensions` dans Chrome et activez **Mode développeur**.
4. Cliquez sur **Charger l'extension non empaquetée**, puis sélectionnez ce dossier.
5. Épinglez l'extension depuis le menu **Extensions** de Chrome.

Chrome charge le dossier décompressé, pas le fichier ZIP. Conservez ce dossier à son emplacement.
La [procédure officielle de chargement local](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked)
détaille ce mécanisme. La compilation et la création du paquet sont décrites dans le
[guide développeur](../DEVELOPER.md).

Le ZIP de distribution conserve les mêmes fonctions que la version Store, même chargé manuellement.
Seule une compilation locale `dist/` inclut le Sprint Planning expérimental.

### Mettre à jour une installation

**Installation Store :** Chrome gère les mises à jour. Rechargez les onglets Jira pour utiliser
la version installée.

**Installation depuis un dossier :**

1. Remplacez son contenu par la nouvelle version, ou faites reconstruire `dist/`.
2. Dans `chrome://extensions`, cliquez sur l'icône de rechargement de l'extension.
3. Rechargez vos onglets Jira.

Gardez le même dossier et la même identité d'extension pour conserver vos préférences locales.
Passer d'une installation locale au Store peut créer une installation distincte : autorisez
de nouveau le site et ajoutez vos boards. Leurs réglages partagés seront relus depuis Jira.

## Configuration du plugin

### Autoriser votre site Jira

À la première installation, l'onglet **Sprint Goals est installé** s'ouvre.

1. Dans **Adresse de votre Jira ou d'un board**, saisissez par exemple
   `https://votre-equipe.atlassian.net`, ou collez l'adresse complète d'un board.
2. Cliquez sur **Autoriser et ouvrir Jira**.
3. Acceptez la demande d'accès de Chrome pour ce site Jira.
4. Connectez-vous à Jira si votre session n'est pas déjà ouverte.

Avec une adresse de site, Jira s'ouvre : choisissez ensuite un board.
Avec une adresse de board reconnue, la vue Sprint Goals de ce board s'ouvre directement.
**L'extension ne vous demande ni mot de passe ni jeton Jira.**

Si l'onglet de bienvenue a été fermé, cliquez sur l'icône de l'extension dans Chrome.
Le formulaire **Sprint Goals dans Jira** permet de saisir la même adresse, avec le bouton
**Ouvrir dans Jira**. Une autorisation refusée peut être demandée de nouveau depuis ce formulaire.

Pour utiliser un autre site Jira, ouvrez un board de cet autre site dans Chrome, puis utilisez
l'icône de l'extension et autorisez ce site. Dans la vue intégrée, la connexion reste liée au
site Jira de la page qui l'héberge.

### Comprendre ce qui est personnel ou partagé

| Élément | Où s'applique-t-il ? |
|---|---|
| Sites autorisés et liste de boards ajoutés | À votre installation Chrome |
| Position du bouton Sprint Goals, largeur de la barre latérale, lignes repliées, informations fermées | À votre navigateur |
| Filtres de consultation | À la vue en cours ; ils sont remis à zéro lors d'un rechargement de la page ou changement de board |
| Rafraîchissement automatique | À votre navigateur |
| Swimlanes, objectifs masqués, couleurs et champs des cartes | Au board, partagés avec l'équipe via Jira |
| Goals épinglés | Au sprint de référence en Scrum, au board en Kanban |
| Statut, rang et liens vers des Goals Atlassian | Aux données des tickets dans Jira |

Il n'y a pas de paramétrage obligatoire avant la première consultation. L'extension lit les
colonnes, les statuts, les types et le mode d'estimation du board Jira. Les réglages déjà
partagés par votre équipe sont repris automatiquement.

## Ajouter un board depuis Jira

« Ajouter un board » signifie **ouvrir et mémoriser un board Jira existant dans l'extension**.
Cela ne crée aucun board dans Jira. Si le board n'existe pas encore, créez-le d'abord dans Jira.

1. Ouvrez le board Scrum ou Kanban voulu dans Jira.
2. Si le site est déjà autorisé, cliquez sur le bouton **Sprint Goals** présent dans la page,
   puis passez à l'étape 5.
3. Sinon, cliquez sur l'icône de l'extension dans Chrome. Le message
   **Board Jira reconnu dans cet onglet.** confirme la détection.
4. Cliquez sur **Ouvrir dans Jira** et acceptez l'accès demandé pour ce site.
5. Attendez le chargement : le board est ajouté à votre liste et ses tickets s'affichent.

Si l'autorisation est déjà accordée, le clic sur l'icône Chrome ouvre directement la vue,
sans formulaire intermédiaire. Aucune recherche ni configuration initiale n'est nécessaire.

### Placer le bouton et retrouver Jira

Dans cette version de `main`, le bouton affiche le texte **Sprint Goals** et une poignée à gauche.
Sa position initiale est en bas à droite, près de Rovo lorsqu'il est présent.

- Déplacez-le par sa poignée. La position est conservée pour ce site dans votre profil Chrome.
- Au clavier, donnez le focus à la poignée puis utilisez les flèches ; **Maj** affine le mouvement.
  **Échap** annule un déplacement en cours.
- Dans Sprint Goals, **Retour à Jira**, en bas de la barre latérale, retrouve la vue habituelle.
  Lorsque la barre latérale est repliée, ce bouton se trouve au-dessus du contenu.

Vous pouvez enregistrer l'adresse de la vue Sprint Goals dans vos favoris pour la rouvrir directement.

## Ajouter un board depuis le plugin

Ce parcours sert à ajouter un autre board **du même site Jira**, sans devoir le rechercher
au préalable dans les menus Jira.

1. Dans Sprint Goals, cliquez sur le **nom du board**, en haut de la barre latérale gauche.
2. Choisissez **Ajouter un board…**.
3. Dans l'écran **Quel board afficher ?**, saisissez tout ou partie du nom dans **Nom du board**.
   Ce champ recherche un nom : les adresses de boards se collent dans le lanceur Chrome.
4. Choisissez le résultat souhaité. La liste indique le nom, le type Scrum ou Kanban, ainsi que
   la clé du projet lorsqu'elle est disponible et le numéro du board.
5. Attendez la fin de **Lecture du board…**.

La recherche propose au maximum **cinq résultats**. Précisez davantage le nom si le board voulu
n'apparaît pas. Vous pouvez sélectionner un résultat avec les flèches puis **Entrée**.
**Annuler** revient au board précédent lorsqu'un board est déjà configuré.

Seuls les boards accessibles à votre compte Jira sont proposés. L'ajout ne modifie ni leur
structure ni leurs réglages Jira.

### Changer de board ou le retirer de votre liste

Le menu du nom du board permet de retrouver les boards ajoutés, d'utiliser **Ouvrir ce board
dans Jira** et de retirer le board courant avec **Retirer « … » de l'extension…**.
Confirmez ensuite avec **Retirer de l'extension**.

Le retrait efface les données locales de ce board ; il ne supprime ni le board Jira ni ses
réglages partagés. Vous pourrez l'ajouter de nouveau.

Lors d'un changement de board, la page Jira suit normalement le board choisi. Si l'extension
ne dispose pas des informations nécessaires pour construire son adresse, elle affiche le board
sur place et présente un avertissement : la page Jira située derrière reste alors la précédente.

## Utiliser le board

![Board Scrum : objectifs, cartes et progression](store/captures/01-board.png)

### Se repérer

La barre latérale contient le choix du board, l'accès **Sprint** ou **Kanban** et les lignes
du board. Cliquer sur une ligne vous amène à son contenu. Vous pouvez masquer cette barre,
tirer sa séparation pour changer sa largeur ou double-cliquer sur la séparation pour rétablir
sa largeur par défaut.

L'en-tête présente le sprint ou le board, sa progression et les actions **Actualiser**, **Mode
présentation** et **Daily**. Les filtres sont placés au-dessus des cartes. Les colonnes, leurs
statuts et leurs limites de travail en cours — WIP — viennent du board Jira.

### Comprendre les lignes du board

Une *swimlane* est une ligne horizontale qui répartit un groupe de tickets entre les colonnes.
Le classement suit cette règle : **l'objectif visible est prioritaire ; sinon, le ticket rejoint
la swimlane prévue pour son type.**

| Ligne | Tickets affichés |
|---|---|
| Objectif | Tickets rattachés à cet objectif, quel que soit leur groupe par défaut |
| Build, repéré par Default dans les réglages | Tickets sans objectif visible dont le type n'a pas de groupe dédié |
| Swimlane par type, par exemple RUN ou OPS | Tickets de ses types sans objectif visible |

RUN et OPS sont des noms configurables. Build peut également être renommé.

- Un objectif masqué conserve ses liens : ses tickets retrouvent la destination de leur type.
- Masquer une swimlane par type ne masque pas ses tickets placés dans un objectif visible.
- Un type classé **Ignorés** est exclu du board, même s'il possède un objectif.
- Build et les swimlanes par type disparaissent lorsqu'elles n'ont aucun ticket. Un objectif
  présent dans le board peut rester visible vide ; l'épinglage sert notamment à conserver un Goal vide.
- Une ligne contenant des tickets disparaît si aucun ne passe les filtres actifs. Pendant un
  déplacement, une destination vide peut être révélée pour permettre le dépôt.

Un ticket lié à plusieurs Goals Atlassian apparaît **une seule fois**, dans le premier objectif
retenu au chargement.

### Objectifs et progression

Un objectif devient vert lorsque tous ses tickets retenus dans ce board sont dans la dernière
colonne visible. Cela ne change pas le statut du Goal Atlassian. Un objectif vide n'est pas
compté comme atteint. Les filtres de consultation ne modifient pas ce calcul.

Cliquez sur le titre d'un objectif pour n'afficher que lui ; cliquez de nouveau pour quitter ce
focus. Le menu **⋯** d'une ligne permet notamment de **Replier**, **Tout replier** ou **Tout déplier**.
Les commandes **Monter** et **Descendre**, lorsqu'elles sont autorisées, changent l'ordre partagé.

### Particularités Scrum et Kanban

| | Scrum | Kanban |
|---|---|---|
| Périmètre | Tickets du board dans les sprints actifs retenus, sans doublon | Filtre et sous-filtre du board, dans les statuts de ses colonnes |
| Source des objectifs | Texte du sprint par défaut, ou Goals Atlassian | Goals Atlassian |
| Dates de sprint et filtre Ajoutés | Disponibles | Absents |
| Épinglage des Goals | Sprint de référence | Board |

Si plusieurs sprints actifs sont retenus, le premier par date de début sert de référence pour
le titre, les dates, le texte des objectifs et l'épinglage. Les sprints actifs sans ticket du
board sont écartés lorsqu'un autre en contient.

En Scrum, l'indicateur d'avancement utilise les points lorsqu'ils existent, sinon les tickets.
Il porte sur Build et les tickets des objectifs ; les tickets sans objectif des swimlanes par
type n'y sont pas inclus.

![Board Kanban organisé par objectifs](store/captures/02-kanban.png)

En Kanban, une erreur globale de lecture des Goals empêche la synchronisation ; elle ne
reclasse pas silencieusement tous les tickets dans Build. La lecture est limitée à **5 000
tickets** : au-delà, réduisez le périmètre du board Jira.

### Rechercher et filtrer

1. Utilisez **Rechercher** pour retrouver une clé, un résumé, une personne, un type ou un label.
2. Affinez avec **Personne**, **Type**, **Parent**, **Statut**, **Label** et les filtres rapides de votre board Jira.
3. Activez **Bloqués**, ou **Ajoutés** en Scrum, pour examiner ces situations.
4. Cliquez sur **Réinitialiser (N)** pour retirer les filtres et le focus d'objectif.

Plusieurs valeurs dans un même menu sont des alternatives ; les catégories se combinent.
Par exemple, deux personnes sélectionnées et un type affichent les tickets de ce type affectés
à l'une ou l'autre personne. Les intitulés « Mes tickets », « Priorité haute » ou « Sans estimation »
des captures sont des exemples de filtres Jira, pas des filtres livrés sur tous les boards.

Les limites WIP et la charge des colonnes restent calculées sur les tickets chargés, même après filtrage.

### Lire et ouvrir les cartes

Cliquez sur une carte pour ouvrir la fiche native Jira. Vous retrouvez ses champs, commentaires
et actions ; à sa fermeture, le board relit les données. L'en-tête et les zones de défilement
conservent la disposition native de Jira. **Ctrl/Cmd + clic** permet l'ouverture habituelle du
lien dans un nouvel onglet.

Quelques indicateurs utiles :

- **Bloqué** signale un lien Jira « est bloqué par ». Le drapeau Jira est un signal distinct.
- **Vieillissant** signale une absence de changement de statut au-delà du seuil choisi pour le board.
- **Ajouté en cours de sprint** apparaît lorsque l'historique permet de le déterminer.
- La progression des sous-tâches indique celles terminées et leur total ; son survol donne le détail.

Les sous-tâches ont leur propre carte lorsqu'elles sont renvoyées dans le périmètre du board
et possèdent un statut affichable. Elles ne sont donc pas toutes systématiquement visibles.
Sans objectif propre, elles héritent du lien connu de leur parent ; un objectif propre reste
prioritaire. Leur groupe par défaut suit celui du parent lorsqu'il est chargé. Elles peuvent
ainsi apparaître ailleurs que leur parent. Le survol souligne les membres visibles de la famille.

### Déplacer un ticket

- **Changer de statut :** glissez la carte dans la colonne voulue. Si elle contient plusieurs
  statuts, choisissez la zone de dépôt correspondant au statut souhaité.
- **Rattacher à un objectif :** glissez la carte depuis Build ou sa swimlane par type vers l'objectif.
- **Retirer d'un objectif :** ramenez la carte dans la destination prévue pour son type.
- **Prioriser :** déplacez la carte à la position voulue lorsque Jira autorise le changement de rang.

Le type Jira du ticket reste inchangé. Un ticket dont la destination par défaut est RUN ne peut
pas être déplacé vers OPS pour changer son type. Une sous-tâche détachée de son propre objectif
peut retrouver celui de son parent lors de la relecture.

Les changements de statut suivent votre workflow Jira. Si plusieurs transitions mènent au même
statut, l'extension choisit automatiquement la première disponible dans l'ordre fourni par Jira.
Si un formulaire est nécessaire, Jira l'ouvre : remplissez-le et validez-le vous-même.

Attendez la confirmation du résultat. Un déplacement peut réussir en partie, par exemple changer
le statut puis échouer sur le rattachement ; les opérations confirmées restent appliquées et
le message précise le résultat. Après une erreur ou un résultat incertain, consultez le board
actualisé avant de recommencer.

## Administration du board

### Ouvrir les réglages

1. Cliquez sur le **nom du board**, en haut de la barre latérale.
2. Choisissez **Réglages de ce board**.
3. Ouvrez l'onglet **Board**, **Objectifs**, **Champs des cartes** ou **Couleurs des cartes**.
4. Utilisez **Retour au board** pour revenir aux tickets.

Le menu **⋯** d'une ligne fournit aussi **Configurer les swimlanes…** ou **Gérer les objectifs…**.
Les réglages partagés demandent le droit de modifier le board. Si Jira vous refuse ce droit,
les accès correspondants ne sont pas proposés. Certains gestes, comme l'épinglage au sprint,
dépendent également des permissions du sprint.

### Savoir quand enregistrer

| Modification | Action nécessaire |
|---|---|
| Déplacement d'un type, ordre ou visibilité d'une swimlane, source des objectifs | Enregistrement dès le geste |
| Nom d'une swimlane ou valeur numérique saisie | Sortir du champ pour valider |
| Couleur ou masquage d'un objectif, boutons − / + | Enregistrement dès le clic |
| Champs supplémentaires des cartes | **Appliquer** |
| Règles de couleur, leur activation, ordre ou suppression | **Appliquer** |
| Épinglage ou désépinglage des Goals | **Enregistrer dans Jira** |

L'en-tête affiche **Enregistrement dans Jira…**, puis le dernier enregistrement confirmé et
son auteur. **Appliquez ou enregistrez avant de changer d'onglet** : les brouillons des champs,
des couleurs et des épinglages ne sont pas conservés après avoir quitté leur onglet.

### Onglet Board : organiser les swimlanes

![Administration : swimlanes et affectation des types](store/captures/03-swimlanes.png)

Dans **Swimlanes**, le badge **Default** identifie la destination par défaut, initialement nommée
Build. Vous pouvez la renommer. Certains types peuvent déjà être regroupés lors de la première
détection ; adaptez les affectations aux besoins de votre équipe.

Pour créer une ligne RUN, par exemple :

1. Cliquez sur **Nouvelle swimlane** et saisissez **RUN**.
2. Choisissez un premier type ou déposez-le dans la nouvelle ligne : ce premier type crée le groupe.
3. Ajoutez d'autres types par glisser-déposer, ou par leur menu **Déplacer vers…**.
4. Pour remettre un type dans la ligne par défaut, déplacez-le vers **Default**.
5. Réorganisez les lignes avec leur poignée. Au clavier, utilisez les flèches haut et bas.

Désactivez **Affichée** pour masquer une ligne. Pour supprimer une swimlane par type, déplacez
tous ses types ailleurs : retirer le dernier type supprime le groupe.

Le groupe **Ignorés** exclut ses types, même rattachés à un objectif ; utilisez-le seulement
pour les tickets qui ne doivent pas participer au board. Les types de sous-tâches ne se
configurent pas comme groupes indépendants.

**Réinitialiser l'ordre** remet les objectifs dans leur ordre d'arrivée, puis Build et les
groupes par type. Les swimlanes sont définies par types de tickets : les JQL servent aux couleurs,
pas à créer des lignes.

### Onglet Board : affichage, Daily et structure Jira

Dans **Affichage et daily**, réglez :

| Réglage | Effet | Choix |
|---|---|---|
| Seuil « vieillissant » | Signaler les cartes sans changement de statut depuis ce nombre de jours | 3 jours par défaut |
| Durée de la daily | Durée du minuteur global | 15 minutes par défaut |
| Stock en daily | Nombre de cartes dans la première colonne avant **+ N autres** | 3 cartes par défaut |
| Rafraîchissement automatique | Relire Jira périodiquement ; préférence personnelle | Désactivé, 1, 2 ou 5 minutes |

Les colonnes, statuts et limites WIP se modifient **dans les réglages du board Jira**.
Après une modification de structure, cliquez sur **Relire colonnes et types depuis Jira**,
dans cet onglet ou dans le menu du nom du board. Cette action permet aussi de retrouver des
types présents dans le backlog ou d'anciens tickets, absents du board actuellement affiché.

### Onglet Objectifs : choisir la source

**En Scrum, avec Texte du sprint :**

1. Dans Jira, renseignez le champ **Objectif** du sprint avec **une ligne par objectif**.
   Par exemple :

   ```text
   Simplifier la création de compte
   Fiabiliser le suivi des commandes
   ```

2. Dans l'extension, choisissez **Objectifs → Texte du sprint**. C'est la source initiale des
   nouveaux boards Scrum.
3. Revenez au board et rattachez les tickets aux lignes par glisser-déposer.

La vue du sprint lit ce texte sans le modifier. Les rattachements sont partagés dans Jira,
avec le sprint de référence ; ils ne créent pas de Goals Atlassian. Pour renommer ou ajouter
un objectif texte, modifiez le champ du sprint dans Jira puis actualisez le board.

**Avec Goals Atlassian :** choisissez cette source en Scrum. Elle est la seule disponible en
Kanban. Les Goals liés aux tickets constituent les objectifs, et les rattachements utilisent
les liens natifs Jira. L'extension ne crée aucun Goal : créez-le dans Atlassian au préalable.

### Onglet Objectifs : conserver, colorer ou masquer un objectif

Pour garder un Goal Atlassian visible même sans ticket :

1. Dans l'onglet **Objectifs**, repérez l'encart **Épingler un Goal du site**.
2. Recherchez par **Nom, clé ou responsable**, puis sélectionnez les Goals souhaités.
3. Cliquez sur **Enregistrer dans Jira**.

L'épinglage est partagé avec le sprint de référence en Scrum, ou avec le board en Kanban.
Pour désépingler, retirez la sélection et enregistrez de nouveau. Cela ne supprime ni le Goal
ni ses liens ; un Goal encore utilisé par les tickets peut rester présent.

La couleur et les commandes **Masquer** / **Réafficher** s'enregistrent immédiatement,
indépendamment de l'épinglage. Masquer un objectif conserve ses liens et replace ses tickets
dans la swimlane prévue pour leur type. La rubrique **Masqués du board** de la barre latérale
aide à les retrouver. Un Goal nouvellement découvert peut y être ajouté afin de préserver
l'organisation déjà choisie.

### Onglet Champs des cartes

1. Dans la section **Ajouter un champ**, choisissez un champ proposé ou recherchez un champ
   personnalisé par son nom ou son identifiant.
2. Ajoutez jusqu'à **trois champs**, puis ordonnez-les selon leur importance.
3. Cliquez sur **Appliquer** et vérifiez les cartes du board.

Les champs proposés comprennent **Fix version**, **Affects version**, **Labels** et **Composants**.
Les champs personnalisés simples — texte, nombre, choix, date ou utilisateur — peuvent être
affichés ; certains champs complexes restent vides. Le parent dispose de son propre affichage
et ne consomme aucun des trois emplacements.

L'aperçu utilise les valeurs déjà disponibles. Certains nouveaux champs ne sont lus qu'après
**Appliquer**.

### Onglet Couleurs des cartes

![Couleurs des cartes : règles JQL, validation et aperçu](store/captures/04-couleurs.png)

Une règle associe une couleur à une condition JQL, le langage de recherche de Jira.

1. Cliquez sur **Nouvelle règle** et donnez-lui un nom, par exemple **À surveiller**.
2. Saisissez une requête, par exemple `labels = "a-surveiller"`.
3. Utilisez les suggestions de champs, opérateurs, fonctions et valeurs fournis par Jira.
4. Attendez **JQL valide**, ou cliquez sur **Vérifier**. Corrigez les erreurs indiquées sous le champ.
5. Choisissez la couleur et placez la règle dans l'ordre souhaité.
6. Cliquez sur **Appliquer**, puis vérifiez les compteurs, l'aperçu et les cartes.

La **première règle active qui correspond** l'emporte. Une nouvelle règle arrive en tête ;
déplacez-la si une autre doit rester prioritaire. Les règles évaluent uniquement les tickets
du board chargé : elles n'ajoutent aucun ticket et ne créent aucune swimlane. Un `ORDER BY`
dans leur JQL ne change pas l'ordre des cartes.

Pour les suggestions, utilisez **↑ / ↓**, **Entrée** pour choisir, **Échap** pour fermer et
**Ctrl + Espace** pour rouvrir la liste. Une requête valide peut ne correspondre à aucun ticket.
**Non vérifié** indique que la validation n'a pas abouti, pas nécessairement une erreur de syntaxe.
Les règles actives nouvelles ou modifiées doivent être validées pour être appliquées.

**L'aperçu et les compteurs montrent les règles déjà enregistrées, après leur dernière évaluation.**
Ils ne prévisualisent pas le brouillon avant **Appliquer**.

En Scrum, la règle intégrée **Ajouté en cours de sprint** n'a pas de JQL à saisir : vous pouvez
changer sa couleur, son ordre ou son activation. Elle n'est pas proposée en Kanban.

En cas d'échec ou de modification concurrente, le brouillon reste disponible tant que cet onglet
reste ouvert. Copiez vos saisies utiles avant de cliquer sur **Annuler** pour relire les règles
enregistrées dans Jira.

## Daily et présentation

![Daily : parcours d'une swimlane à la fois](store/captures/05-daily.png)

### Animer une Daily

1. Préparez vos filtres : ils restent actifs pendant la Daily.
2. Cliquez sur **Daily**, à droite de l'en-tête.
3. Parcourez les lignes avec **Swimlane précédente** et **Swimlane suivante**, ou les flèches **← / →**.
4. Mettez le minuteur en pause ou reprenez-le avec son bouton. Le raccourci **Espace** fonctionne
   lorsque le focus n'est ni dans un champ de saisie ni sur un bouton.
5. Cliquez sur **Terminer** pour revenir à la vue normale.

La Daily fonctionne en Scrum et en Kanban. Elle parcourt les swimlanes contenant des tickets
visibles, y compris Build et les groupes par type ; les objectifs vides sont sautés.
Le minuteur est global, avec un indicateur séparé du temps passé sur la ligne. Il devient orange
dans les deux dernières minutes, puis rouge en dépassement.

Dans la première colonne, **+ N autres** révèle les cartes supplémentaires et **Afficher moins**
referme ce groupe. Les cartes restent consultables et déplaçables pendant la réunion.

Le mode demande le plein écran à Chrome ; s'il n'est pas accordé, la Daily continue dans la fenêtre.
**Échap** quitte d'abord le plein écran sans terminer la Daily ; hors plein écran, il ferme un menu
ouvert ou termine la Daily. Un rechargement de la page arrête la session.

### Présenter le board

Cliquez sur **Mode présentation**, l'icône de chevalet dans l'en-tête. Le board utilise l'espace
disponible sans barre latérale ni en-tête, avec ses filtres et ses cartes. **Quitter** permet
de retrouver la vue normale.

Pour revenir à Jira depuis la Daily ou la présentation, quittez d'abord ce mode, puis utilisez
**Retour à Jira**.

## Aide et dépannage

| Situation | Action conseillée |
|---|---|
| Le bouton Sprint Goals n'apparaît pas | Vérifiez que vous êtes sur un board Scrum ou Kanban, cliquez sur l'icône Chrome de l'extension, autorisez le site si nécessaire, puis rechargez Jira. |
| Aucun résultat lors de l'ajout d'un board | Précisez son nom, vérifiez le site connecté et votre accès au board dans Jira. |
| La session a expiré | Reconnectez-vous à Jira dans le même navigateur, puis réessayez. |
| Une colonne ou un type manque | Utilisez **Relire colonnes et types depuis Jira**, depuis le menu du board ou ses réglages. |
| Un ticket manque | Réinitialisez les filtres ; vérifiez le périmètre Jira, le statut, les types ignorés et les lignes masquées. Pour une sous-tâche, vérifiez aussi son parent. |
| Un objectif manque | Vérifiez la source choisie, la rubrique **Masqués du board**, ses liens et son épinglage, puis actualisez. |
| La lecture des Goals est partielle | Lisez l'information affichée et relisez la structure si le champ Goals des tickets n'est pas reconnu. En Scrum, un repli vers le texte du sprint peut être signalé. |
| Les réglages ne sont pas accessibles ou ne s'enregistrent pas | Faites vérifier les droits du board et, pour une action de sprint, les permissions correspondantes dans Jira. |
| Une information revient à l'écran | Sa croix permet de la fermer pour ce board ; ce choix est personnel. Les messages d'erreur liés à une nouvelle action peuvent réapparaître. |

### Utiliser le diagnostic

1. En bas de la barre latérale, ouvrez **Site Jira → Diagnostic**.
2. Les contrôles de **1 · Lectures** démarrent à la première ouverture ; **Relancer** les refait.
3. Si nécessaire, consultez le **Journal des écritures** pour retrouver les dernières actions.
4. Dans **3 · Rapport**, cliquez sur **Copier le rapport**.
5. Relisez ce rapport avant de le transmettre : il contient notamment les messages retournés
   par Jira. Ajoutez la version de l'extension, le type de board, l'action et le résultat attendu.

**2 · Test d'écriture** est un contrôle facultatif pour un board Scrum avec un sprint actif :
saisissez **Adresse du board Jira**, cliquez sur **Trouver le sprint actif**, puis sur
**Tester l'écriture sur ce sprint**. Il écrit, relit et supprime une propriété technique du
sprint ; il ne modifie ni les tickets ni le texte de l'objectif. En Kanban, les contrôles de
lecture restent utilisables.

Pour une lenteur, précisez également s'il s'agit de l'ouverture, d'une actualisation ou d'une
relecture de structure et donnez une durée approximative. Cette version ne propose pas de
popin détaillant les temps de chaque phase de chargement dans Jira.

### Déconnecter le plugin

Ouvrez **Site Jira → Se déconnecter**, puis confirmez. L'extension retire son autorisation
Chrome pour ce site et efface les données locales associées, dont la liste des boards, les
préférences et le journal. **Rien n'est supprimé dans Jira et votre session Jira reste ouverte.**
Pour réutiliser le plugin, autorisez de nouveau le site et ajoutez vos boards.

L'extension n'utilise pas de serveur applicatif de l'éditeur ni de mesure d'audience.
Consultez la [politique de confidentialité](privacy/index.html) pour le détail des données utilisées.

## Annexe : Sprint Planning local

**Cette fonction est expérimentale et réservée à une compilation locale `dist/`. Elle n'est
pas active dans le ZIP de distribution ni dans la version Chrome Web Store ; aucun réglage
ne permet de l'y activer.**

Sur un board Scrum, **Sprint Planning** permet de préparer un sprint futur par objectifs texte,
sans créer de Goal Atlassian. S'il n'existe pas de sprint futur, créez-en un dans Jira puis actualisez.

1. Ouvrez **Sprint Planning** dans la barre latérale et choisissez le sprint futur.
2. Ajoutez les objectifs attendus et ordonnez-les par priorité : chaque objectif correspondra
   à une ligne du texte du sprint.
3. Depuis le **Backlog**, glissez les tickets vers un objectif, ou utilisez leur sélecteur
   d'affectation. Les sous-tâches et les tickets terminés restent en consultation seule.
   **À organiser** accueille les tickets retenus sans objectif.
4. Consultez le **Reste à faire** des sprints actifs pour préparer la discussion. Ces tickets restent
   dans leur sprint ; ceux revenus au backlog après sa clôture pourront ensuite rejoindre le plan.
5. Ajustez la capacité envisagée et vérifiez la charge, les tickets non estimés et ceux à organiser.
6. Cliquez sur **Publier dans Jira**, relisez le texte et les ajouts proposés, puis confirmez.
   **Copier la synthèse** permet aussi de préparer un compte rendu.

La préparation reste un **brouillon personnel dans le navigateur**. La publication peut modifier
le texte du sprint futur et lui ajouter les tickets retenus du backlog ; elle ne démarre pas le
sprint et ne crée ni sprint ni Goal. Les tickets déjà présents ne peuvent pas être retirés ici.
Pour retrouver ensuite ces objectifs sur la vue du sprint, choisissez la source **Texte du sprint**.

Si Jira a changé, la publication s'arrête : copiez votre synthèse avant **Repartir de Jira**.
En cas d'échec partiel, les étapes déjà confirmées restent appliquées et sont indiquées ; vérifiez
le résultat avant de poursuivre. Jira contrôle les permissions de publication.
