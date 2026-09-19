# TODO — Sprint Goals Board pour Jira

Liste de travail décidée avec Denis le 19/09/2026. Chaque point donne ce que fait l'extension
**aujourd'hui** (vérifié dans le code, version 0.12.0), puis les questions à trancher avant de coder.

---

## 1. Sprint Health dans la vue Board, et « Sprint » au lieu de « Board »

**Aujourd'hui.** Sprint Health est une vue à part, ouverte depuis la barre latérale (entrée sous
*Board*). Elle reprend l'en-tête et les filtres du board, puis ses propres cartes : indicateurs,
avancement par objectif, périmètre, charge par colonne, composition, tickets à surveiller.

**Demande.** Déplacer Sprint Health à l'intérieur de la vue Board, et renommer *Board* en *Sprint*
dans l'application, sauf dans le titre « Sprint Goals Board ».

**À trancher.**

- [ ] **Où placer Sprint Health dans la vue ?** Pistes :
  - bascule dans l'en-tête du sprint, à côté du titre : `[ Board | Santé ]` ;
  - bouton icône (tracé de pouls) près de la flèche ronde, qui affiche ou masque la santé ;
  - panneau repliable au-dessus des swimlanes, sous la barre de filtres.
- [ ] **Icône, texte, ou les deux ?**
- [ ] L'entrée *Sprint Health* disparaît-elle alors de la barre latérale ?
- [ ] **Jusqu'où renommer ?** « board » a deux sens dans l'interface :
  - la **vue** du sprint en cours (entrée *Board* de la barre latérale) → *Sprint* ;
  - le **board Jira** lui-même, qui contient les sprints : « Boards enregistrés », « Ajouter un
    board par son adresse… », « Ouvrir ce board dans Jira », « Quel board afficher ? », section
    *Board* de l'administration (colonnes et types du board), « Masqués du board », « limites WIP
    du board », « filtres rapides du board Jira ». Renommer ceux-là en « sprint » serait inexact
    (on n'ajoute pas un sprint par son adresse). Proposition : ne renommer que la vue, garder
    « board » quand il s'agit du board Jira. À confirmer.

---

## 2. Changement de statut par colonne : plusieurs statuts, ou aucun

**Aujourd'hui** (`jira/transitionPlanner.ts`, port du `TransitionPlanner` du Mac) :

- Ticket déjà dans un des statuts de la colonne visée : aucune transition, seul le rang peut
  changer.
- **Colonne à plusieurs statuts** : le **premier statut de la colonne** (ordre du board Jira)
  atteignable par une transition directe est choisi **sans demander**. L'utilisateur ne choisit
  pas le statut.
- **Aucune transition directe** vers un statut de la colonne : une fenêtre liste les transitions
  que Jira autorise depuis le statut courant (qui peuvent mener ailleurs) ; l'utilisateur en choisit
  une ou ne change rien. Jamais d'enchaînement automatique de transitions.
- Transition qui exige des champs (écran de transition) : refusée, avec un message ; on passe par
  Jira.
- **Colonne sans statut** : masquée d'office (réglage « aucun statut Jira ») ; on ne peut pas y
  déposer de carte.

**À trancher.**

- [ ] Colonne à plusieurs statuts : garder le choix automatique du premier, ou **demander** quel
  statut (petite fenêtre quand plusieurs sont atteignables) ? Ou un statut par défaut réglable par
  colonne dans l'administration ?
- [ ] Faut-il montrer le statut choisi après coup (bandeau « passé en *Revue* ») ?
- [ ] Aucune transition directe : la fenêtre actuelle suffit-elle, ou faut-il proposer d'ouvrir le
  ticket dans Jira directement ?
- [ ] Colonne sans statut : la montrer grisée, avec « aucun statut Jira », plutôt que la masquer ?
- [ ] À valider sur le Jira de Denis : les transitions réelles de son workflow (aucune n'a encore
  été émise depuis l'extension).

---

## 3. Plusieurs sprints actifs et objectifs en mode « texte du sprint »

**Aujourd'hui** (`core/boardSync.ts`) :

- Les tickets de **tous** les sprints actifs sont affichés ensemble ; l'en-tête montre leurs noms
  joints par « + ». Un ticket présent dans deux sprints n'apparaît qu'une fois.
- Le **sprint de référence** est le premier sprint actif par date de début. C'est lui seul qui
  donne : dates et jours restants de l'en-tête, épinglage des Goals, et, en mode texte, **les
  objectifs** (lignes de son champ « Sprint Goal ») et **les rattachements** (propriété du sprint).
- En mode texte, les objectifs des **autres** sprints actifs sont donc **ignorés** ; leurs tickets
  ne peuvent être rattachés qu'aux objectifs du sprint de référence, et ces rattachements sont
  enregistrés dans la propriété de ce seul sprint.
- En mode Goals Atlassian, les objectifs viennent des tickets de tous les sprints ; seul l'épinglage
  dépend du sprint de référence.

**À trancher.**

- [ ] Mode texte, plusieurs sprints : réunir les objectifs de tous les sprints (préfixés par le nom
  du sprint ?), ou ne garder que le sprint de référence en le disant clairement ?
- [ ] Rattachement d'un ticket du sprint B à un objectif du sprint A : l'écrire dans la propriété de
  quel sprint ? (Règle actuelle : celle du sprint de référence.)
- [ ] Ou bien : choisir le sprint affiché (menu dans l'en-tête) au lieu de les mélanger ?
- [ ] L'app Mac se comporte comme l'extension aujourd'hui : un changement ici devra y être reporté
  (le format de la propriété du sprint est partagé et ne doit pas changer).

---

## 4. Outil de Sprint Planning

**Demande.** Préparer le sprint suivant : définir les objectifs, y associer des tickets, et
démarrer le sprint.

**Contraintes à lever avec Denis avant tout code** (règles du projet, `CLAUDE.md`) :

- Aujourd'hui l'extension n'écrit que quatre choses dans Jira : propriété du sprint (épinglage),
  lien ticket↔Goal, transitions, rang. Le planning demanderait des **écritures nouvelles** :
  - **ajouter un ticket à un sprint** (déplacer depuis le backlog) ;
  - **démarrer un sprint** (état, dates) ;
  - éventuellement **créer un Goal Atlassian**.
  Chacune doit être proposée, validée, ajoutée à l'inventaire des écritures (`jira/writes.ts`) et
  vérifiée dans la documentation Atlassian avant d'être codée.
- **Le champ « Sprint Goal » du sprint ne doit jamais être réécrit** (règle héritée du Mac). En mode
  texte, définir des objectifs passerait donc par la propriété du sprint, pas par ce champ ; en mode
  Goals Atlassian, par l'épinglage de Goals existants (déjà possible sur le sprint actif).
- Lecture nécessaire : sprints futurs du board et backlog (lectures seulement, à vérifier dans
  l'API Jira Software).

**À trancher.**

- [ ] Périmètre de la première version : objectifs + tickets seulement (préparation), le démarrage
  restant dans Jira ? Ou démarrage inclus ?
- [ ] Sur quel sprint : le prochain sprint futur du board, ou un sprint choisi ?
- [ ] Objectifs : Goals Atlassian existants épinglés au sprint futur, texte, ou création de Goals ?
- [ ] Forme : une vue *Planning* dans la barre latérale (backlog à gauche, objectifs en
  swimlanes à droite, glisser-déposer) ?
- [ ] Capacité : afficher la somme des story points par objectif et pour le sprint ?

---

## 5. Partager la configuration entre plusieurs postes et avec l'équipe

**Demande.** Si quelqu'un de l'équipe installe l'extension, comment retrouve-t-il la même
configuration (colonnes, types, couleurs, règles…) ? Est-ce possible ?

**Aujourd'hui.**

- Tous les réglages sont **locaux au navigateur** : `chrome.storage.local`, par site et par board.
  Un autre poste, ou un autre profil Chrome, repart de zéro : il faut refaire les réglages.
- Deux règles du projet l'imposent : réglages **jamais écrits dans Jira** (décision héritée du Mac)
  et **jamais dans `storage.sync`** (rien ne part chez Google).
- Ce qui est **déjà partagé** passe par Jira : Goals épinglés au sprint et rattachements du mode
  texte (propriété du sprint), liens ticket↔Goal, statuts, rang. Les colonnes, statuts et types
  viennent aussi de Jira, relus sur chaque poste.

**Ce qui vaudrait la peine d'être partagé** (réglages d'équipe) : noms et limites WIP des colonnes,
classement des types (Scrum, RUN, ignoré, bug), labels de blocage, nom de Build, seuil de
vieillissement, couleurs des objectifs, ordre des swimlanes, champs des cartes, règles de couleur.
**Ce qui resterait personnel** : swimlanes repliées, objectifs masqués, rafraîchissement
automatique, largeur de la barre latérale, filtres.

**Pistes, de la plus simple à la plus intégrée.**

- [ ] **Export / import d'un fichier** (réglages d'équipe d'un board en JSON) depuis
  l'administration. Aucune permission nouvelle, rien dans Jira ni chez Google. Le fichier circule
  à la main (Slack, Confluence) ; il faut réimporter à chaque changement. Import : validation stricte,
  aperçu de ce qui change, réglages personnels non touchés.
- [ ] **Propriété du board dans Jira** (comme celle du sprint, mais au niveau du board) : toute
  l'équipe la lit, et les changements sont partagés tout de suite. Mais c'est une **cinquième
  catégorie d'écriture** et cela **lève la règle « réglages jamais écrits dans Jira »** : à décider
  par Denis. À vérifier avant tout code : l'endpoint dans la spécification OpenAPI de Jira Software,
  les droits nécessaires pour écrire (administrateur du board ?), et le format, à partager avec
  l'app Mac.
- [ ] **Politique Chrome gérée** (`storage.managed`), si l'entreprise administre Chrome : l'IT pousse
  une configuration en lecture seule. Demande un schéma dans le manifest et l'accord de l'IT ;
  utile seulement pour un déploiement encadré.
- Écarté : `storage.sync`, interdit par les règles du projet, et qui ne synchronise que les postes
  d'**une même personne**, pas l'équipe.

**À trancher.**

- [ ] Partage ponctuel (fichier) ou partage vivant (Jira) ?
- [ ] Qui a le droit de modifier la configuration d'équipe : tout le monde, ou un responsable ?
- [ ] En cas de réglage local différent de celui de l'équipe : lequel l'emporte ?
- [ ] Même format que l'app Mac, pour qu'un réglage fait sur l'un serve à l'autre ?

---

## Déjà prévu : fin de l'étape 6

- [ ] 6c — Déplacer une carte au clavier (alternative accessible au glisser-déposer).
- [ ] 6d — Audit de sécurité de l'extension, sur le modèle de celui du Mac.
- [ ] 6e — Empaquetage pour l'installation.
