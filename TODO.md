# TODO — Sprint Goals Board pour Jira

**Décision du 09/10/2026 — 0.25.0 : mode intégré Jira uniquement.** L'URL Jira reste derrière
la vue métier. Le lanceur ne fait que choisir l'URL d'un board et autoriser son site. Les commandes
`build`, `watch`, `check` et `package` produisent ce seul mode. Les rubriques datées ci-dessous
conservent l'historique des livraisons ; les procédures actuelles sont dans `DEVELOPER.md`.

**0.26.0 (09/10/2026)** : board reconnu au clic sur l'icône (`activeTab`), bouton « Sprint
Goals » sur les boards Jira, changement de board par navigation. À constater sur le Jira de
Denis : adresse des boards de projets gérés
par l'équipe, emplacement du bouton.

Mis à jour le 20/09/2026 pour la version 0.19.1, après revue du code et précisions de Denis.
Denis confirme utiliser la dernière version dans Chrome et que les fonctionnalités marchent.
Ce retour ne constitue pas un relevé détaillé de chaque scénario testé sur son Jira.

Ajouts du 24/09/2026 (0.19.20), à la demande de Denis : mode Daily (section 5) et relance du
Sprint Planning (section 4). Le reste du fichier n'a pas été revu depuis la 0.19.1.

Les décisions confirmées, les travaux restants et les pistes facultatives sont séparés ci-dessous.
L'ordre des travaux est une proposition ; les choix encore ouverts ne sont pas des autorisations
à développer de nouvelles écritures Jira ou à changer les permissions.

## Livré — 0.19.1

- [x] Autoriser la saisie du temps passé dans les transitions (`worklog`), en ajout au journal existant.
- [x] Story Points : champ numérique dynamique prérempli, décimales avec point ou virgule.
- [x] Envoi unique avec la transition, aucune écriture à l’annulation et aucune relance automatique.
- [ ] Valider les transitions demandant Time Spent et Story Points sur le Jira réel.

## Livré — 0.19.0

- [x] Formulaire de transition créé à partir des champs exposés par Jira, valeurs existantes conservées, validation explicite et erreurs par champ.
- [x] Repli vers Jira pour les champs non pris en charge ; aucune relance d’écriture incertaine.
- [ ] Validation utilisateur des écrans de transition sur les workflows réels.

## Livré — 0.18.3

- [x] Retirer le texte redondant sous la recherche de boards.
- [x] Retirer le repère vert et le message de réussite ; conserver le repère rouge en cas de problème.
- [x] Stabiliser les swimlanes pendant le glissement ; régression vérifiée avec de vrais gestes Chrome depuis deux Goals et Build.
- [ ] Validation utilisateur du correctif de glisser-déposer sur Jira réel.

## Livré — 0.18.2

- [x] Retirer l’ajout par URL ; préciser dans le sélecteur et la description que seuls les boards Scrum sont pris en charge, sans Kanban.

## Livré — 0.18.1

- [x] Autocomplétion : cinq suggestions directement sous le champ, sélection au clic ou au clavier.

## Livré — 0.18.0

- [x] Carte provisoire à destination pendant le déplacement et la relecture Jira.
- [x] Repère de confirmation ou d’avertissement pendant quatre secondes ; état Jira conservé lors d’une réussite partielle.
- [ ] Validation utilisateur de la lisibilité des repères sur un board réel.

## Livré — 0.17.0

- [x] Confirmation avant déconnexion, avec rappel de l’effacement des réglages locaux.
- [x] Recherche de boards Scrum par nom sur le site connecté : cinq résultats accessibles maximum, adresse en option.
- [ ] Validation utilisateur de la recherche sur Jira réel.

## 1. Décisions confirmées et éléments livrés

### Orientation et règles métier confirmées le 19/09/2026

- **Intégration Jira uniquement** : décision du 09/10/2026, qui remplace l'orientation initiale
  vers une page dédiée. Aucun board autonome ni retour vers ce mode.
- **Goals Atlassian privilégiés**, avec maintien de l'option « texte du sprint ».
- **Plusieurs sprints actifs** : afficher tous leurs tickets ensemble, sans doublon, avec un
  sprint de référence. Le comportement actuel est conservé : le premier par date de début donne
  les dates de l'en-tête, l'épinglage et, en mode texte, les objectifs et leurs rattachements.
  Les Goals Atlassian sont déduits des tickets de tous les sprints ; les textes des autres sprints
  ne sont pas réunis. Référence : `src/core/boardSync.ts`.
