---
title: 'Story 1.6 — Les messages entre Jira et la vue sont déclarés une seule fois'
type: 'refactor'
created: '2026-10-30'
status: 'done'
baseline_commit: '8a82b2ef8b9945658114cf814e17336b55e9ba09'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/docs/technique/securite.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Les messages `sprint-goals:*` (`refresh`, `close`, `language`, `open-board`, `open-issue` en `postMessage` ; `launch`, `prepare-launch` en `chrome.runtime`) sont des littéraux répartis dans `embedded.ts`, `injectBoard.ts`, `worker.ts`, `bootstrap.ts` et `launcherChrome.ts`, chacun avec sa propre validation ; un message élargi d'un côté peut être rejeté silencieusement de l'autre.

**Approach:** `src/integration/messages.ts` déclare une fois chaque message : type, canal, sens, champs et règles de validation (motifs et longueurs maximales) sous forme de données pures, plus des fonctions de construction et de validation. Les modules qui peuvent importer l'utilisent ; `injectBoard.ts` (copié par `executeScript`, sans import) porte une copie littérale de la même déclaration entre marqueurs, et un test compare les deux ; `bootstrap.ts` (script de contenu sans import) est un doublon nommé, couvert de la même façon.

## Boundaries & Constraints

**Always:** comportement identique, mêmes valeurs acceptées et refusées qu'aujourd'hui ; origine et fenêtre source toujours vérifiées dans les deux sens ; `injectBoard` reste autonome (aucun import, aucun état extérieur à sa fonction) ; `bootstrap.ts` reste sans import ; le test échoue si un type, un sens, un champ, un motif ou une longueur diffère entre la déclaration et une copie.

**Never:** nouveau message, nouveau champ, assouplissement d'une validation ; nouvelle permission ou règle réseau ; dépendance d'exécution nouvelle.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Copie conforme | déclaration = copie `injectBoard` | test vert | N/A |
| Motif divergent | `open-issue.key` élargi dans `messages.ts` seulement | test rouge nommant le message et le champ | N/A |
| Message reçu invalide | `open-board` avec `projectKey: "abc"` | ignoré, comme aujourd'hui | N/A |
| Source étrangère | bonne forme, mauvaise fenêtre ou origine | ignoré | N/A |

</frozen-after-approval>

## Code Map

- `src/integration/messages.ts` (nouveau) -- `PROTOCOL` : objet littéral JSON-compatible (motifs en chaînes `source` de RegExp, longueurs en nombres) + `validate(type, data)` et constructeurs ; reprendre exactement les règles actuelles de `injectBoard.ts` (l. ~481–540 : `language` ∈ fr/en/es ; `open-board` : `boardId` entier sûr > 0, `projectKey` `^[A-Z][A-Z0-9_]*$` ; `open-issue` : `key` `^[A-Z][A-Z0-9_]*-[1-9]\d*$`, `transition.id` `^\d+$`, `name`/`to` < 200 caractères…) et celles de `embedded.ts`, `worker.ts`, `bootstrap.ts`, `launcherChrome.ts`.
- `src/integration/injectBoard.ts` -- copie de `PROTOCOL` entre `// <protocole sprint-goals>` et `// </protocole sprint-goals>` à l'intérieur de la fonction ; la validation existante lit cette copie.
- `src/integration/bootstrap.ts` -- doublon nommé pour `launch` (même principe de marqueurs si une validation y existe).
- `src/integration/embedded.ts`, `src/integration/worker.ts`, `src/app/platform/launcherChrome.ts` -- importer depuis `messages.ts` (`launcherChrome` : import de type/constante autorisé par AD-1 `platform -. types .-> integration` ; si une constante en valeur n'est pas permise, en faire un doublon nommé couvert par le test).
- `tests/integration/messages.test.ts` (nouveau) -- extraire chaque bloc entre marqueurs du code source, l'évaluer, et le comparer en profondeur à `PROTOCOL` ; vérifier qu'aucun littéral `sprint-goals:` n'existe hors de `messages.ts` et des blocs marqués ; cas acceptés/refusés de la matrice.
- `tests/guards/sources.test.ts` -- s'assurer que `injectBoard`/`bootstrap` restent sans import (gardes existantes).
- `ARCHITECTURE-SPINE.md` -- retirer l'écart AD-7, nommer les doublons ; `docs/technique/securite.md` si la description des messages y figure ; `CHANGELOG.md` sous 0.36.2.

## Tasks & Acceptance

**Execution:**
- [x] `src/integration/messages.ts` -- déclaration unique -- AD-7
- [x] `src/integration/injectBoard.ts`, `bootstrap.ts` -- copies marquées utilisées par la validation -- AD-7
- [x] `src/integration/embedded.ts`, `worker.ts`, `src/app/platform/launcherChrome.ts` -- utiliser la déclaration -- AD-7
- [x] `tests/integration/messages.test.ts` -- comparaison des copies et matrice -- CAP-5
- [x] documents -- spine, sécurité, changelog

**Acceptance Criteria:**
- Given `npm run verify:jira` et `npm run verify:button`, when ils tournent, then ils passent.

## Implementation Notes

- `PROTOCOL` est indexé par nom court (`openIssue`…) et porte `type` : les copies n'ont ainsi aucun littéral `sprint-goals:` hors de leur bloc marqué (`PROTOCOL.launch.type`).
- Le code de validation (`<validation sprint-goals>`) est le même texte dans `messages.ts` et `injectBoard.ts` ; le test compare les jetons (espaces et virgules finales ignorés).
- `launcherChrome.ts` porte un doublon nommé (`prepareLaunch`) : AD-1 n'admet que des types de `platform` vers `integration`.
- Seul durcissement : `open-issue.key` doit être une chaîne (avant, `RegExp.test` convertissait par exemple `["ABC-1"]`).

## Spec Change Log

## Review Triage Log

| # | Constat | Verdict | Preuve / route |
|---|---------|---------|----------------|
| 1 | Le worker trie par sens seulement ; aucun test n'exécute son écouteur | medium | `readMessage(message, sens)` sans comparaison de type ; gap pré-vérifié (aucun test de `worker.ts` en CI) ; patch |
| 2 | Bloc marqué ouvert dans un fichier hors de `COPIES` | medium | Le test retire tout bloc marqué mais ne compare que `COPIES` ; patch |
| 3 | Durcissement `open-issue.key` absent du CHANGELOG et des tests | low | Plus strict seulement (valeurs non textuelles) ; patch direct |
| 4 | Garde « sans import » fragile | low | Motif sans drapeau `m` ; réutiliser l'extracteur existant ; patch |
| 5 | Ligne de matrice « source étrangère » sans test | medium | Audit de la matrice ; patch |
| 6 | Comparaison par jetons écrasant les espaces dans les littéraux | low | Rejeté : divergence improbable, correctif non direct (analyse syntaxique) |
| 7 | Réponses `{ok}`/`{error}` des messages runtime non déclarées | low | Rejeté : hors de la liste des messages visée par l'intention |
| 8 | `channel` déclaré mais non contrôlé à la réception | low | Rejeté : le canal découle de l'API d'écoute utilisée |
| 9 | `link.dataset.issueKey ?? ""` | low | Rejeté : sélecteur `a.card[data-issue-key]` garantit l'attribut |
| 10 | `securite.md` non mis à jour | false | Le document ne décrit pas les messages |
| 11 | Littéraux `sprint-goals:` dans `scripts/` | low | Rejeté : banc d'essai hors du code livré |

## Verification

**Commands:**
- `npm run check` -- expected: vert
- `npm run verify:jira` -- expected: vert
- `npm run verify:button` -- expected: vert
