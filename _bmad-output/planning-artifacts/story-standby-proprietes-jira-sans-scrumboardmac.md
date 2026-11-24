# Story en attente — Retirer `scrumboardmac` des propriétés Jira

*Statut : **standby**, mise de côté par Denis le 24/11/2026. Non engagée : pas d'epic, pas de numéro, absente de
[epics.md](epics.md) et du suivi de sprint. À reprendre avec `bmad-create-epics-and-stories` quand la décision
ci-dessous est prise. Référence dans le [backlog](backlog.md), « Pistes produit à décider ».*

### Story : Renommer les propriétés Jira de l'extension sans le nom `scrumboardmac`

*Type : dette technique et nom. Demandée par Denis le 24/11/2026. Seul le Jira de Denis utilise ces propriétés.
Lève, si elle est retenue, la règle « préserver les clés `com.scrumboardmac.*` » d'[AGENTS.md](../../AGENTS.md).*

As a propriétaire de l'extension,
I want que les propriétés Jira de l'extension portent un nom sans `scrumboardmac` (ancien nom de l'application macOS abandonnée),
So that le nom de l'ancien produit disparaisse du code, des données Jira et de la documentation, sans perdre aucun objectif ni aucun réglage existant.

## Décision à prendre avant de planifier

Trois solutions ont été proposées le 24/11/2026. Aucune n'est retenue.

| | Solution | `scrumboardmac` disparaît | Données à migrer |
|---|---|---|---|
| A | Lecture double : écrire la nouvelle clé, lire la nouvelle puis l'ancienne | Du code non (constante « ancienne clé »), des données non | Aucune, chaque sprint se convertit à sa première écriture |
| B | **Migration par copie, puis bascule** (recommandée) : un script copie chaque propriété vers la nouvelle clé, le code ne lit plus que la nouvelle, les anciennes sont supprimées à la fin | Oui, partout | Toutes les propriétés existantes, en une fois |
| C | Renommer seulement le nom affiché et la documentation | Non | Aucune |

Recommandation : B. La lecture double sert à protéger d'autres installations qui liraient l'ancienne clé ; ici il n'y en
a pas. La compatibilité tient dans les données : les anciennes clés restent en place jusqu'à la vérification, donc
l'ancienne version de l'extension continue de fonctionner pendant la bascule.

Noms proposés (à confirmer) :

| Clé actuelle | Clé proposée |
|---|---|
| `com.scrumboardmac.sprintgoals.v1` (propriété de sprint) | `sprintgoals.dashboard.v1` |
| `com.scrumboardmac.boardsettings.v1` (propriété de board) | `boardsettings.dashboard.v1` |
| `com.scrumboardmac.diagnostic` (propriété technique de sprint) | `diagnostic.dashboard` |

Le format de la valeur ne change pas (`version: 1`) : seul le nom change.

## Acceptance Criteria (solution B, si elle est retenue)

**Given** un script de migration lancé par Denis, en lecture et en écriture, sur les boards concernés (3013, 3018 et les autres)
**When** il parcourt les sprints et les boards
**Then** pour chaque propriété existante il la copie sous la nouvelle clé sans rien supprimer, la relit pour vérifier l'égalité, ignore les propriétés absentes, ne rejoue jamais une écriture au résultat incertain (relecture puis décision), et affiche un compte rendu par sprint et par board

**Given** les propriétés copiées et vérifiées
**When** la nouvelle version de l'extension est installée
**Then** elle lit et écrit uniquement les nouvelles clés ; les objectifs, les liens ticket → objectif, les Goals épinglés, les réglages partagés et la couleur de chaque objectif sont identiques à ceux de l'ancienne version, sur un board réel

**Given** un sprint ou un board dont la nouvelle propriété est absente
**When** l'extension le lit
**Then** elle le traite comme une propriété absente (aucune donnée inventée), sans erreur ni repli sur l'ancienne clé

**Given** la migration vérifiée sur un sprint réel
**When** le script supprime les anciennes clés
**Then** chaque suppression n'a lieu qu'après relecture de la nouvelle clé, et aucune propriété `com.scrumboardmac.*` ne reste dans les sprints ni les boards migrés

**Given** le changement livré
**When** il est vérifié
**Then** le nom `scrumboardmac` n'apparaît plus dans `src/`, `tests/`, `docs/`, le skill `rapport-sprintgoals`, l'application Forge et le script PowerShell ; `writes.ts` et ses tests exhaustifs sont à jour (inventaire fermé : une clé de moins, une de plus, aucun nouvel endpoint) ; `npm run check`, `npm run verify:jira` et `npm run verify:i18n` sont verts ; version, changelog, `AGENTS.md` (règle des clés) et `docs/technique/` reflètent la décision

## Vérifications préalables

- **Écriture sur un sprint fermé.** Non vérifié : Jira accepte-t-il d'écrire ou de supprimer une propriété sur un sprint fermé ? À tester sur un sprint du sandbox avant de choisir B.
- **Droits.** Écrire une propriété de sprint demande le droit de gérer les sprints du projet ; une propriété de board, un droit sur le board.
- **Nom des clés.** Vérifier que Jira ne réserve pas le préfixe choisi, et que le nom sans domaine ne risque pas de collision avec une autre application du même Jira.
- **Périmètre.** Compter les sprints qui portent la propriété sur chaque board (le board 3013 compte 112 sprints fermés, la plupart sans propriété) et lister les boards avec `boardsettings.v1`.
- **Accès du script.** Chrome connecté (lecture seule jusqu'ici, il faudra une écriture : décision à part) ou jeton d'API ; ou une action de l'extension, ce qui ajoute une écriture (supprimer une propriété autre que le diagnostic) à l'inventaire.

## Notes

- **Code :** les trois clés sont déclarées dans `src/jira/writes.ts` (`SPRINT_PROPERTY_KEYS` et `BOARD_PROPERTY_KEYS`, lignes 52 à 67). Une quinzaine de lectures (`boardSync.ts`, `planningProgress.ts`, `sprintGoals.ts`, `sprintPlanning.ts`, `teamSettings.ts`) et trois écritures passent par ces constantes : changer les valeurs suffit, plus les tests (une vingtaine de fichiers dont `writes.test.ts`, `BoardWriteGate.test.ts`, `PlanningModel.test.ts`).
- **Hors `src/` :** `scripts/verify-planning.mjs`, `docs/technique/` (`donnees.md`, `securite.md`, `index.md`), `AGENTS.md`, le skill `.claude/skills/rapport-sprintgoals/SKILL.md`, `forge/bilan-objectifs-pi/` (manifest, code et README) et `scripts/lire-proprietes-jira.ps1`, tous non suivis par Git sauf les docs et `AGENTS.md`.
- **À ne pas confondre :** la clé publique du `manifest.json` et les identifiants persistés des objectifs et des colonnes ne changent pas. Cette story ne touche que les noms de propriétés Jira.
- **Jira n'a pas de renommage de propriété** : il faut copier puis supprimer, d'où des écritures sur chaque sprint concerné.
- **Contexte :** l'essai du 24/11/2026 (rapports d'objectifs d'Accueil-26T3 et T4, Avantages-26T4) a lu ces propriétés dans Chrome ; le connecteur Atlassian ne sait pas les lire, ce qui a motivé de les rendre plus faciles à manipuler.
