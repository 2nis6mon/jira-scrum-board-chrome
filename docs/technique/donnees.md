# Données persistantes

Propriétés Jira et clés locales de l'extension. Règle de propriété des formats : AD-4 de la
[note d'architecture](../../_bmad-output/planning-artifacts/architecture/architecture-sprint-goals-board-2026-10-27/ARCHITECTURE-SPINE.md) ;
autres références : [index technique](index.md).

## Propriétés Jira

| Propriété Jira | Contenu |
|---|---|
| `com.scrumboardmac.sprintgoals.v1` | Objectifs texte, liens ticket → objectif, Goals épinglés Scrum, métadonnées |
| `com.scrumboardmac.boardsettings.v1` | Réglages partagés, swimlanes, Goals épinglés Kanban |
| `com.scrumboardmac.diagnostic` | Test d'écriture demandé, relu puis supprimé |

Préserver ces noms et les identifiants ; relecture avant modification, conflits refusés, données
illisibles jamais écrasées, clés inconnues conservées, limite client 32 Ko. Références de format :
[`sprintGoals.ts`](../../src/core/sprintGoals.ts), [`teamSettings.ts`](../../src/core/teamSettings.ts) et leurs tests.
`sprintgoals.v1` n'est mis à jour que par `updateSprintGoalProperty` (`sprintGoals.ts`) : relecture
stricte (version inconnue refusée), refus si la zone modifiée a changé depuis le chargement (lien
du ticket, Goals épinglés, document entier pour le planning), fusion sur Jira frais sinon, clés
inconnues gardées à la racine et par objectif, `updatedAt` ISO à la seconde, une seule écriture.
L'emplacement des Goals épinglés n'est choisi que par `pinnedGoalsStorage` (`pinnedGoals.ts`) :
propriété du sprint de référence en Scrum, `boardPinnedGoalIds` en Kanban, indisponible en Scrum
sans sprint actif ; services et vues consomment ce stockage sans tester le type du board.
Les anciennes valeurs `SCRUM`/`KANBAN`, `showKanbanSection`, `kanbanSectionLabel`,
`dailyKanbanStockLimit` restent compatibles ; retrait seulement avec migration et décision sur les
anciennes installations. Valeurs absentes : défauts compatibles, pas de perte des données.
Depuis 0.31.0, `scrumColumns`, `kanbanColumns` et `blockedLabels` ne sont plus lus : clés inconnues,
ils sont réécrits tels quels pour les versions précédentes, qui exigent les colonnes ; un premier
document reçoit celles de Jira. Localement, masquage et noms de colonnes enregistrés sont ignorés.
Depuis 0.31.1, le marquage `countsAsBug` des types est ignoré dans les anciens documents et caches,
et absent des nouvelles configurations sérialisées. Les catégories et swimlanes sont conservées ;
aucune migration n'écrit automatiquement dans Jira.
Les swimlanes utilisent les types. À la lecture d'un réglage 0.34.0,
les anciennes affectations sont rétablies depuis `ticketSwimlanes.typeIds`, sans requête JQL ni
publication automatique. Les types ignorés restent exclus. Les règles créées uniquement par JQL,
sans type associé, ne deviennent pas des groupes ; la clé partagée `jqlSwimlanes` est préservée
comme donnée inconnue, sans effet sur le classement.

## Stockage local Chrome

| Clé `chrome.storage.local` | Contenu |
|---|---|
| `connection.v1`, `launcher.v1` | Site connecté ; dernière adresse de board |
| `boards.v1`, `interface.v1` | Boards/configuration/sélection par site ; préférences de présentation |
| `language.v1` | Langue personnelle (`auto`, `fr`, `en`, `es`), commune aux boards de ce navigateur |
| `sprint-planning.v1:<origine Jira>` | Brouillons par board/sprint : objectifs texte, clés/rattachements, capacité, révision de base ; oubli du board/site les efface |
| `jira-button-position.v1:<origine Jira>` | Position personnelle commune aux boards d'un site |
| `dismissedNotices.v1`, `graphqlOrigin.v1` | Avis fermés par site/board ; variante Origin du site |
| `audit.v1` | Au plus 500 écritures de l'extension : clés des tickets, résultat, erreurs, aucun cookie ni saisie native |
| `loadDiagnostics.v1` | Cinq chargements, 500 segments chacun ; troncature comptée |

Les mesures de chargement ne stockent que version/date, type du board, compteurs, temps et catégories
fermées : aucun nom, URL, JQL, identifiant Jira, en-tête, corps ou message brut. Identifiants de
rapports/appels locaux à la mesure, décodeur strict, stockage non bloquant. Historique par onglet,
relu à l'ouverture, sans consolidation entre onglets simultanés : ils peuvent se remplacer.
Le diagnostic de capacités et les erreurs ordinaires peuvent contenir des informations Jira :
relire leur rapport avant partage. Aucun envoi automatique ni `storage.sync`.

## Identifiants à conserver

La clé publique du manifest conserve l'identité de développement `efhpkdoiimdggndnfcgdoaniobdcmokb`.
Garder aussi les identifiants DOM/scripts historiques contenant `direct`, nécessaires à la reconnaissance
d'une intégration déjà injectée ; ils ne désignent pas un second mode.
