# Intégration dans Jira

Un seul paquet de production : `npm run build` produit `dist/`, chargé dans Chrome en mode
développeur. Le service worker compilé est `jira-worker.js` et le script de contenu est
`jira-bootstrap.js`. Les sources et tests correspondants sont dans `src/integration/` et
`tests/integration/`.

## Lancement et navigation

- Première installation : onglet `launcher.html?bienvenue=1`. L'utilisateur saisit une URL de
  site ou de board et autorise le site au clic. Aucune permission d'hôte n'est accordée d'office.
- Clic sur l'icône : le lanceur reconnaît le board de l'onglet avec `activeTab`. S'il est déjà
  autorisé, la vue s'ouvre ; sinon l'URL est préremplie avant la demande Chrome.
- Hors d'un board, le formulaire permet de choisir une adresse ; le dernier board connu est proposé.
- Sur les boards autorisés, un bouton flottant Sprint Goals ouvre l'adresse marquée. Il est isolé
  dans une racine Shadow DOM et suit la navigation interne de Jira.
- L'URL marquée porte `sprintGoals=1`, par exemple
  `https://site.atlassian.net/jira/software/c/projects/PROJET/boards/123?sprintGoals=1`.
  Elle peut être mise en favori. Une URL sans marqueur garde le board Jira habituel.
- Le clic de lancement recharge la page (`location.assign`). Conserver ce mécanisme : l'essai
  historique avec `pushState` seul échouait sur l'instance de l'utilisateur.
- La vue recouvre Jira, qui reste chargé derrière. Le changement de board envoie uniquement
  identifiant et clé projet à l'hôte, qui construit l'URL sur son origine. Sans clé projet, la vue
  s'affiche sur place avec un avertissement.
- « Retour à Jira » demande à l'hôte de recharger son adresse sans marqueur.
- Après rechargement de l'extension dans Chrome, recharger aussi la page Jira pour remplacer
  le script de contenu déjà injecté.

## Placement personnel du bouton

La poignée à gauche permet de déplacer le bouton avec la souris ou le doigt ; le libellé garde
son clic d'ouverture. Un déplacement inférieur à 5 px est ignoré. Échap, une interruption du
pointeur ou un redimensionnement pendant le geste annulent celui-ci sans enregistrer.
La poignée est accessible avec Tab ; les flèches déplacent de 10 px, ou de 1 px avec Maj.

La clé locale `jira-button-position.v1:<origine Jira>` contient `{ x, y }`, deux ratios entre
0 et 1 de la course disponible dans le viewport visible après retrait des dimensions du bouton
et des marges de 12 px. Elle est commune aux boards d'un site dans le même profil Chrome.
Les déplacements sont enregistrés au relâchement ; le clavier enregistre chaque pas.
Aucun cookie, requête Jira ni nouvelle permission. Le réglage est effacé à la déconnexion du site.

Le viewport visuel, sa position et la taille du bouton sont observés : une fenêtre réduite, un
zoom ou le plein écran changent le placement affiché, jamais le réglage enregistré. Une valeur
hors bornes est ramenée entre 0 et 1 ; une valeur illisible revient au défaut (96 px de la droite,
28 px du bas, bornés à la fenêtre). Les changements locaux dans un autre onglet sont appliqués.
Une lecture initiale tardive ne peut pas remplacer un déplacement déjà effectué.

**Administration → Préférences personnelles → Réinitialiser la position du bouton Jira**
retire uniquement la préférence du site connecté, sans toucher aux réglages d'équipe.

`npm run verify:button` charge une copie temporaire du paquet qui autorise à l'installation deux
hôtes fictifs pour contourner la boîte de permission native du banc headless. Le script de contenu
et `chrome.storage.local` sont ceux de Chrome ; les pages HTTPS sont interceptées. Le manifest
distribué et le profil de l'utilisateur ne sont pas modifiés.

