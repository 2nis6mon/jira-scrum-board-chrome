# Sprint Goals Board pour Jira — manuel utilisateur

Extension Chrome pour les boards Scrum et Kanban de Jira Cloud (`*.atlassian.net`).
Elle affiche objectifs, Build et swimlanes par type dans la page Jira, avec votre session habituelle.
Les captures montrent la version 0.34.5 avec des données fictives et les fonctions du paquet
distribué. **Sprint Planning est réservé au `dist/` local et absent de la version Chrome Web Store.**

## Installer et mettre à jour

Si vous installez l'extension depuis sa fiche Chrome Web Store, Chrome gère ses mises à jour.
Les étapes ci-dessous concernent une installation manuelle depuis un dossier ou une archive.

### Installation depuis un dossier ou une archive

1. Préparez le dossier de l'extension : utilisez `dist/` après compilation du dépôt, ou
   décompressez l'archive `sprint-goals-board-<version>.zip` fournie par votre équipe dans un
   dossier permanent. Le dossier choisi doit contenir `manifest.json`.
2. Ouvrez `chrome://extensions` et activez **Mode développeur**.
3. Cliquez sur **Charger l'extension non empaquetée**, puis sélectionnez ce dossier.
4. Épinglez **Sprint Goals Board** dans la barre d'outils Chrome depuis l'icône puzzle.

Chrome charge un dossier, pas le fichier `.zip`. Pour compiler ou préparer une archive,
consultez le [guide développeur](../DEVELOPER.md).

### Mise à jour

1. Reconstruisez `dist/`, ou remplacez les fichiers du dossier installé par ceux de la nouvelle archive.
2. Dans `chrome://extensions`, cliquez sur l'icône de rechargement de la carte de l'extension.
3. Rechargez votre onglet Jira.

Gardez le même dossier et le même identifiant d'extension pour conserver vos préférences locales.
Installer un paquet sous un autre identifiant crée une autre extension : reconnectez le site ;
les réglages partagés reviennent depuis Jira, mais les préférences locales ne suivent pas.

## Ouvrir le board

À l'installation, l'onglet de bienvenue permet de saisir l'adresse de Jira, puis de cliquer sur
**Autoriser et ouvrir Jira**. Acceptez l'accès demandé par Chrome pour ce seul site.
Vous pouvez aussi vous connecter à Jira, ouvrir un board et cliquer sur l'icône de l'extension :
elle reconnaît son adresse et propose **Ouvrir dans Jira** si une autorisation est nécessaire.
Aucun mot de passe ni jeton n'est demandé par l'extension.

Sur les boards autorisés, la petite icône **Sprint Goals**, en bas à droite près de Rovo par défaut,
ouvre la vue. Son infobulle indique son nom. Déplacez-la par sa poignée gauche, par exemple dans
un espace libre de l'en-tête Jira : elle peut s'approcher à 4 px des bords. Sa position est conservée
pour ce site dans ce profil Chrome.
Au clavier, placez le focus sur la poignée puis utilisez les flèches, avec Maj pour affiner.
Échap annule un glissement.

**Retour à Jira**, en bas de la barre latérale, retrouve le board habituel. Si la barre est repliée,
le bouton reste visible au-dessus du contenu. Le menu du nom du board, dans la barre latérale,
permet d'en choisir ou d'en ajouter un autre : l'adresse Jira suit toujours le board affiché.
Vous pouvez enregistrer cette URL dans vos favoris. Le paramètre `sprintGoals=1` ouvre la vue
Sprint Goals ; sans lui, Jira garde son affichage habituel. La vue ne s'ouvre pas hors de Jira.

## Lire et utiliser le board

![Vue principale du board](store/captures/01-board.png)

- **Objectifs** : une swimlane par objectif, sa progression et ses tickets. Elle devient verte
  quand tous ses tickets sont dans la dernière colonne visible. Un objectif épinglé peut rester vide.
  L'objectif est prioritaire, y compris pour un ticket dont le type est configuré dans RUN ou OPS.
- **Build** : tickets sans objectif visible dont le type n'a pas de swimlane dédiée.
- **Swimlanes par type** : groupes configurables, par exemple RUN ou OPS, utilisés par défaut
  lorsque le ticket n'a pas d'objectif visible. Si un objectif est masqué, son rattachement est
  conservé et ses tickets retrouvent leur swimlane par défaut. Masquer une swimlane par type
  ne masque pas ses tickets rattachés à un objectif visible.
  Build et ces groupes disparaissent sans tickets ; la swimlane par défaut réapparaît pendant
  le glissement d'un ticket rattaché à un objectif pour permettre son détachement.
- **Filtres** : recherche, Personne / Type / Parent / Statut / Label, filtres rapides Jira et
  raccourcis pour tickets bloqués, mes tickets, priorité haute ou absence d'estimation.
- **Cartes** : cliquez pour ouvrir la fiche native Jira. Sa fermeture revient au board et relit
  les données. L'en-tête et le défilement des colonnes suivent la présentation native de Jira.
  Les sous-tâches restent avec leur story ; le survol souligne toute la famille.
