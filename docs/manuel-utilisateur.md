# Sprint Goals Board pour Jira — manuel utilisateur

Extension Chrome pour les boards Scrum et Kanban de Jira Cloud (`*.atlassian.net`).
Elle affiche objectifs, Build et swimlanes par type dans la page Jira, avec votre session habituelle.
Les captures proviennent de la version Scrum 0.22.7 ; certains libellés ont évolué.

## Installer et mettre à jour

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

Sur les boards autorisés, le bouton **Sprint Goals**, en bas à droite près de Rovo, ouvre la vue.
Déplacez-le par sa poignée gauche ; sa position est conservée pour ce site dans ce profil Chrome.
Au clavier, placez le focus sur la poignée puis utilisez les flèches, avec Maj pour affiner.
Échap annule un glissement.

**Retour à Jira** retrouve le board habituel. Le menu du nom du board, dans la barre latérale,
permet d'en choisir ou d'en ajouter un autre : l'adresse Jira suit toujours le board affiché.
Vous pouvez enregistrer cette URL dans vos favoris. Le paramètre `sprintGoals=1` ouvre la vue
Sprint Goals ; sans lui, Jira garde son affichage habituel. La vue ne s'ouvre pas hors de Jira.

## Lire et utiliser le board

![Vue principale du board](store/captures/01-board.png)

- **Objectifs** : une swimlane par objectif, sa progression et ses tickets. Elle devient verte
  quand tous ses tickets sont dans la dernière colonne visible. Un objectif épinglé peut rester vide.
- **Build** : tickets classés par objectif qui n'en ont pas, ou dont l'objectif est masqué.
- **Swimlanes par type** : groupes configurables, par exemple RUN ou OPS. Build et ces groupes
  disparaissent sans tickets ; Build réapparaît pendant un glissement pour permettre un détachement.
- **Filtres** : recherche, Personne / Type / Parent / Statut / Label, filtres rapides Jira et
  raccourcis pour tickets bloqués, mes tickets, priorité haute ou absence d'estimation.
- **Cartes** : cliquez pour ouvrir la fiche native Jira. Sa fermeture revient au board et relit
  les données. Les sous-tâches restent avec leur story ; le survol souligne toute la famille.
- **Déplacements** : glissez une carte pour changer statut, rang ou objectif. Jira ouvre son
  formulaire de transition si nécessaire. Les cartes d'une swimlane par type restent dans leur
  groupe ; leur colonne et leur rang peuvent changer.
- **Informations flottantes** : la croix ferme l'information pour ce board, y compris après
  rechargement. Ce choix est personnel.

![Story et sous-tâches au survol](store/captures/02-famille.png)

### Scrum

Les tickets de tous les sprints actifs sont réunis sans doublon. Le premier sprint par date de
début sert de référence pour les dates, l'épinglage et le texte des objectifs.
L'en-tête indique notamment points terminés, objectifs atteints, blocages et ajouts en cours de
sprint. Le filtre « ajouté en cours de sprint » permet de retrouver ces derniers.

Les objectifs proviennent par défaut du texte **Sprint Goal**, lu sans être modifié.
Vous pouvez choisir les **Goals Atlassian** dans l'administration. Si leur lecture échoue,
le board peut revenir au texte du sprint avec un message explicatif.

### Kanban

Le périmètre suit le filtre et le sous-filtre du board, dans les statuts de ses colonnes.
Il n'y a ni sprint, ni dates de sprint, ni filtre « ajouté en cours de sprint ».
Les objectifs viennent des **Goals Atlassian** liés aux tickets et de ceux épinglés au board.

Un échec de lecture des Goals signale une synchronisation impossible ; les tickets ne sont pas
reclassés automatiquement dans Build. Si le lien Goal → tickets n'est pas disponible, le champ
Goals des tickets peut servir de repli. S'il n'est pas identifié, relisez la structure (voir Support).
La lecture est limitée à **5 000 tickets** : au-delà, elle est refusée ; réduisez le filtre du board.

