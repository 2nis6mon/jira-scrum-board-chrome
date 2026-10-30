---
id: SPEC-conformite-architecture
companions:
  - ../../planning-artifacts/architecture/architecture-sprint-goals-board-2026-10-27/ARCHITECTURE-SPINE.md
sources: []
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Source documents listed in frontmatter are for traceability — consult them only if you need narrative rationale or prose color this contract intentionally omits.

# Mise en conformité d'architecture

## Why

Obligation interne. La spine d'architecture (AD-1 à AD-7) fixe les règles qui empêchent deux évolutions indépendantes de diverger, mais le code s'en écarte encore sur treize points. Ces écarts servent de précédents trompeurs aux agents et aux développeurs. Le plus grave : la propriété `sprintgoals.v1` est écrite par trois fonctions qui appliquent trois règles de conflit différentes, et un rattachement peut effacer des données d'un format plus récent. Il faut les résorber avant la prochaine fonction qui écrit dans Jira (menu contextuel).

## Capabilities

- **CAP-1**
  - **intent:** Toute mise à jour de `sprintgoals.v1` conserve les versions et champs inconnus et applique une seule règle de conflit, quelle que soit la fonction qui écrit (AD-4).
  - **success:** Des tests montrent qu'un rattachement, un épinglage ou une publication du planning n'écrase jamais une version inconnue, conserve un champ inconnu d'un objectif, fusionne un changement d'un autre lien et refuse un changement du même lien survenu depuis la lecture.
- **CAP-2**
  - **intent:** Les Goals épinglés sont lus et écrits par un seul résolveur, qui choisit la propriété Jira selon le board (AD-4).
  - **success:** Aucun service ni vue ne choisit la propriété ; un test couvre Scrum, Kanban et Scrum sans sprint actif.
- **CAP-3**
  - **intent:** Chaque intention d'écriture (déplacer, rattacher à un Goal, publier les réglages) a une seule fonction de `core`, qui porte séquence, relecture et résultat partiel (AD-2).
  - **success:** `BoardMovementService` et `BoardSettingsService` ne contiennent plus d'enchaînement d'écritures ni de détection de conflit ; `verify:drag` et `verify:settings` passent sans changement de comportement.
- **CAP-4**
  - **intent:** Toutes les écritures déclenchées depuis un board, planning compris, passent par une porte unique détenue par `BoardModel` (AD-6).
  - **success:** Un test montre qu'un second geste ne part pas pendant une écriture en cours sur le même board, que `core` ne reçoit jamais le transport brut, et que `canEdit` ne conditionne que E6.
- **CAP-5**
  - **intent:** Les messages `sprint-goals:*` sont déclarés une seule fois, et la copie de `injectBoard` ne peut pas en diverger (AD-7).
  - **success:** Un test échoue si un type, un sens ou une validation de `injectBoard.ts` diffère de la liste déclarée ; `verify:jira` passe.
- **CAP-6**
  - **intent:** Chaque clé locale a son module propriétaire, et la déconnexion efface toutes les données du site par ces modules (AD-4).
  - **success:** Le lanceur ne lit ni n'écrit de clé locale directement ; un test confronte les modules enregistrés à la table des clés de DEVELOPER.md et vérifie qu'après déconnexion aucune donnée du site ne reste.
- **CAP-7**
  - **intent:** `core` ne produit plus de phrases ; le journal enregistre les nouvelles entrées sous forme de clé et paramètres, sans perdre l'affichage des anciennes (convention Erreurs et messages).
  - **success:** Un test de garde refuse une phrase utilisateur dans `src/core/` ; les entrées `audit.v1` existantes s'affichent comme avant, dans les trois langues.
- **CAP-8**
  - **intent:** Le sens des dépendances de AD-1 est vérifié automatiquement, sans exception restante.
  - **success:** `tests/guards/sources.test.ts` échoue sur un import `jira → core` ou sur une construction de `JiraTransport`, `JiraClient`, `GoalsClient` ou `AuditLog` hors de `AppModel`, `BoardModel` et `DiagnosticModel`, et passe sur le code livré.
- **CAP-9**
  - **intent:** Tous les interrupteurs de fonction sont déclarés au même endroit et gardés aux points d'entrée des modèles et services (AD-5).
  - **success:** `SPRINT_HEALTH_ENABLED` et `DIAGNOSTIC_ENABLED` viennent de `app/featureFlags.ts` ; un test de mode de compilation couvre leur valeur dans `dist/` et dans le paquet.

## Constraints

- Aucun changement visible pour l'utilisateur, sauf le refus d'un rattachement texte en conflit introduit par CAP-1.
- Aucune nouvelle écriture, aucun nouvel endpoint, hôte, permission Chrome ni assouplissement de CSP ; inventaire E1–E9 inchangé.
- Noms et formats persistés inchangés (`com.scrumboardmac.*`, clés `.v1`). Seule évolution : les nouvelles entrées `audit.v1`, la lecture des anciennes étant conservée.
- Chaque capacité est livrable seule, avec `npm run check` et `npm run verify:jira` verts.
- Une seule tentative par écriture ; Sprint Planning reste désactivé dans le paquet.

## Non-goals

- Inversion hexagonale.
- Nouvelles fonctions, dont le menu contextuel sur ticket.
- Passage aux endpoints Software « enhanced ».
- Fusion entre onglets des écritures de clés locales.
- Nouvelle version de format des propriétés Jira.

## Success signal

- La section « Écarts à résorber » de la spine est vide, les gardes de sources encodent AD-1, AD-4 et AD-7, et un essai réel sur Jira montre le board, les déplacements, les réglages et le planning inchangés.

## Assumptions

- Livraison en plusieurs versions patch, chacune portant une ou quelques capacités.

## Decisions

- Livraison : CAP-1 en premier, seul écart pouvant perdre des données (décision de Denis, 27/10/2026).
- Message du refus de rattachement texte en conflit (CAP-1) : « Ce ticket a été modifié par quelqu'un d'autre depuis le chargement. Le board a été rechargé ; recommence si besoin. » Relecture du board sans rejouer l'écriture.

## Open Questions

- Faut-il un essai réel sur Jira pour le refus d'un rattachement texte en conflit (CAP-1), en plus du contrôle sur Jira fictif ?
