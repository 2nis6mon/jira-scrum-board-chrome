# Scrum Board — extension Chrome

Pilote un sprint Jira Cloud par ses objectifs, depuis un onglet Chrome. Jira reste la source de
vérité. Projet distinct de l'app macOS du même nom, dont il reprend la spécification
([`docs/reference-app-mac/PROMPT.md`](docs/reference-app-mac/PROMPT.md)).

> **État : étape 1 — connexion et diagnostic.** L'extension se connecte à un site
> `*.atlassian.net` avec la session Jira du navigateur et propose un diagnostic : trois lectures,
> puis, sur demande, un test d'écriture sur une propriété technique du sprint. Le board n'existe
> pas encore.

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
| À la connexion | Chrome demande l'accès à **un seul** site `https://….atlassian.net`, celui que vous saisissez. « Se déconnecter » rend cet accès. |
| Authentification | La session Jira déjà ouverte dans Chrome. L'extension ne demande et ne voit ni mot de passe ni jeton. |
| Politique de sécurité | Scripts de l'extension uniquement ; connexions limitées à `*.atlassian.net` ; aucune image ni style distant |
| Absents | Scripts injectés dans les pages, permissions `cookies`, `tabs`, `scripting`, `webRequest` |

Ces droits sont verrouillés par [`tests/manifest.test.ts`](tests/manifest.test.ts).

## Ce que l'extension écrit dans Jira

À cette étape, **une seule écriture existe**, et uniquement sur le bouton « Tester l'écriture » :
`PUT` puis `DELETE` de la propriété technique `com.scrumboardmac.diagnostic` du sprint actif.
Elle est invisible dans Jira, ne touche ni ticket ni champ du sprint, et est supprimée aussitôt.
C'est le même test que « Tester l'enregistrement » de l'app Mac.

L'inventaire des écritures est [`src/jira/writes.ts`](src/jira/writes.ts) : le transport ne sait
émettre que ce que ce fichier décrit. Aucune écriture n'est jamais rejouée.

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

```bash
npm run harness
```

Banc d'essai visuel sur <http://localhost:5199/?scenario=ok> (`ok`, `xsrf`, `refuse`, `session`,
`deconnecte`) : l'interface réelle branchée sur le faux Jira des tests. Données fictives,
réservé au développement, jamais inclus dans `dist/`.

## État de vérification

### ✅ Vérifié sur cette machine

- Types, lint, 106 tests, construction.
- Chargement réel dans Chrome 153 (sans interface, profil temporaire vierge) : manifest accepté,
  identifiant conforme à la clé, service worker enregistré, formulaire de connexion rendu sans
  erreur, hôte hors `*.atlassian.net` refusé à la saisie sans rien enregistrer, aucune permission
  d'hôte, `fetch` vers un hôte tiers bloqué par la CSP.
- Contre un **faux Jira de test** : forme des requêtes (session du navigateur, aucun en-tête
  d'identification, redirections jamais suivies), correspondance des erreurs, distinction entre
  refus XSRF et refus de droits, aucune écriture rejouée, déroulé du test d'écriture dans tous
  ses cas, rapport sans donnée identifiante.
- Rendu des vues dans cinq scénarios, par capture d'écran du banc d'essai (données fictives).

### ⚠️ Non vérifié — nécessite votre instance Jira

Aucune requête n'a jamais été émise vers un vrai Jira pendant le développement.

- La demande d'accès au site par Chrome (fenêtre native, non pilotable sans interface).
- **Que Jira reconnaisse la session du navigateur** pour une requête émise par la page de
  l'extension (sonde 1 du diagnostic).
- **Que Jira accepte un POST puis une écriture venant d'une origine `chrome-extension://`**,
  sans en-tête ou avec `X-Atlassian-Token: no-check` (sondes 2 et 3, puis test d'écriture).
  C'est le risque n°1 du projet ; le diagnostic existe pour le lever.
- Le test d'écriture exige la permission Jira de gestion des sprints : sans elle, Jira répond
  403 et le diagnostic le distingue d'un refus XSRF.
