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
  **Seule la publication explicite du Sprint Planning peut modifier le champ natif d'un sprint futur.**
- Kanban utilise le périmètre du board et `subQuery.query`, avec ses statuts mappés : aucun faux
  sprint, lecture séparée du backlog ou âge limite local des tickets terminés. `snapshot.sprint=null`
  et `activeSprints=[]` n'indiquent pas un board vide. Filtres rapides et couleurs JQL gardent ce
  sous-filtre, sans clause sprint. Un statut absent de la structure locale reste compté et signalé
  comme non mappé ; la relecture de structure permet de replacer sa carte.
- Kanban exige les Goals Atlassian. Si leur lecture est inexploitable, la photographie précédente
  reste affichée avec l'erreur : aucun repli qui placerait à tort tous les tickets dans Build.
  `boardPinnedGoalIds` est partagé sur le board, sans propriété de sprint, et exige son droit d'édition.
- Un ticket lié à plusieurs Goals suit le premier Goal résolu. Après la première lecture, un Goal
  nouvellement découvert par un ticket arrive masqué ; ses tickets restent dans leur destination
  par défaut jusqu'à réaffichage, sans modifier le rattachement.
  Les objectifs épinglés peuvent rester vides. Un Goal vide n'est jamais atteint ; sinon tous ses
  tickets doivent être dans la dernière colonne visible. Le vert est réservé à cet état.
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

- Sprint Planning : `PlanningModel` pilote un atelier chargé uniquement à son ouverture,
  `core/sprintPlanning.ts` porte lectures, validation et publication, `views/planning/` sa présentation.
  Choix d'un sprint futur existant, backlog du board paginé, RAF actif consultatif (statut hors Done),
  objectifs texte éditables, sélection/affectation locale, capacité facultative et synthèse copiable.
  Aucun appel Goals Atlassian par cet atelier, même si le board les utilise ; aucune modification de
  sa source d'objectifs. Pour retrouver ces objectifs sur le board actif, choisir la source texte.
  Les sous-tâches ne sont pas ajoutées séparément ; les tickets déjà dans le sprint restent présents.
  Brouillons par site/board/sprint, sauvegardes ordonnées et copie mémoire conservée en cas d'échec local.
  La publication compare texte, propriété et périmètre de la photographie avec Jira frais ; un conflit
  conserve le brouillon et demande de copier la synthèse puis repartir de Jira. Ordre : texte → ajouts
  par lots de 50 → propriété des rattachements, avec vérification de chaque étape. Refus/résultat
  incertain arrête la séquence, sans rollback ni retry ; les étapes confirmées sont indiquées.
  Les droits sprint et tickets sont appliqués par Jira, distincts du `canEdit` des réglages du board.
  Durant la publication, retour Jira, changement de board, déconnexion et sorties de vue sont protégés.

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
