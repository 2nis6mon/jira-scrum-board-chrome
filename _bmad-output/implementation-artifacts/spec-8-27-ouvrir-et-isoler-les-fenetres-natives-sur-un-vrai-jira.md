---
title: 'Story 8.27 — Ouvrir et isoler les fenêtres natives de clôture et de démarrage sur un vrai Jira'
type: 'bugfix'
created: '2026-11-24'
status: 'done'
route: 'none'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-8-context.md'
---

## Clôture sans code (24/11/2026)

Décision de Denis du 24/11/2026 : la story est close sans correctif. Les défauts D3 et D4 relevés à l'essai réel 8.10 (03/11/2026) — clic sur « Complete sprint » parti avant que la page soit prête, fenêtre « Start Sprint » avec bandeau non reconnue, popin non refermée après validation — ne sont plus constatés par Denis sur le Jira de test, dans la version 0.53.0.

Aucun code ni test ajouté : la cause n'a pas été identifiée, le comportement de Jira ou du sandbox a pu changer. Les critères de la story (clic attendu une fois la page prête, fenêtre de démarrage isolée, popin refermée et vue relue) ne sont pas vérifiés par un test. Le défaut peut revenir : un clic qui dépend du temps de chargement réussit parfois par chance. À rouvrir s'il reparaît ; dans ce cas, reprendre les trois critères de `epics.md` (story 8.27) et les traces de `injectBoard.ts`.
