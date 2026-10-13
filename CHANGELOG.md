# Historique synthétique

Les détails des anciennes versions, prototypes et validations sont conservés dans l'historique
Git. Ce fichier décrit les évolutions du produit, sans remplacer les procédures actuelles.

## 0.28.2 — Vérification du bouton sous Windows

- Le contrôle Chrome du placement prend en compte la largeur des barres de défilement Windows.
- Les scénarios de déplacement, redimensionnement, zoom et plein écran vérifient les marges dans le viewport visible.

## 0.28.1 — Simplification du bouton déplaçable

- Retrait de la section « Préférences personnelles » et de la commande de réinitialisation.
- Position du bouton toujours mémorisée localement par site, avec maintien automatique dans l'écran.

## 0.28.0 — Bouton Jira déplaçable

- Poignée de déplacement à la souris ou au toucher ; flèches du clavier (10 px, Maj : 1 px).
- Position relative enregistrée dans Chrome pour chaque site, commune à ses boards.
- Bornes de 12 px et adaptation à la fenêtre, au zoom et au plein écran, sans écraser le placement choisi.
- Réinitialisation dans Administration → Préférences personnelles, accessible sans droit de modification du board.
- Nouveau contrôle `verify:button` sur Chrome isolé, avec le vrai stockage de l'extension et des pages Jira fictives.

## 0.27.1 — Nettoyage de l'intégration Jira

- `src/integration/` et `tests/integration/` remplacent les dossiers `experiment/`.
- Entrées de compilation `jira-worker.js` et `jira-bootstrap.js`, contrôle `scripts/verify-jira.mjs`.
- Suppression des alias npm `*:jira-direct-test` ; `verify:transition` contrôle les popins natives.
- Retrait du formulaire de transition local, de sa sérialisation et de son banc d'essai.
  Les champs sont saisis et validés par Jira ; une ouverture impossible produit une erreur explicite.
- Documentation recentrée sur le mode Jira, retrait des copies de documentation macOS.
- Contrôle de l'archive aligné sur `activeTab`, déjà autorisé dans le manifest depuis la 0.26.0.
- Métadonnées Finder `.DS_Store` exclues des archives de distribution.
- Identité Chrome, permissions, données existantes et règles des swimlanes conservées.

## 0.27.0 — Installation

Onglet de bienvenue à la première installation, autorisation du site Jira seul possible,
puis ouverture de Jira. Le contrôle navigateur ferme cet onglet avant ses scénarios.
Installation constatée par Denis ; fusion dans `main` consignée au commit `816b7f1`.

## 0.26.0–0.26.6 — Accès au board

Reconnaissance de l'onglet courant avec `activeTab`, bouton flottant Sprint Goals sur les boards
autorisés, changement de board suivi dans l'URL et retour à Jira. Le clic charge réellement la
page marquée : l'essai sans rechargement ne fonctionnait pas sur l'instance testée. Le texte du
sprint devient la source par défaut des nouveaux boards Scrum, sans modifier les choix existants.

## 0.25.0 — Jira devient le mode unique

Le board exige une page Jira hôte autorisée. Un seul manifest et un seul paquet ; suppression du
fonctionnement autonome. Le lanceur ouvre Jira sans lire de ticket. Identifiant et stockage conservés.

## 0.24.0–0.24.4 — Kanban

Boards Kanban sans sprint, sous-filtre du board, épinglage des Goals partagé au board,
pagination des liens lorsque le schéma l'autorise et détection des lectures incomplètes.
Masquage des swimlanes vides hors objectifs, avis refermables, configurations IntelliJ partagées.

## 0.23.0–0.23.1 — Swimlanes par type

Groupes de types configurables, colonnes communes, compatibilité des réglages existants.
Détection de l'ajout en cours de sprint à partir de l'historique d'appartenance.

## 0.22.0–0.22.7 — Réglages et distribution

Enregistrement des réglages d'équipe à chaque modification explicite, droit `canEdit`,
administration simplifiée, épinglage dans les objectifs, outillage et captures pour le Store.

## 0.20.0–0.21.2 — Daily et présentation

Daily avec minuteur, navigation par swimlane, stock limité ; plein écran et sortie de présentation.

## 0.19.x — Tickets, objectifs et intégration

Écrans de transition, Goals atteints, défilement fixe, largeur des swimlanes, sous-tâches,
lecture des tickets restreinte au board. Exploration puis intégration directe dans Jira avec
fiche native et formulaire isolé. Les prototypes à onglet et à URL de transition directe ont
été abandonnés ; la transition est sélectionnée dans le menu natif Jira.

## 0.16.x–0.18.x — Déplacements et recherche

Dépôt par statut, choix de transition, refus des destinations inaccessibles, retour visuel en
cas d'erreur ; recherche de boards et confirmation de déconnexion.

## Versions initiales

Portage des règles du board, Goals Atlassian et texte du sprint, filtres, réglages,
contrôles réseau et sécurité. L'application macOS est abandonnée depuis septembre 2026.
