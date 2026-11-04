---
title: 'Story 8.31 — Ne plus montrer le sprint actif dans « Où sont les tickets »'
type: 'bugfix'
created: '2026-11-04'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-8-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Denis l'a signalé en testant la 8.28 le 04/11/2026. « Où sont les tickets » affiche le reste à faire de chaque sprint actif, en consultation. Ses cartes ne se sélectionnent pas et ne se glissent pas : on perd du temps à essayer, et la colonne mélange ce qu'on peut ajouter au sprint avec ce qu'on ne peut pas. Décision de Denis du 04/11/2026 : le sprint actif n'a pas sa place dans cette colonne.

**Approach:** La colonne ne montre plus que les autres sprints futurs et le backlog. Aucun compte, filtre rapide ou ouverture de fiche ne prend plus en compte le reste à faire actif. La lecture des sprints actifs reste là où la clôture et le démarrage s'en servent : « Clôturer », sprints proposés, raison de « Démarrer » désactivé, report. Les tickets d'un sprint actif ne sont plus lus que pour un sprint d'un autre board, qu'il faut savoir vide pour ne pas le proposer à la clôture. Aucune écriture ni lecture n'est ajoutée. Le manuel et le banc `verify:planning` sont mis à jour.

</frozen-after-approval>

## Implementation Notes

- Revient sur la 8.2 (« le reste à faire du sprint actif (consultation) »), sur le dernier critère de la 8.4 et sur le périmètre des filtres rapides de la 8.14.
- `src/core/sprintPlanning.ts` : `PlanningSnapshot.activeSprints` devient `readonly JiraSprint[]`. Les tickets d'un sprint actif ne sont lus que s'il vient d'un autre board (`isForeignSprint`), pour l'écarter s'il ne contient aucun ticket restant (0.48.1, 0.48.2). Un sprint actif du board n'est plus lu ticket par ticket. `activeIssueKeys`, qui refuse au geste un ticket du sprint actif, ne change pas.
- `src/app/model/PlanningModel.ts` : plus de section `active`. `planningIssues` (options de filtre), le périmètre des filtres rapides et `locate` (ouverture de fiche, plus de paramètre `readOnly`) ignorent le sprint actif. `PlanningTypes.ts` : plus de variante `kind: "active"`.
- `src/app/views/planning/PlanningView.tsx` : rendu de la section, note de consultation et total du filtre ; styles `.planning-state-active` et note de consultation retirés. Le texte « Reste à faire du sprint actif, en consultation… » est retiré des catalogues anglais et espagnol.
- Banc : le Jira fictif (`planningFixture`, option `backlogSubtask`) ajoute au backlog la sous-tâche ABC-205, seule carte en consultation de la colonne, pour garder le contrôle du clic droit sans menu (8.13). Il donne aussi Camille Durand à ABC-202 pour le menu Personne : ses tickets venaient du sprint actif. `verify:planning` vérifie l'absence de la section du sprint actif et le périmètre `sprint in (43,44)` du filtre rapide ; la clôture et le démarrage du banc passent toujours.
- Le manuel utilisateur ne décrit pas Sprint Planning (fonction expérimentale, absente du paquet) : rien à y changer. Mises à jour dans `docs/technique/` (invariants, lectures Jira, bancs), `CHANGELOG.md` et la version 0.48.9.
- Vérifications : `npm run check` (2016 tests), `verify:planning`, `verify:planning:package`, `verify:jira` et `verify:i18n` (un texte visible retiré) verts.

## Review Triage Log

Relecture faite sans sous-agent (rythme de l'Epic 8).

| # | Constat | Verdict | Suite |
|---|---------|---------|-------|
| 1 | Un ticket du sprint actif pourrait encore arriver par le backlog ou la sélection. | false | La route du backlog Jira exclut les sprints actifs ; `locate` ne cherche plus que dans le sprint en préparation, le backlog et les autres sprints futurs ; le refus au geste (`issueInActiveSprint`) est gardé. |
| 2 | Ne plus lire les tickets d'un sprint actif du board change la clôture d'un sprint vide. | false | Un sprint du board, même vide, restait proposé (`shown` ne vise que les sprints d'un autre board) : seule la lecture devenue inutile disparaît. |
| 3 | Le texte `actif` retiré des catalogues casserait le board. | false | Seule la note de consultation est retirée ; `actif` sert encore à `BoardView` et reste dans les catalogues. |
