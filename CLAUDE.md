# Consignes de développement — Sprint Goals Board pour Jira

Extension Chrome Manifest V3 pour Jira Cloud, utilisée uniquement dans une page Jira autorisée.
Les boards Scrum et Kanban et les swimlanes par type sont pris en charge.
L'application macOS et l'affichage du board hors Jira sont abandonnés.

## Documents de référence

- `DEVELOPER.md` : architecture et décisions produit actuelles, tests et livraison.
- `docs/integration-jira.md` : lancement, fiche native et transitions Jira.
- `docs/API-CONTRACTS.md` : contrats employés par le code et données persistées.
- `docs/SECURITY-AUDIT.md` : permissions, inventaire E1–E7 et constats S1–S12.
- `TODO.md` : travaux encore ouverts. `CHANGELOG.md` : évolutions livrées.

Les décisions actuelles ont une seule description de référence. Éviter de recopier le changelog
ou le backlog dans plusieurs fichiers. L'historique détaillé des anciennes versions reste dans Git.

## Règles produit et sécurité

1. Cinq catégories d'écriture métier : transitions, rang, liens ticket ↔ Goal, propriété du sprint
   et propriété du board. Le diagnostic peut écrire puis supprimer sa propriété technique.
   Aucun nouvel endpoint d'écriture, hôte, droit Chrome ou assouplissement de CSP sans décision
   produit explicite et vérification du contrat Atlassian.
2. Le champ natif « Sprint Goal » est lu, jamais écrit. Aucun démarrage de sprint, ajout au sprint
   ou création de Goal dans le périmètre actuel.
3. Les réglages du board sont partagés via sa propriété Jira, relus à chaque chargement et écrits
   sur chaque modification explicite par l'utilisateur. Un calcul automatique n'écrit rien.
   Sans droit `canEdit`, ils sont en lecture seule. Les préférences personnelles restent locales.
4. Toute écriture est tentée une seule fois. Après une réponse incertaine, relire Jira, ne pas
   rejouer la requête. Ne pas annoncer de réussite avant confirmation.
5. Les écrans de ticket et de transition sont ceux de Jira. Le clic sur une carte ouvre la fiche
   complète ; une transition avec formulaire ouvre ce seul formulaire. L'extension ne remplit
   ni ne valide ses champs. Les transitions sans formulaire utilisent l'inventaire REST.
6. Garder les clés Jira `com.scrumboardmac.*`, les formats et identifiants persistés : ils servent
   aux installations existantes. Toute évolution doit conserver la lecture des anciennes données.
7. Aucune donnée fictive sous `src/`, `public/`, `board.html` ou `launcher.html` ; les données de
   test restent sous `tests/`, absentes du paquet distribué.
8. Ne pas inventer d'API Atlassian. Distinguer les contrôles sur faux Jira des essais réels.

## Frontières techniques

- `src/jira/transport.ts` est le seul appelant de `fetch` : session navigateur, hôte contrôlé,
  redirections refusées, lectures rejouables et écritures jamais rejouées.
- `src/jira/writes.ts` contient les inventaires fermés REST et GraphQL. Toute évolution doit
  conserver les tests exhaustifs de `tests/jira/writes.test.ts` et les garde-fous de sources.
- `src/core/` et `src/jira/` n'utilisent ni le DOM ni `chrome.*`.
- `src/app/platform/` contient les adaptateurs Chrome de l'application et du lanceur.
  `src/integration/` contient aussi le service worker et le script de contenu injecté par Chrome.
- `embeddingGuard.ts` doit valider le parent unique, son origine, l'URL du board et l'autorisation
  Chrome AVANT de créer le modèle métier ou d'accéder aux données Jira.
- La règle Origin de `originRule.ts` vise les seuls POST de l'extension, identifiée comme initiateur,
  vers l'URL exacte `|https://<site>/gateway/api/graphql|`. Ne jamais l'élargir aux pages web.
- `injectBoard` est copié dans l'onglet par `executeScript` : aucun import ou état extérieur à sa
  fonction. `bootstrap.ts` est un script de contenu sans import.
- Conserver la clé publique du manifest pour garder l'identifiant et le stockage de développement.
  `.secrets/extension-key.pem` reste ignorée et ne doit jamais être commitée.

## Méthode de travail et Git

- Répondre en français ; commentaires et messages de commit en français.
- Ne pas lire les identifiants ou la session Jira de l'utilisateur. Les scripts de vérification
  utilisent des profils Chrome temporaires et des services fictifs ; les essais réels sont à
  distinguer explicitement et nécessitent l'autorisation de l'utilisateur.
- Travailler dans une branche `codex/...`. Un commit cohérent par changement, poussé sur sa branche.
  Fusionner dans `main` seulement sur demande explicite.
- Identité des commits : `git -c user.name="2nis6mon" -c user.email="denis.simon@gmail.com" commit …`.
  Ne pas ajouter de trailer `Co-Authored-By`.
- Avant livraison : contrôler le diff, mettre à jour les documents concernés et la version dans
  `package.json`, `package-lock.json` et `public/manifest.json`.
- Exécuter `npm run check` et `npm run verify:jira` avant commit. Si un paquet dans `dist/` est
  en cours d'essai, construire ailleurs avec `npx vite build --outDir <dossier>`, puis utiliser
  `EXTENSION_DIR=<dossier> node scripts/verify-jira.mjs`.
- Réutiliser les tests pertinents ; ajouter une régression lorsqu'un comportement change.
  Une nouvelle dépendance d'exécution doit être justifiée (actuellement Preact et signals).

## Commandes

```bash
npm ci                    # Node >= 22.12
npm run check             # typage, lint, tests, construction intégrée dans dist/
npm run watch             # reconstruction continue du même paquet
npm run verify:load       # chargement et lanceur, Chrome temporaire
npm run verify:jira       # intégration et popins natives, Chrome temporaire avec faux Jira
npm run verify:transition # même contrôle natif que verify:jira
npm run verify:drag       # gestes sur le banc visuel avec faux Jira
npm run verify:button     # déplacement et stockage du bouton Jira, Chrome temporaire
npm run harness           # banc visuel http://localhost:5199/?scenario=board
npm run package           # archive Store dans release/, sans clé publique de développement
npm run store:screenshots # captures fictives du Store
```

Les configurations IntelliJ partagées sont dans `.run/` ; `.idea/` et les fichiers personnels
restent ignorés. Il n'existe qu'un seul paquet de production, intégré dans Jira.
