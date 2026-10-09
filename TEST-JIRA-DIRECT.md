# Vérification — intégration dans Jira

Depuis la **0.25.0**, l'intégration Jira est le seul mode. Toutes les constructions produisent
le même paquet, sans suffixe `.2`. L'ancien nom de ce fichier et les alias `:jira-direct-test`
restent pour les liens et procédures existants.

## Installer

1. Construire avec `npm run build` : le paquet sort dans `dist/`.
2. Dans `chrome://extensions`, recharger l'extension, ou charger `dist/` en mode développeur.
3. Le site, les boards et les réglages des versions précédentes sont conservés : l'identifiant
   Chrome de développement reste le même. `scripting` fait partie du manifest intégré.

## Comportement attendu

- Le clic sur l'icône d'un board Jira déjà autorisé ouvre directement Sprint Goals pour ce board.
- Sinon, le lanceur affiche un formulaire : coller l'URL d'un board Scrum ou Kanban, autoriser
  ce seul site dans Chrome, puis ouvrir Jira. Le dernier board est prérempli lorsqu'il est connu ;
  son adresse peut être remplacée, notamment pour choisir un autre site.
- Le lanceur ne lit aucun ticket et n'affiche ni board ni administration.
- La vue s'ouvre sur l'URL Jira avec `sprintGoals=1` ; Sprint Goals recouvre cette page, qui reste chargée derrière.
- Cette URL peut être enregistrée dans les favoris et ouverte directement.
- La même URL Jira sans `sprintGoals=1` reste une page Jira normale, sans bouton ni onglet ajouté.
- Un clic sur une carte ouvre le vrai panneau Jira dans une popin de 1 280 px de large, avec des
  marges adaptatives de 16 à 60 px.
- La fermeture du ticket conserve le board Sprint Goals et déclenche sa mise à jour.
- Choisir un autre board depuis Sprint Goals rejoint l'URL Jira de ce board.
- Une transition qui exige des champs ouvre le formulaire natif Jira, sans le remplir ni le
  valider automatiquement.
- `board.html` ouvert directement, encadré par un autre site, imbriqué dans plusieurs cadres ou
  chargé sans autorisation du site reste bloqué avant toute lecture métier.

## Vérification automatisée

`npm run verify:jira` charge le paquet dans un profil Chrome temporaire et utilise un faux Jira.
L'alias `npm run verify:jira-direct-test` lance le même contrôle. Cela ne valide pas les workflows
de l'instance réelle ; ces essais restent à l'utilisateur.

Pour conserver un `dist/` en cours d'utilisation, construire dans un dossier temporaire avec
`npx vite build --outDir <dossier>`, puis lancer le script `scripts/verify-jira-direct-test.mjs`
avec la variable d'environnement `JIRA_DIRECT_DIST` pointant vers ce dossier.
