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
  - "Sprint Planning en direct (Denis, 01/11/2026) : remplace la décision produit du 14/10/2026 ; Epic 8 redéfinie depuis _bmad-output/forge/sprint-planning-complet/forged-idea.md (proposition sprint-change-proposal-2026-11-01.md)."
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
FR17: Sprint Planning planifie le prochain sprint en direct dans Jira : chaque geste écrit aussitôt ; objectifs selon la source du board (texte, ou Goals Atlassian cherchés et épinglés) ; tickets pris dans le backlog et les sprints futurs du board, retirés seulement du sprint en préparation ; clôture et démarrage par les fenêtres natives Jira, avec report des objectifs non atteints ; vélocité partagée ; estimation d'un ticket pendant la séance. Il est validé sur une instance réelle avant son activation dans le paquet ; création de sprint et création de Goals restent hors périmètre.

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

NFR1: Écritures métier limitées à l'inventaire fermé E1–E9 de `src/jira/writes.ts` ; aucun nouvel endpoint d'écriture, hôte, droit Chrome ni assouplissement de CSP sans décision produit explicite et vérification du contrat Atlassian ; ne pas inventer d'API. Exception décidée le 01/11/2026 : retour d'un ticket au backlog depuis le sprint en préparation (E10), sous réserve de la vérification du contrat (story 8.1).
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
FR17: Epic 8 - Sprint Planning en direct dans Jira, validé sur instance réelle, puis activé dans le paquet
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
*Notes :* après l'Epic 1 (AD-2, AD-6). Top/basse priorité = tête/fin de la swimlane (Denis, 30/10/2026), dans le sprint du ticket quand plusieurs sont affichés (Denis, 31/10/2026). Priorité = rang seulement, champ Priorité Jira non modifié (Denis, 30/10/2026).

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

