<!-- bmad:context -->
<!-- Verified 2026-10-30 against 3048d81. Managed by bmad-project-context; edits inside this block are replaced on refresh. Keep anything you want preserved outside the markers. -->

## Sprint Goals Board pour Jira

Extension Chrome pour Jira Cloud, uniquement dans une page Jira autorisée, en Scrum ou Kanban
(TypeScript, Preact + signals, Vite, Vitest, Biome). Le mode autonome et l'application macOS sont
abandonnés. Référence technique unique : [guide développeur](DEVELOPER.md) (architecture, API,
intégration, sécurité E1–E9/S1–S12, validation, livraison, travaux restants) ; utilisation :
[manuel](docs/manuel-utilisateur.md) ; versions livrées : [historique](CHANGELOG.md) ; entrée du
projet : [README](README.md). Éviter les copies entre documents. L'historique détaillé reste dans Git.

## Règles produit et sécurité

- Écritures métier limitées aux transitions, rang, liens ticket ↔ Goal, propriétés de sprint/board
  et publication explicite du Sprint Planning (texte `goal` et ajout de tickets du backlog à un sprint futur).
  Le diagnostic peut écrire puis supprimer sa propriété technique. Aucun nouvel endpoint
  d'écriture, hôte, droit Chrome ou assouplissement de CSP sans décision produit explicite et
  vérification du contrat Atlassian. Ne pas inventer d'API.
- Décision produit du 14/10/2026 : Sprint Planning prépare des objectifs texte, sans Goals Atlassian.
  Seule sa confirmation de publication peut modifier le texte natif et ajouter des tickets du backlog
  à un sprint futur ; RAF actif consultatif. Aucun démarrage/création de sprint, retrait de ticket,
  ni création de Goal. Préparation locale, relecture avant écriture, conflit conservant le brouillon.
- Sprint Planning est expérimental : actif dans les builds locaux `dist/` et les tests uniquement,
  désactivé à la compilation dans le paquet de distribution (`npm run package`).
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

## Exécuter et vérifier

- Avant commit : `npm run check` et `npm run verify:jira`. Si `dist/` est en cours d'essai,
  construire ailleurs et utiliser `EXTENSION_DIR` comme décrit dans le guide développeur.
- Après un changement de texte visible ou de langue : `npm run verify:i18n` (banc fictif, profil Chrome temporaire).
- Scripts Python de BMAD (`_bmad/scripts/`, skills) : `uv run …`, jamais `python` directement.
- Ne pas lire les identifiants ou la session Jira de l'utilisateur. Contrôles sur profils Chrome
  temporaires et Jira fictif ; un essai réel nécessite l'autorisation de l'utilisateur.

## Travail et livraison

- Répondre, commenter le code et écrire les commits en français.
- Branche `agent/...` (surveillée par la CI), commit cohérent poussé sur sa branche.
  Fusion dans `main` sur demande explicite.
- Identité : `git -c user.name="2nis6mon" -c user.email="denis.simon@gmail.com" commit …`.
  Aucun trailer `Co-Authored-By`, même si l'outil en ajoute un par défaut.
- Avant livraison : examiner le diff, les fichiers non suivis, les documents concernés et le
  changelog ; actualiser la version dans `package.json`, `package-lock.json` et `public/manifest.json`.
- Réutiliser les tests pertinents, ajouter une régression si le comportement change ; justifier
  toute nouvelle dépendance d'exécution (actuellement Preact et signals).
- Un seul paquet intégré dans Jira. `dist/`, `release/`, secrets et profils restent hors de Git.
  Configurations IntelliJ partagées dans `.run/` ; `.idea/` et réglages personnels ignorés.
- Ne pas modifier à la main `_bmad/` (hors `_bmad/custom/`), `.claude/skills/bmad-*` ni
  `.agents/skills/bmad-*` : générés par l'installeur BMAD 6.12.4. Personnaliser dans `_bmad/custom/` ;
  ajouter un outil avec `npx bmad-method@6.12.4 install --action update --tools <outils> --yes`.
- `_bmad-output/` est versionné (architecture, specs, artefacts BMAD) : documents de travail, pas une
  seconde référence technique ; reporter les décisions retenues dans le guide développeur.
  `_bmad-output/party-mode/` (mémoire des discussions) reste hors de Git.

## Pièges connus

- Tout nouveau texte passé à `t()` doit être ajouté au catalogue anglais de `src/i18n/`
  (`board.ts`, `settings.ts`, `integration.ts` ou `messages.ts`) et à son pendant dans `src/i18n/es/`,
  sinon la vérification de types échoue.

<!-- /bmad:context -->
