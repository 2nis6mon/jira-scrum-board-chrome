# Développement, contrôles et livraison

Outillage, commandes, intégration continue et garde-fous. Règles de branche, d'identité, de
contrôles avant commit et de version : [AGENTS.md](../../AGENTS.md). Publication sur le Chrome Web
Store : [fiche de publication](../store/fiche.md). Autres références : [index technique](index.md).

## Environnement

Node >= 22.12 ; dépendances exactes dans `package-lock.json`, scripts d'installation désactivés par
`.npmrc`. `npm ci`, puis `npm run check` (typage, lint, tests, build). Un seul paquet intégré `dist/` ;
`npm run watch` le reconstruit. `.gitattributes` impose les fins de ligne LF pour conserver le même
format dans chaque clone.

Le site de présentation possède son propre dossier `site/` et ses commandes `site:build`,
`site:check`, `site:preview` et `site:verify`. Sa sortie `.vite/site-dist/` et son archive
`release/sprint-goals-site.zip` sont indépendantes du paquet Chrome. Le guide est un mini-site de
huit fiches par langue générées avec Marked depuis les manuels Markdown FR/EN/ES, avec recherche
locale. Les pages anglaises sont sous `en/`, les espagnoles sous `es/` et toutes partagent les captures françaises. Marked reste
une dépendance de développement ; aucune bibliothèque n'est embarquée dans le site.
`node scripts/generate-icons.mjs` dérive les PNG Chrome de la marque SVG, via le navigateur isolé.
La publication GitHub Pages est manuelle : voir [le guide du site](../site-web.md).

## Interrupteurs de fonction

Tous les interrupteurs sont déclarés dans `src/app/featureFlags.ts` et injectés par Vite à la
compilation (`vite.config.ts`, `vite.harness.config.ts`) ; `tests/buildModes.test.ts` vérifie leur
valeur par mode et `tests/guards/sources.test.ts` refuse un interrupteur déclaré ailleurs. Chacun
garde la vue et les points d'entrée des modèles qui lisent ou écrivent pour sa fonction ; décodage,
conservation des formats et effacement des données n'en dépendent jamais.

- `SPRINT_HEALTH_ENABLED` (`__SPRINT_HEALTH_ENABLED__`) vaut `false` dans tous les modes : ni
  bouton ni panneau, `BoardModel.health` ne calcule rien et `toggleHealth` n'enregistre rien.
- `DIAGNOSTIC_ENABLED` (`__DIAGNOSTIC_ENABLED__`) vaut `true` dans tous les modes. Coupé, il
  retire l'entrée et bloque l'ouverture, les sondes, le test d'écriture et la lecture du journal.

Feature flag `SPRINT_PLANNING_ENABLED` : Vite injecte `__SPRINT_PLANNING_ENABLED__` à la compilation.
Il vaut `true` uniquement pour les modes `dist` (`npm run build`), `development` (`watch` et banc)
et `test` ; `false` pour `package`, `production` et tout mode inconnu. `npm run package` reconstruit
toujours dans un dossier temporaire avec `--mode package`, sans reprendre ni remplacer `dist/`.
Le paquet masque l'entrée et bloque l'ouverture, les lectures et la publication du planning.
Ce flag ne provient ni de `.env`, ni d'un paramètre d'URL, ni d'une préférence Chrome.

## Commandes

