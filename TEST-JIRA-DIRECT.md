# Test — ouverture directe dans Jira

Cette expérimentation reste sur la branche `codex/test-ouverture-jira-directe`. Elle remplace, dans
`dist/`, le paquet autonome par le paquet d'essai : `npm run build` remet l'autonome.

## Installer le paquet d'essai

1. Construire le paquet avec `npm run build:jira-direct-test` : il sort dans `dist/`.
2. Dans `chrome://extensions`, recharger l'extension (ou charger `dist/` en mode développeur la
   première fois). Son nom devient « Sprint Goals — test ouverture Jira » et sa version finit
   par `.2`.
3. Le site connecté, le board et les réglages sont conservés : l'identifiant Chrome est le même
   que celui du paquet autonome. La permission `scripting` s'ajoute tant que ce paquet est chargé.

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
