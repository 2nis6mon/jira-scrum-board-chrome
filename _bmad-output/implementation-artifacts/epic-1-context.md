# Epic 1 Context: Des écritures Jira sûres et cohérentes

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Remettre le code en conformité avec les règles d'architecture AD-1 à AD-7 avant la prochaine fonction qui écrit dans Jira (menu contextuel, Epic 3). L'équipe doit pouvoir déplacer, rattacher, épingler et publier sans jamais perdre de données d'un format plus récent ; deux gestes ne partent jamais en même temps sur un même board ; chaque intention suit toujours le même ordre d'écritures ; les règles de structure sont vérifiées automatiquement par les tests. Les écarts actuels servent de précédents trompeurs : aucun ne doit être pris pour modèle. Le plus grave, à traiter en premier : `sprintgoals.v1` est écrite par trois fonctions aux règles de conflit différentes, et un rattachement texte peut écraser une version inconnue ou perdre des champs inconnus.

## Stories

- Story 1.1 : Ne jamais perdre de données en écrivant `sprintgoals.v1`
- Story 1.2 : Un seul endroit décide où sont stockés les Goals épinglés
- Story 1.3 : Une seule fonction par intention d'écriture
- Story 1.4 : Une seule porte d'écriture par board
- Story 1.5 : Les gardes de sources vérifient le sens des dépendances
- Story 1.6 : Les messages entre Jira et la vue sont déclarés une seule fois
- Story 1.7 : La déconnexion efface vraiment toutes les données du site
- Story 1.8 : Le journal des écritures reste lisible dans toutes les langues
- Story 1.9 : Tous les interrupteurs de fonction au même endroit

## Requirements & Constraints

