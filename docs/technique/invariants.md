# Invariants fonctionnels

Comportements que le code doit conserver. Structure du code : [note d'architecture](../../_bmad-output/planning-artifacts/architecture/architecture-sprint-goals-board-2026-10-27/ARCHITECTURE-SPINE.md) ;
autres références : [index technique](index.md).

## Langue de l'interface

Le français constitue la source des catalogues ; l'anglais est la langue de repli. Le mode
`auto` suit la langue de la page Jira transmise par l'intégration : toute variante `fr` reste en
français, toute variante `es` utilise l'espagnol et les autres langues passent en anglais.
Si la page ne fournit pas de langue exploitable,
`GET /rest/api/3/mypreferences/locale` sert de repli non bloquant ; sans résultat, l'anglais reste
actif. Le contrat de cette lecture est [documenté par Atlassian](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-myself/#api-rest-api-3-mypreferences-locale-get).

`AppModel.prepareLanguage()` restaure `language.v1` (`auto`, `fr`, `en`, `es`)
avant le premier rendu. La préférence est personnelle à ce profil Chrome et commune aux boards ;
elle n'entre jamais dans `TeamSettings` ni dans une écriture Jira. Elle se modifie dans
**Site Jira → Préférences personnelles**, même sans `canEdit`, et jamais dans les réglages partagés
du board. La bascule réactive conserve les composants et leurs brouillons ; les nombres, dates,
textes visibles et noms accessibles suivent la langue choisie.

`t` traduit une clé du catalogue ; `localize` présente les messages historiques déjà construits
par les modèles. Ne jamais passer à `localize` les titres de tickets, noms des Goals, statuts ou
noms personnalisés : ce sont des contenus Jira. Les fiches et formulaires de transition natifs
gardent la langue de Jira, indépendamment de la préférence du plugin.

`npm run verify:i18n` contrôle le rendu FR/EN/ES, les variantes Jira françaises et espagnoles, le repli anglais,
l'absence de la langue dans les réglages du board et la préférence sans droits d'administration, dans un Chrome isolé.
Les métadonnées Chrome (`public/_locales/`) suivent la langue de Chrome ; la vue du board suit
la règle Jira ci-dessus. Les deux catalogues sont embarqués, sans service de traduction distant.

## Périmètres, Goals et cartes

- Scrum réunit sans doublon les tickets de tous les sprints actifs retenus par le filtre du board.
  Un sprint actif sans ticket du board est omis ; si tous sont vides, le premier reste affiché.
  Un sprint est **étranger** si `originBoardId` diffère du board (absent = du board) : il passe après
  ceux du board, seul son nom est coloré, ses tickets comptent comme les autres et ses objectifs ne
  sont pas lus. Un ticket présent dans deux sprints suit un sprint du board, puis le plus ancien démarré.
- Le premier sprint du board porte titre et dates ; l'épinglage le présélectionne. Les objectifs de
  chaque sprint du board (texte `goal` et propriété) sont réconciliés par sprint puis réunis,
  préfixés du nom de leur sprint dès qu'il y en a plusieurs ; les épinglages de tous sont lus et
  chacun se modifie dans l'onglet Objectifs (choix du sprint, bloqué tant que le brouillon est
  modifié ou en cours d'écriture ; un sprint disparu ramène au premier). Le repli local après refus
  de droits vaut par sprint : la bannière cumule ceux des sprints du board, « Oublier » les efface
  tous. Un objectif encore absent de sa propriété reçoit un identifiant déduit du sprint et du libellé (`stableGoalIds`).
- Rattachement libre à l'objectif de n'importe quel sprint du board. En mode texte, le lien s'écrit
  dans la seule propriété du sprint du ticket (sprint de référence pour un ticket étranger) ; pour un
  ticket noté dans deux propriétés, celle de son sprint fait foi. Le filtre **Sprint**, visible dès
  deux sprints affichés, ne retient que des tickets : il ne masque aucun objectif.
- Le texte `sprint.goal` est la source par défaut d'un nouveau Scrum ; les choix existants ou
  partagés sont conservés. Les Goals Atlassian sont optionnels ; leur échec permet un repli texte explicite.
  **Seuls les gestes du Sprint Planning modifient le champ natif d'un sprint futur ; le texte est relu avant chaque écriture.**
- Kanban utilise le périmètre du board et `subQuery.query`, avec ses statuts mappés : aucun faux
  sprint, lecture séparée du backlog ou âge limite local des tickets terminés. `snapshot.sprint=null`
  et `activeSprints=[]` n'indiquent pas un board vide. Filtres rapides et couleurs JQL gardent ce
  sous-filtre, sans clause sprint. Un statut absent de la structure locale reste compté et signalé
  comme non mappé ; la relecture de structure permet de replacer sa carte.
- Kanban exige les Goals Atlassian. Si leur lecture est inexploitable, la photographie précédente
  reste affichée avec l'erreur : aucun repli qui placerait à tort tous les tickets dans Build.
  `boardPinnedGoalIds` est partagé sur le board, sans propriété de sprint, et exige son droit d'édition.
- Un ticket lié à plusieurs Goals suit le premier Goal résolu. Après la première lecture, un Goal
  Atlassian nouvellement découvert par un ticket, non épinglé (ni sur un sprint réuni, ni dans le
  repli local, ni dans `boardPinnedGoalIds`), arrive masqué ; ses tickets restent dans leur
  destination par défaut jusqu'à réaffichage, sans modifier le rattachement. Jamais un objectif
  texte, y compris en repli texte : ceux d'un sprint qui démarre peuvent avoir un identifiant neuf
  (objectifs créés pendant le planning). Épinglage d'un sprint réuni illisible : rien n'est masqué.
  Les objectifs épinglés peuvent rester vides. Un Goal vide n'est jamais atteint ; sinon tous ses
  tickets doivent être dans la dernière colonne visible. Le vert est réservé à cet état.
- État d'un ticket (décisions de Denis du 02/11/2026, story 8.20) : une seule règle,
  [`columnStates`](../../src/core/columnState.ts), sur le board comme dans le planning. Première
  colonne visible « à faire », colonnes du milieu « en cours », dernière « terminé » ; jamais la
  catégorie de statut Jira. Un statut dans aucune colonne visible est ignoré partout (ni affiché ni
  compté : objectifs, barres, charge, santé, vieillissement, sous-tâches, reste à faire), avec l'avis
  « non affichés, comme dans Jira ». Restent à la catégorie : les refus de Jira lui-même (ajout au
  sprint d'un ticket résolu), les bloquants (souvent hors du board) et la couleur de la pastille de
  statut. « Où sont les tickets » du planning (backlog, autres sprints futurs, reste à faire actif)
  ne garde, comme le backlog Jira, que les statuts d'une colonne autre que la dernière (8.22) ; le
  sprint en préparation aussi (8.23) : ses tickets terminés restent lus pour les gestes et le déjà
  livré, mais ne sont ni affichés ni comptés (charge, avancement, filtres, sélection). En-tête d'objectif et barre empilée par état (gris, bleu, vert) communs aux deux écrans
  ([`LaneHeader`](../../src/app/views/LaneHeader.tsx)).
- Une seule série de colonnes pour toutes les swimlanes. Un type est `GOAL`, `SWIMLANE` ou `IGNORED`.
  [`normalizeSwimlanes`](../../src/core/boardConfiguration.ts) garantit une seule swimlane par type :
  groupe créé avec son premier type, retiré avec le dernier ; nom vide = noms des types réunis.
  L'objectif est prioritaire pour tous les types visibles : `swimlaneId` conserve la destination
  par défaut du ticket, utilisée sans objectif visible. `goalIssues` contient aussi les tickets
  de types `SWIMLANE` rattachés ; `swimlaneIssues` contient ceux sans rattachement. Les types
  `IGNORED` restent exclus. Les lignes sans ticket affiché disparaissent, sauf les objectifs vides.
  Une carte peut rejoindre tout objectif ou revenir uniquement dans sa destination par défaut.
  Pendant le glissé, sa destination vide réapparaît temporairement en fin de board pour préserver
  la position de la carte source ; elle reprend l'ordre configuré après détachement.
  Le menu d'une carte (clic droit, Maj+F10, touche Menu) est le même composant sur le board et dans
  le planning ([`ActionMenu`](../../src/app/views/ActionMenu.tsx), story 8.19) : pastille de couleur
  de chaque objectif, sous-menus au survol et au clavier, Échap et Tab rendent le focus. Dans le
  planning, il ajoute « Retirer du sprint › » et, pour un ticket seul du sprint en préparation, top /
  basse priorité : une E2 avant le premier ou après le dernier autre ticket de la swimlane de son
  objectif (« Sans objectif » compris), sprint et ordre relus avant, ordre relu après
  (`rankPlanningIssue`). Il n'agit pas pendant une écriture ; sa liste
  d'objectifs, sous-menu à côté de lui, s'ouvre au survol sans prendre le focus. Toutes
  ses actions restent permises en Daily et en présentation. « Envoyer vers un goal » repasse par
  `dropIssue` sans changer colonne ni rang ; « Retirer du goal » exige que la destination par
  défaut soit affichée. « Mettre en top / basse priorité » écrit une seule E2 par le même chemin
  privé (`#runMovement`), avant le premier ou après le dernier ticket de la swimlane dans l'ordre
  de lecture de Jira (toutes colonnes, filtres ignorés). Le board affichant les sprints l'un après
  l'autre, le ticket se classe parmi ceux de son sprint ; une sous-tâche, parmi les sous-tâches
  de son parent.
- Les sous-tâches gardent leur carte et leurs compteurs ; sans Goal propre, elles héritent de celui
  du parent. Si celui-ci est présent, elles héritent de sa destination par défaut ; leur propre
  objectif reste prioritaire s'il existe.
  Filtres carte par carte, WIP en tickets, `columnLoad` sur toutes les swimlanes. Survol de famille
  seulement avec au moins deux cartes visibles et hors glissé ; jauge et alerte des sous-tâches
  utilisent ces données, sans lecture Jira supplémentaire.
- « Ajouté en cours de sprint » rejoue l'historique Sprint jusqu'au démarrage, ou utilise la date
  de création sans changement de sprint ; sans historique, aucun indicateur (`sprintScope`).
  Identifiants `from`/`to` prioritaires sur les noms d'époque ; démarrage compté avec 2 min de tolérance,
  car Jira peut dater le démarrage du sprint suivant avant d'écrire le report des tickets non terminés.
  L'en-tête/filtres/colonnes restent fixes ; le Goal courant reste sous les colonnes, sur toute
  la largeur logique. Les Goals atteints sont verts ; le compteur porte sur les Goals visibles.
- « Reporté » (`carriedOverInto`, champ `carriedOver`) : la dernière entrée de l'historique Sprint
  qui fait entrer un sprint du board (`isForeignSprint` faux) ne retire aucun sprint et garde un
  sprint X présent dans `closedSprints` du ticket, clôturé à moins de 10 min de l'entrée
  (`CARRY_OVER_WINDOW_MS`) et du board (`originBoardId` absent ou égal). L'historique seul ne distingue pas un report d'un retour depuis
  le backlog. Identifiants prioritaires, noms seulement sans identifiants ; `closedSprints` absent :
  non reporté. Seul `closedSprints` s'ajoute aux champs des tickets de sprint, aucune requête en
  plus ; filtre rapide « Reportés (N) », N tiré de `sprintMetrics` quels que soient les filtres,
  absent en Kanban, sans compteur dans l'en-tête ; règles de « ajouté en cours de sprint » inchangées.

## Couleurs des cartes et saisie JQL

`JqlEditor` fournit les suggestions de Jira et la validation stricte pour les couleurs des cartes.
Un JQL actif invalide ou non vérifié bloque l'application ; une erreur ou un conflit conserve le
brouillon. `BoardSettingsService` vérifie la famille de réglages ; la porte d'écriture du board
(`BoardWriteGate`) refuse E6 sans droit `canEdit` avant l'envoi. Les règles sont appliquées après
confirmation. `BoardCardColorService` évalue uniquement les
couleurs sur les identifiants déjà chargés (lots de 50 tickets / 10 JQL, 3 appels simultanés via
`JqlService`). Les résultats périmés sont écartés ; aucun classement de swimlane n'utilise JQL.

## Déplacements, présentation et réglages

- Sprint Planning en direct (décision du 01/11/2026) : `PlanningModel` lit Jira à l'ouverture puis
  après chaque geste, sans brouillon ; `core/sprintPlanning.ts` porte une fonction par intention
  (objectifs texte, placer ou retirer un ticket, vélocité, report après clôture) au résultat typé
  (`done`, `unchanged`, `refused`, `partial` avec étapes confirmées) ; `views/planning/` présente le
  sprint futur choisi, les autres sprints futurs, le backlog paginé et le reste à faire du sprint
  actif (consultation, statut hors Done). Chaque geste passe par la porte du board, une seule
  tentative par écriture, et chaque écriture est conditionnée par une relecture : sprint encore futur,
  texte `goal` identique à l'affichage avant E8 (sinon rien n'est écrit, la page est relue et l'avis
  demande de refaire), zone modifiée de `sprintgoals.v1` inchangée avant E5. Objectifs texte : E8
  seulement si les titres changent, puis E5, identifiants gardés au renommage (validé par Entrée ou
  sortie du champ, Échap annule). Goals Atlassian : recherche par nom et épinglage (E5), liens E3/E4,
  jamais de création. Ticket posé sur un objectif : E9 depuis le backlog ou un autre sprint futur,
  relu, puis lien ; sous-tâche, ticket terminé ou du sprint actif refusés. Retrait seulement depuis le
  sprint en préparation : E10 vers le backlog ou E9 vers un autre sprint futur ; le lien reste dans la
  propriété. Clôture et démarrage par les fenêtres natives Jira, que l'utilisateur seul remplit ;
  « Démarrer » est désactivé avec sa raison tant qu'un sprint est actif. Plusieurs sprints actifs :
  « Clôturer un sprint » propose chacun par son nom, et le report lit les objectifs du sprint choisi.
  Après la fermeture de la fenêtre de clôture, l'état du sprint est relu à 0, 1, 3, 6 et 10 s
  (« Clôture en cours dans Jira… » ; pendant ces 10 s environ, les gestes, le retour au board, le
  changement de board et la déconnexion attendent, comme pendant un geste ; second `refresh` ignoré) ; clos, il déclenche
  le report idempotent des objectifs non atteints (au moins un ticket lié hors de la dernière
  colonne visible) ; encore actif à 10 s, rien n'est écrit. Chaque clôture demandée laisse un
  compte rendu par objectif (reporté, sans ticket, tickets tous dans la dernière colonne, déjà dans
  la cible ; lecture des Goals incomplète signalée), affiché au-dessus des swimlanes jusqu'à sa
  fermeture, et une entrée de journal du sprint clos vers le sprint préparé (`réussi` si écrit ou
  rien à reporter, `échec` si toujours actif ou refusé, `incertain` si le résultat est inconnu).
  Les droits sprint et tickets sont appliqués par Jira, distincts du `canEdit` des réglages du board ;
  pendant un geste, changement de board et rafraîchissement automatique attendent.
- Filtres du Sprint Planning (story 8.14) : lecture seule, distincts de ceux du board, vidés au
  changement de board et gardés au changement de sprint ; recherche et menus suivent les règles du
  board. Totaux des objectifs et charge du sprint sont calculés sans eux. Le JQL des filtres rapides
  est évalué par Jira sur le périmètre du planning (`inPlanningScope`), réévalué après chaque
  relecture, puis croisé avec les cartes ; un JQL refusé désactive les filtres rapides, sans
  nouvelle tentative.
- Lots du Sprint Planning (story 8.15) : Ctrl/Cmd+clic et Maj+clic (plage dans la même section)
  sélectionnent les cartes déplaçables, jamais celles en consultation ; Échap vide la sélection. Une
  carte sélectionnée emmène toute la sélection, au glissé comme par son menu ; un lot ne quitte le
  sprint en préparation que s'il y est tout entier. Un lot = une seule E9 (ou E10, ou E9 vers
  l'autre sprint), puis une seule E5 en texte ou un lien E3 par ticket (après E4) en Goals ; plus de
  50 tickets : refus avant toute écriture. Arrêt au premier échec, rien n'est rejoué ; l'avis
  et le journal disent les tickets confirmés et ceux à refaire, qui restent sélectionnés.
- Sprints proposés (0.43.1) : seulement ceux que l'utilisateur peut modifier (administrateur, ou
  « Gérer les sprints » sur tous les projets du board d'origine) ; indécidable : proposé. Un sprint
  d'un autre board (`originBoardId`, `isForeignSprint`) sans aucun ticket du board restant (colonne
  visible autre que la dernière, comme en 8.22) n'est proposé nulle part (0.48.1, 0.48.2) ; un sprint du board, même vide, l'est ; lecture en échec : proposé.
- Avancement des objectifs (story 8.16) : répartition par colonne (depuis 8.20), filtres ignorés ;
  déjà livré avant ce sprint (statut dans la dernière colonne, 8.21) : segment hachuré à la suite du
  terminé et légende de « Terminé », jamais compté dans la charge ni dans « n/N terminés » ; lectures seules,
  relues quand les objectifs changent, jamais après un geste qui ne les change pas.

- Même colonne : aucun changement de statut. Autre colonne : seuls les statuts accessibles
  acceptent le dépôt. `defaultTransitions` retient la première transition disponible
  par identifiant de statut, dans l'ordre Jira (`sortByOpsBarAndStatus=true`), sans préférer les
  actions sans formulaire. Le survol décrit cette action et le dépôt verrouille son ID et sa
  destination ; la relecture refuse une action disparue ou modifiée, sans repli. Plusieurs statuts
  dans une colonne conservent leurs zones de dépôt et, si nécessaire, un choix par statut.
  Cet ordre de présentation est documenté ; l'API ne garantit pas le défaut interne du board natif.
  Aucun réglage administratif supplémentaire. Ordre : **transition → Goal → rang**.
  Arrêt au premier échec, réussite partielle indiquée, aucun rollback automatique. Cette séquence
  (et détacher → lier pour un Goal Atlassian) est portée par `core/boardMove.ts` ; la publication
  des réglages partagés relit `boardsettings.v1` par `saveTeamSettings` (`core/teamSettings.ts`).
  Déplacement, rattachement, réglages, épinglage et publication du planning passent par la seule
  porte d'écriture du board (`app/model/BoardWriteGate.ts`) : un geste attend la fin du précédent ;
  une écriture préparée pour un board quitté est refusée avant l'envoi ; `canEdit` ne refuse que
  la propriété du board (E6). Ces refus sont typés (`BoardWriteRefused`, raison `stale` ou
  `cannotEdit`) : rien n'est parti vers Jira. `cannotEdit` met les réglages en lecture seule,
  force la relecture des réglages partagés (la modification locale est défaite si Jira n'en porte
  aucun) et journalise « rien n'a été envoyé à Jira ». `stale` est silencieux pour les réglages et
  épinglages, et journalisé « rien n'a été envoyé à Jira » pour une étape de déplacement.
  La carte projetée est visuelle ; les compteurs restent ceux confirmés par Jira. Repère rouge
  pour les erreurs, aucune confirmation verte. Les formulaires suivent le parcours natif décrit dans
  l'[intégration Jira](integration-jira.md).
- Daily : une swimlane affichée à la fois dans l'ordre du board, sans objectifs masqués ni lignes
  sans ticket visible ; filtres et replis personnels inchangés. Déplacements possibles, sans
  changement de Goal par glissé. Minuteur global fondé sur l'heure de départ, pauses exclues,
  sans arrêt ni son à échéance ; orange les deux dernières minutes puis dépassement rouge.
  Durée partagée `dailyMinutes` : 15 min par défaut, bornée à 1–120. `dailyStockLimit` : trois
  premières cartes par première colonne, dépliage temporaire par swimlane. Recharger termine la séance.
- Daily et présentation demandent le plein écran au clic (`allow="fullscreen"` sur l'iframe,
  aucune permission Chrome). Un refus laisse la Daily utilisable. Sortir du plein écran termine
  la présentation via `fullscreenchange`, mais laisse la Daily active. Présentation : en-tête et
  barre latérale masqués, filtres conservés ; commandes détaillées dans le manuel.
- `SPRINT_HEALTH_ENABLED` (`src/app/featureFlags.ts`) reste désactivé. `DIAGNOSTIC_ENABLED`
  (même fichier) reste actif, notamment pour le renvoi « Invalid CORS request » ; le désactiver
  retire l'entrée Diagnostic du menu « Site Jira » (site et déconnexion restent) et bloque les
  points d'entrée du modèle : ouverture, sondes (dont les essais de variantes Origin), test
  d'écriture, lecture du journal et copie du rapport. L'effacement du journal reste permis.
- Réglages du board ([`settings/`](../../src/app/views/settings/SettingsView.tsx)) : vue
  `settings` à onglets Board, Objectifs, Champs et Couleurs des cartes, ouverte depuis le board
  (menu du board, menu ⋯ d'une swimlane) ; le pied de barre « Site Jira »
  garde préférences personnelles, diagnostic et déconnexion. Glisser-déposer HTML5 à types de données propres
  (`application/x-sprint-goals-settings-*`), sans effet sur les glissés du board, avec un équivalent
  clavier ou menu pour chaque geste ; `verify:settings` les rejoue dans Chromium. La liste des
  swimlanes est la sous-suite hors objectifs de `blockOrder` (`settingsLaneOrder`,
  [`reorder`](../../src/core/reorder.ts)) : y déplacer Build ou une swimlane par type ne change jamais
  l'ordre relatif des objectifs, réglé sur le board. Un dépôt sans effet n'écrit rien.
- Les types sont intégrés à la carte Swimlanes : Default est la destination `GOAL`
  (Build), les groupes dédiés restent `SWIMLANE`, et Ignorés figure dans la même carte.
  Le dépôt d'un type sur Default est distinct de la réorganisation des lignes ; les réglages
  existants et le nom personnalisé de Build restent conservés.
- Aucune entrée Réglages sous Sprint ni compteur bloqués/ajoutés/Build dans l'en-tête ; filtres et
  navigation vers les swimlanes restent disponibles. Retour à Jira est
  ancré au pied de la barre latérale ; il disparaît avec elle lorsqu'elle est repliée,
  sans ligne de remplacement. Il reste désactivé pendant une écriture et masqué en présentation/Daily.
- Colonnes telles que Jira les déclare (noms, limites WIP) ; seules celles sans statut sont
  écartées. Bloqué = lien Jira « est bloqué par » uniquement. Les personnalisations de colonnes et
  labels de blocage d'avant 0.31.0 ne sont plus lues (voir [données persistantes](donnees.md)).
- Les réglages partagés sont relus à chaque chargement ; chaque geste de modification est écrit
  immédiatement après relecture et fusion avec la version des collègues. Un calcul automatique
  n'écrit jamais seul. Une modification non enregistrée est perdue à la prochaine lecture.
  Sans `canEdit` ou après refus Jira, les réglages du board disparaissent (entrées et vue) ; le menu
  « Site Jira » reste ; repli des lignes personnel.
- Déconnexion confirmée : permission Chrome rendue, boards/réglages locaux du site et historique
  de chargement effacés. Les préférences personnelles ne sont jamais publiées ni synchronisées entre postes.
