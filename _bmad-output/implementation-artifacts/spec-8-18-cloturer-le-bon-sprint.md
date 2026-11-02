---
baseline_commit: 'a8225c5f0042db7b6c362ef8bd4305f488b6d884'
title: 'Story 8.18 — Clôturer le bon sprint et toujours dire ce qui a été reporté'
type: 'bugfix'
created: '2026-11-02'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-8-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-8-2-a-8-9-planning-en-direct.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Essai du 02/11/2026 : deux sprints actifs, clôture par le bouton du planning, objectifs avec tickets non terminés, rien reporté et aucun message. Le planning ne vise que le premier sprint actif, relit l'état du sprint une seule fois juste après la fenêtre native, et son avis disparaît au geste suivant.

**Approach:** Choisir le sprint actif à clôturer ; après la fenêtre native, relire son état pendant une durée bornée ; faire rendre au report un compte rendu par objectif, affiché jusqu'à fermeture et inscrit au journal ; côté hôte, suivre une fenêtre de Jira remontée au lieu de refermer la popin.

**Décisions (Denis a délégué la forme) :**
- Un seul sprint actif : bouton « Clôturer {nom} » inchangé. Plusieurs : bouton « Clôturer un sprint » qui ouvre un menu des sprints actifs (nom de chacun).
- Relectures de l'état à 0, 1, 3, 6 et 10 s ; une fenêtre annulée est donc annoncée après ~10 s, l'en-tête montrant « Clôture en cours dans Jira… » pendant ce temps.
- Compte rendu : encart au-dessus des swimlanes, fermé par l'utilisateur, remplacé par la clôture suivante, oublié au changement de board.
- Fenêtre de suite (Denis, 02/11/2026) : après la validation de la clôture, Jira ouvre une seconde fenêtre (création d'une rétrospective ou d'une page Confluence de récapitulatif). La popin la suit et la montre : l'utilisateur seul la remplit ou la ferme. Le report part quand plus aucune fenêtre de Jira n'est ouverte dans la popin. L'extension ne clique ni ne remplit rien dans cette fenêtre.
- Journal : une entrée par report (`from` sprint clos, `to` sprint préparé) ; écrit/rien à reporter → « réussi », sprint encore actif ou refus → « échec », résultat incertain → « incertain ».

## Boundaries & Constraints

**Always:** une tentative par écriture, aucun rejeu ; relectures seules pendant l'attente ; porte du board pour le report ; `SPRINT_PLANNING_ENABLED` garde chaque entrée ; textes dans `src/i18n` en/es ; `injectBoard.ts` sans import ; messages hôte/vue inchangés (`sprintDialog` porte déjà le nom du sprint choisi).

**Never:** écrire la clôture, l'état ou le déplacement des tickets ; remplir ou valider la fenêtre native ; relancer le report automatiquement après un échec ; nouvel endpoint, hôte ou droit.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Deux sprints actifs | 42 et 45 actifs, 45 porte les objectifs | menu ; « Sprint 45 » ouvre sa fenêtre ; report des objectifs de 45 | — |
| Clôture lente | 45 encore actif à 0 s, clos à 3 s | report fait, compte rendu « reportés » | — |
| Fenêtre annulée | actif à 10 s | compte rendu « toujours actif », rien écrit, journal « échec » | — |
| Objectif sans ticket / tous terminés / déjà présent | sprint clos | listé « non reporté » avec sa raison | — |
| Goals avec lecture partielle | avertissement Goals | compte rendu signale la lecture incomplète | — |
| Second `refresh` pendant la vérification | message hôte | ignoré, aucun second report | — |
| Fenêtre Jira remontée | ancien dialogue détaché, un nouveau apparaît | popin gardée sur le nouveau | sinon fermeture comme avant |
| Fenêtre de suite (rétrospective, Confluence) | clôture validée, nouveau dialogue | popin gardée et montrée ; report à sa fermeture | rien n'y est cliqué ni rempli |

</frozen-after-approval>

## Code Map