- **Déplacements** : glissez une carte pour changer statut, rang ou objectif. Jira ouvre son
  formulaire de transition si nécessaire, avec sa présentation et ses défilements natifs.
  Si plusieurs transitions mènent au même statut,
  l'extension choisit automatiquement la première disponible dans l'ordre Jira, sans réglage.
  Une colonne contenant plusieurs statuts conserve une zone de dépôt par statut. Si l'action
  prévue n'est plus disponible, le board est actualisé et vous pouvez recommencer le déplacement.
  Glissez un ticket de RUN, OPS ou Build vers un objectif
  pour l'y rattacher ; ramenez-le dans sa swimlane par défaut pour le détacher. Son type reste
  inchangé : un ticket RUN sans objectif retourne dans RUN, pas dans OPS ou Build.
- **Informations flottantes** : la croix ferme l'information pour ce board, y compris après
  rechargement. Ce choix est personnel.

### Scrum

Les tickets de tous les sprints actifs sont réunis sans doublon. Le premier sprint par date de
début sert de référence pour les dates, l'épinglage et le texte des objectifs.
L'en-tête indique les points terminés et les objectifs atteints. Les filtres rapides permettent
de retrouver les tickets bloqués et ceux ajoutés en cours de sprint.

Les objectifs proviennent par défaut du texte **Sprint Goal**, lu sans être modifié par la vue du sprint.
Vous pouvez choisir les **Goals Atlassian** dans les réglages du board. Si leur lecture échoue,
le board peut revenir au texte du sprint avec un message explicatif.

### Kanban

Le périmètre suit le filtre et le sous-filtre du board, dans les statuts de ses colonnes.
Il n'y a ni sprint, ni dates de sprint, ni filtre « ajouté en cours de sprint ».
Les objectifs viennent des **Goals Atlassian** liés aux tickets et de ceux épinglés au board.

![Board Kanban organisé par objectifs](store/captures/02-kanban.png)

Un échec de lecture des Goals signale une synchronisation impossible ; les tickets ne sont pas
reclassés automatiquement dans Build. Si le lien Goal → tickets n'est pas disponible, le champ
Goals des tickets peut servir de repli. S'il n'est pas identifié, relisez la structure (voir Support).
La lecture est limitée à **5 000 tickets** : au-delà, elle est refusée ; réduisez le filtre du board.

## Préparer le Sprint Planning — version locale uniquement

Fonction expérimentale réservée à l'installation locale depuis `dist/` (`npm run build` ou
`npm run watch`). Elle est désactivée dans le ZIP de distribution et sur le Chrome Web Store ;
aucune option ne l'y active.

Sur un board Scrum, ouvrez **Sprint Planning** dans la barre latérale et choisissez un sprint futur.
S'il n'en existe pas, créez-le dans Jira puis cliquez sur **Actualiser**. Les objectifs viennent
uniquement du texte de ce sprint : une ligne par objectif, sans création de Goal Atlassian.

1. Nommez les résultats attendus avec **Ajouter un objectif**, puis ordonnez-les par priorité.
2. Cherchez les stories dans le **Backlog** et glissez-les vers un objectif. Le sélecteur d'affectation
   permet le même geste au clavier. **À organiser** accueille les tickets retenus sans objectif.
3. Consultez le **Reste à faire** pour alimenter la discussion : ces tickets restent dans le sprint
   actif. Après sa clôture dans Jira, ceux revenus au backlog pourront rejoindre le plan.
4. Ajustez la capacité envisagée si utile et vérifiez la charge par objectif, les tickets non estimés
   et ceux encore à organiser. Le mode de focus permet de discuter un objectif à la fois, sans timer.
5. Cliquez sur **Publier dans Jira**, relisez le texte et les ajouts, puis confirmez. Le sprint reste
   futur : son démarrage se fait dans Jira. **Copier la synthèse** prépare un compte rendu de la proposition.

Les gestes de préparation restent dans un **brouillon local**, retrouvé sur ce navigateur ; seuls
les plans publiés sont partagés via Jira. Les tickets déjà dans le sprint ne peuvent pas être retirés
ici, et les sous-tâches suivent leur parent dans Jira. Le planning ne change pas les réglages du board :
pour afficher ensuite ces objectifs sur la vue du sprint, utilisez sa source **texte du sprint**.

Si Jira a changé depuis le brouillon, la publication s'arrête. Copiez votre synthèse puis choisissez
**Repartir de Jira** pour examiner les nouvelles données. En cas d'échec à une étape de publication,
les étapes déjà confirmées restent appliquées et sont indiquées ; aucune écriture n'est rejouée seule.
Jira contrôle les droits de modification du sprint et d'ajout des tickets.

## Réglages du board et partage

Chaque board a ses réglages, ouverts depuis **Réglages de ce board** dans le menu du nom du board,
ou **Configurer les swimlanes…** / **Gérer les objectifs…** dans le menu ⋯ d'une swimlane.
Ils remplacent le board dans la page ; **Retour au board** y ramène. Ils sont enregistrés dans
Jira pour toute l'équipe et exigent le droit de modifier le board : sans ce droit, ils
n'apparaissent pas. L'en-tête indique qui les a enregistrés en dernier, et quand.

