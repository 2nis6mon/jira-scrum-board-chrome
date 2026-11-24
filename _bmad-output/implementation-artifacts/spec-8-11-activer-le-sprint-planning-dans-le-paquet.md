---
title: 'Story 8.11 — Activer le Sprint Planning dans le paquet'
type: 'feature'
created: '2026-11-24'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-8-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Sprint Planning, validé sur un vrai Jira (essai 8.10) et documenté (8.35), n'existe encore que dans `dist/` et les tests : le paquet distribué par le Chrome Web Store l'a désactivé à la compilation.

**Approach:** Demande de Denis du 24/11/2026. `SPRINT_PLANNING_ENABLED` vaut vrai dans le paquet (`npm run package`). `npm run verify:planning:package` le vérifie, AGENTS.md, le CHANGELOG, la version et les notes de publication sont à jour, et les résumés `_locales` ainsi que la fiche du Store reprennent ceux de la section « Activation de Sprint Planning ». Aucun nouvel hôte, droit Chrome, endpoint d'écriture ni assouplissement de CSP.

</frozen-after-approval>

## Implementation Notes

- Drapeau : `vite.config.ts` et `vite.harness.config.ts` ajoutent le mode `package` aux modes actifs (`dist`, `development`, `test`) ; `production` et un mode inconnu restent désactivés. `featureFlags.ts` et `docs/technique/developpement.md` le disent ; le garde-fou du code (entrée masquée, ouverture, lectures, gestes et fenêtres natives bloqués quand le drapeau est faux) est conservé et testé (`PlanningDisabled.test.tsx`, `buildModes.test.ts` : `package` → vrai).
- `verify-planning.mjs --package` : après avoir vérifié que l'interrupteur est vrai et que l'entrée est présente, le banc compilé en mode package rejoue tout le parcours de `verify:planning` (le bloc « paquet désactivé » est supprimé). `exerciseEntrypoints` du banc reste, sans appel.
- Captures : `store-screenshots.mjs` attend désormais le drapeau vrai et l'entrée Sprint Planning (absente sur Kanban) ; son exécution a été validée puis ses sorties écartées, les cinq captures du board restent celles de 0.34.9 (choix de la 8.35). `store-planning-screenshots.mjs` passe en mode package ; `06-planning.png` et `07-cloture.png` sont régénérées en 0.54.0.
- Store : `_locales` FR/EN/ES (« … Daily et préparation du sprint », moins de 132 caractères, `tests/manifest.test.ts`), tableau et paragraphes de `fiche.md` (version 0.54.0, instructions de revue, `npm run verify:planning:package`), ligne de version des notes `release-notes-planning-*`.
- Docs : AGENTS.md (Sprint Planning actif, publication groupée), README, `securite.md`, `developpement.md`, CHANGELOG 0.54.0, version 0.54.0 (`package.json`, `package-lock.json`, `public/manifest.json`). `backlog.md` non touché (modification personnelle en cours de Denis) : sa phrase « Sprint Planning est réservé au `dist/` local » est à corriger au prochain passage.
- Risque assumé : la décision sur les droits du planning (lecture seule annoncée ou découverte au premier refus) reste ouverte ; la partie sans droit n'a pas été jouée sur le sandbox. L'activation suit la demande explicite de Denis. La 8.27 est close sans code (non reproduite) : le défaut D3/D4 peut revenir.
- Publication : à la main, dans cet ordre : site (manuel, guide « Préparer le sprint », politique de confidentialité), puis Store avec `release/sprint-goals-board-0.54.0.zip` et le kit `release/chrome-store-multilingual-0.54.0/`. Rien n'est soumis par ce commit.
- Vérifications : `npm run check` (2056 tests), `verify:planning:package`, `verify:planning`, `verify:jira`, `verify:i18n`, `site:check`, `package` (le ZIP contient la vue du planning) et `store:kit` verts.

## Review Triage Log

Relecture faite sans sous-agent (rythme de l'Epic 8).

| # | Constat | Verdict | Suite |
|---|---------|---------|-------|
| 1 | `store-screenshots.mjs` affirmait que le planning est absent et échouait sur Kanban après l'activation. | medium | Corrigé : drapeau vrai attendu, entrée seulement hors Kanban ; exécution validée. |
| 2 | Le test `PlanningDisabled` suppose un drapeau faux alors que le paquet l'active. | false | Voulu : il garde le comportement du garde-fou (mode inconnu). |
| 3 | `backlog.md` garde « réservé au `dist/` local ». | low | Reporté : fichier modifié par Denis, non committé ici. |