## Hébergement et communication

`board.html` ne démarre que dans un cadre avec un parent unique, le même site normalisé que
`jiraHost`, une adresse `jiraBoard` valide et l'autorisation Chrome de ce site. Une ouverture
seule, un cadre imbriqué ou une autre origine est bloqué avant création du modèle métier.

`postMessage` vérifie origine et fenêtre source dans les deux sens :

| Message | Sens | Effet |
|---|---|---|
| `sprint-goals:open-issue` | Vue → hôte | Fiche native ou formulaire de transition |
| `sprint-goals:open-board` | Vue → hôte | Navigation construite par l'hôte |
| `sprint-goals:close` | Vue → hôte | Retour à Jira |
| `sprint-goals:refresh` | Hôte → vue | Fin de la popin, déblocage et relecture |

Les identifiants DOM et de script contenant encore `direct` sont conservés pour reconnaître
les éléments déjà injectés ; ce ne sont pas des modes supplémentaires. L'URL publique et les
clés de stockage ne changent pas avec le renommage des sources.

## Fiche et formulaire natifs

Un clic normal sur une carte ouvre la fiche Jira complète dans une popin de **1 280 px**,
limitée à la largeur disponible, avec des marges de 16 à 60 px. Le titre et les commandes sont
ceux de Jira. La fermeture conserve le board et le relit.

Pour une transition avec écran ou champs requis :

1. Le statut et les transitions sont relus. L'extension n'envoie aucun POST de transition.
2. La fiche native se charge cachée ; le menu de statut est ouvert.
3. La transition n'est cliquée qu'en cas de correspondance unique avec son nom, ou son nom suivi
   du statut d'arrivée, après normalisation. Aucun choix par préfixe ou destination approximative.
4. Le formulaire moderne ou classique dans son iframe est isolé et la popin prend sa taille,
   bornée par la fenêtre avec une marge de 16 px. La fiche autour reste cachée.
5. L'utilisateur remplit, valide ou annule dans Jira. L'extension ne saisit et ne soumet rien.
6. La fermeture déclenche une relecture. Les modifications de Goal/rang qui auraient accompagné
   ce déplacement ne sont pas automatiquement reprises après une transition native.

Si le choix est ambigu, la fiche est rendue pour que l'utilisateur choisisse. Si elle n'est pas
reconnue en 12 secondes, Jira est montré tel quel ; si le cadre reste inaccessible pendant
20 secondes, la popin se ferme et affiche une erreur. Les étapes sont tracées dans la console
avec le préfixe « Sprint Goals ».

L'ancienne URL `/secure/CommentAssignIssue!default.jspa` n'est pas utilisée : l'essai sur le
Jira Cloud de l'utilisateur affichait une page vide. Ne pas la réintroduire comme solution
équivalente au menu natif. Aucun formulaire reconstruit par l'extension n'est conservé en secours.

## Vérifier

```bash
npm run verify:jira
```

Le script charge l'extension et intercepte les pages Jira pour les remplacer par des fixtures
dans un profil Chrome temporaire. Il vérifie : couverture de la page, iframe du board,
refus d'hébergement non autorisé, taille de la fiche, formulaire seul, absence de validation
automatique, transition ambiguë, fermeture, changement de board et rejet des messages forgés.
Les tests du modèle vérifient l'absence d'écriture avant un formulaire, les transitions simples,
les conflits, les succès partiels et l'absence de retry. `verify:transition` lance le même contrôle natif.

Pour conserver le paquet chargé par l'utilisateur :

```bash
npx vite build --outDir /tmp/sprint-goals-check
EXTENSION_DIR=/tmp/sprint-goals-check node scripts/verify-jira.mjs
```

Ces contrôles ne remplacent pas l'essai des workflows réels : Time Spent, Story Points,
Resolution, champs tiers et routes particulières. Le détail des validations restantes est dans
[TODO.md](../TODO.md).