- **Aucun changement visible**, sauf le refus d'un rattachement texte en conflit (1.1), avec exactement : « Ce ticket a été modifié par quelqu'un d'autre depuis le chargement. Le board a été rechargé ; recommence si besoin. » Le board est relu, l'écriture n'est pas rejouée. Le texte passe par `t()` et existe en FR/EN/ES.
- **Aucune nouvelle écriture**, endpoint, hôte, permission Chrome ni assouplissement de CSP : inventaire E1–E9 de `src/jira/writes.ts` inchangé, tests exhaustifs préservés.
- **Formats persistés inchangés** (`com.scrumboardmac.*`, clés `.v1`, identifiants). Version inconnue ou donnée illisible jamais écrasée, clés inconnues conservées à tous les niveaux, limite client de 32 Ko par propriété. Seule évolution de format : les nouvelles entrées `audit.v1` (clé + paramètres), les anciennes (phrases) restant affichées comme avant dans les trois langues.
- **Une seule tentative par écriture** ; après un résultat incertain, relire sans rejouer et n'annoncer la réussite qu'après confirmation.
- Chaque story est **livrable seule** (version patch), avec `npm run check` et `npm run verify:jira` verts ; `verify:drag` et `verify:settings` passent sans changement de comportement (1.3). Régression ajoutée pour tout comportement modifié.
- Sprint Planning reste désactivé dans le paquet ; comportement visible des interrupteurs inchangé (diagnostic actif, santé du sprint masquée).
- Ordre : 1.1 en premier (seul écart pouvant perdre des données).
- **Hors périmètre** : inversion hexagonale, endpoints « enhanced », fusion entre onglets des écritures de clés locales (la dernière écriture gagne, c'est accepté), nouvelle version de format des propriétés Jira, toute nouvelle fonction.
- Signal de réussite de l'epic : la section « Écarts à résorber » de la note d'architecture est vide, et les gardes de sources encodent AD-1, AD-4 et AD-7.

## Technical Decisions

- **Sens des dépendances (AD-1)** : `jira` n'importe jamais `core`, `app`, `integration`, ni DOM ni `chrome.*`. Le contrat d'observation des lectures (`core/loadTrace.ts`, importé par `jira/transport.ts`) migre dans `src/jira/`. Seuls `AppModel`, `BoardModel` et `DiagnosticModel` construisent `JiraTransport`, `JiraClient`, `GoalsClient` et `AuditLog`. `tests/guards/sources.test.ts` est la traduction exécutable du graphe et doit échouer en nommant le fichier fautif.
- **Une fonction `core` par intention (AD-2)** : déplacer (transition → Goal → rang, arrêt au premier échec, résultat partiel typé), changer de Goal Atlassian (détacher → lier, succès partiel si seul le nouveau lien échoue), publier les réglages (relecture et conflit dans `core/teamSettings.ts`). Les services déclenchent sur geste, gèrent file, droits et journal, traduisent le résultat en avis ; ils peuvent seulement décorer le `JiraWriter`.
- **Propriétaire unique de `sprintgoals.v1` (AD-4)** : `core/sprintGoals.ts` seul décode, encode et expose la primitive de mise à jour (relecture, mutation pure fournie par l'appelant, écriture), fixe la règle de conflit et l'horodatage. Règle : fusion sur Jira frais si la mutation ne touche qu'un lien ; refus si la zone modifiée a changé depuis la version de base. `boardWrites.ts` (`readStoredDocument`, `DOCUMENT_KEYS`) et `sprintPlanning.ts` (`readGoalProperty`) passent par elle.
- **Résolveur des Goals épinglés** : un seul résolveur dans `core` choisit `sprintgoals.v1` du sprint (Scrum avec sprint actif), `boardsettings.v1` (Kanban) ou l'indisponibilité sans écriture (Scrum sans sprint actif, comme Jira). Aucun service ni vue ne teste `boardType` pour choisir.
- **Porte d'écriture unique (AD-6)** : `BoardModel` détient la seule file d'écritures du board (déplacement, rattachement texte, réglages, publication du planning). `core` ne reçoit que le décorateur de la porte (péremption de génération, droits), jamais le transport brut. `canEdit` ne conditionne que E6 ; E1–E5, E8, E9 relèvent des droits Jira ; E7 reste hors du board. Disparaissent : `BoardSettingsService.#teamQueue`, la file propre à `dropIssue`, le rattachement texte sans file ; `PlanningModel` ne journalise plus lui-même.
- **Clés locales (AD-4)** : un module propriétaire par clé ; `connection.v1` et `launcher.v1` via un nouveau `app/model/connectionStore.ts`, `boards.v1` via `boardStore`. Chaque module exporte `forgetSite(origin)`, enregistré dans une liste unique appelée par la déconnexion (remplace la liste manuelle de `AppModel.disconnect()`). Nouvelle clé de site : suffixe `:<origine Jira>`. Doublons tolérés seulement s'ils sont imposés par l'absence d'import de `bootstrap.ts` (`language.v1`, `jira-button-position.v1:<origine>`), nommés et testés.
- **Protocole hôte ↔ vue (AD-7)** : `src/integration/messages.ts` déclare chaque `sprint-goals:*` (canal `postMessage` ou `chrome.runtime`, sens, charge utile, validation), utilisé par `embedded.ts`, `worker.ts`, `bootstrap.ts` (si import possible, sinon doublon nommé) et `launcherChrome.ts`. La copie dans `injectBoard.ts` (sans import, copiée par `executeScript`) est comparée par un test. Origine et fenêtre source vérifiées dans les deux sens.
- **Messages et journal** : `core` renvoie des résultats typés ou des clés du catalogue, jamais de phrase ; les modèles produisent le texte. Garde de test contre les phrases dans `src/core/`. Tout nouveau texte va dans le catalogue anglais de `src/i18n/` et son pendant `src/i18n/es/`.
- **Interrupteurs (AD-5)** : `SPRINT_HEALTH_ENABLED` (`BoardView.tsx`) et `DIAGNOSTIC_ENABLED` (`DiagnosticView.tsx`) migrent dans `app/featureFlags.ts`, fixés à la compilation, gardés aux points d'entrée des modèles et services, pas seulement dans la vue. Décodage, conservation des formats et effacement ne dépendent jamais d'un interrupteur. Un test des modes de compilation couvre `dist/` et le paquet.

## Cross-Story Dependencies

- 1.1 avant tout : 1.2 (épinglage) et 1.4 (publication du planning par la porte) écrivent `sprintgoals.v1` via sa primitive de mise à jour.
- 1.3 et 1.4 se complètent : les fonctions `core` par intention reçoivent le `JiraWriter` décoré par la porte de `BoardModel`.
- 1.8 s'appuie sur les résultats typés de `sprintPlanning.ts` et `boardWrites.ts` (touchés par 1.1 et 1.3).
- 1.5 rend exécutable le graphe AD-1 ; il doit passer sur le code livré sans exception tolérée.
- En aval : l'Epic 2 (épinglage par sprint, E5) s'appuie sur 1.2 et 1.4 ; l'Epic 3 (menu contextuel) réutilise les fonctions de 1.3 et la porte de 1.4 ; l'import de réglages de l'Epic 6 réécrit E6 par cette porte.
