# Sprint Planning complet — idée gravée (01/11/2026)

Renverse la décision produit du 14/10/2026 (préparation locale, relecture avant écriture, ni démarrage
de sprint ni retrait de ticket, reste à faire consultatif). Maquette : [maquette-sprint-planning-v2.html](maquette-sprint-planning-v2.html).

## Décisions

- **Jira est la seule source, chaque geste écrit tout de suite.** Plus de brouillon local ni de
  « Relire et publier ». La page se reconstruit à l'entrée depuis Jira (texte de l'objectif, propriété
  `sprintgoals.v1`, tickets du sprint).
- **Objectifs** : suivent la source du board. Texte : ajout, suppression, ordre et renommage écrivent
  E8 puis E5 ; renommage à la validation du champ (Échap annule). Goals Atlassian : créés en amont,
  ajoutés par recherche par nom (`searchGoals`), épinglés sur le sprint (E5) ; aucune création.
- **Tickets** : poser un ticket sur un objectif l'ajoute aussitôt au sprint en préparation (E9) et le
  rattache. Sources : backlog et autres sprints futurs du board (sans alerte), reste à faire du sprint
  actif en consultation ; tickets sans objectif sous les objectifs.
- **Retrait** : uniquement depuis le sprint en préparation, vers le backlog (`POST
  /rest/agile/1.0/backlog/issue`, nouvel appel) ou un autre sprint futur (E9).
- **Clôture** : « Clôturer le Sprint N » ouvre la fenêtre native Jira, en début de séance ; à la
  fermeture, l'extension relit Jira et reporte les objectifs non atteints (tous leurs tickets pas dans
  la dernière colonne) dans le sprint en préparation, liens texte compris.
- **Démarrage** : « Démarrer le Sprint N+1 » ouvre la fenêtre native Jira, en fin de séance,
  désactivé tant qu'un sprint est actif.
- **Vélocité** : champ libellé visible dans l'en-tête, partagé dans `sprintgoals.v1` (E5), écrit à la
  validation ; anciennes propriétés sans ce champ toujours lisibles.
- **Conflit** : avant d'écrire le texte des objectifs, relire Jira ; s'il a changé, ne rien écrire,
  mettre la page à jour, demander de refaire. Une seule tentative par écriture.
- **Écran** : grammaire de la page du sprint (barre latérale avec choix du board, en-tête, mêmes
  filtres, swimlanes, cartes) ; sprint préparé dans le titre.

## Écartés

- Mode « Animer la séance » : un seul écran pour la préparation et la séance.
- Clôture et démarrage écrits par l'extension : fenêtres natives, aucune écriture nouvelle pour eux.
- Choix de la destination du reste à faire dans l'extension : fait dans la fenêtre native.
- Création de Goals Atlassian depuis le planning.
- Vélocité locale au navigateur.

## Ouvert

- **Droits** (en attente) : lire les droits à l'ouverture et annoncer la lecture seule (reco, si le
  contrat Atlassian le permet) ou basculer en lecture seule au premier refus.
- **Contrats Atlassian à vérifier** : retour au backlog, E9 depuis un autre sprint futur, ouverture des
  fenêtres natives depuis le backlog Jira, droits requis par chaque écriture.
- Un ticket envoyé ailleurs que dans le sprint en préparation lors de la clôture native est respecté.
- À répercuter : `AGENTS.md`, `docs/technique/` (invariants, sécurité E9), Epic 8, CHANGELOG.
