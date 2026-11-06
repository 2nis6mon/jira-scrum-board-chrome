---
title: 'Story 8.27 — Ouvrir et isoler les fenêtres natives de clôture et de démarrage sur un vrai Jira'
type: 'bugfix'
created: '2026-11-06'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-8-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Sur le sandbox (essai 8.10, défauts D3 et D4), « Terminer » cliquait le bouton natif trop tôt et aucune fenêtre ne s'ouvrait, et la fenêtre « Start Sprint », avec son bandeau d'avertissement, n'était pas reconnue. Une fois la page rendue, cette fenêtre déjà ouverte n'était pas suivie : après « Start », Jira chargeait son board (`?sprintStarted=true`) dans la popin, qui restait ouverte.

**Approach:** Dans `openSprintDialog` (`src/integration/injectBoard.ts`), le seul clic part quand la page backlog est chargée et que le bouton est resté le même assez longtemps. La fenêtre est reconnue sur sa présence stable, sans exiger une taille fixe. La page rendue suit la fenêtre déjà ouverte. Toute navigation de Jira hors de la page de départ, après le clic ou après la page rendue, referme la popin et relit Jira. Une seule tentative de clic, le repli de la page rendue conservé, rien n'est rempli ni validé ; un essai sur le sandbox, avec l'autorisation de Denis, couvre ensuite clôture et démarrage.

</frozen-after-approval>

## Implementation Notes

- Cause de D4 lue dans le code : la trace `fenêtre de sprint non reconnue … 1` signifie qu'une seule fenêtre nouvelle était présente, mais que sa taille arrondie n'est pas restée identique trois passages de suite. `handOver` a ensuite rangé cette fenêtre dans `dialogsBefore` : la page rendue ne la suivait donc jamais, d'où la popin restée sur le board natif.
- D3 : cause supposée (clic avant que Jira réponde), non prouvée. Le clic attend désormais `readyState === "complete"` et le même bouton sur cinq passages (1,2 s) ; la trace du clic donne le délai depuis l'ouverture pour le constat sur le sandbox. Recherche du bouton portée à 15 s (page rendue à 15 s au lieu de 10), attente de la fenêtre à 20 s.
- D4 : fenêtre reconnue sur le même élément pendant quatre passages (~0,9 s), sans taille fixe. `handOver` après le clic garde les fenêtres d'avant le clic : la fenêtre ouverte et non reconnue est suivie (`outermost` aussi en page rendue).
- Navigation : chemin de départ (`…/backlog`) relevé au clic ou à la page rendue (pas sur `about:blank`) ; tout autre chemin referme la popin et relit Jira, y compris un lien suivi par l'utilisateur dans la page rendue (choix fait seul) ; un paramètre de requête ne compte pas.
- Fichiers : `src/integration/injectBoard.ts`, `tests/integration/injectBoard.test.ts` (5 tests ajoutés, délais des anciens allongés ; les 4 premiers échouent sur l'ancien code), `docs/technique/integration-jira.md`, `docs/technique/securite.md` (S13), `CHANGELOG.md`, version 0.50.3.
- Vérifications : typage, Biome, 2048 tests, build et `verify:jira` verts. `verify:planning` échoue avant ses étapes de fenêtres natives (« ABC-204 n'a pas été sélectionné »), à l'identique sur le commit précédent `4ca339c` : reporté dans `deferred-work.md`. L'essai sur le sandbox reste à faire, avec l'autorisation de Denis.

## Review Triage Log

Revue Blind Hunter (sous-agent, sans contexte) sur le diff non commité.

| Constat | Verdict | Suite |
|---|---|---|
| Page rendue avec le cadre encore sur `about:blank` : départ `blank`, popin fermée au chargement du backlog | medium, réel | patch : départ limité à un chemin `…/backlog`, relevé aussi plus tard en page rendue ; test ajouté |
| Condition de clic plus stricte, délai de recherche inchangé (10 s) | medium, réel | patch : 15 s |
| D3 non prouvée, aucune trace pour la vérifier | low, réel | patch : délai depuis l'ouverture dans la trace du clic |
| Identité d'élément : une fenêtre remontée sans cesse n'est jamais isolée | low, rejeté | un remontage ponctuel relance seulement ~0,9 s ; en continu, la page rendue suit la fenêtre (repli conservé) |
| Navigation de l'utilisateur en page rendue referme la popin ; paramètre de requête non testé | low, réel | patch : documenté comme voulu, test du paramètre `?selectedIssue=` |
| Navigation vers une autre origine : cadre illisible, popin ouverte | low, rejeté | Échap referme la popin ; distinguer une reconstruction passagère d'un départ demanderait plus qu'une correction simple |
| Page rendue sans `outermost` : fenêtre avec dialogue imbriqué jamais suivie | medium, réel | patch : `outermost` dans `watchManual` |
| « trois passages » dans la doc pour quatre observations | low, réel | patch : « près d'une seconde » |
| Bords des 20 s et bouton désactivé non testés | low, rejeté | bouton désactivé couvert par les tests existants ; le bord des 20 s suit le chemin déjà testé à 10/15 s |
| Suivi et spec non à jour | false | mis à jour en fin de workflow |
| `.claude/launch.json` non suivi | false | fichier personnel de Denis, non commité |
