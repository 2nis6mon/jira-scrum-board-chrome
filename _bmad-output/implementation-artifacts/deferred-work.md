# Travail reporté

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-sprintgoals-sans-perte.md`
  summary: Le rattachement texte reconstruit la liste des objectifs depuis le chargement et retire, à l'écriture, les liens d'un collègue vers un objectif ajouté au texte du sprint depuis.
  evidence: `withTextGoalLink` (src/core/boardWrites.ts) part de `input.goals` et filtre les liens frais par `validIds` ; comportement identique avant la story 1.1.
