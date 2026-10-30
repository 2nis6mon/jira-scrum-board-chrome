---
title: 'Story 1.8 — Le journal des écritures reste lisible dans toutes les langues'
type: 'refactor'
created: '2026-10-30'
status: 'done'
baseline_commit: '059fd3152eac860917bf844b8eefc7b79b90f628'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/docs/technique/donnees.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `core` produit des phrases utilisateur (`sprintPlanning.ts` : `PlanningOutcome.message` et `Error` en français ; `boardWrites.ts`, `sprintGoals.ts` : messages d'erreur et contextes de décodage) ; les services les recopient dans `audit.v1`, qui stocke donc des phrases françaises ensuite relocalisées par motifs (`localize`) à l'affichage.

**Approach:** `core` renvoie des résultats typés (codes de raison et paramètres) et des erreurs typées ; les modèles et services produisent le texte avec `t()`. Les nouvelles entrées `audit.v1` stockent une clé du catalogue et ses paramètres pour les champs textuels qu'elles produisent ; l'affichage traduit ces clés, et continue d'afficher les anciennes entrées en phrases comme aujourd'hui.

## Boundaries & Constraints

**Always:** textes visibles en français inchangés (même phrases, mêmes avis) ; anciennes entrées `audit.v1` affichées comme avant dans les trois langues ; une nouvelle entrée reste acceptée par le lecteur des versions précédentes (`isEntry` de 0.36.1 : `at`, `site`, `action`, `outcome` chaînes, `issueKey` chaîne ou `null`) ; contenus Jira (titres, noms de statut, messages renvoyés par Jira) passés en paramètres et jamais traduits ; tout nouveau texte présent dans `src/i18n/` (fr, en, es).

**Never:** migrer ou réécrire les anciennes entrées ; changer `MAX_AUDIT_ENTRIES` ou la clé `audit.v1` ; traduire un contenu Jira.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Nouvelle écriture | rattachement réussi | entrée avec clé + paramètres, sans phrase française dans ses champs hors contenu Jira | N/A |
| Ancienne entrée | `detail: "conflit : statut modifié dans Jira"` | affichée comme aujourd'hui en fr/en/es | N/A |
| Langue changée | journal affiché en en puis es | nouvelles entrées traduites dans la langue courante | N/A |
| Phrase ajoutée dans `core` | littéral égal à une clé du catalogue dans `src/core/` | la garde échoue en nommant le fichier | N/A |

</frozen-after-approval>

## Code Map

- `src/core/sprintPlanning.ts` -- `PlanningOutcome.message` et les `throw new Error("…")` : remplacer par un code de raison typé (+ paramètres, ex. étapes confirmées, clé de ticket) ; `PlanningModel` construit le texte avec `t()` à partir des clés existantes du catalogue (`src/i18n/messages.ts`).
- `src/core/boardWrites.ts` -- `"Cet objectif n'existe plus dans le sprint. Actualisez le board."`, `"Jira a refusé de classer {issueKey}."` : erreurs typées ou résultats ; le service garde le texte.
- `src/core/sprintGoals.ts` -- contextes français de `unreadableError` : erreur typée (`reason`), texte produit côté service/modèle.
- `src/core/teamSettings.ts`, autres `src/core/*.ts` -- même règle pour toute phrase trouvée par la garde (y compris les contextes de `JiraError` construits dans `core` et les libellés de `teamDifferences`, à traiter en clés si la garde les signale).
- `src/app/model/auditLog.ts` -- ajouter des champs optionnels de message (par ex. `toMessage?: {key, params}`, `detailMessage?: {key, params}`) ; pour les nouvelles entrées, `to`/`detail` ne portent plus de phrase (contenu Jira brut ou `null`) ; `isEntry` accepte les deux formes.
- Services (`BoardMovementService`, `BoardSettingsService`) et `PlanningModel`/`BoardModel.#record` -- produire les entrées au nouveau format.
- `src/app/views/DiagnosticView.tsx` (l. ~187–189) -- afficher `t(key, params)` pour les nouvelles entrées, `localize(detail)` pour les anciennes.
- `tests/guards/sources.test.ts` -- garde : aucun littéral de chaîne de `src/core/` n'est égal à une clé du catalogue `english` ni à sa partie fixe (modèles `{p0}`) ; message nommant le fichier.
- Tests : `tests/app/auditLog.test.ts`, `tests/core/sprintPlanning.test.ts`, `tests/app/PlanningModel.test.ts`, `tests/app/BoardLocalization.test.tsx`, `tests/i18n/`.
- `ARCHITECTURE-SPINE.md` -- retirer l'écart « Conventions » ; `docs/technique/donnees.md` (format `audit.v1`) ; `CHANGELOG.md` sous 0.36.2.

## Tasks & Acceptance

**Execution:**
- [x] `src/core/*.ts` -- résultats et erreurs typés, plus de phrase -- convention Erreurs et messages
- [x] `src/app/model/auditLog.ts` -- format clé + paramètres, lecture des deux formes -- CAP-7
- [x] services, `PlanningModel`, `BoardModel` -- produire texte et entrées -- CAP-7
- [x] `src/app/views/DiagnosticView.tsx` -- affichage des deux formes -- CAP-7
- [x] `src/i18n/*.ts`, `src/i18n/es/*.ts` -- clés nécessaires -- NFR10
- [x] `tests/...` -- matrice : anciennes entrées en fr/en/es, nouvelle entrée sans phrase, compatibilité `isEntry` 0.36.1 (copie de la fonction dans le test), garde `core` -- CAP-7
- [x] documents -- spine, données, changelog

**Acceptance Criteria:**
- Given `npm run verify:i18n` et `npm run verify:planning`, when ils tournent, then ils passent.

## Implementation Notes

- `src/core/reasons.ts` : `CoreReason` (union des raisons) et `CoreError` (son `message` est le code). `sprintPlanning.ts` rend `PlanningOutcome.reason` (`published`, `suspended`, `notFuture`, `sprintChanged`, `refused`, `unconfirmed` + étapes confirmées) ; avertissements Goals (`GoalsWarning`), `goalsIssue`, `SettingError`, `TeamFamily` et `BoardSetupError` sont typés.
- `src/app/model/appMessage.ts` : message stockable `{ key, params }`, `{ text }` (texte de la couche Jira), `{ list, separator }` ; `renderMessage` (langue courante, repli en texte source pour une clé inconnue), `sourceText` (français) et `isAppMessage` (lecture tolérante du journal).
- `src/app/model/coreText.ts` : correspondance exhaustive raison → clé du catalogue (un `never` refuse une raison sans message), suggestions, et libellés déplacés de `core` (couleurs, filtres rapides, champs de carte, familles de réglages).
- Les avis à l'écran restent en texte source (`sourceText`) et sont présentés par `localize`, ce qui garde le changement de langue en direct ; seul `audit.v1` stocke des clés.
- Exception nommée de la garde : « Ajouté en cours de sprint » (`src/core/cardColors.ts`), nom persisté de la règle intégrée.
- Erreurs de la couche Jira (hors périmètre de la garde) : leur texte est rangé en `{ text }` dans `detailMessage` ; `detail` ne garde que le message renvoyé par Atlassian.
- `decodeTeamSettings` : `boardName` factice passé de « réglages d'équipe » à `""` ; vérifié sans effet observable (`teamSettingsOf` ne lit pas ce champ, le décodeur accepte toute chaîne).
- Clés ajoutées (fr/en/es) : « avant {p0} », « Transition « {p0} » », « enregistrement ».
- Petits changements visibles hors du français : d'anciennes entrées « Transition « X » » sont désormais traduites en en/es ; en espagnol, les étapes d'un planning partiel sont traduites une à une (« texto de los objetivos » au lieu de « texto de objetivos »).

## Spec Change Log

## Review Triage Log

| # | Constat | Verdict | Preuve / route |
|---|---------|---------|----------------|
| 1 | Tableau du journal jamais rendu par un test | high | Gap pré-vérifié : aucune vue ne lit `.journal td` ; patch |
| 2 | Cause des écritures en échec, détail de transition et refus Atlassian non vérifiés | high | Gap pré-vérifié ; patch |
| 3 | `reasonMessage` non exhaustif : code brut possible | medium | `Partial<Record>` + `default` ; patch |
| 4 | Message stocké mal formé fait planter le Diagnostic | medium | `isAppMessage` accepte `key` + `list` non tableau ; patch |
| 5 | Repli sur clé inconnue non exercé | medium | Gap pré-vérifié ; patch |
| 6 | Textes des nouvelles erreurs (`rankRefused`, décodages) non vérifiés | medium | Gap pré-vérifié ; patch |
| 7 | Raisons du planning non vérifiées | low | Defer proposé ; correctif d'une ligne par cas : patch |
| 8 | Colonnes vides après retour à 0.36.1, doc trompeuse ; `detail` décrit à tort | medium | Le bloc figé interdit la phrase dans `to`/`detail` : documenter ; patch |
| 9 | Littéral `"tableau"` et champs `detail` inutilisés | low | Correction directe ; patch |
| 10 | Garde `catalogPhrases` lit les commentaires | low | Retrait des commentaires ; patch |
| 11 | Variable `message` masquant l'import ; `cardFieldLabel` non typé | low | Corrections directes ; patch |
| 12 | `boardName` vide dans `decodeTeamSettings` | maybe-false | À confirmer par l'implémentation (aucun usage observable connu) ; patch de vérification |
| 13 | Erreurs de la couche Jira stockées en phrases `{ text }` | medium | Hors de `core`, mécanisme de `jira/errors.ts` ; defer |
| 14 | Avis en direct relocalisés par motifs, sans test en/es | medium | Mécanisme antérieur conservé (« avis inchangés ») ; defer |
| 15 | Pluriel de `pinnedCount` selon la règle française | low | Rejeté : « 0 Goal pinned » rare et compréhensible ; correctif non direct |
| 16 | Profondeur > 8 refusée | low | Rejeté : imbrication réelle ≤ 3 |
| 17 | Message Jira brut de `detail` passé à `localize` | false | Comportement identique à avant la story |
| 18 | `DONE_LABELS` et repli Atlassian en texte dans le service | false | Phrases autorisées dans les services (couche `app`), présentes au catalogue |
| 19 | `loadError` classe `CoreError` en « other » | maybe-false | Erreurs côté écriture, hors des segments mesurés ; rejeté (low si vrai) |
| 20 | Spec non finalisée | false | Implementation Notes remplies par le correctif, statut à l'étape 5 |

## Verification

**Commands:**
- `npm run check` -- expected: vert
- `npm run verify:i18n` -- expected: vert
- `npm run verify:planning` -- expected: vert
- `npm run verify:jira` -- expected: vert
