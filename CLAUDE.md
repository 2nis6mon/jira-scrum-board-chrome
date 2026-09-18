# Scrum Board — extension Chrome

Extension Chrome (Manifest V3) qui reprend les fonctionnalités de l'app macOS « Scrum Board »,
connectée à Jira Cloud. Projet **distinct** de l'app Mac, qui reste maintenue en parallèle.

## Références

- Spécification fonctionnelle commune aux deux projets : `docs/reference-app-mac/PROMPT.md`.
- API Atlassian vérifiées, audit de sécurité et README du Mac : même dossier. Ce sont des copies
  conformes (voir `LISEZ-MOI.md` pour le commit d'origine) : ne pas les modifier ici.
- Code de l'app Mac : `/Users/dsimon/Claude Code/jira-scrum-board-advanced`. **Lecture seule,
  ne jamais le modifier.** Ses tests Swift sont la référence des cas de test à porter.

## Règles non négociables

1. **Quatre catégories d'écriture dans Jira, rien d'autre** : propriété de sprint (épinglage des
   Goals), lien ticket↔Goal (`goals_linkWorkItem` / `goals_unlinkWorkItem`), transitions, rang.
2. **Ne JAMAIS réécrire le champ « Sprint Goal » du sprint.** Il est lu, jamais écrit.
3. Ordre des swimlanes, couleurs des objectifs, champs des cartes, règles de couleur : réglages
   **locaux** (`chrome.storage.local`), jamais écrits dans Jira, jamais dans `storage.sync`.
4. **Une seule tentative pour tout POST/PUT/DELETE.** Jamais de retry sur une écriture ; si
   l'issue est incertaine, on relit Jira.
5. Pas de fiche ticket native : on ouvre la page Jira dans un onglet.
6. Aucune écriture sans geste explicite de l'utilisateur. Rien n'est affiché comme réussi avant
   la confirmation de Jira.
7. **Aucune donnée fictive dans le code de production** (`src/`, `public/`, `board.html`).
   Les données de test vivent uniquement sous `tests/`.
8. Ne rien inventer de l'API Atlassian : endpoint, champ ou paramètre non vérifié = non utilisé.
   Ne jamais écrire « testé sur Jira » pour ce qui ne l'a pas été.

## Contraintes de travail

- Ne jamais accéder aux identifiants ni à la session Jira de Denis. Ne jamais lancer l'extension
  contre son vrai Jira : c'est lui qui installe, se connecte et valide. `npm run verify:load`
  utilise un profil Chrome temporaire vierge et n'émet aucune requête vers Jira.
- Répondre en français. Code, commentaires et messages de commit en français.
- Commits : `git -c user.name="2nis6mon" -c user.email="denis.simon@gmail.com" commit …`, avec le
  trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Ne pusher que sur demande explicite.

## Droits de l'extension

Le manifest (`public/manifest.json`) est gardé par `tests/manifest.test.ts`. Toute permission
supplémentaire, tout hôte supplémentaire, tout assouplissement de la CSP doit être **proposé à
Denis avant d'être codé**. État actuel : `storage` seul à l'installation ; accès à un site
`https://*.atlassian.net` demandé à l'exécution ; CSP `connect-src https://*.atlassian.net`.

`.secrets/extension-key.pem` est la clé privée qui correspond au champ `key` du manifest (elle
fige l'identifiant de l'extension). Elle est ignorée par git : ne jamais la committer.

## Architecture

```
board.html            page plein onglet de l'extension
src/app/              interface Preact
src/background/       service worker (ouvre la page, rien d'autre)
src/jira/             client REST + GraphQL, modèles, erreurs      (à venir)
src/core/             logique métier pure                           (à venir)
tests/                tests Vitest et données de test
scripts/              outillage de développement
```

`src/jira/` et `src/core/` n'utilisent ni `chrome.*` ni le DOM : ils se testent sous Node.

## Commandes

```bash
npm run check         # types + lint + tests + construction
npm run verify:load   # construit puis charge dist/ dans un Chrome temporaire sans interface
npm run watch         # reconstruit dist/ à chaque modification
```

Dépendances en versions exactes (`.npmrc` : `save-exact`, `ignore-scripts`). Toute nouvelle
dépendance d'exécution se justifie : il y en a deux aujourd'hui (`preact`, `@preact/signals`).

## Étapes

Plan validé le 18/09/2026 : 0 socle · 1 connexion et diagnostic (essai XSRF par Denis) ·
2 logique métier · 3 board en lecture seule · 4 les quatre écritures · 5 réglages locaux ·
6 compléments. Chaque étape se termine par `npm run check` au vert, un commit, et la liste de ce
qui reste à valider sur l'instance de Denis.
