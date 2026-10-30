# Travail reporté

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-sprintgoals-sans-perte.md`
  summary: Le rattachement texte reconstruit la liste des objectifs depuis le chargement et retire, à l'écriture, les liens d'un collègue vers un objectif ajouté au texte du sprint depuis.
  evidence: `withTextGoalLink` (src/core/boardWrites.ts) part de `input.goals` et filtre les liens frais par `validIds` ; comportement identique avant la story 1.1.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-5-gardes-de-sources.md`
  summary: `src/jira/diagnostics.ts` importe `../i18n`, dépendance de la couche Jira hors du graphe AD-1 (un contenu Jira n'est jamais localisé) ; non couverte par les gardes de la story 1.5.
  evidence: import de `../i18n` dans src/jira/diagnostics.ts, antérieur à la story 1.5 ; `forbiddenImports` ne vise que `core`, `app` et `integration`.
