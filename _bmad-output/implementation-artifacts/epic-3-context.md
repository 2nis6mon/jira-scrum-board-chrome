# Epic 3 Context: Agir vite sur un ticket

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Permettre d'agir sur un ticket sans le glisser à travers le board : un clic droit (ou son équivalent clavier) sur une carte ouvre un menu de l'extension proposant « Envoyer vers un goal », « Mettre en top priorité » et « Mettre en basse priorité ». Le gain vise surtout la Daily et l'affinage, où le glisser-déposer sur un grand board est lent. Ce n'est qu'un nouveau geste : chaque action réutilise la fonction de `core` de son intention et passe par la porte d'écriture unique du board, mises en place par l'Epic 1. Aucune nouvelle écriture Jira.

## Stories

- Story 3.1 : Ouvrir le menu d'un ticket et l'envoyer vers un goal
- Story 3.2 : Mettre un ticket en top ou en basse priorité

## Requirements & Constraints

- **Menu** : remplace le menu du navigateur sur une carte, ouvert par clic droit, Maj+F10 ou la touche Menu quand la carte a le focus ; s'ouvre près de la carte, se ferme par Échap, clic ailleurs ou après une action, et rend le focus à la carte ; navigable au clavier avec les rôles d'accessibilité d'un menu.
- **Envoyer vers un goal** : liste des objectifs visibles du board, sans le goal actuel du ticket, plus « Retirer du goal » s'il en a un (retour dans sa destination par défaut). Rattachement libre à l'objectif de n'importe quel sprint du board, comme le glissé.
- **Top / basse priorité** : une seule écriture E2 (`PUT /rest/agile/1.0/issue/rank`) qui classe le ticket avant le premier, ou après le dernier, ticket de sa swimlane (objectif ou swimlane par type), **tous sprints actifs confondus**, dans l'ordre de rang Jira, par rapport à **tous** les tickets de la swimlane, même masqués par un filtre. Action désactivée, sans écriture, si le ticket est déjà premier ou dernier. La priorité est le rang seulement : le champ Priorité de Jira n'est jamais modifié (ce serait une nouvelle écriture).
- **Actions impossibles** désactivées avec leur raison : écriture en cours ; en Daily, pas de changement de goal (même règle que le glissé), les déplacements restant possibles. En présentation, aucune action n'est désactivée (le glissé y est permis), seul le placement du menu suit le zoom (décision de délégation du 31/10/2026).
- **Écritures** : inventaire fermé E1–E9 inchangé (ici E2, E3/E4 en Goals Atlassian, E5 en mode texte). Aucun nouvel endpoint, hôte, droit Chrome ni CSP. Une seule tentative ; échec ou résultat incertain : même repère d'erreur rouge sur la carte qu'après un déplacement, relecture du board sans rejouer, réussite annoncée seulement après confirmation de Jira, aucune confirmation verte.
- **Textes** : tout libellé passe par `t()`, en français, anglais et espagnol (catalogue anglais de `src/i18n/` et pendant `src/i18n/es/`) ; `npm run verify:i18n` après changement visible. Contenus Jira jamais traduits.
- **Livraison** : `npm run check` et `npm run verify:jira` verts, régression pour tout comportement modifié, version actualisée (`package.json`, `package-lock.json`, `public/manifest.json`), CHANGELOG et manuel utilisateur à jour. Aucune donnée fictive dans `src/`.

## Technical Decisions

- **Une fonction de `core` par intention (AD-2)** : le rattachement passe par la même fonction que le glissé, `core/boardMove.ts` (séquence transition → Goal → rang ; en Goals Atlassian détacher → lier, arrêt si le détachement échoue, succès partiel si seul le nouveau lien échoue, sans rollback). En mode texte, le lien s'écrit dans la seule propriété `sprintgoals.v1` du sprint du ticket (sprint de référence pour un ticket étranger), via son module propriétaire (fusion sur Jira frais, refus si le même lien a changé). Le classement réutilise la même primitive de rang ; aucune variante de séquence propre au menu.
- **Porte d'écriture unique (AD-6)** : `BoardModel` détient la seule file (`app/model/BoardWriteGate.ts`) ; le geste du menu l'acquiert comme un dépôt, un second geste attend, une écriture préparée pour un board quitté est refusée (`BoardWriteRefused`, `stale`). `core` ne reçoit que le `JiraWriter` décoré, jamais le transport brut. `canEdit` ne concerne que E6, donc pas ces actions.
- **Services** : `BoardMovementService` déclenche l'exécution, traduit le résultat en avis et journalise ; la projection `pendingMove` reste visuelle, les compteurs restent ceux confirmés par Jira.
- **Couches (AD-1, AD-3)** : ni DOM ni `chrome.*` dans `core`/`jira` ; seuls les modèles créent des signaux (état d'ouverture du menu compris), les vues appellent des méthodes de modèle sans affecter de signal ; services par `app/services/ports.ts`. Gardes de sources dans `tests/guards/sources.test.ts`.
- **Swimlanes** : l'objectif est prioritaire pour tous les types visibles ; `goalIssues` contient aussi les tickets de types `SWIMLANE` rattachés, `swimlaneIssues` ceux sans rattachement ; une carte peut rejoindre tout objectif ou revenir uniquement dans sa destination par défaut (`swimlaneId`). Les sous-tâches sans Goal propre héritent de celui du parent.

## UX & Interaction Patterns

- Le menu est un équivalent des gestes de glissé existants, pas un nouveau comportement métier : mêmes règles de Daily, de présentation et d'écriture en cours que le glisser-déposer.
- Les réglages offrent déjà un équivalent clavier ou menu à chaque glissé ; le menu de carte suit ce principe sur le board.
- Avec plusieurs sprints, les objectifs sont préfixés du nom de leur sprint ; le filtre Sprint ne masque aucun objectif.

## Cross-Story Dependencies

- Les deux stories dépendent de l'Epic 1 : story 1.3 (une fonction `core` par intention) et story 1.4 (porte d'écriture de `BoardModel`).
- 3.2 dépend de 3.1 : elle ajoute ses actions au menu créé par 3.1 et reprend ses règles d'échec.
