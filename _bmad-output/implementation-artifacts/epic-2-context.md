# Epic 2 Context: Plusieurs sprints actifs, jusqu'au bout

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Terminer la prise en charge des boards Scrum à plusieurs sprints actifs. Depuis la 0.36.0, les épinglages de Goals Atlassian de tous les sprints du board sont lus, mais seul celui du sprint principal (le premier sprint du board, qui porte titre, dates et fenêtre d'épinglage) se modifie. L'équipe doit pouvoir épingler les Goals du sprint de son choix, et voir quels tickets ont été reportés depuis le sprint précédent du board, pour rendre visible la charge héritée dès le démarrage d'un sprint. L'epic s'appuie sur la mise en conformité de l'Epic 1 (résolveur des épinglages, porte d'écriture unique).

## Stories

- Story 2.1 : Épingler les Goals du sprint de mon choix
- Story 2.2 : Voir les tickets reportés du sprint précédent

## Requirements & Constraints

- **Épinglage par sprint** : choix du sprint dans l'onglet Objectifs des réglages, seulement en source « Goals Atlassian » avec au moins deux sprints actifs du board ; présélection du sprint principal ; jamais de sprint étranger (`originBoardId` différent du board ; absent = du board). Une seule écriture E5 sur `sprintgoals.v1` du sprint choisi, les autres sprints inchangés. Changement de sprint bloqué tant que des modifications ne sont ni enregistrées ni annulées. Un seul sprint, Kanban ou Scrum sans sprint actif : comportement actuel conservé.
- **Reportés** : calculés sans aucune requête Jira supplémentaire, à partir de l'historique Sprint et des sprints clos du ticket (`closedSprints`, champ de la même lecture), en comparant les identifiants de sprint `from`/`to`, jamais les noms. Présentés par un filtre rapide « Reportés » (comme « Bloqués ») qui indique leur nombre ; **aucun compteur dans l'en-tête du sprint**. Exclus : tickets venant d'un sprint d'un autre board ou d'un sprint étranger, ajouts depuis le backlog en cours de sprint, tickets sans historique exploitable. L'indicateur « ajouté en cours de sprint » garde ses règles. Avec plusieurs sprints du board, le filtre réunit leurs reportés et se combine avec le filtre Sprint.
- **Écritures** : inventaire fermé E1–E9 inchangé ; l'épinglage Scrum est E5 (`PUT …/sprint/{id}/properties/com.scrumboardmac.sprintgoals.v1`). Aucun nouvel endpoint, hôte, droit Chrome ni CSP. Une seule tentative ; conflit ou refus Jira : modifications conservées, relecture sans rejouer, pas de réussite annoncée avant confirmation.
- **Formats persistés inchangés** : version inconnue jamais écrasée, clés inconnues conservées, limite 32 Ko par propriété.
- **Textes** : tout nouveau libellé passe par `t()`, en français, anglais et espagnol (catalogue anglais de `src/i18n/` et pendant `src/i18n/es/`) ; `npm run verify:i18n` après un changement visible. Contenus Jira jamais traduits.
- **Livraison** : `npm run check` et `npm run verify:jira` verts, régression pour tout comportement modifié, version actualisée (`package.json`, `package-lock.json`, `public/manifest.json`), CHANGELOG et manuel utilisateur à jour pour les changements visibles. Aucune donnée fictive dans `src/`.

## Technical Decisions

- **Résolveur unique des Goals épinglés** : `pinnedGoalsStorage` (`core/pinnedGoals.ts`) choisit seul l'emplacement (propriété du sprint de référence en Scrum, `boardPinnedGoalIds` de `boardsettings.v1` en Kanban, indisponible en Scrum sans sprint actif). Services et vues ne testent pas le type de board ni ne choisissent la propriété : le choix du sprint doit s'exprimer comme une entrée de ce résolveur, pas comme une branche dans la vue.
- **Propriétaire de `sprintgoals.v1`** : `core/sprintGoals.ts` (`updateSprintGoalProperty`) fait relecture stricte, mutation pure fournie par l'appelant et écriture unique ; refus si la zone modifiée (ici les Goals épinglés du sprint) a changé depuis le chargement, fusion sur Jira frais sinon.
- **Porte d'écriture** : `BoardModel` détient la seule file d'écritures ; l'épinglage l'acquiert, `core` ne reçoit que le `JiraWriter` décoré (péremption, droits). `canEdit` ne conditionne que E6 ; E5 relève des droits Jira. `BoardSettingsService` porte l'épinglage Scrum/Kanban par cette porte.
- **Couches (AD-1, AD-3)** : ni DOM ni `chrome.*` dans `core`/`jira` ; seuls les modèles créent des signaux, les vues n'en affectent aucun ; les services passent par `app/services/ports.ts`. Gardes de sources dans `tests/guards/sources.test.ts`.
- **Historique Sprint** : `sprintScope` rejoue l'historique jusqu'au démarrage (tolérance de 2 min, Jira pouvant dater le démarrage du sprint suivant avant d'écrire le report) ; identifiants `from`/`to` prioritaires sur les noms d'époque.

## UX & Interaction Patterns

- Le filtre **Sprint** n'apparaît qu'à partir de deux sprints affichés et ne masque jamais d'objectif ; les objectifs sont préfixés du nom de leur sprint dès qu'il y en a plusieurs.
- Les filtres rapides de l'extension (dont « Bloqués ») indiquent leur nombre ; « Reportés » suit le même modèle.
- Enregistrement explicite « Enregistrer dans Jira » dans les réglages ; aucun calcul ne publie automatiquement.

## Cross-Story Dependencies

- 2.1 dépend des stories 1.2 (résolveur `pinnedGoalsStorage`) et 1.4 (porte d'écriture de `BoardModel`).
- 2.2 est indépendante de 2.1 et n'écrit rien dans Jira ; elle s'appuie sur `sprintScope` et sur la détection des sprints étrangers.