### Epic 8: Sprint Planning en direct dans Jira
L'équipe clôture son sprint, construit le suivant par objectifs avec des tickets trouvés partout sur le board, puis le démarre, sans quitter l'extension ; chaque geste est aussitôt dans Jira, et la fonction, validée sur un vrai Jira, est activée dans le paquet distribué.
**FRs covered:** FR17
*Notes :* créé le 31/10/2026, redéfini le 01/11/2026 (Denis) depuis [forged-idea.md](../forge/sprint-planning-complet/forged-idea.md), qui remplace la décision du 14/10/2026. Création de sprint et de Goals hors périmètre. Droits (lecture seule annoncée ou découverte au premier refus) : décision en attente. Écran de référence : maquette v2. Complété le 02/11/2026 (Denis, retours d'essai) par les stories 8.12 à 8.18 ; décision produit du même jour : l'estimation d'un ticket s'écrit depuis le planning (E11, story 8.17), sous réserve de la vérification du contrat Atlassian.

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

**Given** une écriture en cours
**When** j'ouvre le menu d'une carte
**Then** les actions sont désactivées avec leur raison ; en Daily et en présentation, toutes restent permises (Denis, 31/10/2026)

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
**Then** une seule écriture E2 classe le ticket avant le premier ticket de sa swimlane (objectif ou swimlane par type), toutes colonnes confondues, dans l'ordre de rang Jira ; avec plusieurs sprints, parmi les tickets de son sprint, seul ordre affiché

**Given** le menu d'une carte ouvert
**When** je choisis « Mettre en basse priorité »
**Then** une seule écriture E2 classe le ticket après le dernier ticket de sa swimlane, avec la même règle de sprint

**Given** un ticket déjà premier, ou déjà dernier, de sa swimlane
**When** j'ouvre son menu
**Then** l'action correspondante est désactivée et rien n'est écrit

**Given** un filtre actif qui masque des tickets de la swimlane
**When** je mets un ticket en top ou en basse priorité
**Then** le classement se fait par rapport à tous les tickets de la swimlane, pas seulement aux cartes visibles
**And** la réussite n'est annoncée qu'après confirmation de Jira ; un échec suit les règles de la story 3.1

*Décision (Denis, 30/10/2026) :* la priorité est le rang seulement ; le champ Priorité de Jira n'est pas modifié.
*Décisions (Denis, 31/10/2026) :* classement dans le sprint du ticket, au plus simple (ordre de lecture de Jira, sans lire le champ de rang) ; une sous-tâche se classe parmi les sous-tâches de son parent.

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


## Epic 8: Sprint Planning en direct dans Jira

L'équipe clôture son sprint, construit le suivant par objectifs avec des tickets trouvés partout sur le board, puis le démarre. Chaque geste écrit aussitôt dans Jira, qui reste la seule source : la page se reconstruit à l'entrée depuis le texte de l'objectif du sprint, la propriété `sprintgoals.v1` et les tickets du sprint. Aujourd'hui, Sprint Planning n'existe que dans les builds locaux `dist/` et les tests (`SPRINT_PLANNING_ENABLED`) ; il le reste jusqu'à la story 8.11. Décisions : [forged-idea.md](../forge/sprint-planning-complet/forged-idea.md) ; écran : maquette v2.

Ordre : contrats d'abord, écran et objectifs ensuite, clôture et démarrage, puis les compléments issus des premiers essais (8.12 à 8.18), et enfin essai réel et activation. Les numéros 8.12 à 8.18 se jouent avant 8.10 et 8.11.

### Story 8.1: Vérifier les contrats Atlassian du planning en direct

As a Denis, responsable des écritures autorisées,
I want que chaque nouvel usage d'une API Jira soit vérifié dans la documentation officielle avant d'être codé,
So that le planning n'invente aucune API.

**Acceptance Criteria:**

**Given** les références officielles Jira Software Cloud (Sprint, Board, Backlog)
**When** les usages suivants sont vérifiés : retour au backlog (`POST /rest/agile/1.0/backlog/issue`), ajout à un sprint futur d'un ticket venant d'un autre sprint (E9), fenêtres natives « Terminer le sprint » et « Démarrer le sprint » atteignables depuis le backlog Jira, droits Jira requis par E5, E8, E9 et E10
**Then** le constat (contrat, limites, droits) est consigné dans `docs/technique/`, E10 est ajouté à l'inventaire de `securite.md` si le contrat le permet, et tout usage non confirmé devient une décision à reprendre avec Denis

### Story 8.2: L'écran du planning parle comme la page du sprint

As a Scrum Master,
I want un planning qui reprend la barre latérale, l'en-tête, les filtres, les swimlanes et les cartes de la page du sprint,
So that je n'apprends pas un second écran.

**Acceptance Criteria:**

**Given** un board Scrum avec des sprints futurs
**When** j'ouvre Sprint Planning
**Then** la barre latérale garde le choix du board et liste les objectifs prévus, le sprint préparé est le titre de l'en-tête avec le menu des sprints futurs, et la page est lue dans Jira (objectifs, tickets, propriété), sans brouillon local

**Given** la colonne de gauche
**When** je cherche un ticket
**Then** les sprints futurs du board, le backlog et le reste à faire du sprint actif (consultation) sont regroupés, filtrés par les mêmes filtres que la page du sprint, sans le sprint en préparation dont les tickets sont dans la zone principale

**Given** des tickets du sprint sans objectif
**When** la page s'affiche
**Then** ils apparaissent après les swimlanes d'objectifs

**Given** d'anciens brouillons `sprint-planning.v1`
**When** le planning en direct s'ouvre
**Then** ils ne sont plus appliqués ; leur sort (synthèse copiable une fois puis effacement, ou effacement) suit la décision de Denis prise en ouvrant la story

### Story 8.3: Écrire les objectifs texte du sprint au fil de la séance

As a Scrum Master sur un board en « Texte du sprint »,
I want que l'ajout, le renommage, la suppression et le déplacement d'un objectif soient aussitôt dans Jira,
So that l'équipe voit le même sprint que moi.

**Acceptance Criteria:**

**Given** un objectif ajouté, supprimé ou déplacé
**When** le geste est fait
**Then** le texte de l'objectif du sprint (E8) puis la propriété (E5) sont écrits, une seule fois chacun, par la porte du board

**Given** un objectif renommé
**When** je valide le champ (Entrée ou sortie du champ)
**Then** E8 puis E5 sont écrits en gardant l'identifiant de l'objectif et ses tickets ; Échap annule sans écriture

**Given** le texte de l'objectif du sprint modifié dans Jira depuis l'affichage
**When** je fais un geste sur les objectifs
**Then** rien n'est écrit, la page est mise à jour depuis Jira et l'avis demande de refaire la modification

**Given** E8 confirmé puis E5 en échec
**When** le geste se termine
**Then** l'étape confirmée est indiquée, sans nouvelle tentative ni annonce de réussite

### Story 8.4: Poser un ticket sur un objectif l'ajoute au sprint

As a PO qui a réparti ses tickets sur plusieurs sprints au PI Planning,
I want prendre un ticket du backlog ou d'un autre sprint futur et le poser sur un objectif,
So that il entre dans le sprint en préparation d'un seul geste.

**Acceptance Criteria:**

**Given** un ticket du backlog ou d'un autre sprint futur du board
**When** je le pose sur un objectif (glisser-déposer ou menu ⋯)
**Then** il est ajouté au sprint en préparation (E9) puis rattaché (E5 en texte, E3 en Goals Atlassian), sans alerte, et sa carte indique d'où il vient

**Given** un ticket du sprint en préparation
**When** je le renvoie au backlog ou vers un autre sprint futur
**Then** il en sort (E10 ou E9) ; aucun retrait n'est possible depuis un autre sprint, depuis le sprint actif, ni une fois le sprint démarré

**Given** un ticket du reste à faire du sprint actif
**When** il est affiché à gauche
**Then** il est en consultation seulement

### Story 8.5: Préparer le sprint avec les Goals Atlassian

As a Scrum Master sur un board en Goals Atlassian,
I want chercher par nom les Goals créés en amont et les ajouter au sprint,
So that le planning et le board montrent les mêmes objectifs.

**Acceptance Criteria:**

**Given** un board en Goals Atlassian
**When** je cherche un Goal par son nom et l'ajoute
**Then** il est épinglé sur le sprint en préparation (E5), et ses tickets s'y rattachent par E3/E4 ; le planning ne crée aucun Goal

### Story 8.6: Vélocité partagée du sprint

As a équipe qui prépare son sprint sur plusieurs postes,
I want une vélocité visible et identique pour tous,
So that la charge se lit pareil chez chacun.

**Acceptance Criteria:**

**Given** le champ « Vélocité de l'équipe » de l'en-tête
**When** je valide une valeur
**Then** elle est écrite dans `sprintgoals.v1` (E5) et la charge du sprint s'y compare ; une propriété sans ce champ reste lisible et n'affiche pas de vélocité

### Story 8.7: Clôturer le sprint actif et reporter ses objectifs non atteints

As a Scrum Master en début de séance,
I want clôturer le sprint actif depuis le planning,
So that son reste à faire et ses objectifs non atteints arrivent dans le sprint que je prépare.

**Acceptance Criteria:**

**Given** un sprint actif sur le board
**When** je clique « Clôturer le Sprint N »
**Then** la fenêtre native « Terminer le sprint » de Jira s'ouvre ; l'utilisateur seul la remplit et valide

**Given** la fenêtre fermée et le sprint relu clos
**When** l'extension relit Jira
**Then** chaque objectif non atteint (tickets pas tous dans la dernière colonne) est reporté dans le sprint en préparation : texte et propriété avec les liens de ses tickets en mode texte, épinglage en Goals Atlassian ; un ticket envoyé ailleurs par la fenêtre native est respecté

**Given** la fenêtre annulée
**When** l'extension relit Jira
**Then** rien n'est reporté

### Story 8.8: Démarrer le sprint préparé

As a Scrum Master en fin de séance,
I want démarrer le sprint préparé depuis le planning,
So that la séance se termine sans quitter l'extension.

**Acceptance Criteria:**

**Given** aucun sprint actif
**When** je clique « Démarrer le Sprint N »
**Then** la fenêtre native « Démarrer le sprint » de Jira s'ouvre ; l'extension n'écrit rien et relit l'état du sprint à la fermeture

**Given** un sprint encore actif
**When** l'en-tête s'affiche
**Then** « Démarrer » est désactivé avec sa raison

### Story 8.9: Avis du planning dans les trois langues

As a utilisateur anglophone ou hispanophone,
I want que les avis du Sprint Planning soient dans ma langue,
So that je comprends un conflit ou une écriture partielle sans deviner.

**Acceptance Criteria:**

**Given** un avis du planning (conflit, écriture partielle, refus, fenêtre native)
**When** l'interface est en anglais ou en espagnol
**Then** l'avis est produit en clés du catalogue avec paramètres et vérifié par des tests en/es (NFR10)

### Story 8.10: Valider le Sprint Planning sur un vrai Jira

As a Denis, responsable de la diffusion,
I want un essai réel du planning en direct (droits, volumes, fenêtres natives),
So that son activation repose sur un constat.

**Acceptance Criteria:**

**Given** l'autorisation de Denis et un site Jira de test (NFR9)
**When** un cycle complet est joué (clôture, report, objectifs, tickets venant de plusieurs sprints, déplacement groupé, retrait, vélocité, estimation, démarrage), avec et sans droit de gérer les sprints, sur un backlog volumineux
**Then** le constat est consigné, et chaque défaut devient une story ou un correctif ; la décision sur les droits est prise à partir de ce constat

### Story 8.11: Activer le Sprint Planning dans le paquet

As a équipe qui installe l'extension depuis le paquet distribué,
I want trouver Sprint Planning,
So that je planifie mes sprints sans build local.

**Acceptance Criteria:**

**Given** les stories 8.1 à 8.10 et 8.12 à 8.18 terminées et le constat de 8.10 favorable
**When** le paquet est construit (`npm run package`)
**Then** `SPRINT_PLANNING_ENABLED` vaut vrai dans le paquet, `npm run verify:planning:package` le vérifie, et AGENTS.md, le manuel, le CHANGELOG et les captures Store sont à jour

### Story 8.12: La carte du planning montre le type et le statut du ticket

As a équipe en séance de planning,
I want reconnaître d'un coup d'œil le type et l'état d'un ticket sur sa carte,
So that je n'ouvre pas la fiche pour savoir si c'est un bug ou s'il est déjà commencé.

**Acceptance Criteria:**

**Given** une carte du planning (sprint en préparation, sources ou consultation)
**When** elle s'affiche
**Then** elle montre l'icône Jira du type de ticket, et celle de sa priorité si elle existe, par le même composant et le même cache d'images que la carte du board (`JiraIcon`), avec la lettre du type si l'image manque

**Given** une carte du planning
**When** elle s'affiche
**Then** elle montre le nom du statut Jira, teinté selon sa catégorie (à faire, en cours, terminé), sur toutes les cartes et plus seulement en consultation, sans nouvelle lecture Jira

*Notes :* retour d'essai du 02/11/2026 (points 4 et 5). Aucune écriture.

### Story 8.13: Ouvrir le menu d'une carte du planning au clic droit

As a Scrum Master habitué au menu de carte du board,
I want ouvrir le menu d'une carte du planning au clic droit,
So that je pose un ticket sur un objectif sans viser le petit bouton ⋯.

**Acceptance Criteria:**

**Given** une carte du planning qui n'est pas en consultation
**When** je fais un clic droit dessus, ou j'appuie sur la touche Menu ou Maj+F10 avec le focus sur la carte
**Then** le même menu que ⋯ s'ouvre à cet endroit (objectifs, « Sans objectif », retour au backlog, autres sprints futurs), comme le menu de carte du board ; Échap le referme et rend le focus

**Given** une carte en consultation
**When** je fais un clic droit dessus
**Then** aucun menu de l'extension ne s'ouvre

*Notes :* retour d'essai du 02/11/2026 (point 3). Mêmes écritures que le menu ⋯ (8.4).

### Story 8.14: Filtrer le planning comme la page du sprint

As a PO qui cherche les tickets d'une personne, d'un type ou d'un epic,
I want les mêmes filtres que sur la page du sprint,
So that je trouve vite les tickets à planifier.

**Acceptance Criteria:**

**Given** la barre de filtres du planning
**When** elle s'affiche
**Then** elle propose, en plus de la recherche `/`, les menus de la page du sprint (Personne, Type, Parent, Statut et Label), la pastille « Bloqués » (lien Jira « est bloqué par », règle du board) et les filtres rapides du board Jira, avec les mêmes composants

**Given** un filtre actif
**When** la page s'affiche
**Then** il s'applique aux swimlanes, à « Sans objectif » et à la colonne « Où sont les tickets » ; les totaux d'un objectif et la charge du sprint restent calculés sans filtre, comme avec la recherche

**Given** un filtre rapide du board Jira actif
**When** la page s'affiche
**Then** son JQL est évalué par Jira sur le sprint en préparation, les autres sprints futurs, le backlog et le reste à faire du sprint actif (lecture seule), plusieurs filtres se combinant en intersection

*Notes :* retour d'essai du 02/11/2026 (point 1). Prévu par la story 8.2 mais livré avec la seule recherche. Décision de Denis (02/11/2026) : Priorité et Composant, retirés de la page du sprint en 0.14.2, ne sont pas repris ; « Bloqués » est proposé ; « Ajoutés » et « Reportés », sans objet avant le démarrage, ne le sont pas. Livrée en 0.43.0 : périmètre du planning `inPlanningScope` dans `core/jql.ts` (sprints du board et backlog), sans changer celui du board.

### Story 8.15: Déplacer plusieurs tickets ensemble

As a Scrum Master qui répartit un lot de tickets,
I want sélectionner plusieurs tickets et les poser d'un seul geste sur un objectif,
So that je ne répète pas le même glisser-déposer dix fois.

**Acceptance Criteria:**

**Given** des cartes du planning
**When** je fais Ctrl+clic (Cmd+clic sur macOS) ou Maj+clic (plage dans la même section)
**Then** les cartes sont sélectionnées, leur nombre est affiché, Échap vide la sélection, et une carte en consultation (sous-tâche, ticket terminé, reste à faire du sprint actif) n'est pas sélectionnable

**Given** une sélection
**When** je la glisse, ou j'utilise le menu de l'une de ses cartes, vers un objectif, « Sans objectif », le backlog ou un autre sprint futur
**Then** les tickets absents du sprint en préparation y sont ajoutés en une seule écriture E9 (ou renvoyés par une seule E10, ou une seule E9 vers l'autre sprint), puis rattachés : une seule écriture E5 en texte, un lien E3 par ticket (après E4 si besoin) en Goals Atlassian

**Given** une écriture du lot en échec
**When** le geste s'arrête
**Then** rien n'est rejoué, Jira est relu, et l'avis indique les tickets confirmés et ceux qui restent à refaire

**Given** un lot de plus de 50 tickets
**When** je le dépose
**Then** il est refusé avant toute écriture, avec un avis (limite de E9 et E10)

*Notes :* retour d'essai du 02/11/2026 (point 2). Nouvelle fonction de `core` par intention (AD-2) pour le lot, à côté de `placePlanningIssue` et `removePlanningIssue`.

### Story 8.16: Voir l'avancement de chaque objectif

As a équipe qui reprend un objectif reporté ou un Goal sur plusieurs sprints,
I want voir où en est chaque objectif, y compris ce qui a déjà été livré avant ce sprint,
So that je dimensionne ce qu'il reste vraiment à faire.

**Acceptance Criteria:**

**Given** une swimlane d'objectif
**When** elle s'affiche
**Then** son en-tête montre la répartition de ses tickets dans le sprint en préparation (à faire, en cours, terminé), en tickets et en points, dans la grammaire de l'avancement de la page du sprint

**Given** un objectif texte reporté (même identifiant dans la propriété des sprints clos précédents)
**When** la swimlane s'affiche
**Then** elle indique aussi les tickets déjà terminés rattachés à cet objectif dans les sprints clos, en remontant la chaîne des reports tant que l'identifiant y figure, sans les compter dans la charge du sprint

**Given** un Goal Atlassian épinglé
**When** la swimlane s'affiche
**Then** elle indique les tickets liés au Goal déjà terminés hors du sprint en préparation, lus dans ses `workItems`, signale une lecture incomplète, et ne les compte pas dans la charge du sprint

*Notes :* retour d'essai du 02/11/2026 (point 6). Lectures seulement (propriétés des sprints clos, Goals) ; nombre de sprints relus et coût à mesurer en 8.10.

### Story 8.17: Estimer un ticket pendant la séance

As a équipe qui chiffre ses stories en Sprint Planning,
I want saisir l'estimation d'un ticket directement sur sa carte,
So that la charge du sprint se met à jour sans ouvrir chaque fiche.

**Acceptance Criteria:**

**Given** la décision produit de Denis du 02/11/2026 (écrire l'estimation depuis le planning)
**When** la story commence
**Then** le contrat est vérifié dans la documentation officielle Atlassian (candidat : `PUT /rest/agile/1.0/issue/{issueIdOrKey}/estimation?boardId=`, qui vise le champ d'estimation du board ; sinon `PUT /rest/api/3/issue/{issueIdOrKey}` limité à ce seul champ), avec ses droits et ses limites ; E11 entre alors dans l'inventaire fermé de `jira/writes.ts` et dans `securite.md`, et la règle « Écritures métier » d'AGENTS.md est complétée ; tout usage non confirmé revient à Denis

**Given** un board dont le champ d'estimation est connu, et un ticket du sprint en préparation ou d'une source
**When** je clique sur l'estimation de la carte (« ? » si elle est vide), saisis une valeur et valide (Entrée ou sortie du champ)
**Then** E11 est écrit une seule fois par la porte du board, puis le ticket est relu ; la carte et la charge affichent la valeur relue ; Échap annule sans écriture ; une valeur inchangée n'écrit rien

**Given** une estimation modifiée dans Jira depuis l'affichage, un refus de Jira ou un résultat incertain
**When** le geste se termine
**Then** rien n'est rejoué, la valeur de Jira est affichée, et l'avis le dit sans annoncer de réussite

**Given** un board sans champ d'estimation (unité « tickets »), un ticket en consultation, ou un champ non modifiable pour ce ticket
**When** la carte s'affiche
**Then** l'estimation n'est pas modifiable, et la fiche native reste le recours

*Notes :* retour d'essai du 02/11/2026 (point 7, option « saisie sur la carte »). Nouvel endpoint d'écriture : la décision produit est prise, la vérification du contrat reste préalable. Avis en clés de catalogue en/es (8.9).

### Story 8.18: Clôturer le bon sprint et toujours dire ce qui a été reporté

As a Scrum Master d'un board à plusieurs sprints actifs,
I want choisir le sprint que je clôture et voir ce que le report a fait,
So that les objectifs non atteints du bon sprint arrivent dans celui que je prépare.

**Acceptance Criteria:**

**Given** plusieurs sprints actifs sur le board
**When** je veux clôturer depuis le planning
**Then** je choisis le sprint actif à clôturer (et non le premier renvoyé par Jira), son nom figure sur le geste et dans la fenêtre native, et le report lit les objectifs de ce sprint

**Given** la fenêtre native fermée
**When** le sprint relu est encore actif
**Then** son état est relu pendant une durée bornée (une dizaine de secondes) avant de conclure ; ce sont des lectures, aucune écriture n'est rejouée

**Given** une clôture demandée depuis le planning
**When** le report se termine, quel que soit son résultat (reporté, rien à reporter, sprint encore actif, refus, échec)
**Then** un compte rendu reste affiché jusqu'à ce que je le ferme : objectifs reportés, objectifs non reportés avec leur raison (aucun ticket rattaché, tous terminés, déjà présents), tickets rattachés ; il est aussi inscrit au journal des écritures, en clés de catalogue en/es

**Given** le banc fictif `verify:planning`
**When** un board a deux sprints actifs dont le second porte les objectifs
**Then** la clôture de ce second sprint reporte ses objectifs non atteints, et une clôture lente côté Jira est couverte par un test de non-régression

*Notes :* retour d'essai du 02/11/2026 : deux sprints actifs, clôture par le bouton du planning, objectifs avec tickets non tous terminés, aucun objectif reporté et aucun message. Causes possibles relevées dans le code : premier sprint actif seul visé (`PlanningModel.ts`, `activeSprint`), relecture unique de l'état du sprint juste après la fermeture de la fenêtre, message effacé par le geste suivant. Cause exacte à confirmer par les traces `Sprint Goals —` de la console lors du prochain essai.
