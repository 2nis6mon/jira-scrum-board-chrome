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
  summary: La fermeture de la fenêtre native est détectée sur sa disparition ; un remontage du dialogue par Jira pourrait fermer la popin trop tôt (non vérifié).
  evidence: maybe-false, medium ; monitorClosure dans injectBoard.ts, à constater en 8.10.
  status: couvert par la story 8.18 (0.42.1) : une seule nouvelle fenêtre extérieure (remontée ou fenêtre de suite) est suivie. Constat 8.10 (03/11/2026) : clôture conforme (popin refermée seule) ; au démarrage, Jira navigue vers son board dans la popin, qui reste ouverte : story 8.27.
- source_spec: `_bmad-output/implementation-artifacts/spec-8-18-cloturer-le-bon-sprint.md`
  summary: Une clôture que Jira enregistre après la dernière relecture (10 s) laisse le compte rendu « toujours actif » et aucun report n'est possible depuis le planning.
  evidence: medium ; PlanningModel.#verifyClosure s'arrête à CLOSURE_CHECKS_MS, la relecture finale retire le sprint des actifs et le bouton de clôture disparaît. Délai réel à mesurer en 8.10 ; une relance manuelle explicite reste à décider.
  status: délai constaté en 8.10 : sprint lu `closed` 6,1 s après la validation de la fenêtre, dans les 10 s ; la relance manuelle reste à décider.
- source_spec: `_bmad-output/implementation-artifacts/spec-8-18-cloturer-le-bon-sprint.md`
  summary: La popin se ferme si la fenêtre de suite de Jira (rétrospective, Confluence) apparaît plus de 600 ms après la clôture ou si plusieurs fenêtres naissent ensemble ; à l'inverse une fenêtre Jira persistante née après le clic serait suivie sans fin.
  evidence: maybe-false, medium non vérifié ; monitorClosure adopte une seule nouvelle fenêtre extérieure, délai de 600 ms. À constater en 8.10 sur la vraie fenêtre de suite.
  status: non observé en 8.10 : « Join Confluence » décoché sur décision de Denis, aucune fenêtre de suite ; reste à constater avec la case cochée.
- source_spec: `_bmad-output/implementation-artifacts/spec-8-18-cloturer-le-bon-sprint.md`
  summary: « Démarrer » reste désactivé tant qu'un sprint est actif, même sur un board à sprints parallèles où Jira le permet, et son message est au singulier.
  evidence: medium ; startDisabledReason teste `activeSprints.length > 0` (règle antérieure à 8.18). Décision produit à prendre sur le démarrage avec sprints parallèles.

- source_spec: `_bmad-output/implementation-artifacts/spec-8-15-deplacer-plusieurs-tickets.md`
  summary: La sélection de plusieurs cartes du planning ne se fait qu'à la souris (Ctrl/Cmd+clic, Maj+clic) ; aucun geste clavier ne sélectionne une carte.
  evidence: hors de la story 8.15, qui ne demande que les clics ; à décider avec l'accessibilité du glissé (le menu de carte reste le recours clavier, ticket par ticket).
- source_spec: `_bmad-output/implementation-artifacts/spec-8-15-deplacer-plusieurs-tickets.md`
  summary: Un ticket sélectionné puis masqué par un filtre reste dans la sélection et part avec le lot.
  evidence: medium non vérifié en usage ; le compteur de la barre montre le nombre réel. À constater en 8.10 : faut-il élaguer la sélection aux cartes visibles ?
  status: constaté en 8.10 : CLIENT-5303, masqué par le filtre WEB, est parti avec CLIENT-6566 ; décision à prendre (backlog.md).
- source_spec: `_bmad-output/implementation-artifacts/spec-8-24-defiler-pendant-le-glisser.md`
  summary: Pendant un glisser, quitter une swimlane survolée retire son message « Rattacher à cet objectif » et décale la mise en page sous le pointeur.
  evidence: banc `verify:drag` de la 8.24 à 800 px — après survol d'autres swimlanes, le dépôt visé tombait sur un en-tête de swimlane décalé de 34 px ; antérieur à la 8.24, contourné dans le banc par un premier survol de la destination.
- source_spec: `_bmad-output/implementation-artifacts/spec-8-28-garder-la-vue-du-planning-immobile.md`
  summary: Les bancs Chrome `verify:drag` et `verify:planning` échouent par intermittence sur des étapes de timing antérieures à la 8.28.
  evidence: maybe-false (medium si réel) ; le 03/11/2026, 2 échecs sur 8 passages : « .board n'a pas défilé dans sa bande basse » et « .planning-sources défile encore » (contrôle 8.24, boucle `requestAnimationFrame`, sans doute ralentie quand la fenêtre du banc est masquée), puis `scrollIntoView` sur un élément absent à l'étape 640 px. Les relances passent ; à confirmer en lançant les bancs en série, fenêtre visible puis masquée.
- source_spec: `_bmad-output/implementation-artifacts/spec-8-27-ouvrir-et-isoler-les-fenetres-natives-sur-un-vrai-jira.md`
  summary: `npm run verify:planning` échoue de façon reproductible à l'étape de sélection (« ABC-204 n'a pas été sélectionné »), avant ses étapes de fenêtres natives, qui ne sont donc plus exercées dans Chrome.
  evidence: deux échecs sur deux passages avec la 8.27, et un échec identique sur le commit précédent `4ca339c` (06/11/2026) ; antérieur à la 8.27, sans doute depuis les gestes communs de 8.30 ou 8.32/8.33. À corriger avant l'essai sur le sandbox et avant 8.11.
  status: corrigé le 06/11/2026 : sous macOS, le Ctrl+clic des bancs ouvrait le menu contextuel de la carte (comportement voulu) au lieu de sélectionner ; `verify:planning` et `verify:drag` sélectionnent désormais par Cmd+clic sous macOS (`SELECT_MODIFIER`, `scripts/browser-check.mjs`), Ctrl+clic ailleurs (CI Linux et Windows inchangée). Les deux bancs passent en local, étapes des fenêtres natives comprises.
- source_spec: `_bmad-output/implementation-artifacts/spec-8-38-gestes-d-un-ticket-desactives-sans-droit-sur-son-projet.md`
  summary: Désactiver sur le Sprint Board le rattachement d'une carte à un Goal Atlassian sans *Edit issues* sur son projet.
  evidence: séparé de la 8.38 par décision de Denis (06/11/2026) : le Sprint Board est livré dans le paquet et la spec dépassait la taille recommandée ; devenu la story 8.39.