![Réglages des swimlanes et affectation des types](store/captures/03-swimlanes.png)

- **Swimlanes** (onglet Board) : les types sans swimlane dédiée sont réunis dans **Default**,
  la ligne Build dont le nom reste personnalisable. Glissez un type vers une swimlane, ou
  ramenez-le dans Default ; son menu permet le même déplacement. Les objectifs sont prioritaires.
  **Nouvelle swimlane** crée un groupe avec son premier type ; retirer le dernier supprime le groupe.
  Réorganisez les lignes par leur poignée, renommez-les ou masquez-les directement dans la liste.
  Le groupe **Ignorés** exclut ses types du board, même s'ils sont rattachés à un objectif.
- **Affichage et daily** : seuil « vieillissant », durée de la Daily et nombre de cartes visibles
  dans la première colonne, réglables au clavier ou par − et +. Le rafraîchissement automatique
  reste personnel.
- **Objectifs** : source des objectifs en Scrum, puis couleur, masquage et épinglage de Goals
  Atlassian. L'épinglage garde une swimlane même sans ticket ; confirmez avec **Enregistrer dans
  Jira**. En Scrum il concerne le sprint de référence, en Kanban le board.
- **Champs des cartes** et **Couleurs des cartes** : jusqu'à trois champs sous le titre, et des
  règles de couleur en JQL évaluées par Jira, rangées par glissé (la première règle satisfaite
  l'emporte). Un aperçu montre des cartes du board ; **Appliquer** enregistre.

Les champs JQL des couleurs proposent des champs, opérateurs, fonctions et valeurs provenant de
Jira. Utilisez les flèches et Entrée pour choisir une suggestion, Échap pour fermer la liste.
Jira valide la requête après la saisie ou avec **Vérifier** ; les erreurs et avertissements
s'affichent sous le champ. Une règle active doit avoir un JQL valide avant **Appliquer**.
Une requête valide sans résultat reste acceptée. Si Jira ne répond pas ou refuse l'enregistrement,
le brouillon est conservé. Un changement concurrent des règles bloque l'application : copiez votre
brouillon puis choisissez **Annuler** pour recharger les réglages de Jira.

![Couleurs des cartes et validation JQL](store/captures/04-couleurs.png)

Au clavier, une poignée déplace sa ligne avec les flèches haut et bas ; les onglets se parcourent
avec les flèches gauche et droite.

Les colonnes sont celles du board Jira, avec leurs noms et leurs limites WIP : elles se règlent
dans Jira. Un ticket est **bloqué** quand il a un lien Jira « est bloqué par ».

Les préférences personnelles, notamment filtres, swimlanes repliées et position du bouton Jira,
restent locales. Un calcul automatique ne publie pas de réglage dans Jira.

## Daily et présentation

![Mode Daily](store/captures/05-daily.png)

**▶ Daily**, à droite de l'en-tête, lance le plein écran, une swimlane à la fois, avec minuteur. Il devient orange dans
les deux dernières minutes, puis rouge en dépassement. **Précédent / Suivant** ou les flèches
← → changent de swimlane ; Espace met en pause, **Terminer** quitte la Daily.
Échap sort d'abord du plein écran sans arrêter la Daily ; hors plein écran, il la termine.
La première colonne montre trois cartes par défaut ; **+ N autres** déplie ce groupe seul.
Les cartes restent déplaçables pendant la réunion.

Le bouton chevalet de l'en-tête ouvre le **mode présentation** : board agrandi en plein écran,
sans barre latérale, en-tête ni panneau de santé. **Quitter** ou Échap retrouve la vue normale.

## Support et limites

- **Type absent des réglages ou structure modifiée** : dans l'onglet Board des réglages, ou
  dans le menu du nom du board, choisissez **Relire colonnes et types depuis Jira**.
  À l'ouverture, les types connus sont complétés par les tickets affichés ; cette relecture
  explicite recense aussi ceux du backlog ou d'anciens tickets.
- **Connexion ou droits** : ouvrez **Site Jira → Diagnostic**, en bas de la barre latérale,
  lancez les contrôles puis relisez le rapport avant de le transmettre avec la description du
  problème.
- **Lenteur** : indiquez version de l'extension, Scrum ou Kanban, action concernée (ouverture,
  actualisation ou relecture de structure) et durée approximative. Le diagnostic de connexion
  ne fournit pas le détail des phases de chargement dans la vue Jira.

L'extension utilise votre session Jira Cloud, sans serveur de l'éditeur ni mesure d'audience.
Les écritures suivent vos actions et ne sont annoncées comme réussies qu'après confirmation de
Jira. Elle ne crée ni Goal ni sprint et ne démarre pas de sprint. Seule la publication du Sprint Planning
modifie le texte Sprint Goal et ajoute les tickets retenus du backlog à un sprint futur.

Pour diffuser ce manuel dans Confluence, ajoutez le lien de l'archive de votre équipe et
téléversez les cinq images de `docs/store/captures/` : le collage ne les récupère pas automatiquement.
