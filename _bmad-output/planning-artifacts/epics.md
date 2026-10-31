---
status: draft
stepsCompleted: [1, 2]
inputDocuments:
  - _bmad-output/planning-artifacts/backlog.md
  - _bmad-output/specs/spec-conformite-architecture/SPEC.md
  - _bmad-output/planning-artifacts/architecture/architecture-sprint-goals-board-2026-10-27/ARCHITECTURE-SPINE.md
  - AGENTS.md
  - docs/technique/index.md
  - docs/technique/invariants.md
  - docs/technique/integration-jira.md
  - docs/technique/donnees.md
  - docs/technique/securite.md
  - docs/technique/developpement.md
  - docs/manuel-utilisateur.md
decisions:
  - "Pas de PRD ni de conception UX : exigences tirées du backlog, de la spec de conformité, de la note d'architecture, d'AGENTS.md et de docs/technique/ (Denis, 30/10/2026)."
  - "Les pistes produit non décidées deviennent des epics, avec leurs questions ouvertes (Denis, 30/10/2026)."
  - "La mise en conformité d'architecture précède le menu contextuel, prochaine fonction qui écrit dans Jira (Denis, 30/10/2026)."
  - "Sprint Planning, fonction cachée du paquet, a son propre epic (Epic 8) pour être retravaillé puis activé ; FR17 quitte l'Epic 4 et la question de concurrence de la publication (action 5 de la rétrospective de l'Epic 1) y est reprise (Denis, 31/10/2026)."
---

# Sprint Goals Board pour Jira - Epic Breakdown

## Overview

