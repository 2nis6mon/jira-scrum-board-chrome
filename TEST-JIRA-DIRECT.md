# Test — ouverture directe dans Jira

Cette expérimentation reste sur la branche `codex/test-ouverture-jira-directe`. Elle ne modifie pas
le paquet autonome `dist/`.

## Installer le paquet d'essai

1. Construire le paquet avec `npm run build:jira-direct-test`.
2. Dans `chrome://extensions`, charger le dossier `dist-jira-direct-test` en mode développeur.
3. Ouvrir une première fois l'extension et connecter le site Jira puis choisir le board Scrum.

Le paquet d'essai est une extension distincte. Cette première configuration lui accorde uniquement
l'accès au site Jira choisi.

## Comportement attendu

- Un clic sur l'icône ouvre le board actif dans Jira avec `?sprintGoals=1` et le board Sprint Goals
  recouvre toute la page.
- Cette URL peut être enregistrée dans les favoris et ouverte directement.
- La même URL Jira sans `sprintGoals=1` reste une page Jira normale, sans bouton ni onglet ajouté.
- Un clic sur une carte ouvre le vrai panneau Jira dans une popin de 1 280 px de large, avec des
  marges adaptatives de 16 à 60 px.
- La fermeture du ticket conserve le board Sprint Goals et déclenche sa mise à jour.

## Vérification automatisée

`npm run verify:jira-direct-test` charge le paquet dans un profil Chrome temporaire et vérifie ces
comportements sans utiliser le profil ni les données Jira de l'utilisateur.