- **Plusieurs Goals pour un ticket** : conserver pour l'instant son affichage dans une seule
  swimlane. Le code retient le premier Goal lors de la résolution des associations
  (`src/core/atlassianGoals.ts`).
- Le champ Jira « Sprint Goal » reste en lecture seule. Le format de la propriété du sprint,
  partagé avec l'app Mac, reste inchangé.

### Livré

- [x] **0.13.0 — Réglages d'équipe** : publication explicite dans la propriété du board
  `com.scrumboardmac.boardsettings.v1`. À l'actualisation, une nouvelle version s'applique
  automatiquement si les réglages locaux n'ont pas divergé ; sinon elle est proposée avec
  « Appliquer » / « Garder les miens ». Les couleurs, l'ordre et les objectifs masqués font
  partie des réglages d'équipe ; repli des swimlanes, filtres, rafraîchissement et largeur de
  barre restent personnels. Format prévu pour être partagé avec l'app Mac ; cela ne signifie
  pas que sa prise en charge est déjà livrée dans l'app Mac.
- [x] **0.14.0 — Santé du sprint** : panneau repliable entre les filtres et les swimlanes,
  bouton icône dans l'en-tête, suppression de l'entrée séparée dans la barre latérale.
  La vue s'appelle « Sprint » ; « board » est conservé pour désigner le board Jira.
- [x] **0.14.1 — Audit de sécurité** : `docs/SECURITY-AUDIT.md`, avec correction des liens
  de Goals. Audit existant, sans prétendre à une validation de tous les usages réels.
- [x] **0.14.2 — Filtres simplifiés** : menus Priorité, Objectif et Composant retirés ;
  filtrage par objectif toujours accessible par le titre de sa swimlane.
- [x] **0.15.0 / 0.15.1 — Présentation** : interface allégée, sortie par bouton ou Échap,
  filtres et board agrandis.

**Abandonné** : déplacement des cartes au clavier (ancien lot 6c, décision de Denis).

## 2. Fiabilité des Goals — constats de la revue à traiter

Ces points viennent de la lecture du code ; ils ne sont pas des incidents reproduits sur le Jira
de Denis.

- [ ] **Compléter la lecture des tickets liés à un Goal.** Le client utilise
  `workItems(first: 100)` sans pagination de cette liste (`src/jira/goals.ts`). Le champ Goals
  des tickets peut compléter les associations, mais ne garantit pas leur exhaustivité.
  Vérifier les possibilités du schéma avant implémentation ; signaler une lecture incomplète
  si elle ne peut pas être poursuivie. Couvrir le cas de plus de 100 liens et l'absence de
  complément par le champ Goals des tickets.
- [x] **0.16.0 — Changement de Goal partiellement réussi** : le message précise désormais
  que l'ancien lien a déjà été retiré si la création du nouveau lien échoue ou reste incertaine.
  Les autres opérations déjà confirmées du déplacement sont également signalées.

---

## 3. Statuts et transitions — livré en 0.16.0, à essayer sur Jira

Règles validées avec Denis le 19/09/2026 :

- [x] Même colonne : jamais de transition, uniquement Goal et/ou rang.
- [x] Autre colonne : zones de dépôt par statut accessible, chargées au début du glissé.
- [x] Colonne inaccessible grisée, dépôt interdit. Chargement et échec de lecture distingués.
- [x] Plusieurs transitions vers le statut choisi : fenêtre de choix par nom d'action.
- [x] Écran de transition ou champs obligatoires : passage par Jira, sans écriture du déplacement.
- [x] Annulation avant toute écriture ; relecture du statut et des transitions après choix.
- [x] Ordre des opérations : transition, objectif, rang ; arrêt au premier échec, réussite
  partielle explicitée, aucune restauration automatique.
- [x] Zone de statut sans position précise : rang conservé ; position devant une carte : classement.
- [x] Colonne sans statut : reste masquée, explication conservée dans l'administration.
- [ ] Retour de Denis sur les zones de dépôt, ses transitions réelles et le mode présentation.

Les limites WIP restent des avertissements ; elles ne rendent pas un statut inaccessible.
L'accès à un statut dépend des transitions du ticket et des droits de l'utilisateur, pas d'un
statut par défaut configuré dans l'extension.

---

## 4. Outil de Sprint Planning

**Demande.** Préparer le sprint suivant : définir les objectifs, y associer des tickets, et
démarrer le sprint. Redemandée par Denis le 24/09/2026 : « un outil de Sprint Planning pour
définir les objectifs et associer les stories avant de lancer le sprint ».

