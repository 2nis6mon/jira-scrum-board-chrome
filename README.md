# Scrum Board — extension Chrome

Pilote un sprint Jira Cloud par ses objectifs, depuis un onglet Chrome. Jira reste la source de
vérité. Projet distinct de l'app macOS du même nom, dont il reprend la spécification
([`docs/reference-app-mac/PROMPT.md`](docs/reference-app-mac/PROMPT.md)).

> **État : étape 0 — socle.** L'extension se charge et affiche l'état « aucun site Jira
> connecté ». Elle ne sait pas encore se connecter à Jira et n'émet aucune requête réseau.

## Installer l'extension (mode développeur)

```bash
npm ci
```

```bash
npm run build
```

Puis dans Chrome : `chrome://extensions` → activer **Mode développeur** → **Charger l'extension
non empaquetée** → choisir le dossier `dist/`. Un clic sur l'icône de l'extension ouvre le board
dans un onglet (ou y revient s'il est déjà ouvert).

Après une reconstruction, cliquer sur la flèche de rechargement de la carte de l'extension.

L'identifiant de l'extension est figé (`efhpkdoiimdggndnfcgdoaniobdcmokb`) par le champ `key` du
manifest : déplacer le dossier ne fait pas perdre les réglages locaux.

## Ce que l'extension a le droit de faire

| | |
|---|---|
| À l'installation | `storage` uniquement. **Aucun accès à aucun site.** |
| À la connexion (étape 1) | Chrome demandera l'accès à **un seul** site `https://….atlassian.net` |
| Politique de sécurité | Scripts de l'extension uniquement ; connexions limitées à `*.atlassian.net` ; aucune image ni style distant |
| Absents | Scripts injectés dans les pages, permissions `cookies`, `tabs`, `scripting`, `webRequest` |

Ces droits sont verrouillés par [`tests/manifest.test.ts`](tests/manifest.test.ts).

## Développer

```bash
npm run check
```

Types, lint, tests et construction.

```bash
npm run verify:load
```

Construit puis charge `dist/` dans un Chrome sans interface, sur un **profil temporaire vierge** :
contrôle l'identifiant, le service worker, le rendu, les permissions accordées et le blocage par
la CSP d'une connexion hors `*.atlassian.net`. Aucune requête vers Jira.

```bash
npm run watch
```

Reconstruit `dist/` à chaque modification.

## État de vérification

### ✅ Vérifié sur cette machine (étape 0)

- Types, lint, 12 tests, construction.
- Chargement réel dans Chrome 153 (sans interface, profil temporaire) : manifest accepté,
  identifiant conforme à la clé, service worker enregistré, page rendue sans erreur, aucune
  permission d'hôte, `fetch` vers un hôte tiers bloqué par la CSP.

### ⚠️ À valider par l'utilisateur

- Chargement dans son Chrome habituel, et ouverture de l'onglet par l'icône de l'extension
  (le clic sur l'icône n'est pas simulable sans interface).
- Si Chrome est géré par l'entreprise : qu'aucune politique (`chrome://policy`) n'interdit les
  extensions non empaquetées.