- `src/core/sprintPlanning.ts` -- `prepareCarryOver`/`carryOverGoals` (l. 634-794) : rendre `{ outcome, report }` ; `report` = `{ goals: { title, status: "carried"|"noIssue"|"allDone"|"alreadyThere", linkedKeys }[], incomplete }`, `null` si refus avant lecture (sprint non clos). Réutiliser `unmet`, `keysOf`, `loaded.warnings`.
- `src/app/model/PlanningModel.ts` -- `activeSprint` (l. 136) → `activeSprints` ; `closeActiveSprint(sprintId)` (l. 717) ; `afterNativeDialog` (l. 751) : garde contre la réentrée, `pendingClosure` gardé pendant l'attente, relectures bornées via `context.wait(ms)` ; `#carryOver` (l. 774) : signal `carryOverReport` + `dismissCarryOverReport()`, journal du report ; `reset()` l'efface ; `#busyWhile` ne l'efface pas.
- `src/app/model/PlanningTypes.ts` -- type `PlanningCarryOverReport` (sprint clos, cible, résumé `AppMessage`, objectifs, incomplet) ; contrat de vue.
- `src/app/model/BoardModel.ts` (l. 405-418) -- `wait: (ms) => new Promise(r => setTimeout(r, ms))` dans le contexte du planning.
- `src/app/model/coreText.ts` (l. 302) -- `planningCarryOverMessage` : résumé + raisons en clés ; « toujours actif » y passe.
- `src/app/views/planning/PlanningView.tsx` -- en-tête (l. 229-239) bouton ou menu `<details class="menu">` (modèle : `CardMenu`, `placeFloatingMenu`) ; encart `planning-carry-over` dans `LanesColumn` ; statut « Clôture en cours » prioritaire sur « Écriture ». `planning.css` pour l'encart.
- `src/integration/injectBoard.ts` -- `monitorClosure`/étape `dialog-visible` (l. 795-808) : mémoriser les dialogues d'avant le clic ; à la disparition, un seul nouveau dialogue extérieur → l'adopter et le réisoler (`isolateSprintDialog`).
- `src/i18n/{board,messages}.ts` + `src/i18n/es/` -- nouveaux textes.
- Tests : `tests/core/sprintPlanning.test.ts` (l. 1128+, `closedFixture`), `tests/app/PlanningModel.test.ts` (l. 525+, `context()` : ajouter `wait`), `tests/app/PlanningView.test.tsx` (stub du modèle l. 142), `tests/integration/injectBoard.test.ts` (fenêtres de sprint de l'hôte) ; `tests/support/planningFixture.ts` option `secondActiveSprint` (sprint 45, propriété liée à un ticket non terminé) ; `tests/harness/harness.tsx` `closeNativeDialog(completed, lagMs?)` ; `scripts/verify-planning.mjs` (l. 425-462).

## Tasks & Acceptance

**Execution:**
- [x] `src/core/sprintPlanning.ts` + tests -- compte rendu par objectif et lecture partielle -- AC raisons.
- [x] `PlanningTypes.ts`, `PlanningModel.ts`, `BoardModel.ts`, `coreText.ts` + tests -- choix du sprint, relectures bornées, garde de réentrée, compte rendu, journal.
- [x] `PlanningView.tsx`, `planning.css`, i18n en/es + tests -- menu, encart, statut.
- [x] `injectBoard.ts` -- fenêtre remontée suivie.
- [x] `planningFixture.ts`, `harness.tsx`, `verify-planning.mjs` -- deux sprints actifs, clôture lente, annulation.
- [x] `docs/technique/integration-jira.md` (fenêtres natives), `docs/manuel-utilisateur.md`, `CHANGELOG.md`, version 0.42.1 (`package.json`, `package-lock.json`, `public/manifest.json`), `deferred-work.md` (entrées couvertes marquées), `sprint-status.yaml`.

**Acceptance Criteria:**
- Given plusieurs sprints actifs, when je clôture depuis le planning, then je choisis le sprint, la fenêtre native est celle de ce sprint et le report lit ses objectifs.
- Given une clôture demandée, when le report se termine quel que soit son résultat, then le compte rendu reste affiché jusqu'à sa fermeture et une entrée de journal existe.
- Given le paquet, when il est construit, then `verify:planning:package` reste vert (aucune entrée du planning).

## Implementation Notes

- Implémentation par un sous-agent : `carryOverGoals` rend `{ outcome, report }` ; `activeSprints`, `closeActiveSprint(sprintId)`, `CLOSURE_CHECKS_MS`, `#closureCheck`, `carryOverReport`, `#journalCarryOver` ; menu `CloseSprintMenu` et encart `CarryOverReportPanel` ; l'hôte suit une seule nouvelle fenêtre extérieure (`monitorClosure`) ; banc `board-planning-deux-actifs`.
- `docs/manuel-utilisateur.md` non modifié : le manuel ne décrit pas Sprint Planning, absent du paquet distribué ; sa section viendra avec l'activation (8.11).
- `dist/` non touché : construction et `verify:jira` dans un dossier temporaire (`EXTENSION_DIR`).

## Spec Change Log

## Review Triage Log

Passe 1 (chasse aveugle, cas limites — relancée après un blocage —, trous de vérification) :
- Objectif texte déjà présent dans la cible mais dont le report rattache des tickets, dit « non reporté » — medium, patch (vu par deux couches).
- Résumé « aucun objectif non atteint à reporter » alors que le détail liste des objectifs non atteints déjà présents — low, patch (libellé).
- Ancien compte rendu affiché pendant la vérification d'une nouvelle clôture — low, patch (effacé à la demande de clôture).
- Correspondance résultat → journal recopiée entre `#journal` et `#journalCarryOver` — low, patch (fonction commune). Partie « `context.write` lève un résultat inconnu » : false, la porte ne lève qu'un refus avant envoi, les erreurs d'écriture sont rendues en `partial` par le cœur.
- Lectures d'état en échec pendant la vérification non testées — gap, patch.
- Report partiel, incertain et « rien à reporter » non vérifiés dans le modèle (compte rendu, journal) — gap, patch.
- Lecture incomplète des Goals non vérifiée de bout en bout dans le modèle — gap, patch.
- Suivi d'une fenêtre suivante en page rendue (`manual`) non testé — gap, patch.
- Deux lignes « Terminer le sprint », seule celle du sprint nommé cliquée : non testé côté hôte — gap, patch.
- Menu « Clôturer un sprint » : Échap et fermeture quand les gestes sont impossibles non testés — low, patch (tests).
- `closeNativeDialog` du banc ferme le sprint 42 pour un identifiant inconnu — low, patch.
- Verrou d'environ 10 s (retour au board, changement de board, déconnexion en attente) non documenté — low, patch (CHANGELOG, invariants).
- Clôture enregistrée par Jira après 10 s : compte rendu « toujours actif », aucun report manuel possible — medium, defer (relance manuelle déjà différée ; délai à mesurer en 8.10).
- Clôture avec un seul bouton visible non nommé : la fenêtre d'un autre sprint pourrait s'ouvrir — maybe-false medium, defer (logique antérieure ; constater en 8.10 si la ligne Jira porte le nom du sprint).
- Fenêtre de suite après plus de 600 ms, plusieurs nouvelles fenêtres, ou fenêtre Jira persistante suivie sans fin — maybe-false medium, defer (à constater en 8.10).
- « Démarrer » bloqué et message au singulier avec plusieurs sprints actifs — medium, defer (antérieur ; décision produit sur les sprints parallèles).
- Manuel coché mais non modifié — rejeté : correction par modification de la spec ; voir Implementation Notes.
- `aria-live` sur une section insérée déjà remplie — low, rejeté (annonce non critique, l'encart reste visible).
- Couleurs de l'encart recopiées de `.notice` — low, rejeté (cosmétique).
- `linkedKeys` liste aussi les tickets restés dans le sprint clos — low, rejeté (conforme à « tickets rattachés » du sprint clos).
- Deux objectifs non atteints au même titre sans casse ; Goal en double dans `loaded.goals` — low, rejeté (cas improbables, garde à ajouter).
- Lecture d'état en échec journalisée « échec » et non « incertain » — false : aucune écriture n'a eu lieu, « incertain » vise une écriture sans réponse.
- `reset()` pendant l'attente garde le planning occupé — false : changement de board et déconnexion sont refusés tant que le planning est occupé (`AppModel.#planningBusy`, l. 247).
- `pendingClosure` jamais effacé sans `refresh` de l'hôte — false : l'hôte envoie toujours un `refresh`, y compris en erreur (`sprintError`).
- Compte rendu invisible sans sprint futur — low, rejeté (la cible du report reste future).
- Ancienne fenêtre masquée puis réaffichée ; attribut d'isolement gardé sur l'ancienne fenêtre — false : toutes les fenêtres `role="dialog"` sont déjà visibles par la règle d'isolement, et une fenêtre détachée ou non affichée n'est pas rendue visible par `visibility`.
- Comptes rendus absents après un changement de board — false : le changement de board oublie le planning par décision de la spec.

## Verification

**Commands:**
- `npm run check` -- vert
- `npm run verify:planning` et `npm run verify:planning:package` -- verts (construire hors de `dist/` si l'essai en cours l'utilise)
- `npm run verify:jira` et `npm run verify:i18n` -- verts