**Contraintes à lever avec Denis avant tout code** (règles du projet, `CLAUDE.md`) :

- Aujourd'hui l'extension n'écrit que cinq choses dans Jira : propriété du sprint (épinglage),
  lien ticket↔Goal, transitions, rang, propriété du board (réglages d'équipe). Le planning demanderait des **écritures nouvelles** :
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

## 5. Mode Daily

**Demande de Denis (24/09/2026).** Un mode pour animer la daily :

- un bouton « play » lance un **minuteur**, 15 min par défaut, réglable dans l'administration ;
- le board passe en **plein écran** ;
- on le présente **swimlane par swimlane**, un objectif à la fois, avec des boutons **Suivant** et
  **Précédent** : à chaque étape, l'équipe est concentrée sur un seul objectif ;
- **on continue à pouvoir déplacer les tickets** entre colonnes et statuts pendant la daily, pour
  faire les mises à jour en direct.

**Sur quoi s'appuyer.** Le mode présentation (0.15.0–0.15.1 : barre latérale et en-tête masqués,
board agrandi, sortie par Échap), le focus sur un objectif (clic sur le titre d'une swimlane,
filtre par objectif) et le glisser-déposer par statut (0.16.0). Déplacer un ticket reste une
transition ou un rang, deux écritures déjà autorisées : le mode Daily n'en demande aucune nouvelle.

**Tranché par Denis le 24/09/2026, livré en 0.20.0 (branche `codex/mode-daily`).**

- [x] Plein écran du navigateur, demandé au clic sur « play », pour la daily seulement.
- [x] Étapes : ordre des swimlanes du board, Build et RUN compris ; masquées et vides sautées.
- [x] Minuteur global, plus le temps passé sur l'étape en cours.
- [x] Fin du temps : signal visuel seul (orange à 2 min, rouge et dépassement affiché), sans arrêt.
- [x] Durée réglée localement, par board (administration, section Board).
- [ ] À valider par Denis dans Chrome, puis fusion dans `main` sur sa demande.

## 6. Installation et distribution

- [ ] **Empaquetage pour l'installation** (ancien lot 6e).
- [ ] Choisir le mode de distribution et de mise à jour pour les autres utilisateurs.
- [ ] Préparer le paquet et les instructions correspondantes, sans embarquer de clé privée
  ni les données du banc d'essai.

## 7. Pistes facultatives — à décider selon les besoins

Le partage des réglages d'équipe via Jira est déjà livré : il n'est plus à choisir ni à refaire.

- [ ] **Export / import de configuration** : fichier JSON validé, aperçu des changements,
  distinction entre réglages d'équipe et préférences personnelles.
- [ ] **Préférences personnelles sur plusieurs postes** : étudier une propriété d'utilisateur
  Jira. Ce serait une nouvelle écriture, à vérifier dans la documentation et à faire valider.
  `chrome.storage.sync` reste exclu par les règles actuelles du projet.
- [ ] **Limites WIP** : étudier le minimum et les contraintes en points ; le code compare
  actuellement un nombre de tickets au maximum.
- [ ] **Disponibilité des Goals** : étudier les fonctionnalités exposées par le board pour
  adapter la proposition du mode Goals Atlassian ; vérifier la pertinence de cette information.
- [ ] **Déploiement Chrome géré** : configuration en lecture seule poussée par l'IT via
  `storage.managed`, seulement si un besoin de déploiement encadré apparaît.
- [x] **Intégration dans la page Jira** : mode unique en 0.25.0. Le manifest, les constructions,
  le lanceur et la documentation ciblent l'affichage du board sous son URL Jira.

## 8. Suivi documentaire et validation

- [x] Nettoyer ce TODO : retirer les décisions devenues obsolètes et intégrer les choix confirmés.
- [ ] Lors des prochains travaux, consigner les scénarios effectivement validés par Denis,
  notamment réception des réglages d'équipe sur un second poste, workflows particuliers,
  volumes importants et lecture croisée des épinglages avec l'app Mac. Ne pas les présenter
  comme échoués ou non fonctionnels sur la seule base d'anciennes mentions du README.

Les essais contre le vrai Jira restent réalisés par Denis, conformément à `CLAUDE.md`.
Les vérifications locales utilisent les faux services et le banc d'essai. Ne pas reconstruire
`dist/` pendant ses essais ; utiliser un dossier de sortie temporaire si nécessaire.
