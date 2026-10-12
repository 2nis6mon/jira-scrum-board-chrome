# Sprint Goals Board pour Jira

Extension Chrome pour organiser les tickets d'un board Jira Cloud en swimlanes par objectif,
avec Build et des swimlanes par type configurables. Elle fonctionne dans Jira, sur les boards
**Scrum et Kanban**, en utilisant la session du navigateur.

## Installer et ouvrir

Prérequis de compilation : Node >= 22.12.

```bash
npm ci
npm run build
```

1. Dans `chrome://extensions`, activer le mode développeur puis charger le dossier `dist/`.
2. À la première installation, saisir l'adresse du Jira dans l'onglet de bienvenue et autoriser
   l'accès à ce seul site. L'extension ne demande ni mot de passe ni jeton.
3. Ouvrir un board Jira et cliquer sur l'icône de l'extension, ou sur le bouton flottant
   **Sprint Goals** d'un site déjà autorisé.

Le board est affiché à son adresse Jira avec `?sprintGoals=1`. Cette URL peut être mise en favori.
**Retour à Jira** retrouve le board habituel. Une URL sans ce paramètre conserve l'interface Jira,
avec le seul bouton d'ouverture sur les boards autorisés.

Pour mettre à jour une installation de développement, reconstruire puis recharger l'extension
et l'onglet Jira. Garder la clé du manifest et le dossier d'installation pour conserver son identité.

Voir le [manuel utilisateur](docs/manuel-utilisateur.md) pour les réglages et l'installation
à partir d'une archive. Les captures existantes y sont identifiées par leur version.

## Fonctionnalités

- Scrum : tickets de tous les sprints actifs du board, sans doublon. Le texte du Sprint Goal est
  la source par défaut des nouveaux boards ; les Goals Atlassian se choisissent dans l'administration.
- Kanban : tickets du périmètre et du sous-filtre du board, Goals Atlassian uniquement.
- Goals épinglés au sprint ou au board Kanban, objectifs masqués réactivables, compteur des Goals
  atteints. Le vert indique que tous les tickets de l'objectif sont dans la dernière colonne visible.
- Colonnes et transitions issues de Jira ; déplacement dans la même colonne sans changement d'état,
  choix du statut cible et des transitions, changement d'objectif et de rang.
- Fiche native Jira au clic sur une carte. Formulaire natif Jira lorsqu'une transition exige une
  saisie ; la fermeture relit le board.
- Sous-tâches avec leur story, filtres locaux et filtres rapides Jira, champs et couleurs de cartes.
- En-tête, filtres et colonnes fixes ; titre de swimlane repoussé par la suivante au défilement.
- Présentation en plein écran et Daily avec minuteur, une swimlane à la fois.
- Réglages du board partagés dans Jira ; filtres et préférences d'interface personnels.

## Données et limites

Aucun serveur applicatif ni service de mesure d'audience. Les appels restent sur le site Jira
Cloud autorisé ; les préférences personnelles sont dans `chrome.storage.local`.

Les seules écritures métier de l'extension sont les transitions sans formulaire, le rang, les
liens ticket ↔ Goal, la propriété du sprint et les réglages du board. Les champs des formulaires
natifs sont gérés par Jira. Le champ texte natif « Sprint Goal » n'est jamais réécrit.
Les écritures ne sont jamais rejouées automatiquement. Une opération partiellement réussie est
signalée ; il n'y a pas de restauration automatique des modifications acceptées par Jira.

Un ticket lié à plusieurs Goals apparaît dans une seule swimlane. Un objectif vide n'est pas
atteint. Le Kanban refuse une lecture incomplète qui classerait les tickets dans de mauvais Goals.
Le client borne la lecture à 5 000 tickets et signale les dépassements. Les formulaires natifs
dépendent de l'interface Jira ; les particularités d'un workflow doivent être validées sur son site.

## Développer

```bash
npm run check       # types, lint, tests et construction
npm run watch       # compilation continue dans dist/
npm run harness     # interface locale avec données fictives
npm run verify:load # chargement/lanceur dans un Chrome temporaire
npm run verify:jira # intégration, fiche et transitions natives avec faux Jira
npm run verify:drag # glisser-déposer dans un Chrome temporaire
npm run package     # archive pour distribution dans release/
```

Les configurations IntelliJ sont dans `.run/`. Pour tester une autre construction sans toucher
à `dist/` : `npx vite build --outDir <dossier>`, puis
`EXTENSION_DIR=<dossier> node scripts/verify-jira.mjs`.

- [Guide développeur](DEVELOPER.md) : architecture, règles métier et livraison.
- [Intégration Jira](docs/integration-jira.md) : fonctionnement et scénarios à vérifier.
- [Contrats API et données](docs/API-CONTRACTS.md) : références utiles au code.
- [Audit de sécurité](docs/SECURITY-AUDIT.md) et [confidentialité](docs/privacy/index.html).
- [Travaux ouverts](TODO.md), [historique synthétique](CHANGELOG.md), [fiche Store](docs/store/fiche.md).

Les contrôles automatisés utilisent des services fictifs. Ils ne prouvent pas le comportement
de tous les workflows Jira réels. L'historique détaillé des versions retirées reste dans Git.
