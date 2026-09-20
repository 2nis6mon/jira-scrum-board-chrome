# TODO — Sprint Goals Board pour Jira

Mis à jour le 20/09/2026 pour la version 0.18.1, après revue du code et précisions de Denis.
Denis confirme utiliser la dernière version dans Chrome et que les fonctionnalités marchent.
Ce retour ne constitue pas un relevé détaillé de chaque scénario testé sur son Jira.

Les décisions confirmées, les travaux restants et les pistes facultatives sont séparés ci-dessous.
L'ordre des travaux est une proposition ; les choix encore ouverts ne sont pas des autorisations
à développer de nouvelles écritures Jira ou à changer les permissions.

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

- **Page dédiée** : c'est l'orientation actuelle. Une intégration dans la page Jira a été évoquée,
  sans décision de la réaliser ; elle reste une piste facultative.
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
démarrer le sprint.

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

## 5. Installation et distribution

- [ ] **Empaquetage pour l'installation** (ancien lot 6e).
- [ ] Choisir le mode de distribution et de mise à jour pour les autres utilisateurs.
- [ ] Préparer le paquet et les instructions correspondantes, sans embarquer de clé privée
  ni les données du banc d'essai.

## 6. Pistes facultatives — à décider selon les besoins

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
- [ ] **Intégration dans la page Jira** : possibilité évoquée, pas de migration décidée.
  Piste proposée : afficher notre propre vue dans Jira, en conservant l'onglet dédié.
  L'injection, les communications avec l'extension, les permissions et la CSP nécessiteraient
  une étude et des validations spécifiques. Transformer le board natif serait une autre
  approche, plus dépendante de la structure de la page Jira.

## 7. Suivi documentaire et validation

- [x] Nettoyer ce TODO : retirer les décisions devenues obsolètes et intégrer les choix confirmés.
- [ ] Lors des prochains travaux, consigner les scénarios effectivement validés par Denis,
  notamment réception des réglages d'équipe sur un second poste, workflows particuliers,
  volumes importants et lecture croisée des épinglages avec l'app Mac. Ne pas les présenter
  comme échoués ou non fonctionnels sur la seule base d'anciennes mentions du README.

Les essais contre le vrai Jira restent réalisés par Denis, conformément à `CLAUDE.md`.
Les vérifications locales utilisent les faux services et le banc d'essai. Ne pas reconstruire
`dist/` pendant ses essais ; utiliser un dossier de sortie temporaire si nécessaire.