## Administration et partage

**Administration**, en bas de la barre latérale, ouvre les réglages sans quitter le board.
Les changements partagés sont enregistrés dans Jira pour toute l'équipe et exigent le droit de
modifier le board. Sans ce droit, le diagnostic reste accessible.

![Administration des objectifs](store/captures/03-objectifs.png)

- **Objectifs du sprint / du board** : couleur, masquage et épinglage de Goals Atlassian.
  L'épinglage garde une swimlane même sans ticket ; confirmez avec **Enregistrer dans Jira**.
  En Scrum il concerne le sprint de référence, en Kanban le board.
- **Colonnes** : renommez leur affichage, masquez-en ou ajustez leur limite WIP. Les statuts
  viennent de Jira ; les colonnes sont communes à toutes les swimlanes.
- **Types de tickets et swimlanes** : chaque type va dans **Par objectif**, une swimlane nommée
  ou **Ignorés**. **Nouvelle swimlane** crée un groupe ; retirer son dernier type le supprime.
  Vous pouvez renommer Build et les groupes, ou masquer une swimlane par type.
- **Case Bug** : un ticket lié de ce type est signalé comme bug sur la carte du ticket porteur.
  Ce choix est indépendant de la swimlane où le type est classé.
- **Champs et couleurs des cartes** : choisissez les champs affichés et les règles de couleur
  en JQL, évaluées par Jira.
- **Daily** : réglez la durée et le nombre de cartes initialement visibles dans la première colonne.

Les préférences personnelles, notamment filtres, swimlanes repliées et position du bouton Jira,
restent locales. Un calcul automatique ne publie pas de réglage dans Jira.

## Daily et présentation

![Mode Daily](store/captures/04-daily.png)

**▶ Daily** lance le plein écran, une swimlane à la fois, avec minuteur. Il devient orange dans
les deux dernières minutes, puis rouge en dépassement. **Précédent / Suivant** ou les flèches
← → changent de swimlane ; Espace met en pause, **Terminer** quitte la Daily.
Échap sort d'abord du plein écran sans arrêter la Daily ; hors plein écran, il la termine.
La première colonne montre trois cartes par défaut ; **+ N autres** déplie ce groupe seul.
Les cartes restent déplaçables pendant la réunion.

![Mode présentation](store/captures/05-presentation.png)

Le bouton chevalet de l'en-tête ouvre le **mode présentation** : board agrandi en plein écran,
sans barre latérale, en-tête ni panneau de santé. **Quitter** ou Échap retrouve la vue normale.

## Support et limites

- **Type absent de l'administration ou structure modifiée** : choisissez **Relire colonnes et
  types depuis Jira**. À l'ouverture, les types connus sont complétés par les tickets affichés ;
  cette relecture explicite recense aussi ceux du backlog ou d'anciens tickets.
- **Connexion ou droits** : ouvrez **Administration → Diagnostic**, lancez les contrôles puis
  relisez le rapport avant de le transmettre avec la description du problème.
- **Lenteur** : indiquez version de l'extension, Scrum ou Kanban, action concernée (ouverture,
  actualisation ou relecture de structure) et durée approximative. Le diagnostic de connexion
  ne fournit pas le détail des phases de chargement dans la vue Jira.

L'extension utilise votre session Jira Cloud, sans serveur de l'éditeur ni mesure d'audience.
Les écritures suivent vos actions et ne sont annoncées comme réussies qu'après confirmation de
Jira. Elle ne crée ni Goal ni sprint, ne démarre pas de sprint et ne modifie pas le texte Sprint Goal.

Pour diffuser ce manuel dans Confluence, ajoutez le lien de l'archive de votre équipe et
téléversez les cinq images de `docs/store/captures/` : le collage ne les récupère pas automatiquement.
