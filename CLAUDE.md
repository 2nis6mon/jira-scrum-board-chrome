# Consignes de contribution — Sprint Goals Board pour Jira

Extension Chrome pour Jira Cloud, uniquement dans une page Jira autorisée, en Scrum ou Kanban.
Le mode autonome et l'application macOS sont abandonnés.

## Références

- [README](README.md) : entrée du projet et index des documents.
- [Guide développeur](DEVELOPER.md) : architecture, API, intégration, sécurité E1–E7/S1–S12,
  validation, livraison et travaux restants. Référence technique unique.
- [Manuel](docs/manuel-utilisateur.md) : utilisation ; [historique](CHANGELOG.md) : versions livrées.

Éviter les copies entre documents. L'historique détaillé reste dans Git.

## Règles produit et sécurité

- Écritures métier limitées aux transitions, rang, liens ticket ↔ Goal et propriétés de sprint/board.
  Le diagnostic peut écrire puis supprimer sa propriété technique. Aucun nouvel endpoint
  d'écriture, hôte, droit Chrome ou assouplissement de CSP sans décision produit explicite et
  vérification du contrat Atlassian. Ne pas inventer d'API.
- Le texte natif « Sprint Goal » est lu, jamais écrit. Aucun démarrage de sprint, ajout au sprint
  ni création de Goal dans le périmètre actuel.
- Réglages partagés relus à chaque chargement, écrits seulement sur modification explicite.
  Aucun calcul automatique ne publie dans Jira. Sans `canEdit`, ils restent en lecture seule ;
  les préférences personnelles restent locales.
- Une seule tentative par écriture. Après un résultat incertain, relire Jira sans rejouer ;
  ne pas annoncer de réussite avant confirmation.
- Fiches et formulaires de transition natifs Jira. L'extension ne remplit ni ne valide les champs ;
  les transitions sans formulaire passent par l'inventaire REST.
- Préserver clés `com.scrumboardmac.*`, formats et identifiants persistés, lecture des anciennes
  données et clé publique du manifest. Ne jamais committer `.secrets/extension-key.pem`.
- Aucune donnée fictive dans `src/`, `public/`, `board.html` ou `launcher.html` : tests sous `tests/`,
  exclus du paquet. Distinguer contrôles fictifs et essais réels.

## Frontières techniques

- `src/jira/transport.ts` est le seul appelant de `fetch` : session, hôte contrôlé, redirections
  refusées, lectures rejouables, écritures jamais rejouées. `writes.ts` est l'inventaire fermé ;
  préserver ses tests exhaustifs et les garde-fous de sources.
- Ni DOM ni `chrome.*` dans `src/core/` ou `src/jira/`. Adaptateurs Chrome dans `src/app/platform/`,
  service worker et contenu injecté dans `src/integration/`.
- `embeddingGuard.ts` valide parent unique, origine, URL du board et permission Chrome avant
  création du modèle métier ou accès Jira. Messages hôte/vue : origine et fenêtre source vérifiées.
- La règle Origin vise seulement les POST de l'extension, identifiée comme initiateur, vers
  `|https://<site>/gateway/api/graphql|`. Ne jamais l'élargir aux pages web.
- `injectBoard` est copié par `executeScript` : aucun import ni état extérieur à sa fonction.
  `bootstrap.ts` reste un script de contenu sans import.

## Travail et livraison

- Répondre, commenter le code et écrire les commits en français.
- Ne pas lire les identifiants ou la session Jira de l'utilisateur. Contrôles sur profils Chrome
  temporaires et Jira fictif ; un essai réel nécessite l'autorisation de l'utilisateur.
- Branche `codex/...`, commit cohérent poussé sur sa branche. Fusion dans `main` sur demande explicite.
- Identité : `git -c user.name="2nis6mon" -c user.email="denis.simon@gmail.com" commit …`.
  Aucun trailer `Co-Authored-By`.
- Avant livraison : examiner le diff, les fichiers non suivis, les documents concernés et le
  changelog ; actualiser la version dans `package.json`, `package-lock.json` et `public/manifest.json`.
- Avant commit : `npm run check` et `npm run verify:jira`. Si `dist/` est en cours d'essai,
  construire ailleurs et utiliser `EXTENSION_DIR` comme décrit dans le guide développeur.
- Réutiliser les tests pertinents, ajouter une régression si le comportement change ; justifier
  toute nouvelle dépendance d'exécution (actuellement Preact et signals).
- Un seul paquet intégré dans Jira. `dist/`, `release/`, secrets et profils restent hors de Git.
  Configurations IntelliJ partagées dans `.run/` ; `.idea/` et réglages personnels ignorés.
