---
title: 'Story 1.7 — La déconnexion efface vraiment toutes les données du site'
type: 'refactor'
created: '2026-10-30'
status: 'done'
baseline_commit: '18b37bedab9cb7284d66585e1be57e1d74ecf9c4'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/docs/technique/donnees.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `connection.v1` et `launcher.v1` sont lus et écrits directement par `AppModel` et `LauncherModel`, `boards.v1` est lu brut par le lanceur, et `AppModel.disconnect()` efface les données du site par une liste manuelle d'appels ; une nouvelle clé oubliée dans cette liste survivrait à la déconnexion.

**Approach:** Chaque clé locale a un module propriétaire ; `app/model/connectionStore.ts` (nouveau) possède `connection.v1` et `launcher.v1`, le lanceur passe par lui et par `boardStore`. Chaque module qui garde des données d'un site exporte `forgetSite(origin)` et s'inscrit dans une liste unique (`app/model/siteData.ts`) que la déconnexion parcourt ; un test confronte cette liste à la table des clés de `docs/technique/donnees.md`.

## Boundaries & Constraints

**Always:** noms de clés et formats inchangés, anciennes données lisibles (NFR3) ; après déconnexion, aucune donnée du site déconnecté ne reste, celles des autres sites restent ; `language.v1` et `interface.v1` (préférences non liées à un site) restent ; un échec d'effacement d'un module n'empêche pas les autres ; la dernière écriture gagne entre onglets (accepté par AD-4).

**Never:** renommer ou migrer une clé ; effacer des préférences personnelles non liées au site ; lire les identifiants ou la session Jira.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Déconnexion | données de A et B pour chaque clé de site | toutes celles de A effacées, celles de B intactes | N/A |
| `launcher.v1` d'un autre site | dernière adresse sur B, déconnexion de A | `launcher.v1` conservé | N/A |
| Un module échoue | `forgetSite` d'un module rejette | les autres modules effacent quand même ; l'erreur ne bloque pas la déconnexion | comme les `.catch` actuels |
| Clé ajoutée à la table sans module | ligne nouvelle dans `donnees.md` | le test échoue | N/A |

</frozen-after-approval>

## Code Map

- `src/app/model/AppModel.ts` -- `disconnect()` (l. ~239–262) : remplacer la liste manuelle (`planning.forgetSite`, `GraphqlOrigin.forget`, `CONNECTION_KEY`, `launcher.v1`, `boardStore.forgetSite`, `forgetDismissedNotices`, `jira-button-position.v1:<origine>`, `audit.forgetSite`) par le parcours de la liste unique ; `CONNECTION_KEY` (l. ~26, ~172, ~234) via `connectionStore`.
- `src/app/model/connectionStore.ts` (nouveau) -- lecture/écriture de `connection.v1` et `launcher.v1` (formats actuels repris de `AppModel` et `src/integration/LauncherModel.ts`) + `forgetSite`.
- `src/integration/LauncherModel.ts`, `src/integration/launcher.tsx`, `src/app/platform/launcherChrome.ts` -- plus aucun accès direct à `connection.v1`, `launcher.v1`, `boards.v1` (passer par `connectionStore` et `boardStore`, selon AD-1 : `integration --> model` permis).
- `src/app/model/siteData.ts` (nouveau) -- liste des propriétaires `{ keys: readonly string[]; forgetSite(store, origin) }` : `connectionStore`, `boardStore`, `noticeStore`, `auditLog`, le module de `graphqlOrigin.v1`, le brouillon `sprint-planning.v1:<origine>`, `jira-button-position.v1:<origine>` (doublon nommé de `bootstrap.ts` : propriétaire côté vue à identifier ou créer), `loadDiagnostics.v1` si elle contient des données du site (vérifier ; sinon justifier son exclusion dans la liste comme `language.v1`/`interface.v1`).
- `tests/app/siteData.test.ts` (nouveau) -- lit la table « Clé `chrome.storage.local` » de `docs/technique/donnees.md`, vérifie que chaque clé est soit déclarée par un propriétaire, soit explicitement listée comme non liée à un site ; remplit un faux `LocalStore` avec des données de deux sites puis vérifie la matrice après `disconnect()`.
- `tests/app/AppModel.test.ts`, `tests/app/boardStore.test.ts`, `tests/app/noticeStore.test.ts` -- tests existants.
- `ARCHITECTURE-SPINE.md` -- retirer les deux écarts AD-4 sur les clés locales ; `docs/technique/donnees.md` (propriétaires) ; `CHANGELOG.md` sous 0.36.2.

