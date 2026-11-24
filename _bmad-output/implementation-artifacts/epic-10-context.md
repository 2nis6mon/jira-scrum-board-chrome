# Epic 10 Context: Retrouver ses tickets plus vite

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

L'équipe trouve vite ce qu'elle cherche sur le board, même quand un sprint compte beaucoup de tickets, de parents ou de valeurs de filtre. L'epic regroupe les améliorations des filtres et de la recherche du board, hors Sprint Planning : le menu de filtre étant un composant partagé, le Sprint Planning en bénéficie sans story propre. Lecture seule : aucune écriture ni nouvelle lecture Jira.

## Stories

- Story 10.1 : Chercher un parent dans le filtre Parent

## Requirements & Constraints

- **Aucun accès Jira nouveau** : ni lecture ni écriture ajoutée ; les valeurs proposées par les filtres restent celles présentes dans les tickets affichés.
- **Même recherche partout** : Sprint Board et Sprint Planning proposent le même comportement de filtre, puisqu'ils partagent le composant.
- **Correspondance de texte** : même règle que la recherche du board (accents et casse ignorés).
- **Accessibilité** : clavier (focus, Échap) et lecteur d'écran (nom accessible, résultats annoncés) pour tout nouveau contrôle.
- **Textes** : tout libellé passe par `t()`, en français, anglais et espagnol (catalogue anglais de `src/i18n/` et pendant `src/i18n/es/`) ; `npm run verify:i18n` après changement visible. Contenus Jira (clés, résumés) jamais traduits.
- **Livraison** : `npm run check` et `npm run verify:jira` verts, régression pour tout comportement modifié, version actualisée (`package.json`, `package-lock.json`, `public/manifest.json`), CHANGELOG, manuel utilisateur et guides EN/ES à jour. Aucune donnée fictive dans `src/`.

## Technical Decisions

- **Couches (AD-1, AD-3)** : la correspondance de texte vient de `core` (fonction existante), sans DOM ni `chrome.*` ; aucune nouvelle logique de filtrage dans `core/filters.ts`, la sélection du filtre reste celle du modèle. Seuls les modèles créent des signaux partagés ; un état purement local à un menu ouvert (texte tapé) peut rester dans le composant de vue.
- **Composant partagé** : l'amélioration s'ajoute au composant de menu de filtre, activée par menu (propriété), pour ne pas changer les autres menus.
- **Aucun interrupteur** : amélioration de lecture seule, livrée directement (pas de fonction expérimentale au sens d'AD-5).

## UX & Interaction Patterns

- Les menus de filtre sont à choix multiples ; le badge du bouton compte les valeurs cochées.
- Décisions de Denis (24/11/2026) : la recherche est réservée au menu Parent ; un parent coché que le texte ne trouve pas disparaît de la liste sans se décocher (le badge le compte toujours) ; « Sans parent » reste toujours affiché, hors recherche.
