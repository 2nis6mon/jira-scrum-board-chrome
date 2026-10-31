---
title: 'Correctif rétro Epic 1 n°3 — Le rattachement texte ne retire plus l''objectif d''un collègue'
type: 'bugfix'
created: '2026-10-31'
status: 'done'
baseline_commit: 'bbe06f68a3b4cc0bd0733a099b45c137ad3ed4f8'
route: 'dispatch'
review_loop_iteration: 1
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-1-sprintgoals-sans-perte.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `withTextGoalLink` (`src/core/boardWrites.ts:214-260`), mutation du rattachement texte passée à `updateSprintGoalProperty`, reconstruit la liste `goals` à partir des objectifs connus au chargement (`input.goals`) et retire les liens vers tout objectif absent de cette liste. Un objectif ajouté depuis dans la propriété (collègue, publication du planning) disparaît à l'écriture, avec ses champs inconnus et les liens d'autres tickets qui y mènent. Le contrôle de conflit ne regarde que le lien du ticket, donc rien ne l'empêche (constat F4 de la rétrospective, entrée 1 de `deferred-work.md`).

**Approach:** La mutation distingue, parmi les objectifs relus dans Jira que le board n'affiche pas, ceux qui étaient déjà dans la propriété lue au chargement (le board les a écartés en réconciliant avec le texte du sprint : ils restent retirés, avec leurs liens, comme aujourd'hui) de ceux qui y sont apparus depuis (ajoutés par un collègue ou par le planning : ils sont conservés intacts, avec leurs liens). Les objectifs affichés gardent leurs champs de Jira avec le titre et la position du board ; ceux que le board vient de réconcilier depuis le texte sont ajoutés. Si la propriété n'a pas pu être lue au chargement, aucun objectif de Jira n'est retiré.

## Boundaries & Constraints

**Always:** une seule écriture ; règle de conflit de la story 1.1 inchangée (refus si le lien du ticket a changé, fusion sinon) ; identifiants stables des objectifs conservés ; champs inconnus d'un objectif conservés ; couleur écrite = celle de Jira, à défaut celle de sa position (règle actuelle) ; format persisté inchangé ; un objectif retiré ou renommé dans le texte du sprint continue d'être purgé à l'écriture comme avant le correctif.

