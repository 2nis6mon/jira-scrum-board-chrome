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
- source_spec: `_bmad-output/implementation-artifacts/spec-8-2-a-8-9-planning-en-direct.md`
  summary: Un report après clôture en échec (refus, panne, conflit) ne peut pas être relancé depuis le planning.
  evidence: PlanningModel.afterNativeDialog efface pendingClosure avant de connaître le résultat ; carryOverGoals est idempotent et pourrait être proposé à nouveau par un bouton explicite.
- source_spec: `_bmad-output/implementation-artifacts/spec-8-2-a-8-9-planning-en-direct.md`
  summary: Le journal ne distingue pas les gestes du planning (action « sprint planning », destination d'un retrait absente).
  evidence: PlanningModel.#journal écrit toujours le même action/from/to ; audit.v1 ne permet pas de savoir s'il s'agit d'un renommage, d'un retrait ou de la vélocité.
  status: partiellement couvert par la story 8.18 (0.42.1) : le report après clôture a son entrée, du sprint clos (`from`) vers le sprint préparé (`to`) ; les autres gestes restent indistincts.
- source_spec: `_bmad-output/implementation-artifacts/spec-8-2-a-8-9-planning-en-direct.md`
  summary: L'état terminé ou sous-tâche d'un ticket est jugé sur l'affichage, pas relu avant E9.
  evidence: placePlanningIssue relit sprints et sprint actif mais teste input.issue ; un ticket terminé entre l'affichage et le geste peut être ajouté (sévérité medium non vérifiée sur Jira réel).
- source_spec: `_bmad-output/implementation-artifacts/spec-8-2-a-8-9-planning-en-direct.md`
  summary: Chaque geste relit tout le planning (backlog paginé jusqu'à 5 000 tickets, tous les sprints) : risque de limitation de débit sur un gros board.
  evidence: PlanningModel.#reread appelle loadSprintPlanning après chaque geste ; à mesurer lors de l'essai réel 8.10 (backlog volumineux).
- source_spec: `_bmad-output/implementation-artifacts/spec-8-2-a-8-9-planning-en-direct.md`
  summary: Seul le premier sprint actif peut être clôturé depuis le planning (sprints parallèles).
  evidence: PlanningModel.activeSprint = activeSprints[0] ; la colonne de gauche les liste tous.
  status: couvert par la story 8.18 (0.42.1) : « Clôturer un sprint » propose chaque sprint actif ; fenêtre et report du sprint choisi.
- source_spec: `_bmad-output/implementation-artifacts/spec-8-2-a-8-9-planning-en-direct.md`
  summary: La recherche de Goals charge une fois tous les Goals du site et filtre localement, sans recherche serveur ni rafraîchissement.
  evidence: PlanningModel #siteGoals ??= searchGoals({loadAll:true}) ; un Goal créé pendant la séance n'apparaît pas.
- source_spec: `_bmad-output/implementation-artifacts/spec-8-2-a-8-9-planning-en-direct.md`
  summary: Report Goals Atlassian sur une lecture partielle des Goals (avertissements) : objectifs manquants non reportés sans le dire.
  evidence: carryOverGoals ignore loaded.warnings ; à décider (refuser ou avertir).
  status: couvert par la story 8.18 (0.42.1) : le compte rendu du report signale la lecture incomplète (avertir, sans refuser).
- source_spec: `_bmad-output/implementation-artifacts/spec-8-2-a-8-9-planning-en-direct.md`
  summary: Relecture de l'état du sprint juste après la fenêtre native sans délai : un Jira lent à refléter la clôture ferait annoncer « toujours actif » (non vérifié).
  evidence: maybe-false, medium ; à constater lors de l'essai réel 8.10.
  status: couvert par la story 8.18 (0.42.1) : relectures à 0, 1, 3, 6 et 10 s ; le délai réel reste à constater en 8.10.
- source_spec: `_bmad-output/implementation-artifacts/spec-8-2-a-8-9-planning-en-direct.md`
  summary: La fermeture de la fenêtre native est détectée sur sa disparition ; un remontage du dialogue par Jira pourrait fermer la popin trop tôt (non vérifié).
  evidence: maybe-false, medium ; monitorClosure dans injectBoard.ts, à constater en 8.10.
  status: couvert par la story 8.18 (0.42.1) : une seule nouvelle fenêtre extérieure (remontée ou fenêtre de suite) est suivie ; à constater en 8.10.
- source_spec: `_bmad-output/implementation-artifacts/spec-8-18-cloturer-le-bon-sprint.md`
  summary: Une clôture que Jira enregistre après la dernière relecture (10 s) laisse le compte rendu « toujours actif » et aucun report n'est possible depuis le planning.
  evidence: medium ; PlanningModel.#verifyClosure s'arrête à CLOSURE_CHECKS_MS, la relecture finale retire le sprint des actifs et le bouton de clôture disparaît. Délai réel à mesurer en 8.10 ; une relance manuelle explicite reste à décider.
- source_spec: `_bmad-output/implementation-artifacts/spec-8-18-cloturer-le-bon-sprint.md`
  summary: Pour terminer, un seul bouton visible non nommé est cliqué même si sa ligne porte un autre sprint ; avec plusieurs sprints actifs, la fenêtre d'un autre sprint pourrait s'ouvrir.
  evidence: maybe-false, medium non vérifié ; sprintButtonChoice (injectBoard.ts) accepte `candidates.length === 1` pour `complete`. À constater en 8.10 : la ligne du backlog Jira porte-t-elle le nom du sprint autour de « Terminer le sprint » ?
- source_spec: `_bmad-output/implementation-artifacts/spec-8-18-cloturer-le-bon-sprint.md`
  summary: La popin se ferme si la fenêtre de suite de Jira (rétrospective, Confluence) apparaît plus de 600 ms après la clôture ou si plusieurs fenêtres naissent ensemble ; à l'inverse une fenêtre Jira persistante née après le clic serait suivie sans fin.
  evidence: maybe-false, medium non vérifié ; monitorClosure adopte une seule nouvelle fenêtre extérieure, délai de 600 ms. À constater en 8.10 sur la vraie fenêtre de suite.
- source_spec: `_bmad-output/implementation-artifacts/spec-8-18-cloturer-le-bon-sprint.md`
  summary: « Démarrer » reste désactivé tant qu'un sprint est actif, même sur un board à sprints parallèles où Jira le permet, et son message est au singulier.
  evidence: medium ; startDisabledReason teste `activeSprints.length > 0` (règle antérieure à 8.18). Décision produit à prendre sur le démarrage avec sprints parallèles.

- source_spec: `_bmad-output/implementation-artifacts/spec-bug-objectifs-masques-au-demarrage.md`
  summary: Après une première lecture en texte (repli ou passage de la source texte aux Goals Atlassian), la première lecture Goals masque d'un coup tous les Goals liés non épinglés.
  evidence: `knownGoalIds` (BoardLoadingService.ts) contient les objectifs texte et `goalColorIndex`, donc la grâce de la première lecture est consommée par la lecture texte ; comportement antérieur au correctif (revue du 02/11/2026).
- source_spec: `_bmad-output/implementation-artifacts/spec-bug-objectifs-masques-au-demarrage.md`
  summary: Aucun test de synchronisation Kanban ne couvre un épinglage du board enregistré pendant la lecture (`pinnedGoalIdsOfSnapshot(result.snapshot, latest)`).
  evidence: le test de BoardModel.kanban.test.ts épingle avant `sync()` ; passer `configuration` au lieu de `latest` ne ferait échouer aucun test. Un lecteur bloqué (gated reader) fermerait le trou.
- source_spec: `_bmad-output/implementation-artifacts/spec-8-15-deplacer-plusieurs-tickets.md`
  summary: La sélection de plusieurs cartes du planning ne se fait qu'à la souris (Ctrl/Cmd+clic, Maj+clic) ; aucun geste clavier ne sélectionne une carte.
  evidence: hors de la story 8.15, qui ne demande que les clics ; à décider avec l'accessibilité du glissé (le menu de carte reste le recours clavier, ticket par ticket).
- source_spec: `_bmad-output/implementation-artifacts/spec-8-15-deplacer-plusieurs-tickets.md`
  summary: Un ticket sélectionné puis masqué par un filtre reste dans la sélection et part avec le lot.
  evidence: medium non vérifié en usage ; le compteur de la barre montre le nombre réel. À constater en 8.10 : faut-il élaguer la sélection aux cartes visibles ?
