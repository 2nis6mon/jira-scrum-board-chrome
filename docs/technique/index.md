# Documentation technique — Sprint Goals Board pour Jira

Un seul produit : l'extension Chrome intégrée dans Jira Cloud. Le mode autonome et l'application
Mac sont abandonnés. Ces documents décrivent le code actuel ; l'historique des versions est dans le
[changelog](../../CHANGELOG.md) et le détail dans Git.

| Document | Contenu |
|---|---|
| [Note d'architecture](../../_bmad-output/planning-artifacts/architecture/architecture-sprint-goals-board-2026-10-27/ARCHITECTURE-SPINE.md) | Couches, modules, sens des dépendances, règles de structure AD-1 à AD-7, écarts à résorber |
| [Invariants fonctionnels](invariants.md) | Langue, périmètres, Goals, cartes, couleurs JQL, déplacements, Daily, réglages |
| [Intégration Jira et contrats API](integration-jira.md) | Hébergement dans Jira, bouton, messages hôte ↔ vue, fiches natives, lectures REST et GraphQL |
| [Données persistantes](donnees.md) | Propriétés `com.scrumboardmac.*`, clés `chrome.storage.local`, compatibilité des anciens formats |
| [Sécurité](securite.md) | Permissions, CSP, inventaire fermé des écritures E1–E9, constats S1–S12 |
| [Développement, contrôles et livraison](developpement.md) | Environnement, interrupteur Sprint Planning, commandes, CI, garde-fous |
| [Publication Chrome Web Store](../store/fiche.md) | Textes, images, permissions, production des ressources et soumission |
| [Backlog](../../_bmad-output/planning-artifacts/backlog.md) | Travaux restants et pistes produit à décider |

Règles de contribution, pour toute IA ou personne : [AGENTS.md](../../AGENTS.md).
Utilisation : [manuel](../manuel-utilisateur.md).