## Tasks & Acceptance

**Execution:**
- [x] `src/app/model/connectionStore.ts` -- propriétaire de `connection.v1`/`launcher.v1` -- AD-4
- [x] `src/app/model/siteData.ts` + `forgetSite` dans chaque propriétaire -- liste unique -- AD-4
- [x] `src/app/model/AppModel.ts`, `src/integration/LauncherModel.ts`, `launcher.tsx`, `src/app/platform/launcherChrome.ts` -- passer par les propriétaires -- AD-4
- [x] `tests/app/siteData.test.ts` -- table des clés et matrice -- CAP-6
- [x] `tests/guards/sources.test.ts` -- garde : `"connection.v1"`, `"launcher.v1"`, `"boards.v1"` n'apparaissent que dans leur module propriétaire -- régression
- [x] documents -- spine, données, changelog

**Acceptance Criteria:**
- Given `npm run check`, when il tourne, then les tests existants de connexion et du lanceur passent sans changement d'attente.

## Implementation Notes

- `connection.v1` n'est effacé que s'il désigne le site déconnecté (ou s'il est illisible) : celui d'un autre site reste.
- `loadDiagnostics.v1` est déclaré hors site (mesures sans nom, URL ni identifiant Jira) ; il reste remis à zéro par `loadDiagnostics.clear()` comme avant.
- `launcherChrome.ts` et `launcher.tsx` ne référençaient aucune de ces clés : inchangés.
- Le lanceur importe `boardStore` (+21 Ko dans le module commun vue/lanceur).

## Spec Change Log

## Review Triage Log

| # | Constat | Verdict | Preuve / route |
|---|---------|---------|----------------|
| 1 | `forgetAuditSite` hors de la file de l'`AuditLog` : une entrée du site peut revenir ; aucun test d'ajout en cours | high | Lecture-modification-écriture concurrente d'un `append` ; gap pré-vérifié ; patch |
| 2 | Exception synchrone d'un propriétaire échappe à `allSettled` | medium | `map` appelle directement `forgetSite` ; patch direct |
| 3 | Étapes non protégées avant l'effacement (`flushDraft`, `permissions.remove`…) | medium | Un rejet empêche tout effacement ; patch |
| 4 | Brouillon du planning recréé après effacement | medium | L'ancien `forgetSite` attendait `#saveQueue` ; patch |
| 5 | `PlanningModel.forgetSite()` et `GraphqlOrigin.forget()` sans appelant | low | Seconde voie d'effacement ; suppression directe ; patch |
| 6 | `connection.v1` illisible et `launcher.v1` non analysable survivent | medium | Régression par rapport à l'effacement inconditionnel ; patch |
| 7 | `launcher.v1` de A jamais testé | medium | `seed()` le met toujours sur B ; patch |
| 8 | Échecs d'effacement non signalés | low | Rejeté : avant, un échec interrompait la déconnexion, c'était pire |
| 9 | Garde de littéraux limitée à trois clés | low | Rejeté : les autres clés ont déjà un module unique, extension non directe |
| 10 | `"interface.v1"` recopié dans `siteData.ts` | low | Rejeté : export impossible sans cycle, couvert par le test de table |
| 11 | Statut de `loadDiagnostics.v1` | low | Rejeté : documenté (Implementation Notes) |
| 12 | `loadActiveBoardRef` sans contrôle d'origine | false | Même lecture que l'ancienne lecture brute du lanceur |
| 13 | Échec de `connection.v1` sans effacer `launcher.v1` non testé | low | Defer proposé par le relecteur ; rejeté : garde défensive interne, indépendance entre propriétaires testée |
| 14 | CHANGELOG muet sur `graphqlOrigin.v1` et les mesures | low | Rejeté : sans effet visible |

## Verification

**Commands:**
- `npm run check` -- expected: vert
- `npm run verify:jira` -- expected: vert
