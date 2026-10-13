# Sprint Goals Board pour Jira

Extension Chrome pour afficher les boards **Scrum et Kanban de Jira Cloud** en lignes par
objectif, avec **Build** et des lignes par type de ticket configurables. Elle fonctionne dans
la page Jira, avec la session du navigateur, sans serveur applicatif ni mesure d'audience.

## Installer

Avec Node **22.12 ou supérieur** :

```bash
npm ci
npm run build
```

1. Ouvrir `chrome://extensions`, activer le mode développeur et charger le dossier `dist/`.
2. Dans l'accueil de l'extension, saisir l'adresse Jira et autoriser ce site.
3. Ouvrir un board Jira, puis cliquer sur l'icône de l'extension ou sur **Sprint Goals**.

La vue utilise l'adresse du board avec `sprintGoals=1`, enregistrable en favori.
**Retour à Jira** retrouve l'affichage habituel. Après une mise à jour, reconstruire `dist/`,
recharger l'extension puis la page Jira. Conserver le dossier et la clé publique du manifest
pour garder l'identité de l'installation.

## Utiliser

- Scrum : tickets de tous les sprints actifs ; objectifs du texte du sprint ou Goals Atlassian.
- Kanban : tickets du board et de son sous-filtre ; Goals Atlassian uniquement.
- Déplacement des tickets, fiche et formulaires natifs Jira, filtres, sous-tâches, Daily et présentation.
- Réglages du board partagés dans Jira ; préférences d'interface personnelles dans Chrome.

Le champ natif « Sprint Goal » reste en lecture seule. Les écritures ne sont jamais rejouées
automatiquement. Les limites et les réglages sont décrits dans le manuel.

## Documentation

| Document | Pour quoi faire |
|---|---|
| [Manuel utilisateur](docs/manuel-utilisateur.md) | Installer, utiliser et régler le board |
| [Guide développeur](DEVELOPER.md) | Architecture, intégration Jira, API, sécurité, tests et travaux restants |
| [Consignes de contribution](CLAUDE.md) | Règles à respecter pour modifier le dépôt |
| [Historique](CHANGELOG.md) | Évolutions par version |
| [Fiche Chrome Web Store](docs/store/fiche.md) | Textes et éléments de publication |

La [politique de confidentialité](docs/privacy/index.html) reste séparée pour sa publication.
Pour développer : `npm run check` vérifie et compile ; `npm run watch` reconstruit en continu.
Les configurations IntelliJ sont dans `.run/` ; les autres commandes sont dans le guide développeur.