Ce document découpe en epics et stories les travaux du projet Sprint Goals Board pour Jira. Faute de
PRD et de conception UX, les exigences viennent du [backlog](backlog.md), de la
[spec de mise en conformité](../specs/spec-conformite-architecture/SPEC.md), de la
[note d'architecture](architecture/architecture-sprint-goals-board-2026-10-27/ARCHITECTURE-SPINE.md),
d'[AGENTS.md](../../AGENTS.md) et de la [documentation technique](../../docs/technique/index.md).

## Requirements Inventory

### Functional Requirements

Mise en conformité d'architecture (spec, décidée) :

FR1: Toute mise à jour de `sprintgoals.v1` conserve les versions et champs inconnus et applique une seule règle de conflit (fusion d'un autre lien, refus du même lien modifié depuis la lecture), quelle que soit la fonction qui écrit : rattachement, épinglage ou publication du planning (CAP-1).
FR2: Les Goals épinglés sont lus et écrits par un seul résolveur, qui choisit la propriété Jira selon le board (Scrum, Kanban, Scrum sans sprint actif) ; aucun service ni vue ne la choisit (CAP-2).
FR3: Chaque intention d'écriture (déplacer, rattacher à un Goal, publier les réglages) a une seule fonction de `core`, qui porte séquence, relecture et résultat partiel ; `BoardMovementService` et `BoardSettingsService` ne contiennent plus d'enchaînement d'écritures ni de détection de conflit (CAP-3).
FR4: Toutes les écritures déclenchées depuis un board, planning compris, passent par une porte unique détenue par `BoardModel` : un second geste attend l'écriture en cours, `core` ne reçoit jamais le transport brut, `canEdit` ne conditionne que E6 (CAP-4).
FR5: Les messages `sprint-goals:*` sont déclarés une seule fois dans `src/integration/messages.ts`, et un test échoue si la copie de `injectBoard.ts` en diverge (CAP-5).
FR6: Chaque clé locale a son module propriétaire ; le lanceur ne lit ni n'écrit de clé directement, et la déconnexion efface toutes les données du site via `forgetSite` (CAP-6).
FR7: `core` ne produit plus de phrases ; le journal `audit.v1` enregistre les nouvelles entrées en clé + paramètres et affiche les anciennes comme avant, dans les trois langues (CAP-7).
FR8: `tests/guards/sources.test.ts` refuse un import `jira → core` et toute construction de `JiraTransport`, `JiraClient`, `GoalsClient` ou `AuditLog` hors de `AppModel`, `BoardModel` et `DiagnosticModel` (CAP-8).
FR9: `SPRINT_HEALTH_ENABLED` et `DIAGNOSTIC_ENABLED` sont déclarés dans `app/featureFlags.ts`, gardés aux points d'entrée des modèles et services, et un test couvre leur valeur dans `dist/` et dans le paquet (CAP-9).

Fiabilité et distribution (backlog, à faire) :

FR10: Le parcours natif de transition est validé sur des workflows réels : Time Spent, Story Points, Resolution, commentaires, plusieurs champs, widgets tiers, validation et annulation ; le diagnostic des formulaires non reconnus est amélioré sans données sensibles.
FR11: La lecture des Goals est validée sur des schémas réels : plus de 100 liens, absence de `workItems`, champ Goals manquant ; pagination et signalement des résultats incomplets sont contrôlés.
FR12: Les réglages partagés et leurs conflits sont validés sur deux postes, avec et sans `canEdit`, avec des volumes importants et des limites WIP réelles.
FR13: Les routes des boards gérés par l'équipe, le changement de board et le placement du bouton sont validés sur les dispositions Jira réelles.
FR14: Les lectures Software « enhanced » sont étudiées avant de remplacer les endpoints Agile, en préservant filtre, sprints et pagination.
FR15: Le canal de publication et de mise à jour est confirmé (fiche, empaquetage et politique existent déjà).
FR16: Les captures du Store sont renouvelées après chaque évolution visuelle, et une revue de sécurité indépendante a lieu avant une diffusion large.
FR17: Sprint Planning est validé sur une instance réelle (droits, volumes) avant son activation dans le paquet ; démarrage/création de sprint, report automatique du RAF et création de Goals restent hors périmètre.

Pistes produit (backlog, à décider) :

FR18: Menu contextuel (clic droit) sur un ticket du board : « Envoyer vers un goal », « Mettre en top priorité », « Mettre en basse priorité ». Priorité = rang en tête ou en fin, écritures déjà autorisées ; le champ Priorité Jira serait une nouvelle écriture.
FR19: Export et import des réglages en JSON validé, avec aperçu des différences.
FR20: Préférences personnelles partagées entre postes, via une propriété utilisateur Jira (nouvelle écriture à autoriser) ; `storage.sync` exclu.
FR21: Limites WIP exprimées en points et minimums de colonne ; présentation des sources Goals selon les capacités du site.
FR22: Déploiement IT via `storage.managed` si le besoin est confirmé. Le déplacement clavier des cartes reste abandonné (Denis, 30/10/2026).

Ajouts de Denis (30/10/2026) :

FR23: Avec plusieurs sprints actifs du board, l'éditeur d'épinglage des Goals Atlassian permet de choisir le sprint concerné ; l'épinglage s'écrit dans la propriété de ce sprint (E5). Aujourd'hui, les épinglages de tous les sprints sont lus, mais seul celui du sprint principal se modifie (point partiel de la 0.36.0).
FR24: Le board montre les tickets reportés depuis le sprint précédent du board (nombre et liste, via un filtre rapide « Reportés »), calculés sans lecture Jira supplémentaire à partir de l'historique Sprint déjà chargé (`sprintScope`) ; sprints étrangers exclus.

### NonFunctional Requirements

NFR1: Écritures métier limitées à l'inventaire fermé E1–E9 de `src/jira/writes.ts` ; aucun nouvel endpoint d'écriture, hôte, droit Chrome ni assouplissement de CSP sans décision produit explicite et vérification du contrat Atlassian ; ne pas inventer d'API.
NFR2: Une seule tentative par écriture ; après un résultat incertain, relire Jira sans rejouer et ne pas annoncer de réussite avant confirmation.
NFR3: Préserver les clés `com.scrumboardmac.*`, formats et identifiants persistés, la lecture des anciennes données et la clé publique du manifest ; données illisibles ou de version inconnue jamais écrasées, clés inconnues conservées, limite client de 32 Ko par propriété.
NFR4: Réglages partagés relus à chaque chargement et écrits seulement sur modification explicite ; aucun calcul automatique ne publie dans Jira ; sans `canEdit`, lecture seule ; préférences personnelles locales.
NFR5: Fiches et formulaires de transition natifs Jira : l'extension ne remplit ni ne valide aucun champ.
NFR6: `src/jira/transport.ts` est le seul appelant de `fetch` (session navigateur, hôte contrôlé, redirections refusées, lectures rejouables, écritures jamais rejouées) ; ni DOM ni `chrome.*` dans `src/core/` et `src/jira/`.
NFR7: `embeddingGuard` valide parent, origine, URL du board et permission avant tout accès Jira ; messages hôte ↔ vue vérifiés en origine et fenêtre source ; règle Origin limitée aux POST de l'extension vers `/gateway/api/graphql`.
NFR8: Fonctions expérimentales désactivées à la compilation dans le paquet `npm run package` ; aucun interrupteur activable par préférence, réglage ou URL.
NFR9: Aucune donnée fictive dans `src/`, `public/`, `board.html` ou `launcher.html` ; contrôles sur profils Chrome temporaires et Jira fictif ; un essai réel nécessite l'autorisation de l'utilisateur, sans lire ses identifiants ni sa session.
NFR10: Interface en français, anglais et espagnol, textes dans les catalogues `src/i18n/` ; les contenus Jira ne sont jamais traduits.
NFR11: Chaque livraison passe `npm run check` et `npm run verify:jira`, ajoute une régression si le comportement change, et actualise la version dans `package.json`, `package-lock.json` et `public/manifest.json` ; dépendances d'exécution limitées à Preact et signals, toute nouvelle dépendance justifiée.
NFR12: Aucun serveur tiers ni télémétrie ; aucun envoi automatique ni `storage.sync`.

### Additional Requirements

Règles de la note d'architecture qui s'imposent à chaque story :

- AD-1 : les imports suivent le graphe des couches ; `jira` n'importe jamais `core`, `app` ni `integration` ; seuls `AppModel`, `BoardModel` et `DiagnosticModel` construisent transport, clients et journal.
- AD-2 : une écriture n'existe que comme valeur de `jira/writes.ts` ; une seule fonction de `core` par intention métier ; un nouveau geste réutilise cette fonction (concerne directement le menu contextuel, FR18).
- AD-3 : seuls les modèles créent des signaux ; les vues n'affectent aucun signal ; les services passent par les ports de `app/services/ports.ts`.
- AD-4 : un module propriétaire par propriété Jira et par clé locale ; nouvelle clé de site suffixée par l'origine, avec `forgetSite` (concerne FR19 et FR20).
- AD-5 : tout interrupteur se déclare dans `app/featureFlags.ts` et se fixe à la compilation (concerne FR17).
- AD-6 : `BoardModel` détient la seule file d'écritures Jira du board ; le `JiraWriter` remis à `core` est toujours le décorateur de cette porte (concerne FR18).
- AD-7 : protocole hôte ↔ vue déclaré une seule fois dans `src/integration/messages.ts`.
- Ordre de livraison : CAP-1 (FR1) en premier, seul écart pouvant perdre des données ; chaque capacité livrable seule, avec `check` et `verify:jira` verts ; aucun changement visible, sauf le refus d'un rattachement texte en conflit (FR1), avec le message « Ce ticket a été modifié par quelqu'un d'autre depuis le chargement. Le board a été rechargé ; recommence si besoin. »
- La mise en conformité (FR1–FR9) est terminée avant le menu contextuel (FR18).
- Hors périmètre de la conformité : inversion hexagonale, endpoints « enhanced », fusion entre onglets des écritures de clés locales, nouvelle version de format des propriétés Jira.
- Pas de modèle de départ (starter template) : projet existant.

### UX Design Requirements

Aucun document de conception UX. Les comportements visibles existants sont décrits dans le
[manuel](../../docs/manuel-utilisateur.md) et les [invariants](../../docs/technique/invariants.md) ;
les stories qui modifient l'interface (FR18 à FR21) devront préciser leur comportement dans leurs critères.

### FR Coverage Map

FR1: Epic 1 - Une seule règle de conflit pour `sprintgoals.v1`, versions et champs inconnus conservés
FR2: Epic 1 - Résolveur unique des Goals épinglés
FR3: Epic 1 - Une fonction `core` par intention d'écriture
FR4: Epic 1 - Porte d'écriture unique par board
FR5: Epic 1 - Messages `sprint-goals:*` déclarés une seule fois
FR6: Epic 1 - Module propriétaire par clé locale, `forgetSite`
FR7: Epic 1 - `core` sans phrases, journal en clé + paramètres
FR8: Epic 1 - Gardes de sources pour AD-1
FR9: Epic 1 - Interrupteurs réunis dans `featureFlags.ts`
FR10: Epic 4 - Workflows de transition réels
FR11: Epic 4 - Schémas Goals réels
FR12: Epic 4 - Réglages et conflits sur deux postes
FR13: Epic 4 - Routes de boards et placement du bouton
FR14: Epic 4 - Étude des endpoints « enhanced »
FR15: Epic 5 - Canal de publication et de mise à jour
FR16: Epic 5 - Captures Store et revue de sécurité indépendante
FR17: Epic 8 - Sprint Planning retravaillé, validé sur instance réelle, puis activé dans le paquet
FR18: Epic 3 - Menu contextuel sur un ticket
FR19: Epic 6 - Export/import JSON des réglages
FR20: Epic 6 - Préférences personnelles entre postes
FR21: Epic 7 - WIP en points, minimums de colonne, sources Goals
FR22: Epic 5 - Déploiement `storage.managed` (déplacement clavier abandonné)
FR23: Epic 2 - Épinglage par sprint avec plusieurs sprints actifs
FR24: Epic 2 - Tickets reportés, via un filtre rapide « Reportés »

## Epic List

Ordre : l'Epic 1 précède les Epics 2, 3 et 6, qui écrivent dans Jira ; les Epics 4, 5 et 7 peuvent démarrer indépendamment.

### Epic 1: Des écritures Jira sûres et cohérentes
L'équipe déplace, rattache, épingle et publie sans jamais perdre de données d'un format plus récent ; deux gestes ne partent jamais en même temps sur le même board, chaque intention suit toujours le même ordre d'écritures, et les règles d'architecture sont vérifiées automatiquement.
**FRs covered:** FR1, FR2, FR3, FR4, FR5, FR6, FR7, FR8, FR9
*Notes :* une story par capacité de la spec, CAP-1 (FR1) en premier ; aucun changement visible sauf le refus d'un rattachement texte en conflit.

### Epic 2: Plusieurs sprints actifs, jusqu'au bout
Avec plusieurs sprints actifs, l'équipe épingle les Goals Atlassian du sprint de son choix et voit combien de tickets ont été reportés du sprint précédent.
**FRs covered:** FR23, FR24
*Notes :* après l'Epic 1 (E5 par la porte unique). FR24 : filtre rapide « Reportés », sans compteur dans l'en-tête, sprints étrangers exclus (Denis, 30/10/2026).

### Epic 3: Agir vite sur un ticket
Un clic droit sur une carte propose « Envoyer vers un goal », « Mettre en top priorité » et « Mettre en basse priorité ».
**FRs covered:** FR18
*Notes :* après l'Epic 1 (AD-2, AD-6). Top/basse priorité = tête/fin de la swimlane, tous sprints actifs confondus (Denis, 30/10/2026). Priorité = rang seulement, champ Priorité Jira non modifié (Denis, 30/10/2026).

### Epic 4: Fiable sur un vrai Jira
L'équipe peut se fier à l'extension sur des workflows réels (formulaires riches, plus de 100 liens Goals, deux postes, boards gérés par l'équipe) ; les endpoints « enhanced » sont étudiés avant décision.
**FRs covered:** FR10, FR11, FR12, FR13, FR14
*Notes :* en attente (Denis, 30/10/2026). Chaque essai réel nécessite l'autorisation de Denis (NFR9) ; livrable = constat, et correctif si nécessaire. FR17 (Sprint Planning) passe à l'Epic 8 (Denis, 31/10/2026).

### Epic 5: Diffuser plus largement
L'extension est publiée et mise à jour par un canal confirmé, avec des captures Store à jour, une revue de sécurité indépendante et un déploiement IT possible via `storage.managed`.
**FRs covered:** FR15, FR16, FR22
*Notes :* en attente (Denis, 30/10/2026).

### Epic 6: Des réglages qui suivent l'équipe
Une équipe exporte et importe les réglages d'un board en JSON avec aperçu des différences, et chacun retrouve ses préférences personnelles sur un autre poste.
**FRs covered:** FR19, FR20
*Notes :* en attente (Denis, 30/10/2026). FR20 suppose une nouvelle écriture (propriété utilisateur Jira), décision produit préalable ; l'import réécrit E6 et dépend de l'Epic 1.

### Epic 7: Piloter le flux en points
L'équipe règle ses limites WIP en points et des minimums par colonne, et voit les sources de Goals selon les capacités de son site.
**FRs covered:** FR21
*Notes :* en attente (Denis, 30/10/2026).

### Epic 8: Sprint Planning prêt à activer
L'équipe prépare son prochain sprint dans l'extension et publie objectifs et tickets du backlog sans conflit inutile ni geste refusé, et la fonction, validée sur un vrai Jira, est activée dans le paquet distribué.
**FRs covered:** FR17
*Notes :* créé le 31/10/2026 (Denis) : Sprint Planning est aujourd'hui une fonction cachée (`dist/` local et tests seulement). Reprend l'action 5 de la rétrospective de l'Epic 1 et les écarts du planning relevés pendant l'Epic 1. Périmètre produit inchangé (décision du 14/10/2026) : ni démarrage ni création de sprint, ni retrait de ticket, ni création de Goal.

## Epic 1: Des écritures Jira sûres et cohérentes

L'équipe déplace, rattache, épingle et publie sans jamais perdre de données d'un format plus récent ; deux gestes ne partent jamais en même temps sur le même board, chaque intention suit toujours le même ordre d'écritures, et les règles d'architecture sont vérifiées automatiquement. Chaque story est livrable seule, avec `npm run check` et `npm run verify:jira` verts, sans changement visible sauf le refus de la story 1.1.

### Story 1.1: Ne jamais perdre de données en écrivant `sprintgoals.v1`

As a membre de l'équipe qui rattache, épingle ou publie le planning,
I want que chaque écriture de la propriété des objectifs conserve ce qu'elle ne comprend pas et applique une seule règle de conflit,
So that une version plus récente de l'extension ou un collègue ne perde jamais de données.

**Acceptance Criteria:**

**Given** une propriété `sprintgoals.v1` dans une version de format inconnue
**When** un rattachement texte, un épinglage ou une publication du planning veut l'écrire
**Then** l'écriture est refusée et la propriété reste intacte
**And** un avis explique le refus, sans nouvelle tentative

**Given** un objectif portant un champ inconnu
**When** un rattachement texte est écrit
**Then** le champ inconnu est conservé tel quel dans le document écrit

**Given** un collègue a modifié un autre lien depuis la lecture
**When** j'écris mon lien
**Then** les deux liens sont présents après l'écriture (fusion sur Jira frais)

**Given** un collègue a modifié le même lien depuis la lecture
**When** j'écris mon lien
**Then** l'écriture est refusée avec « Ce ticket a été modifié par quelqu'un d'autre depuis le chargement. Le board a été rechargé ; recommence si besoin. »
**And** le board est relu, sans rejouer l'écriture
**And** seul `core/sprintGoals.ts` décode, encode et met à jour la propriété : `boardWrites.ts` (`readStoredDocument`, `DOCUMENT_KEYS`) et `sprintPlanning.ts` (`readGoalProperty`) passent par sa primitive de mise à jour

### Story 1.2: Un seul endroit décide où sont stockés les Goals épinglés

As a membre de l'équipe qui épingle des Goals,
I want que l'emplacement de l'épinglage soit choisi au même endroit pour tous les boards,
So that l'épinglage se comporte pareil en Scrum et en Kanban, et comme Jira sans sprint actif.

**Acceptance Criteria:**

**Given** un board Scrum avec sprint actif
**When** j'épingle ou relis les Goals épinglés
**Then** un résolveur unique de `core` choisit `sprintgoals.v1` du sprint

**Given** un board Kanban
**When** j'épingle ou relis les Goals épinglés
**Then** le même résolveur choisit `boardsettings.v1`

**Given** un board Scrum sans sprint actif
**When** j'ouvre l'épinglage
**Then** comme dans Jira, rien n'est possible : l'épinglage est indisponible, sans aucune écriture
**And** un test couvre les trois cas
**And** ni `BoardSettingsService` ni aucune vue ne testent `boardType` pour choisir la propriété

### Story 1.3: Une seule fonction par intention d'écriture

As a membre de l'équipe qui déplace une carte, la rattache à un Goal ou publie des réglages,
I want que chaque intention suive toujours la même séquence d'écritures, quel que soit le geste,
So that un nouveau geste ne puisse pas écrire dans un autre ordre.

**Acceptance Criteria:**

**Given** un déplacement qui change de colonne, de Goal et de rang
**When** il est exécuté
**Then** une fonction de `core` porte la séquence transition → Goal → rang, s'arrête au premier échec et rend un résultat partiel typé

**Given** un changement de Goal Atlassian
**When** il est exécuté
**Then** la séquence détacher → lier est portée par `core`, avec succès partiel signalé si seul le nouveau lien échoue

**Given** une publication des réglages partagés
**When** un collègue a modifié `boardsettings.v1` depuis la lecture
**Then** relecture et détection du conflit se font dans `core/teamSettings.ts`
**And** `BoardMovementService` et `BoardSettingsService` ne contiennent plus d'enchaînement d'écritures ni de détection de conflit
**And** `verify:drag` et `verify:settings` passent sans changement de comportement

### Story 1.4: Une seule porte d'écriture par board

As a membre de l'équipe qui enchaîne vite plusieurs gestes,
I want que deux écritures ne partent jamais en même temps sur un même board,
So that elles ne se marchent pas dessus sur un ticket ou une propriété.

**Acceptance Criteria:**

**Given** une écriture en cours sur un board (déplacement, rattachement texte, réglage ou publication du planning)
**When** je déclenche un second geste qui écrit
**Then** il attend la fin de la première, dans la file unique de `BoardModel`
**And** `core` ne reçoit jamais le `JiraTransport` brut, seulement le décorateur de la porte (péremption, droits), ce qu'un test vérifie
**And** `canEdit` ne conditionne que E6 ; E1–E5, E8 et E9 restent soumis aux droits Jira
**And** `BoardSettingsService.#teamQueue`, la file propre à `dropIssue` et le rattachement texte sans file disparaissent
**And** `PlanningModel` publie par cette porte et ne journalise plus lui-même

### Story 1.5: Les gardes de sources vérifient le sens des dépendances

As a développeur ou agent IA qui modifie le code,
I want que les tests échouent dès qu'une dépendance remonte dans le mauvais sens ou qu'un client Jira est construit au mauvais endroit,
So that la structure ne se dégrade plus sans qu'on le voie.

**Acceptance Criteria:**

**Given** le code livré, avec le contrat d'observation des lectures (`core/loadTrace.ts`) déplacé dans `src/jira/` et ses importeurs mis à jour
**When** `tests/guards/sources.test.ts` s'exécute
**Then** il passe sans exception tolérée

**Given** un import `jira → core` ajouté exprès
**When** les gardes s'exécutent
**Then** elles échouent en nommant le fichier fautif

**Given** une construction de `JiraTransport`, `JiraClient`, `GoalsClient` ou `AuditLog` hors de `AppModel`, `BoardModel` et `DiagnosticModel`
**When** les gardes s'exécutent
**Then** elles échouent

### Story 1.6: Les messages entre Jira et la vue sont déclarés une seule fois

As a développeur qui ajoute ou modifie un message entre l'hôte et la vue,
I want une liste unique des messages `sprint-goals:*`,
So that un message élargi d'un côté ne soit plus rejeté silencieusement de l'autre.

**Acceptance Criteria:**

**Given** `src/integration/messages.ts`, qui déclare chaque message avec son canal, son sens, sa charge utile et sa validation
**When** `embedded.ts`, `worker.ts`, `bootstrap.ts` ou `launcherChrome.ts` émettent ou reçoivent un message
**Then** ils utilisent cette liste, sauf impossibilité due à l'absence d'import de `bootstrap.ts`, auquel cas le doublon est nommé

**Given** la copie inévitable dans `injectBoard.ts`
**When** un type, un sens ou une validation diffère de la liste déclarée
**Then** un test échoue
**And** origine et fenêtre source restent vérifiées dans les deux sens, et `verify:jira` passe

### Story 1.7: La déconnexion efface vraiment toutes les données du site

As a utilisateur qui se déconnecte d'un site Jira,
I want qu'aucune donnée de ce site ne reste dans le navigateur,
So that rien ne survive à la déconnexion par oubli.

**Acceptance Criteria:**

**Given** les clés locales du tableau de [`docs/technique/donnees.md`](../../docs/technique/donnees.md)
**When** le code les lit ou les écrit
**Then** chaque clé a un module propriétaire unique : `connection.v1` et `launcher.v1` via `connectionStore`, `boards.v1` via `boardStore`
**And** le lanceur ne lit ni n'écrit aucune clé directement

**Given** des données enregistrées pour un site
**When** je me déconnecte
**Then** chaque module enregistré efface les données du site par `forgetSite(origin)`, et il n'en reste aucune
**And** un test confronte la liste des modules enregistrés au tableau des clés
**And** les formats existants restent lisibles (NFR3)

### Story 1.8: Le journal des écritures reste lisible dans toutes les langues

As a utilisateur qui consulte l'historique des modifications,
I want que chaque entrée s'affiche dans ma langue, y compris les anciennes,
So that le journal reste compréhensible quand je change de langue.

**Acceptance Criteria:**

**Given** une nouvelle écriture journalisée
**When** elle est enregistrée dans `audit.v1`
**Then** l'entrée stocke une clé du catalogue et ses paramètres, jamais une phrase

**Given** des entrées `audit.v1` existantes, enregistrées sous forme de phrases
**When** j'affiche le journal en français, anglais et espagnol
**Then** elles s'affichent comme avant
**And** un test de garde refuse une phrase utilisateur dans `src/core/` ; `sprintPlanning.ts` et `boardWrites.ts` renvoient des résultats typés

### Story 1.9: Tous les interrupteurs de fonction au même endroit

As a mainteneur qui livre le paquet du Store,
I want que toutes les fonctions masquées soient déclarées et fixées à la compilation au même endroit,
So that aucune fonction expérimentale ne s'active par erreur dans le paquet.

**Acceptance Criteria:**

**Given** `SPRINT_HEALTH_ENABLED` (`BoardView.tsx`) et `DIAGNOSTIC_ENABLED` (`DiagnosticView.tsx`)
**When** ils sont migrés
**Then** ils sont déclarés dans `app/featureFlags.ts` et gardés aux points d'entrée des modèles et services concernés, pas seulement dans la vue
**And** un test des modes de compilation couvre leur valeur dans `dist/` et dans le paquet
**And** décodage, conservation des formats et effacement ne dépendent jamais d'un interrupteur
**And** le comportement visible est inchangé : diagnostic actif, santé du sprint masquée

## Epic 2: Plusieurs sprints actifs, jusqu'au bout

Avec plusieurs sprints actifs, l'équipe épingle les Goals Atlassian du sprint de son choix et voit combien de tickets ont été reportés du sprint précédent. S'appuie sur les stories 1.2 (résolveur des épinglages) et 1.4 (porte d'écriture unique).

### Story 2.1: Épingler les Goals du sprint de mon choix

As a membre d'une équipe qui a plusieurs sprints actifs sur son board,
I want choisir, dans l'onglet Objectifs, le sprint dont j'épingle les Goals Atlassian,
So that chaque sprint garde ses propres Goals visibles même sans ticket.

**Acceptance Criteria:**

**Given** un board Scrum en source « Goals Atlassian » avec au moins deux sprints actifs du board
**When** j'ouvre l'onglet Objectifs des réglages
**Then** un choix du sprint est proposé, présélectionné sur le sprint principal (celui qui porte le titre du board)
**And** seuls les sprints du board y figurent, jamais les sprints étrangers

**Given** un sprint choisi
**When** je modifie les épinglages puis clique « Enregistrer dans Jira »
**Then** une seule écriture E5 part, sur la propriété `sprintgoals.v1` de ce sprint uniquement, par la porte d'écriture du board
**And** les épinglages des autres sprints sont inchangés, et le board relu les affiche tous

**Given** des modifications d'épinglage non enregistrées
**When** je veux choisir un autre sprint
**Then** le changement de sprint est bloqué tant que les modifications ne sont pas enregistrées ou annulées

**Given** un seul sprint actif, un board Kanban ou un Scrum sans sprint actif
**When** j'ouvre l'onglet Objectifs
**Then** aucun choix de sprint n'apparaît et le comportement actuel est conservé (sans sprint actif : règle de la story 1.2)
**And** un conflit ou un refus Jira conserve mes modifications, sans nouvelle tentative (NFR2)

### Story 2.2: Voir les tickets reportés du sprint précédent

As a Scrum Master qui démarre un sprint,
I want voir combien de tickets ont été reportés du sprint précédent, et lesquels,
So that la charge héritée est visible dès le début du sprint.

**Acceptance Criteria:**

**Given** un sprint actif du board contenant des tickets venus d'un sprint précédent du board terminé sans eux
**When** le board se charge
**Then** ces tickets sont reconnus comme reportés à partir de l'historique Sprint déjà lu (`sprintScope`), sans lecture Jira supplémentaire
**And** l'identification compare les identifiants de sprint (`from`/`to`), pas les noms

**Given** les tickets reportés reconnus
**When** j'affiche le board
**Then** un filtre rapide « Reportés », comme « Bloqués », indique leur nombre et ne garde que ces cartes quand il est actif
**And** aucun compteur n'est ajouté dans l'en-tête du sprint

**Given** plusieurs sprints actifs du board
**When** le filtre « Reportés » est actif
**Then** il combine les reportés de chaque sprint du board, et se combine avec le filtre Sprint

**Given** un ticket venu d'un sprint d'un autre board, ou d'un sprint étranger affiché
**When** le board se charge
**Then** il n'est pas compté comme reporté

**Given** un ticket ajouté depuis le backlog en cours de sprint, ou sans historique Sprint exploitable
**When** le board se charge
**Then** il n'est pas compté comme reporté ; l'indicateur « ajout » garde ses règles actuelles
**And** le libellé du filtre existe en français, anglais et espagnol (NFR10)

## Epic 3: Agir vite sur un ticket

Un clic droit sur une carte propose « Envoyer vers un goal », « Mettre en top priorité » et « Mettre en basse priorité ». Chaque action réutilise la fonction de `core` de son intention (story 1.3) et passe par la porte d'écriture unique (story 1.4) ; aucune écriture hors de E1–E9.

### Story 3.1: Ouvrir le menu d'un ticket et l'envoyer vers un goal

As a membre de l'équipe en Daily ou en affinage,
I want faire un clic droit sur une carte et choisir le goal où l'envoyer,
So that je rattache un ticket sans le glisser à travers le board.

**Acceptance Criteria:**

**Given** une carte du board
**When** je fais un clic droit dessus, ou Maj+F10 ou la touche Menu quand elle a le focus
**Then** un menu de l'extension s'ouvre près de la carte, à la place du menu du navigateur
**And** il se ferme par Échap, par un clic ailleurs ou après une action, et rend le focus à la carte
**And** il se parcourt au clavier et porte les rôles d'accessibilité d'un menu

**Given** le menu ouvert
**When** je choisis « Envoyer vers un goal »
**Then** la liste des objectifs visibles du board s'affiche, sans le goal actuel du ticket, avec « Retirer du goal » s'il en a un
**And** le choix utilise la même fonction de rattachement que le glisser-déposer (story 1.3), par la porte d'écriture du board

**Given** le board en Daily, en présentation ou avec une écriture en cours
**When** j'ouvre le menu d'une carte
**Then** les actions impossibles sont désactivées avec leur raison ; en Daily, comme pour le glissé, pas de changement de goal

**Given** un échec ou un résultat incertain
**When** le résultat arrive
**Then** la carte porte le même repère d'erreur qu'après un déplacement, sans nouvelle tentative, et le board est relu
**And** les libellés existent en français, anglais et espagnol (NFR10)

### Story 3.2: Mettre un ticket en top ou en basse priorité

As a Product Owner qui réordonne le travail,
I want envoyer un ticket en tête ou en fin de sa swimlane depuis son menu,
So that je change sa priorité sans le glisser.

**Acceptance Criteria:**

**Given** le menu d'une carte ouvert
**When** je choisis « Mettre en top priorité »
**Then** une seule écriture E2 classe le ticket avant le premier ticket de sa swimlane (objectif ou swimlane par type), tous sprints actifs confondus, dans l'ordre de rang Jira

**Given** le menu d'une carte ouvert
**When** je choisis « Mettre en basse priorité »
**Then** une seule écriture E2 classe le ticket après le dernier ticket de sa swimlane, tous sprints actifs confondus

**Given** un ticket déjà premier, ou déjà dernier, de sa swimlane
**When** j'ouvre son menu
**Then** l'action correspondante est désactivée et rien n'est écrit

**Given** un filtre actif qui masque des tickets de la swimlane
**When** je mets un ticket en top ou en basse priorité
**Then** le classement se fait par rapport à tous les tickets de la swimlane, pas seulement aux cartes visibles
**And** la réussite n'est annoncée qu'après confirmation de Jira ; un échec suit les règles de la story 3.1

*Décision (Denis, 30/10/2026) :* la priorité est le rang seulement ; le champ Priorité de Jira n'est pas modifié.

## Epic 4: Fiable sur un vrai Jira

**En attente (Denis, 30/10/2026) :** stories à écrire à la reprise de cet epic. Pistes déjà esquissées, non validées : transitions sur workflows réels (FR10), Goals sur volumes réels (FR11), réglages sur deux postes (FR12), routes et bouton selon les dispositions Jira (FR13), note de décision sur les lectures « enhanced » (FR14). La validation de Sprint Planning (FR17) passe à l'Epic 8. Chaque essai réel nécessite l'autorisation de Denis (NFR9).


## Epic 5: Diffuser plus largement

**En attente (Denis, 30/10/2026) :** stories rédigées, non engagées ; la question de la story 5.3 reste ouverte.

L'extension est publiée et mise à jour par un canal confirmé, avec des captures Store à jour, une revue de sécurité indépendante et, si le besoin se confirme, un déploiement IT. Aucune soumission au Store sans geste explicite de Denis ; préparer une version ne la publie pas.

### Story 5.1: Choisir le canal de publication et de mise à jour

As a mainteneur qui distribue l'extension,
I want un canal de publication et de mise à jour décidé et documenté,
So that les équipes reçoivent les nouvelles versions sans manipulation.

**Acceptance Criteria:**

**Given** les options : Store public, Store non répertorié, Store privé à un domaine Google Workspace, installation imposée par l'IT
**When** la décision est prise avec Denis
**Then** elle est consignée dans `docs/technique/developpement.md` : canal retenu, arrivée des mises à jour, qui peut installer
**And** `docs/store/fiche.md` et la politique de confidentialité sont alignées sur ce canal
**And** la ligne « Confirmer publication et canal » du backlog est fermée

### Story 5.2: Renouveler les captures du Store

As a équipe qui découvre l'extension sur le Store,
I want des captures qui montrent l'interface actuelle,
So that ce que je vois correspond à ce que j'installe.

**Acceptance Criteria:**

**Given** les captures de la 0.34.9 et l'interface actuelle (plusieurs sprints, filtre Sprint, réglages sans carte de langue)
**When** je lance `npm run store:screenshots` puis `npm run store:promotions`
**Then** les cinq captures 1280 × 800 et les deux promotions sont régénérées sur le banc en mode `package`, sans Sprint Planning
**And** `captures.json` et `promotions.json` portent la nouvelle version et les empreintes
**And** chaque image est vérifiée visuellement, et `docs/store/fiche.md` ne cite plus les captures 0.34.9

*Décision (Denis, 30/10/2026) :* pas de scénario plusieurs sprints ; les cinq sujets actuels sont conservés.

### Story 5.3: Revue de sécurité indépendante avant diffusion large

As a responsable qui autorise l'extension pour plusieurs équipes,
I want une revue de sécurité indépendante de la version à diffuser,
So that je diffuse en connaissant les risques.

**Acceptance Criteria:**

**Given** la version candidate et `docs/technique/securite.md`
**When** la revue est menée indépendamment du développement
**Then** elle couvre permissions, CSP, règle Origin, inventaire E1–E9, messages hôte ↔ vue, stockage local et dépendances, avec un `npm audit` relancé
**And** chaque constat reçoit un identifiant (S13 et suivants), un état et un correctif ou une décision, consignés dans `securite.md`
**And** aucun constat grave n'est ouvert au moment de la diffusion large

*Question ouverte :* « indépendante » = une personne extérieure, ou un outil lancé à part (par exemple `/security-review` de Claude Code) ?

### Story 5.4: Laisser l'IT préconfigurer l'extension

**En attente (Denis, 30/10/2026).** Si le besoin de déploiement IT se confirme : politique `storage.managed` imposant le site Jira (et éventuellement les boards), permission du site toujours demandée au clic, politique invalide ignorée avec un avis, comportement inchangé sans politique. L'ajout de `storage.managed_schema` au manifest est une décision produit préalable (NFR1).

## Epic 6: Des réglages qui suivent l'équipe

**En attente (Denis, 30/10/2026) :** stories à écrire à la reprise de cet epic. Pistes esquissées, non validées : export JSON des réglages partagés (FR19), import avec validation locale, aperçu des différences et une seule écriture E6 par la porte du board (FR19), préférences personnelles entre postes via une propriété utilisateur Jira, nouvelle écriture soumise à décision produit (FR20). Questions à reprendre : auteur (`publishedBy`) dans l'export, import depuis un autre board, préférences concernées.

## Epic 7: Piloter le flux en points

**En attente (Denis, 30/10/2026) :** stories à écrire à la reprise de cet epic. Pistes : limites WIP exprimées en points, minimums de colonne, présentation des sources de Goals selon les capacités du site (FR21).


## Epic 8: Sprint Planning prêt à activer

L'équipe prépare son prochain sprint dans l'extension et publie objectifs et tickets du backlog sans conflit inutile ni geste refusé, puis la fonction, validée sur un vrai Jira, est activée dans le paquet distribué. Aujourd'hui, Sprint Planning n'existe que dans les builds locaux `dist/` et les tests (`SPRINT_PLANNING_ENABLED`, `vite.config.ts`). Périmètre produit inchangé (décision du 14/10/2026) : préparation locale, relecture avant écriture, publication explicite du texte `goal` et de l'ajout de tickets du backlog à un sprint futur ; ni démarrage ni création de sprint, ni retrait de ticket, ni création de Goal.

**Proposé (31/10/2026), à valider par Denis :** stories issues de la rétrospective de l'Epic 1 (F5, partiel 1.4-a), du travail différé (`deferred-work.md`) et de FR17. Ordre : les corrections d'abord, l'essai réel ensuite, l'activation en dernier.

### Story 8.1: Publier le planning sans refuser un changement sans rapport

As a Scrum Master qui publie son planning,
I want que la publication n'échoue pas parce qu'un collègue a rattaché un autre ticket entre-temps,
So that je ne refais pas mon planning pour un changement qui ne le concerne pas.

*Décision à prendre en ouvrant la story (action 5 de la rétrospective de l'Epic 1) :* aujourd'hui, tout changement de la propriété du sprint depuis le chargement refuse la publication (`src/core/sprintPlanning.ts`, comparaison du document entier). Option proposée : fusionner comme les autres écritures de `sprintgoals.v1` (FR1) les changements hors de la zone du planning, et refuser seulement si les objectifs ou les liens des tickets publiés ont changé. Option alternative : garder le refus et l'inscrire dans `SPEC.md` et la note d'architecture.

**Acceptance Criteria (option proposée) :**

**Given** un planning prêt et un autre ticket rattaché dans Jira depuis le chargement
**When** je publie
**Then** la publication part, et le rattachement du collègue est conservé

**Given** un objectif du sprint ou le lien d'un ticket publié modifié dans Jira depuis le chargement
**When** je publie
**Then** rien n'est écrit, mon brouillon est conservé et le conflit est expliqué (NFR2)

### Story 8.2: Le planning attend son tour au lieu d'être refusé

As a membre de l'équipe qui publie le planning pendant qu'une autre écriture du board est en cours,
I want que la publication attende la fin de l'écriture en cours,
So that je n'ai pas à recommencer un geste refusé pour une simple simultanéité.

**Acceptance Criteria:**

**Given** une écriture du board en cours (déplacement, réglage, épinglage)
**When** je publie le planning
**Then** la publication attend la porte du board, puis part, une seule fois

**Given** le board quitté ou rechargé avant l'envoi
**When** la publication est abandonnée
**Then** le journal indique « rien n'a été envoyé à Jira », et non un résultat incertain

### Story 8.3: Avis du planning traduits dans les trois langues

As a utilisateur anglophone ou hispanophone,
I want que les avis du Sprint Planning soient dans ma langue,
So that je comprends un conflit ou une publication partielle sans deviner.

**Acceptance Criteria:**

**Given** un avis du planning (conflit, publication partielle, refus)
**When** l'interface est en anglais ou en espagnol
**Then** l'avis est produit en clés du catalogue avec paramètres, comme le journal, et vérifié par des tests en/es (NFR10)

### Story 8.4: Valider le Sprint Planning sur un vrai Jira

As a Denis, responsable de la diffusion,
I want un essai réel du Sprint Planning (droits, volumes),
So that son activation repose sur un constat et non sur le seul Jira fictif.

**Acceptance Criteria:**

**Given** l'autorisation de Denis et un site Jira de test (NFR9)
**When** le planning est préparé et publié avec et sans droit de gérer les sprints, sur un backlog volumineux
**Then** le constat (réussites, refus, limites de volume) est consigné, et chaque défaut trouvé devient une story ou un correctif

### Story 8.5: Activer le Sprint Planning dans le paquet

As a équipe qui installe l'extension depuis le paquet distribué,
I want trouver Sprint Planning,
So that je prépare mes sprints sans build local.

**Acceptance Criteria:**

**Given** les stories 8.1 à 8.4 terminées et le constat de 8.4 favorable
**When** le paquet est construit (`npm run package`)
**Then** `SPRINT_PLANNING_ENABLED` vaut vrai dans le paquet, `npm run verify:planning:package` le vérifie, et AGENTS.md, le manuel, le CHANGELOG et les captures Store sont à jour