**Never:** modifier le champ texte natif du sprint ; changer la réconciliation à la lecture (`reconcileSprintGoals`) ; toucher à l'épinglage ou à la publication du planning ; conserver un objectif que le board a écarté à la réconciliation.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Objectif ajouté depuis | chargement : propriété g1, g2 ; Jira frais : g1, g2, g9 (avec un champ inconnu) et lien `ABC-9 → g9` ; board : g1, g2 | rattacher `ABC-1 → g1` écrit g1, g2 **et g9** (champ inconnu compris, après ceux du board, dans l'ordre de Jira) et garde `ABC-9 → g9` | N/A |
| Objectif retiré du texte | chargement et Jira frais : g1, g2, g3 et lien `ABC-3 → g3` ; texte du sprint : g1, g2 (board : g1, g2) | g3 et `ABC-3 → g3` sont retirés, comme avant | N/A |
| Objectif renommé dans le texte | chargement et Jira frais : g2 « Ancienne stabilité » ; texte : « Stabilité » (board : `text-42-…` « Stabilité », issu de la vraie réconciliation) | `text-42-…` est écrit ; g2 et ses liens sont retirés, comme avant | N/A |
| Objectif nouveau côté board | board : `text-42-…` réconcilié depuis le texte, absent de Jira | il est ajouté à la propriété, comme avant | N/A |
| Propriété non lue au chargement | base inconnue ; Jira frais : g1, g9 ; board : g1 | g9 est conservé (rien n'est retiré faute de base) | N/A |
| Conflit | lien du ticket changé depuis le chargement | refus inchangé (story 1.1) | N/A |

</frozen-after-approval>

## Code Map

- `src/core/boardSync.ts` -- à côté de `storedTextLinks` (l. ~304–307, ~389), exposer `storedTextGoalIds` : identifiants des objectifs de la propriété lue au chargement, par sprint réuni, seulement pour les sprints dont la propriété est connue (`entry.known`).
- `src/core/boardIssue.ts` -- `BoardSnapshot.storedTextGoalIds?: Readonly<Record<number, readonly string[]>>` (l. ~253, même forme que `storedTextLinks`).
- `src/core/boardMove.ts` -- l. ~213–220 : transmettre `knownGoalIds: snapshot.storedTextGoalIds[sprintId]` à `linkToTextGoal` quand il est connu (sinon ne rien passer), comme `knownGoalId`.
- `src/core/boardWrites.ts` -- `linkToTextGoal` : nouvelle entrée optionnelle `knownGoalIds` ; `withTextGoalLink` (l. ~214–260) : partir de `fresh?.goals` ; objectifs affichés = `input.goals` fusionnés par `id` avec Jira (titre, position du board ; autres champs de Jira) ; conservés en plus = objectifs de `fresh` absents de `input.goals` **et** absents de `knownGoalIds` (tous si `knownGoalIds` est inconnu), triés par leur `position` dans Jira et placés après ceux du board ; `validIds` = objectifs écrits ∪ `linkableGoalIds`. Mettre à jour le commentaire de la fonction.
- `src/core/sprintGoals.ts` -- `encodeSprintGoalPropertyOver` conserve déjà les champs inconnus par `id` : ne pas le modifier.
- `docs/technique/donnees.md` -- règle de fusion du rattachement texte pour `com.scrumboardmac.sprintgoals.v1`.
- Tests : `tests/core/boardWrites.test.ts`, `tests/core/boardSync.test.ts` (`storedTextGoalIds` par sprint, absent pour un sprint non lu), `tests/app/BoardModel.drop.test.ts` (bout en bout : objectif ajouté entre le chargement et le dépôt, et objectif retiré du texte avant le chargement).
- `_bmad-output/implementation-artifacts/deferred-work.md` -- retirer la première entrée (source spec 1.1), corrigée ici.

## Tasks & Acceptance

**Execution:**
- [x] `src/core/boardSync.ts`, `src/core/boardIssue.ts`, `src/core/boardMove.ts` -- ids connus au chargement -- base de la distinction
- [x] `src/core/boardWrites.ts` -- mutation partant de Jira frais, sans conserver les objectifs écartés -- F4
- [x] tests -- les six lignes de la matrice ; le renommage passe par `reconcileSprintGoals` -- régression
- [x] `docs/technique/donnees.md` -- règle de fusion
- [x] `_bmad-output/implementation-artifacts/deferred-work.md` -- retirer l'entrée corrigée
- [x] `CHANGELOG.md` -- une ligne sous 0.36.3

**Acceptance Criteria:**
- Given un objectif ajouté dans la propriété entre le chargement et un rattachement, when le rattachement est écrit, then l'objectif, ses champs inconnus et ses liens sont dans le PUT.
- Given un objectif retiré ou renommé dans le texte du sprint avant le chargement, when un rattachement est écrit, then il est retiré de la propriété avec ses liens, comme avant le correctif.

## Implementation Notes

- Les identifiants connus au chargement viennent de `storedTextGoalIds` du snapshot (`boardSync.ts`), relevés avant la réconciliation pour chaque sprint dont la propriété a été lue ; `boardMove.ts` les transmet en `knownGoalIds`, absent si la propriété n'a pas été lue.
- Les objectifs ajoutés depuis sont triés par leur position Jira puis renumérotés à la suite de ceux du board (`shown.length + i`) : deux objectifs ne partagent jamais une position. Leurs autres champs, inconnus compris, sont conservés.
- Un objectif présent seulement dans la propriété et absent du texte du sprint (ajouté depuis par un collègue sans toucher au texte) est conservé à l'écriture, puis écarté par la réconciliation à la lecture suivante, et purgé au rattachement d'après : c'est voulu, le texte du sprint fait foi.

## Spec Change Log

- **Boucle 1 (31/10/2026).** Constat des trois relecteurs : la première version conservait tout objectif de Jira absent du board, y compris ceux que la réconciliation venait d'écarter (retirés ou renommés dans le texte) ; ils n'étaient alors plus jamais purgés, et un renommage laissait deux objectifs. La ligne « Titre changé, même id » de la matrice décrivait un état que `reconcileSprintGoals` (association par titre) ne produit pas. **Amendé** : Approach, Always/Never et matrice du bloc figé (seule lecture compatible avec le Problem ; changement fait par l'agent sous la consigne de Denis « sans me poser de questions », à confirmer par lui), Code Map (ids connus au chargement via le snapshot), Acceptance Criteria. **État évité** : accumulation d'objectifs obsolètes et doublon au renommage. **KEEP** : fusion par `id` des objectifs affichés avec les champs de Jira ; ajout des objectifs réconciliés depuis le texte ; conservation intacte (champs inconnus compris) des objectifs ajoutés depuis ; tri de ceux-ci par position Jira ; retrait de l'entrée de `deferred-work.md` ; ligne du CHANGELOG sous 0.36.3.

## Review Triage Log

| # | Constat | Verdict | Preuve / route |
|---|---------|---------|----------------|
| 1 | Objectifs retirés ou renommés dans le texte conservés à jamais, avec leurs liens | high | `kept` filtre seulement sur `!shownIds.has(id)` ; signalé par les trois lentilles ; bad_spec → boucle |
| 2 | Cas « renommé, même id » impossible ; vrai renommage non testé | high | `reconcileSprintGoals` associe par titre (`sprintGoals.ts:513`) ; bad_spec → boucle |
| 3 | Ordre de Jira perdu pour les objectifs conservés | medium | Renumérotation dans l'ordre du tableau ; intégré à la boucle (tri par position) |
| 4 | Règle non consignée dans `docs/technique/` | low | Intégré à la boucle (Code Map) |
| 5 | Doublon de titre avec un objectif publié par le planning | false | Le planning ne publie que vers un sprint futur, le board n'affiche que les sprints actifs |
| 6 | Identifiants en double dans Jira | low | Rejeté : improbable |
| 7 | Version 0.36.3 déjà utilisée | false | 0.36.3 n'est pas livrée : elle regroupe les trois correctifs de la branche |
| 8 | (boucle 1) Positions des objectifs conservés en collision avec celles du board | low | Deux lentilles ; renumérotation à la suite, correction directe ; patch |
| 9 | (boucle 1) `knownGoalIds` testé seulement sur le sprint de référence | medium | Gap pré-vérifié ; patch (dépôt sur le sprint 43) |
| 10 | (boucle 1) Lien vers un objectif ajouté depuis dans un autre sprint réuni encore retiré | medium | `validIds` repose sur `linkableGoalIds` du chargement ; cas rare (plusieurs sprints et écriture concurrente) ; defer |
| 11 | (boucle 1) Renommage concurrent ou objectif supprimé depuis : doublon transitoire | low | Rejeté : `reconcileSprintGoals` (le texte fait foi) l'écarte à la lecture suivante, sans effet visible |
| 12 | (boucle 1) Deux boards réconcilient la même ligne avec des UUID aléatoires | false | Les ids des objectifs texte sont stables (`stableGoalIds` : `text-<sprint>-<empreinte>`) |
| 13 | (boucle 1) Objectif conservé absent du texte, écarté au chargement suivant | false | Voulu : en mode texte, seul le texte du sprint fait exister un objectif |
| 14 | (boucle 1) Bloc figé modifié sans approbation | — | Consigné dans le Spec Change Log ; confirmation demandée à Denis au bilan |

## Verification

**Commands:**
- `npm run check` -- expected: vert
- `npm run verify:drag` -- expected: vert
- `npm run verify:jira` -- expected: vert
