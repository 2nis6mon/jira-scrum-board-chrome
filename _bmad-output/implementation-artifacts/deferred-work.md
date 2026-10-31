# Travail reporté

- source_spec: `_bmad-output/implementation-artifacts/spec-1-5-gardes-de-sources.md`
  summary: `src/jira/diagnostics.ts` importe `../i18n`, dépendance de la couche Jira hors du graphe AD-1 (un contenu Jira n'est jamais localisé) ; non couverte par les gardes de la story 1.5.
  evidence: import de `../i18n` dans src/jira/diagnostics.ts, antérieur à la story 1.5 ; `forbiddenImports` ne vise que `core`, `app` et `integration`.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-8-journal-en-cles.md`
  summary: Les messages des erreurs de la couche Jira (`src/jira/errors.ts`) restent des phrases françaises, stockées en `{ text }` dans le journal et relocalisées par motifs à l'affichage.
  evidence: `errorMessage()` (src/app/model/coreText.ts) renvoie `{ text: error.message }` pour une `JiraError` ; la story 1.8 ne visait que les phrases de `core`.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-8-journal-en-cles.md`
  summary: Les avis en direct (planning, Goals) restent des textes français relocalisés par motifs à l'affichage, y compris des messages imbriqués, sans test en anglais ni en espagnol.
  evidence: `PlanningModel` (`notice.value = sourceText(...)`) et `BoardLoadingService` (`goalsNotice`, `goalsWarnings`) ; mécanisme antérieur, conservé par la story 1.8.

- source_spec: `_bmad-output/implementation-artifacts/spec-retro1-1-deconnexion-en-plein-geste.md`
  summary: La boucle de stabilité de `BoardModel.settled()` (nouvel attente si une écriture locale ou un geste arrive pendant l'attente) n'est exercée par aucun test ; la réduire à une seule passe ne casse rien.
  evidence: mutation `while (false)` dans `settled()` : toute la suite `tests/app` passe ; aucun chemin actuel ne met en file une écriture dans cette fenêtre (revue du 31/10/2026).

- source_spec: `_bmad-output/implementation-artifacts/spec-retro1-2-refus-de-la-porte-type.md`
  summary: Une publication du planning refusée par la porte (board périmé) avant toute écriture est journalisée « incertain / non confirmée » au lieu de « rien n'a été envoyé ».
  evidence: le `catch` des étapes de `publishSprintPlanning` (src/core/sprintPlanning.ts) transforme toute erreur du writer en `partial` / `unconfirmed` ; comportement antérieur, prudent, fonction expérimentale absente du paquet.

- source_spec: `_bmad-output/implementation-artifacts/spec-retro1-3-rattachement-texte-sans-perte.md`
  summary: Un lien écrit par un collègue dans la propriété d'un sprint vers un objectif ajouté depuis dans un AUTRE sprint réuni est encore retiré au rattachement suivant.
  evidence: `withTextGoalLink` (src/core/boardWrites.ts) filtre les liens frais par `validIds`, qui ne connaît des autres sprints que `linkableGoalIds` calculé au chargement ; seule la propriété du sprint écrit est relue.
- source_spec: `_bmad-output/implementation-artifacts/spec-2-2-tickets-reportes.md`
  summary: Vérifier si l'historique joint par `expand=changelog` aux tickets de sprint peut être tronqué (`total` > `maxResults`), ce qui fausserait `sprintScope` et `carriedOverInto`.
  evidence: maybe-false, gravité medium non vérifiée. Ni `total` ni `maxResults` ne sont décodés ; se règle par un essai réel sur un ticket à plus de 100 historiques (Epic 4).
- source_spec: `_bmad-output/implementation-artifacts/spec-3-2-top-basse-priorite.md`
  summary: Le classement top/basse lit l'ordre dans le champ de rang du board (`ranking.rankCustomFieldId`) mais E2 écrit sans `rankCustomFieldId`, donc dans le champ de rang par défaut de l'instance.
  evidence: medium non vérifié — sans effet tant que le board utilise le champ Rank par défaut (cas ordinaire) ; à trancher par décision produit (transmettre `rankCustomFieldId` dans E2, ou désactiver l'action si les champs diffèrent) et à vérifier sur un vrai Jira.
