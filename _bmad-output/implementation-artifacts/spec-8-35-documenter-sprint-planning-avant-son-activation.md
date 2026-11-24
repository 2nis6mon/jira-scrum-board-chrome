---
title: 'Story 8.35 — Documenter Sprint Planning avant son activation'
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

**Problem:** Sprint Planning va être activé dans le paquet (story 8.11), mais ni le manuel, ni le site public, ni les données du Chrome Web Store, ni la politique de confidentialité ne le décrivent : la politique dit même que la fonction n'existe que dans le build local, avec des brouillons que la décision du 01/11/2026 a supprimés.

**Approach:** Demande de Denis du 24/11/2026 : écrire toute la documentation de la vue Sprint Planning avant l'activation, la page web du manuel utilisateur et les données de publication de l'extension. Manuel FR/EN/ES (section « Préparer le sprint »), fiche correspondante du site, textes et fiche du Store, politique de confidentialité à jour, deux captures du planning. Rien n'est publié avant l'activation (8.11), qui en dépend.

</frozen-after-approval>

## Implementation Notes

- Manuel : section « Préparer le sprint » dans `docs/manuel-utilisateur.md`, `docs/user-guide.en.md`, `docs/user-guide.es.md` (après « Organiser les objectifs »), écrite avec les libellés réels des catalogues `src/i18n/`. Elle cite ce que dit l'interface : alternance Clôturer / Démarrer, fenêtres natives, une seule tentative, relecture, droits de Jira (pas de décision sur la lecture seule : la décision de droits reste ouverte au backlog). La 8.27, close sans code, n'est pas présentée comme corrigée.
- Site : neuvième fiche `preparer-sprint` (`site/guide-content.mjs`, numéros 06 à 09 décalés, icône `calendar` de `render-guide.mjs`), compteurs « 9 fiches » des trois langues, `verify-site.mjs` et `tests/site-guide.test.ts` (9 fiches, 30 pages ; « Sprint Planning » n'est admis que dans la fiche et l'accueil du guide), `docs/site-web.md`, `docs/technique/developpement.md`. `site:check` et `site:verify` verts.
- Captures : `scripts/store-planning-screenshots.mjs` (`npm run store:screenshots:planning`) construit le banc en mode `development` (Sprint Planning actif), joue des gestes réels (menu de carte) et produit `06-planning.png` et `07-cloture.png`, avec leur preuve dans `captures.json` (clé `planning`). Les cinq captures du board ne sont pas régénérées. Le Store accepte cinq captures au plus : `fiche.md` propose lesquelles retenir. `build-site.mjs` publie les sept ; `prepare-store-kit.mjs` joint les deux nouvelles et les notes de version du planning (kit produit et contrôlé : 26 fichiers).
- Store : section « Préparez le sprint suivant (Scrum) » dans `listing-fr/en/es.txt`, `release-notes-planning-fr/en/es.txt`, section « Activation de Sprint Planning » de `fiche.md` (éléments, résumés `_locales` proposés, objectif unique, permissions inchangées, captures, instructions de revue en anglais). Choix fait seul : les résumés `_locales` ne sont pas appliqués ici mais par la 8.11, avec le drapeau, pour que le paquet actuel ne promette pas une fonction désactivée ; de même les passages « désactivé » de `fiche.md`. Critères de la 8.11 complétés dans `epics.md`.
- Confidentialité : `docs/privacy/index.html` (FR/EN/ES, mise à jour du 24/11/2026) : la fonction n'est plus « uniquement locale », plus de brouillons (effacés à l'ouverture du planning), écritures de Sprint Planning listées (texte des objectifs, ajout au sprint et retour au backlog, rattachements, estimation, vélocité, report des objectifs ; clôture et démarrage par les fenêtres natives).
- Risque assumé : les textes sont dans le dépôt avant l'activation ; la publication du site (manuel, confidentialité) et du Store se fait à la main, avec la 8.11. Ne pas lancer le workflow du site avant elle.
- Vérifications : `npm run check` (2056 tests), `site:check`, `site:verify`, `package` et `store:kit` verts. Aucun code de `src/` modifié.

## Review Triage Log

Relecture faite sans sous-agent (rythme de l'Epic 8).

| # | Constat | Verdict | Suite |
|---|---------|---------|-------|
| 1 | La regex du kit (`\d{2}-[a-z]+\.png`) avait perdu ses antislashs à l'écriture. | medium | Corrigé et `prepare-store-kit.mjs` exécuté. |
| 2 | Le manuel anglais et espagnol n'avait pas les filtres Bloqués / Ajoutés / Reportés décrits ailleurs. | low | Rejeté : les libellés cités viennent des catalogues ; la section se suffit. |
| 3 | Les captures du board datent de 0.34.9 alors que l'interface a changé. | low | Rejeté ici : les renouveler est un travail du backlog (« Renouveler les captures du Store ») ; la fiche l'indique. |
| 4 | Le test du site interdisait « Sprint Planning » partout, pour ne pas publier une fonction absente. | medium | Remplacé : admis dans la fiche et l'accueil du guide seulement ; la publication reste conditionnée à la 8.11 (note de risque ci-dessus). |
