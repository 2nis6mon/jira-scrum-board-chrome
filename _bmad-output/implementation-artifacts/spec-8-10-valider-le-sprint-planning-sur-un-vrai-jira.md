---
title: 'Story 8.10 — Valider le Sprint Planning sur un vrai Jira'
type: 'chore'
created: '2026-11-03'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '642b61cb5b564cd18e4ce1e8942512fa7e44b220'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-8-context.md'
  - '{project-root}/docs/technique/integration-jira.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Le Sprint Planning (builds locaux, 0.48.4) n'a été vérifié que sur Jira fictif, plus des essais ponctuels sur le sandbox. Son activation dans le paquet (8.11) exige un constat réel, et plusieurs contrats sont « à confirmer en 8.10 » dans `docs/technique/`.

**Approach:** Jouer un cycle complet sur le Jira sandbox, consigner le constat étape par étape, transformer chaque défaut en story ou correctif, et préparer la décision sur les droits.

**Décisions de Denis (03/11/2026) :**
- Claude pilote un Chrome visible sur profil temporaire, piloté par CDP (port local), avec l'extension dans la version qui livre 8.24 (0.48.5, copie identique à `dist/`) ; Denis s'y connecte lui-même au sandbox et y autorise le site (mise à jour du 03/11/2026 : Claude in Chrome refuse de capturer ou de scripter un onglet qui contient le cadre d'une autre extension). Denis valide chaque étape irréversible (clôture, démarrage) avant qu'elle soit jouée.
- Board 3013 « Accueil & Services » (projet CLIENT) du sandbox `mousquetaires-sandbox-860` ; le sprint actif « Accueil-26T2.6 I&P » (16142) sera clôturé.
- Partie sans droit : Denis retire lui-même « Gérer les sprints » à son compte dans le sandbox, puis le rend. Son compte est administrateur Jira du sandbox (`ADMINISTER` suffit à modifier un sprint) : l'étape 8 exige aussi le retrait temporaire de ce droit, ou un autre compte, au choix de Denis au moment de l'étape ; sinon elle est consignée « non jouée ».
- Coût des lectures : lu dans le journal de diagnostic et les requêtes réseau de l'extension, dans Chrome, sans toucher aux identifiants.
- Sprints créés par Denis dans Jira le 03/11 : « Accueil-26T2.7 » (17308) est le sprint à préparer puis démarrer ; « Accueil-26T2.8 » (17309) sert d'autre sprint futur (étape 3) ; « Accueil-26T2.9 » (17310) reste en réserve. Les sprints « [Accueil] … » (8135 à 8137) ne sont pas touchés.
- Clôture : dans la fenêtre native, les tickets non terminés vont vers « Accueil-26T2.7 ».
- Goals Atlassian hors de cet essai (board 3013 en objectifs texte) : consignés « non couverts » ; un essai séparé est nécessaire avant 8.11.

## Boundaries & Constraints

**Always:** sandbox seulement ; gestes faits par l'interface de l'extension et les fenêtres natives Jira, comme un utilisateur ; une seule tentative par geste, relecture de Jira (MCP en lecture seule) après chaque écriture ; constat consigné dans ce fichier au fil de l'essai ; données réelles du sandbox jamais copiées dans `src/`, `tests/` ou le dépôt au-delà du constat (clés de tickets et noms de sprints suffisent).

**Never:** écrire dans Jira hors de l'extension (MCP en lecture seule) ; prod `mousquetaires.atlassian.net` ; lire cookies, jetons ou identifiants ; changer les droits soi-même ; créer un sprint par l'extension ; corriger du code pendant l'essai (les défauts deviennent des stories ou correctifs après).

## I/O & Edge-Case Matrix

| Étape | Geste | Attendu, vérifié dans Jira |
|---|---|---|
| 1 Ouverture | Sprint Planning, board 3013 | menu : 8135 à 8137, 17308 à 17310, et « 2024T1.1 » (6269, board 2753, un ticket ouvert) si l'utilisateur a le droit sur les projets de ce board ; ni « APP : Backlog tech/dette » (3334) ni « [NTF] Sprint 10.7 » (3707), tickets tous terminés ; backlog de 255 tickets lu (pagination, loin de la limite de 5 000) ; coût des lectures relevé ; cartes avec type et statut (8.12) ; tickets de la dernière colonne visible absents de « Où sont les tickets » et du sprint en préparation, et non comptés (8.22, 8.23), comme dans le backlog Jira |
| 2 Objectifs texte | ajouter, renommer, réordonner, relire avant écriture | `goal` du sprint et propriété `sprintgoals.v1` cohérents ; un seul en-tête par objectif (8.20) |
| 3 Tickets | ajouter depuis le backlog et depuis « Accueil-26T2.8 » ; lot de 3+ ; glisser vers un objectif hors de l'écran ; « Envoyer vers un objectif », top et basse priorité par le menu de carte (clic droit) ; retour au backlog | le ticket n'est que dans un sprint ouvert (E9) ; il arrive à la place choisie, ordre relu dans Jira ; la zone défile pendant le glisser (8.24) ; même menu que sur le Sprint Board (8.13, 8.19) ; coût de la relecture du planning après chaque geste relevé |
| 4 Estimation, vélocité, avancement | estimer une carte ; saisir la vélocité ; lire l'avancement des objectifs | champ « Story Points » du board ; propriété du sprint ; barre de chaque objectif par état, selon les colonnes du board 3013, déjà livré dans la partie terminée (8.16, 8.20, 8.21) ; coût de la lecture du déjà livré relevé |
| 5 Filtres rapides | un filtre Jira du board ; sélectionner un ticket, le masquer par le filtre, déplacer le lot | JQL accepté, résultat et coût relevés ; constat : le ticket masqué part-il avec le lot (à trancher après l'essai) |
| 6 Clôture | fenêtre native de 16142 (tickets non terminés vers « Accueil-26T2.7 »), puis report | sprint clos ; tickets non terminés dans 17308 ; objectifs non atteints reportés sur 17308, compte rendu juste ; « Terminer le sprint » trouvé sur la ligne de 16142 (8.18) ; délai réel entre la clôture et sa relecture, comparé aux 10 s de relecture ; fenêtre de suite de Jira (rétrospective, Confluence) suivie jusqu'à sa fermeture |
| 7 Démarrage | fenêtre native du sprint préparé | sprint actif ; objectifs visibles sur le Sprint Board |
| 8 Sans droit | « Gérer les sprints » et administration retirés par Denis (ou autre compte), actualisation | règle de 0.43.1 : aucun sprint futur proposé, le planning le dit ; ni clôture ni démarrage proposés ; aucune écriture tentée |

</frozen-after-approval>

## Code Map

- `docs/technique/integration-jira.md:103,106,149,152` -- coûts à mesurer (déjà livré 8.16, filtres rapides 8.14), un seul sprint ouvert par ticket (E9), règle Cloud des droits.
- `docs/technique/securite.md:70` (S13) -- fenêtres natives de clôture et de démarrage : bouton reconnu par son libellé (fr/en/es).
- `_bmad-output/planning-artifacts/backlog.md:50-62,120-135` -- droits par `originBoardId`, règle de la dernière colonne : à confirmer.
- `_bmad-output/implementation-artifacts/deferred-work.md` -- points « à constater en 8.10 » (relecture après chaque geste, délai de clôture, bouton « Terminer », fenêtre de suite, sélection masquée par un filtre) : le constat y est reporté.
- `src/app/model/PlanningModel.ts` -- gestes et relectures ; `src/core/sprintPlanning.ts` -- lecture et écritures du planning.
- Journal de diagnostic de l'extension (vue Diagnostic) et onglet Réseau de Chrome -- mesures.
- Relecture : connecteur « claude.ai Atlassian MCP », `executeRead` seulement, `cloudId` = `mousquetaires-sandbox-860.atlassian.net` (vérifié le 03/11/2026 : `listJiraBoardSprints` du board 3013 renvoie 16142 actif et 17308 à 17310 futurs). Le connecteur « Atlassian Rovo » ne voit que la prod : ne pas l'utiliser.

## Tasks & Acceptance

**Execution:**
- [x] Préalables -- story 8.24 livrée et acceptée, `dist/` dans cette version chargé dans le Chrome de Denis, Claude in Chrome connecté (remplacés le 03/11/2026 par un Chrome sur profil temporaire piloté par CDP, extension 0.48.5), « Accueil-26T2.7 » choisi dans le menu (Jira le liste après les sprints « [Accueil] … ») -- sans eux, rien ne commence.
- [x] Étapes 1 à 7 -- jouer, relire Jira, consigner (constat ci-dessous) -- cycle complet avec le droit.
- [x] Étape 8 (non jouée, choix de Denis) -- après le retrait des droits par Denis (ou avec un autre compte) ; sinon « non jouée » -- décision sur les droits.
- [x] Défauts (8.26 à 8.28, points à décider dans le backlog) -- une story ou un correctif par défaut dans `backlog.md` / `epics.md` ; « à confirmer en 8.10 » remplacés par le constat dans `docs/technique/` et dans `deferred-work.md` (entrée retirée si conforme, story ou correctif sinon).

**Acceptance Criteria:**
- Given le constat consigné, when Denis le relit, then chaque étape a son résultat (conforme, défaut et sa suite), les coûts sont chiffrés, et la décision sur les droits peut être prise.

## Constat

Essai du 03/11/2026, extension 0.48.5 (copie identique à `dist/`), Chrome sur profil temporaire piloté par CDP, interface en anglais (langue du Jira de Denis). Coûts relevés par les `PerformanceResourceTiming` du cadre de la vue (requêtes vers le site Jira) ; relecture par le MCP en lecture seule.

**Préalable.** Claude in Chrome ne peut pas piloter la vue : quand le cadre `chrome-extension://` est présent, il refuse captures et scripts (« Cannot access a chrome-extension:// URL of different extension ») ; tant qu'il contrôle l'onglet, le cadre est absent (page blanche). Pilotage par CDP retenu par Denis.

**1 Ouverture — conforme.**
- Menu : 2024T1.1 (6269), 8135 à 8137, 17308 à 17310 ; ni 3334 ni 3707. Le planning s'ouvre sur 2024T1.1, premier de la liste ; choix de 17308 au menu.
- Backlog : Jira en compte 255 (route backlog du MCP), dont 88 sans sprint et hors dernière colonne ; l'extension en montre 99, exactement le décompte JQL « sans sprint ouvert ni futur, hors dernière colonne » (reliquats de sprints clos compris), lu en une seule requête `software/1.0/backlog`.
- Sprint actif 16142 : 49 tickets, 46 hors dernière colonne, 46 affichés dans « Où sont les tickets ». Cartes avec type et statut (TO DO, TO TEST, OPEN).
- Coût à l'ouverture : 32 requêtes, 2,8 s (somme 8,5 s) — 13 pages de tickets de sprints, 7 `mypermissions` et 4 `board/{id}/project` (règle des droits), 2 listes de sprints, sprint, propriété, backlog. Changement de sprint au menu : 14 requêtes, 1,1 s (10 pages de tickets de sprints).

**2 Objectifs texte — conforme.** Ajout de trois objectifs, renommage, réordonnancement (bouton « Move goal 3 up ») : après chaque geste, `goal` (lignes dans l'ordre) et `sprintgoals.v1` (titres, positions) concordent dans Jira ; un seul en-tête par objectif. Coût d'un geste, relecture du texte avant E8 et relecture du planning comprises : 21 à 24 requêtes, 2 à 3,2 s. Conflit de texte non provoqué (il exigerait une écriture hors de l'extension).

**3 Tickets — défauts D1 et D2.**
- **D1 (majeur) : écriture appliquée annoncée « Write not confirmed ».** Après E9 (ajout depuis le backlog, lot de 3, retour depuis « Accueil-26T2.8 »), E2 (top et basse priorité) et E10 (retour au backlog), la relecture immédiate par la route des tickets du board ne voit pas encore le changement : 7 gestes sur 7. Jira a pourtant tout appliqué (vérifié par JQL). Délai d'indexation mesuré : CLIENT-7122 visible ~0,9 s après la réponse de l'E9 ; dans le lot, CLIENT-7122 relu, CLIENT-3693 non. Conséquences : l'E5 qui suit n'est pas écrite (ticket déposé sur un objectif, arrivé « Sans objectif ») ; au retrait vers 17309, le lien vers B reste dans la propriété, et le ticket rendu ensuite sur C réapparaît sous B ; juste après le lot, CLIENT-7122 s'affiche à la fois dans le backlog et le sprint ; le message demande de refaire les trois tickets déjà ajoutés. Aucune écriture rejouée ; une actualisation montre l'état juste. Les gestes E5 seuls (« Send to a goal », ticket ou lot) sont confirmés.
- **D2 (mineur) : la vue entière défile quand des cartes sélectionnées sont bas dans « Où sont les tickets ».** `.visually-hidden` (« Selected ») est en `position: absolute` sans bloc conteneur dans la carte ni la colonne : les annonces se placent hors de la colonne (jusqu'à 3 526 px pour 691 visibles), le document devient défilant et, pendant un glisser près du bas, Chrome fait défiler toute la vue (en-tête et filtres sortent de l'écran).
- Conforme : un ticket n'est que dans un sprint ouvert (E9 de 17308 vers 17309 puis retour, relu par JQL) ; glisser du backlog et d'un autre sprint futur ; lot de 3 par Ctrl+clic (« 3 issues selected ») glissé en une seule E9 ; défilement de `.planning-lanes` pendant le glisser jusqu'à l'objectif hors de l'écran (8.24, 301 px) ; menu au clic droit (« Send to a goal », « Remove from sprint » vers le backlog ou chaque sprint futur, top et basse priorité désactivées en bout de ligne avec leur raison ; lot : seulement les deux premiers) ; ordre relu dans Jira (`ORDER BY Rank`).
- Coût d'un geste sur les tickets, relecture du planning comprise : 18 à 21 requêtes, 2,1 à 3,7 s (11 à 14 pages de tickets de sprints, backlog, listes de sprints, propriété).
- Observation (O1) : à chaque relecture, les tickets des sprints 3334, 3707 et 6269 sont lus deux fois (menu des sprints d'autres boards, puis planning).
- Hors extension : le pilotage CDP exige une fenêtre visible (`requestAnimationFrame` suspendu dans une fenêtre masquée : le défilement de 8.24 ne part pas) ; Échap envoyé par CDP n'a pas vidé la sélection (focus probablement hors du cadre, non retenu comme défaut).

**4 Estimation, vélocité, avancement — conforme.** Estimation de CLIENT-7114 sur la carte (« ? » puis 3, Entrée) : `PUT …/estimation?boardId=3013` sur `customfield_10021` (champ du board), relu `value: 3`, affiché ; 17 requêtes, 2,2 s ; pas de D1 (la relecture lit le ticket, pas la route de recherche). Vélocité 20 : `velocity: 20` dans `sprintgoals.v1`, en-tête « 13 / 20 pts · 65 % · 1 issue without estimates » ; 18 requêtes, 1,6 s. Chaque objectif a sa barre et sa légende (« To do / In progress / Done », tickets et points) selon les colonnes du board. Déjà livré : aucun objectif n'a d'historique avant la clôture ; lecture réduite à 2 pages de la liste `state=closed` (relecture complète du planning : 32 requêtes, 2,6 s) ; à remesurer après la clôture.

**5 Filtres rapides — conforme, constat à trancher.** « WEB » (`component in (WEB, Web, COP_WEB, Mire-ITM)`) accepté par Jira avec le périmètre du planning (`sprint in (<préparé, futurs, actif>) OR sprint is EMPTY OR (sprint in closedSprints() AND status not in (<dernière colonne>))`) : 2 pages de `board/{id}/issue`, 1,9 s ; backlog 28, sprint actif 24. Sélection de CLIENT-6566 (WEB) et CLIENT-5303 (SERVICE), puis filtre WEB : CLIENT-5303 masqué, la barre dit toujours « 2 issues selected » ; « Add to the sprint › Essai 8.10 objectif A » sur la carte visible : **le ticket masqué part avec le lot** (relu dans 17308), sans autre signal que le compteur. D1 reproduit ; la sélection reste active après le geste non confirmé.

**6 Clôture — sprint clos et report juste, défaut D3.** Feu vert de Denis.
- **D3 (majeur) : la fenêtre native ne s'ouvre pas seule.** « Complete Accueil-26T2.6 I&P » ouvre la page backlog dans la popin ; traces : `boutons de sprint reconnus 1/1`, `bouton de sprint cliqué Complete sprint`, puis 10 s plus tard `fenêtre de sprint non reconnue, page rendue à l'utilisateur 0`. Le bouton « Complete sprint » est bien sur la ligne de 16142 (8.18 : nom du sprint sur la ligne, un seul candidat) et le clic part, mais Jira n'ouvre aucune fenêtre (clic probablement trop tôt, page non prête). Le repli prévu fonctionne : page rendue, clic manuel sur « Complete sprint », fenêtre native ouverte et suivie.
- Fenêtre native : « 2 completed work items and 40 open work items » ; destination par défaut « APP : Backlog tech/dette » (sprint 3334 d'un autre board), remplacée par « Accueil-26T2.7 » ; case « Join Confluence now to create a sprint retrospective » **cochée par défaut**, décochée sur décision de Denis ; « Generate a sprint summary with Rovo » décochée. Pas de fenêtre de suite (Confluence décoché) : comportement avec la case cochée non observé.
- Délais : fenêtre ouverte 4 à 6 s après « Complete sprint » (traitement Jira), sprint lu `closed` 6,1 s après le clic, popin refermée seule avant 8 s ; dans les 10 s de relecture.
- Report : « Completion of Accueil-26T2.6 I&P — Unmet goals carried over to Accueil-26T2.7 » ; Goal 1, 2 et 3 reportés avec leurs tickets ; 17308 compte 53 tickets dans Jira (6 de l'essai, 40 ouverts, 7 sous-tâches) ; en-têtes avec déjà livré (Goal 2 : 1 ticket ; Goal 3 : 3 tickets, 21 pts). Le compte rendu cite aussi RR-8663 et CLIENT-9851, terminés et restés dans le sprint clos (déjà livré) : liste exacte mais ambiguë sous « Carried over ».
- CLIENT-9969, sous-tâche « Closed » (dernière colonne) reportée dans 17308, n'a pas de carte (52 cartes pour 53 tickets) : conforme à 8.23 (tickets terminés du sprint en préparation ni affichés ni comptés).
- Observation (O3) : le compte rendu de clôture reste affiché après le démarrage, au-dessus d'un autre sprint préparé (2024T1.1).
- Coûts : clôture et report, relectures comprises, 53 requêtes, 6,8 s ; actualisation ensuite 37 requêtes, 4,7 s, dont déjà livré ≈ 8 (2 pages `state=closed`, propriétés et tickets de 16142, 16141, 16140).

**7 Démarrage — sprint actif, défaut D4.** Feu vert de Denis.
- La fenêtre native s'ouvre seule cette fois (`boutons de sprint reconnus 6/1`, `bouton de sprint cliqué Start sprint`) : « Start Sprint », nom « Accueil-26T2.7 », 2 semaines (03/11 14 h 41 → 17/11), achèvement automatique désactivé, « Sprint goal » prérempli des 6 lignes de `goal`, avertissement « 40 others do not have a value for the 'Estimate' field », « 46 work items will be included » ; valeurs gardées, « Start » cliqué.
- **D4 (majeur) : fenêtre de démarrage non isolée, popin laissée sur le board natif.** Trace `fenêtre de sprint non reconnue, page rendue à l'utilisateur 1` : la fenêtre (avec son bandeau d'avertissement) n'est pas reconnue, la page backlog entière est montrée ; après « Start », Jira charge le Sprint Board natif (`?sprintStarted=true`) **dans la popin**, qui ne se ferme pas ; Échap la referme et la vue relit Jira.
- Sprint lu `active` 6,0 s après « Start ». Planning relu : « Complete Accueil-26T2.7 », « Start 2024T1.1 » désactivé (« A sprint is active… »), menu sans 17308. Sprint Board de l'extension : « Accueil-26T2.7 active · 3 Nov → 17 Nov », « 0/54 pts », « 0/6 Goals achieved », les 6 objectifs dans la barre latérale, « Carried over (40) ».
- Observation (O4) : la barre latérale du Sprint Board range Goal 1 à 3 avant les objectifs d'essai, alors que `goal` et `sprintgoals.v1` portent l'ordre A, C, B, Goal 1, 2, 3 ; Goal 1 y compte 0/5 contre 3 tickets dans le planning (sous-tâches ?). À analyser.

**8 Sans droit — non jouée.** Choix de Denis : son compte est administrateur du sandbox (`ADMINISTER` suffit à modifier un sprint) et aucun autre compte n'a été utilisé. Seul le cas avec droit est constaté : menu conforme (étape 1), écritures acceptées.

**Goals Atlassian — non couverts** (board 3013 en objectifs texte) ; essai séparé nécessaire avant 8.11.

**Synthèse.** Conformes : ouverture et menu, backlog volumineux (255 lus, 99 affichés comme dans Jira), objectifs texte, un seul sprint ouvert par ticket, lot, menu de carte, défilement pendant le glisser (8.24), estimation, vélocité, avancement et déjà livré, filtres rapides, clôture et report, démarrage. Défauts devenus stories : D1 → 8.26 (majeur, bloque l'activation : gestes annoncés non confirmés et liens d'objectif manquants), D3 et D4 → 8.27 (majeur : fenêtres natives), D2 → 8.28 (mineur). À décider (backlog) : droits, sélection masquée par un filtre ; à investiguer : ordre et comptes des objectifs sur le Sprint Board (O4), compte rendu persistant (O3) ; optimisation : double lecture (O1). Coûts : ouverture 32 requêtes (2,8 s), geste 17 à 24 (1,6 à 3,7 s), actualisation 32 à 37 (2,6 à 4,7 s), clôture et report 53 (6,8 s) ; aucune limitation de débit observée. Constat défavorable à l'activation (8.11) tant que 8.26 et 8.27 ne sont pas livrées et revérifiées sur le sandbox.

**État laissé dans le sandbox.** 16142 clos ; 17308 « Accueil-26T2.7 » actif avec les objectifs « Essai 8.10 objectif A », « … C », « … B renomme », Goal 1 à 3, 53 tickets dont CLIENT-7114 (estimé 3), CLIENT-7122, CLIENT-3693, CLIENT-4628, CLIENT-6566, CLIENT-5303 ajoutés pendant l'essai, vélocité 20. CLIENT-7121 rendu au backlog. 17309 et 17310 vides.

## Verification

**Manual checks (if no CLI):**
- Relecture de Jira (MCP, lecture seule) après chaque écriture : sprint, propriété `sprintgoals.v1`, tickets du sprint.

## Review Triage Log

| Constat | Verdict | Preuve | Suite |
|---|---|---|---|
| Tâche « Préalables » : cite encore Claude in Chrome, abandonné pendant l'essai | low | La décision de Denis (mode CDP) est dans l'intention, pas dans la tâche cochée | patch : mention du remplacement ajoutée |
| `epic-8-context.md` : « le sprint en préparation garde ses tickets terminés » | low | Antérieur à 8.23, cache régénéré depuis les artefacts de planning modifiés ici | rejeté (régénéré au prochain build de l'epic) |
| AGENTS.md annonce « essai réel 8.10 et activation 8.11 à venir » | false | Vrai jusqu'à l'acceptation de 8.10 par Denis ; à revoir avec 8.11 | rejeté |
| Critère de l'epic « avec et sans droit » non rempli | false | L'intention admet l'étape 8 « non jouée » ; décision des droits reportée au backlog | rejeté |
