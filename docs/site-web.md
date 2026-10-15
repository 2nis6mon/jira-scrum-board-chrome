# Site public Sprint Goals Board

Le site vitrine est indépendant de l'extension et ne se connecte pas à Jira. Ses sources sont
dans `site/`. La sortie `.vite/site-dist/`, ignorée par Git, est le seul dossier à publier.

## Construire et consulter

Avec les dépendances du dépôt installées (`npm ci`) :

```sh
npm run site:build
npm run site:preview
```

Ouvrir `http://127.0.0.1:4173/jira-scrum-board-chrome/`. Le serveur écoute uniquement sur la
boucle locale. Il reproduit le sous-chemin du dépôt sur GitHub Pages, refuse les traversées de
dossiers et sert uniquement les fichiers de l'inventaire public. Arrêter avec Ctrl+C.
Après une modification, reconstruire le site et relancer la prévisualisation.

```sh
npm run site:check
```

Cette commande reconstruit le site et contrôle les fichiers autorisés, les liens locaux,
les images, les ancres et la correspondance du guide avec son Markdown source. Les liens externes
ne sont pas interrogés. Elle ne lance ni compilation ni tests de l'extension.

Chaque construction produit aussi `release/sprint-goals-site.zip`, contenant uniquement le
site public. Décompresser son contenu sur un hébergement statique pour le livrer ailleurs.
Le ZIP conserve les liens relatifs et n'inclut pas l'extension Chrome.

`npm run site:verify` vérifie ensuite les pages et leurs interactions dans un navigateur isolé,
sur cette sortie déjà construite. Aucun compte ni session Jira n'est utilisé.

## Contenu généré

- `site/index.html`, `styles.css`, `main.js` et les images/polices de `site/assets/` forment l'accueil.
- `guide.html` est généré avec Marked depuis [le manuel complet](manuel-utilisateur.md) : tableaux,
  sommaire, captures et annexe locale sont conservés. Modifier le Markdown source pour le mettre à jour.
- Les cinq captures de `docs/store/captures/` sont copiées dans `assets/screenshots/`. Elles montrent
  des données fictives ; leur version de référence reste celle indiquée dans le manuel.
- Les icônes publiques de `public/icons/` sont copiées dans `assets/icons/`.
- `confidentialite.html` reprend [la politique bilingue](privacy/index.html) sans changer son texte
  juridique ; un lien de retour au site et une icône d’onglet sont ajoutés.

Le site ne contient ni `dist/`, ni code source de l'extension, ni paquet ZIP, ni configuration de
développement. La copie suit une liste de sources explicite ; les liens symboliques/physiques,
les types de fichiers inattendus, les clés privées et les liens Confluence privés sont refusés.
Les sorties n'incluent aucune dépendance Node : Marked sert uniquement à la génération.

## Première publication sur GitHub Pages

Ce dépôt est privé. La publication Pages depuis un dépôt privé nécessite une offre GitHub
compatible (GitHub Pro pour ce compte personnel) : voir [les conditions de disponibilité](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages).
Si Pages n’est pas disponible dans **Settings**, utiliser une offre compatible ou publier
uniquement le contenu du ZIP dans un dépôt public dédié au site. Le code de l’extension peut
rester privé ; adapter alors le sous-chemin de publication et l’URL de l’image de partage.

La présence du workflow ne publie rien automatiquement. Il ne démarre que manuellement et ses
deux tâches refusent toute branche autre que `main`.

1. Fusionner les sources du site et le workflow dans `main` après vérification.
2. Dans le dépôt GitHub, ouvrir **Settings → Pages**.
3. Dans **Build and deployment → Source**, sélectionner **GitHub Actions**.
4. Dans **Settings → Environments → github-pages**, limiter les branches de déploiement à `main`
   si une règle supplémentaire est souhaitée.
5. Ouvrir **Actions → Publier le site vitrine → Run workflow** et choisir **main**.
6. Attendre la réussite de la construction et du déploiement ; ouvrir l'adresse affichée par
   la tâche de déploiement. Pour ce dépôt :
   `https://2nis6mon.github.io/jira-scrum-board-chrome/`.
7. Vérifier l'accueil, le guide, les cinq captures et le retour depuis la confidentialité.

Pour mettre à jour le site, fusionner les modifications dans `main`, puis relancer ce même
workflow manuellement. Il ne publie pas l'extension sur le Chrome Web Store.

Le workflow utilise des versions officielles d'Actions épinglées par SHA : checkout 7.0.1,
setup-node 7.1.0, configure-pages 6.0.0, upload-pages-artifact 5.0.0 et deploy-pages 5.0.1.
Les permissions d'écriture Pages et de jeton OIDC appartiennent uniquement à la tâche de déploiement.

Références : [configuration de la source Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site),
[workflow Pages personnalisé](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages),
[releases checkout](https://github.com/actions/checkout/releases),
[setup-node](https://github.com/actions/setup-node/releases),
[configure-pages](https://github.com/actions/configure-pages/releases),
[upload-pages-artifact](https://github.com/actions/upload-pages-artifact/releases),
[deploy-pages](https://github.com/actions/deploy-pages/releases).