| Commande | Contrôle / résultat |
|---|---|
| `npm run test` / `test:watch` | Tests Vitest |
| `npm run typecheck` / `lint` / `format` | TypeScript / contrôles et formatage Biome |
| `npm run harness` | Banc fictif, port 5199 |
| `npm run verify:load` | Chargement, bienvenue, permissions, lanceur |
| `npm run verify:jira` / `verify:transition` | Hébergement, messages forgés, navigation, fiche native (en-tête, colonnes, redimensionnement, menus, remplacement), formulaires longs modernes/classiques (défilement, en-tête, boutons, menus), ambiguïté, absence de validation automatique, fermeture |
| `npm run verify:drag` / `verify:button` | Gestes ; bouton et stockage Chrome, zoom/redimensionnement/plein écran |
| `npm run verify:settings` | Glissés des réglages : swimlanes, types, champs et règles de couleur |
| `npm run verify:i18n` | Rendu FR/EN/ES et préférence de langue (voir [invariants](invariants.md#langue-de-linterface)) |
| `npm run verify:planning` | Atelier, glissés/affectations, brouillon, publication, RAF consultatif et petit écran |
| `npm run verify:planning:package` | Passage du mode local au mode package : entrée/route désactivées, zéro requête Planning, brouillon conservé |
| `npm run verify:loading` | Diagnostic de chargement du banc fictif |
| `npm run package` | Archive `release/sprint-goals-board-<version>.zip` vérifiée |
| `npm run store:screenshots` | Cinq captures Store 1280 × 800 du banc en mode `package`, sans Sprint Planning |
| `npm run store:promotions` | Deux visuels promotionnels communs à toutes les langues, à partir de la capture existante |
| `npm run store:kit` | Assemble le paquet Store déjà construit, les textes FR/EN/ES et les visuels avec empreintes SHA-256 |

Les vérifications navigateur interceptent Jira dans un profil temporaire vierge ; `CHROME_PATH`
choisit l'exécutable. `verify:button` autorise deux hôtes fictifs dans une copie temporaire du paquet,
sans changer manifest distribué ni profil utilisateur. Aucun accès à la session réelle sans autorisation.
Pour préserver un `dist/` en essai : construire avec `npx vite build --mode dist --outDir <dossier>`, puis lancer
`node scripts/verify-jira.mjs` ou `verify-load.mjs` avec `EXTENSION_DIR=<dossier>` dans l'environnement.
Ne pas réintroduire les alias `*:jira-direct-test` ni `JIRA_DIRECT_DIST`.

## Intégration continue

[Le workflow GitHub](../../.github/workflows/validation.yml) exécute les contrôles à chaque push sur
`main`, `agent/**` ou `codex/**` (ancien préfixe) et sur les demandes de fusion vers `main` : typage, style, tests, compilation,
intégration Jira, glisser-déposer (board et réglages), Sprint Planning, diagnostic du banc et paquet. Il utilise une machine Windows,
Node 24 et Chrome for Testing 155.0.8059.39 téléchargé depuis la distribution officielle Google.
Après extraction, le workflow accorde aux processus AppContainer/LPAC les droits de lecture et
d'exécution sur le seul dossier de ce navigateur temporaire (`icacls`, SID `S-1-15-2-1` et
`S-1-15-2-2`), conformément aux [préconisations Chrome](https://pptr.dev/troubleshooting#chrome-reports-sandbox-errors-on-windows).
Profil temporaire et uniquement Jira fictif : aucune session ou donnée Jira réelle n'est nécessaire.

## Garde-fous

[`sources.test.ts`](../../tests/guards/sources.test.ts) (réseau/couches/mutations/fixtures),
[`manifest.test.ts`](../../tests/manifest.test.ts) (permissions/CSP),
[`writes.test.ts`](../../tests/jira/writes.test.ts) (inventaire), tests transport/modèle (conflits,
échecs/retry/délégation native), `tests/integration/` (hôte et refus avant démarrage).
Les tests de services couvrent leurs ports isolément ; les tests du modèle gardent la composition
réelle. `BoardModel.concurrency.test.ts` contrôle en particulier une réponse de l'ancien board
après changement et une lecture de réglages dépassée par une écriture plus récente. Les gardes
de sources empêchent le retour de dépendances vers les vues depuis les couches métier et Jira.
Ces contrôles ne valident pas les workflows réels. Un ancien `npm audit` ne garantit pas les dépendances
actuelles : le relancer lors d'une revue de distribution ; prévoir une revue indépendante avant diffusion large.

Cookies et captures Jira restent hors de Git, comme `dist/`, `release/`, les profils et la clé privée.
Le paquet Store retire la clé publique de développement (identifiant potentiellement différent) et
refuse secrets, sources de tests et source maps.
