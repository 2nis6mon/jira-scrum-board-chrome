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
  - "Bilan des Sprint Goals d'un sprint fermé (Denis, 06/11/2026) : Epic 9, en lecture seule, mode texte du sprint d'abord ; issue d'un bilan manuel du board 3013 (sprints Accueil-26T3.5 à Accueil-26T4.1)."
  - "Epic 11, migration du code de GitHub vers le GitLab de l'entreprise (Denis, 25/11/2026, table ronde) : le dépôt GitHub s'est révélé public avec des données de l'entreprise ; code et site sont séparés, le domaine ne change pas sans décision ; la propriété du code reste dans l'Epic 5."
  - "Epic 9 complétée (Denis, 25/11/2026, table ronde) : terminé = dernière colonne comme le report 8.7, objectif sans ticket = Pas de données, sous-tâches comptées sous le Goal du parent, objectifs masqués retirés, objectif du texte natif absent de la propriété = Pas de données, bilan proposé en fin de clôture, report des objectifs sans ticket ; stories 9.7 à 9.9 ajoutées."
  - "Epic 8 terminée (Denis, 25/11/2026) : les stories de droits 8.36 à 8.39, non faites, passent dans l'Epic 12, Sprint Planning V2, renumérotées 12.1 à 12.4."
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

Ajouts de Denis (06/11/2026), bilan des Sprint Goals :

FR25: Pour un sprint fermé du board en mode « texte du sprint », l'extension affiche un tableau à deux colonnes, « Sprint Goals {nom du sprint} » et « OK / KO », avec une ligne par objectif de la propriété `sprintgoals.v1` de ce sprint (dans l'ordre `position`) ; une ligne OK est en vert ; sous chaque objectif, ses tickets et leur état à la fermeture.
FR26: Le verdict se calcule à la date de fermeture du sprint (`completeDate`) : un ticket compte s'il est rattaché à l'objectif (`links`, ou celui de son parent pour une sous-tâche sans lien propre, comme sur le board) et était dans le sprint à cette date (historique du champ Sprint) ; il est terminé si son statut à cette date (historique du statut, à la seconde) est dans la dernière colonne du board, comme pour le report des objectifs non atteints (colonnes du board au jour du bilan, indiqué comme tel) ; un ticket dont le statut n'est dans aucune colonne n'est pas compté ; OK = tous les tickets comptés terminés, KO sinon ; objectif sans ticket compté = « Pas de données » ; les objectifs masqués du board sont retirés (Denis, 25/11/2026).
FR27: L'utilisateur choisit un ou plusieurs sprints fermés du board et obtient un tableau par sprint, du plus ancien au plus récent ; un sprint sans objectif (texte natif vide, propriété absente ou sans objectif) affiche « Pas de données ».
FR28: Le bilan affiché peut être gardé ou partagé hors de l'extension (copie ou export, format à décider), sans rien écrire dans Jira.
FR29: Le menu de filtre Parent permet de chercher un parent par texte (clé ou résumé) parmi ceux du sprint, car un sprint peut en compter beaucoup (Sprint Board et Sprint Planning).
FR30: Le report des objectifs non atteints et le bilan appliquent une seule règle d'atteinte (atteint, non atteint, pas de données) ; à la clôture, le report reporte aussi un objectif sans ticket, et le Sprint Planning propose le bilan du sprint qui vient d'être clôturé (Denis, 25/11/2026).
FR31: Le code de l'extension n'est plus exposé publiquement : le dépôt GitHub devient privé ou est archivé, et le site public (vitrine, guides, politique de confidentialité) se publie depuis un dépôt dédié qui ne contient que le site construit, sans lien cassé pour les utilisateurs du Store.
FR32: Le dépôt est hébergé sur le GitLab de l'entreprise, devenu `origin`, avec son historique complet, une branche d'intégration protégée (`develop`, seule branche du dépôt GitLab, qui prend le rôle de notre `main`) et des règles de push respectées.
FR33: GitLab CI exécute les mêmes contrôles que `.github/workflows/validation.yml` (tous les bancs Chrome, `check`, site, paquet, kit Store), sur les mêmes déclencheurs, sans pipeline en double.
FR34: Le poste de travail, les agents et la documentation suivent GitLab : clone, `glab` et jeton de lecture de la CI, règles d'AGENTS.md, README et `docs/technique/`, garde-fous contre les fuites d'adresses du dépôt.
FR35: Si l'adresse publique du site change, toutes les références suivent (site, scripts, tests, textes Store, politique de confidentialité, vérification du site par le Store), et l'ancienne adresse redirige ou reste servie.
FR36: Le Sprint Planning et le Sprint Board tiennent compte des droits Jira de l'utilisateur (décision du 06/11/2026) : un sprint futur non modifiable reste une source de tickets sans être préparé, l'entrée « Sprint Planning » est fermée, avec sa raison, sans le droit de gérer les sprints du board, et les gestes qu'un projet refuserait (*Schedule issues*, *Edit issues*) sont désactivés sur la carte avec leur raison ; droits indécidables : le geste part, une seule tentative.

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
FR25: Epic 9 - Tableau OK / KO des objectifs d'un sprint fermé
FR26: Epic 9 - Verdict à la date de fermeture, d'après l'historique des tickets
FR27: Epic 9 - Bilan de plusieurs sprints fermés, « Pas de données » si aucun objectif
FR28: Epic 9 - Copier ou exporter le bilan
FR29: Epic 10 - Rechercher un parent dans le filtre Parent
FR30: Epic 9 - Une règle d'atteinte commune au report et au bilan ; bilan en fin de clôture
FR31: Epic 11 - Code privé, site public dans un dépôt dédié
FR32: Epic 11 - Dépôt importé sur le GitLab de l'entreprise
FR33: Epic 11 - CI GitLab équivalente à la CI GitHub
FR34: Epic 11 - Poste de travail, agents et documentation sur GitLab
FR35: Epic 11 - Changement d'adresse du site, si décidé
FR36: Epic 12 - Sprint Planning et Sprint Board à la mesure des droits Jira
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
*Notes :* créé le 31/10/2026, redéfini le 01/11/2026 (Denis) depuis [forged-idea.md](../forge/sprint-planning-complet/forged-idea.md), qui remplace la décision du 14/10/2026. Création de sprint et de Goals hors périmètre. Droits (lecture seule annoncée ou découverte au premier refus) : décision en attente. Écran de référence : maquette v2. Complété le 02/11/2026 (Denis, retours d'essai) par les stories 8.12 à 8.18 ; décision produit du même jour : l'estimation d'un ticket s'écrit depuis le planning (E11, story 8.17), sous réserve de la vérification du contrat Atlassian. Terminée le 25/11/2026 (Denis) : Sprint Planning actif depuis 0.54.0 ; les stories de droits 8.36 à 8.39, non faites, passent dans l'Epic 12 (12.1 à 12.4).

### Epic 9: Bilan des Sprint Goals d'un sprint fermé
Après la clôture, l'équipe voit pour chaque sprint fermé choisi si ses objectifs ont été atteints (OK / KO) à la date de fermeture, avec les tickets qui l'expliquent, et peut garder ou partager ce bilan.
**FRs covered:** FR25, FR26, FR27, FR28, FR30
*Notes :* créé le 06/11/2026 (Denis) depuis un bilan manuel du board 3013. Lecture seule : aucune nouvelle écriture, aucun bilan enregistré dans Jira. Indépendant des Epics 2 à 8 ; s'appuie sur le format `sprintgoals.v1` de l'Epic 1. Mode « texte du sprint » d'abord ; Goals Atlassian en question ouverte. Complété le 25/11/2026 (Denis, table ronde) : règle d'atteinte commune avec le report de l'Epic 8 (story 9.7, avant la 9.2), report des objectifs sans ticket (9.8, seule écriture touchée, déjà autorisée), bilan en fin de clôture (9.9).

### Epic 10: Retrouver ses tickets plus vite
L'équipe trouve vite ce qu'elle cherche sur le board, même quand un sprint compte beaucoup de tickets, de parents ou de valeurs de filtre ; aucune écriture dans Jira.
**FRs covered:** FR29
*Notes :* créé le 24/11/2026 (Denis), hors Sprint Planning : les améliorations de filtres et de recherche du board. Indépendant des autres epics. Le menu de filtre est un composant partagé avec le Sprint Planning, qui en bénéficie sans story propre.

### Epic 11: Le code sur le GitLab de l'entreprise
Le code de l'extension quitte GitHub pour le GitLab de l'entreprise, sans être exposé publiquement ; la CI, le poste de travail et les agents suivent, et le site public reste en ligne pour les utilisateurs du Store.
**FRs covered:** FR31, FR32, FR33, FR34, FR35
*Notes :* créé le 25/11/2026 (Denis, table ronde). Aucun changement de l'extension. Les stories 11.1 à 11.3 peuvent démarrer tout de suite. Le dépôt GitLab existe (constat du 25/11/2026) : sa seule branche est `develop`, il n'a pas de `main` (story 11.10). La propriété du code (éditeur Store, contact, licence) relève de l'Epic 5, pas de cette epic.

### Epic 12: Sprint Planning V2, à la mesure des droits Jira
Le Sprint Planning et le Sprint Board ne proposent plus un geste que Jira refuserait : chaque geste désactivé dit pourquoi, l'entrée du planning se ferme sans le droit de gérer les sprints, et un sprint futur non modifiable reste une source de tickets.
**FRs covered:** FR36
*Notes :* créé le 25/11/2026 (Denis) à la clôture de l'Epic 8, avec ses stories non faites : 8.36 à 8.39, devenues 12.1 à 12.4 (spec de la 12.3 prête). Lectures seules (`mypermissions`, `board/{id}/project`), aucune nouvelle route ni écriture ; textes en fr/en/es.

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

### Story 5.5: Des propriétés Jira au nom de l'extension

*Type : correctif, demandé par Denis le 02/11/2026.* **En attente :** deux décisions avant de commencer, l'amendement de la règle d'AGENTS.md « préserver les clés `com.scrumboardmac.*` » et la reprise des données déjà publiées.

As a équipe qui retrouve les propriétés de l'extension dans Jira,
I want qu'elles portent le préfixe `com.mousquetaires.*` au lieu de `com.scrumboardmac.*`,
So that leur origine est lisible.

**Acceptance Criteria:**

**Given** les trois clés de l'inventaire `src/jira/writes.ts` : `sprintgoals.v1` (E5, propriété de sprint), `boardsettings.v1` (E6, propriété du board) et `diagnostic` (E7, écrite puis supprimée)
**When** l'extension lit une propriété
**Then** elle lit la nouvelle clé, sinon l'ancienne ; les objectifs épinglés et les réglages d'équipe déjà publiés restent lisibles

**Given** un geste explicite qui écrit une de ces propriétés
**When** l'écriture part
**Then** seule la nouvelle clé est écrite, au format `v1` inchangé, sans nouvelle écriture ; l'ancienne clé n'est jamais supprimée automatiquement

**Given** le correctif livré
**When** les références sont relues
**Then** sont à jour : `src/jira/writes.ts`, `src/jira/diagnostics.ts`, `src/core/sprintGoals.ts`, `src/core/teamSettings.ts` ; les tests (`writes.test.ts` et sa garde de chemins, `BoardWriteGate`, `PlanningModel`, `App`, `sprintGoals`, `teamSettings`, `BoardModel.*`), `scripts/verify-planning.mjs` ; `docs/technique/` (`securite.md`, `donnees.md`, `index.md`), AGENTS.md, la note d'architecture et la spec de conformité. Les specs terminées et les `.memlog.md` gardent l'ancien nom (historique).

*Notes :* références recensées le 02/11/2026, toutes sur ces trois clés.

## Epic 6: Des réglages qui suivent l'équipe

**En attente (Denis, 30/10/2026) :** stories à écrire à la reprise de cet epic. Pistes esquissées, non validées : export JSON des réglages partagés (FR19), import avec validation locale, aperçu des différences et une seule écriture E6 par la porte du board (FR19), préférences personnelles entre postes via une propriété utilisateur Jira, nouvelle écriture soumise à décision produit (FR20). Questions à reprendre : auteur (`publishedBy`) dans l'export, import depuis un autre board, préférences concernées.

## Epic 7: Piloter le flux en points

**En attente (Denis, 30/10/2026) :** stories à écrire à la reprise de cet epic. Pistes : limites WIP exprimées en points, minimums de colonne, présentation des sources de Goals selon les capacités du site (FR21).


## Epic 8: Sprint Planning en direct dans Jira

L'équipe clôture son sprint, construit le suivant par objectifs avec des tickets trouvés partout sur le board, puis le démarre. Chaque geste écrit aussitôt dans Jira, qui reste la seule source : la page se reconstruit à l'entrée depuis le texte de l'objectif du sprint, la propriété `sprintgoals.v1` et les tickets du sprint. Aujourd'hui, Sprint Planning n'existe que dans les builds locaux `dist/` et les tests (`SPRINT_PLANNING_ENABLED`) ; il le reste jusqu'à la story 8.11. Décisions : [forged-idea.md](../forge/sprint-planning-complet/forged-idea.md) ; écran : maquette v2.

Ordre : contrats d'abord, écran et objectifs ensuite, clôture et démarrage, puis les compléments et correctifs issus des premiers essais (8.12 à 8.25), et enfin essai réel et activation. Les numéros 8.12 à 8.24 se jouent avant 8.10 ; 8.25 se joue avant 8.11, avec l'essai séparé des Goals Atlassian ; 8.26 à 8.28, défauts du constat de 8.10, 8.29, même défaut côté board, 8.30, mêmes gestes à la souris sur les deux écrans, 8.31, sprint actif retiré de « Où sont les tickets », puis 8.32 (changer d'objectif sur le board sans changer d'état) et 8.33 (déplacer une sélection du board vers un objectif, après 8.32) se jouent avant 8.11.

**Terminée le 25/11/2026 (Denis).** Les stories de droits 8.36 à 8.39, non faites, passent dans l'Epic 12 (Sprint Planning V2), renumérotées 12.1 à 12.4.

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
**When** un cycle complet est joué (clôture, report, objectifs, tickets venant de plusieurs sprints, déplacement groupé, glisser avec défilement, menu de carte, retrait, filtres rapides, vélocité, estimation, avancement des objectifs, tickets terminés masqués, démarrage), avec et sans droit de gérer les sprints, sur un backlog volumineux, avec la version qui livre 8.24
**Then** le constat est consigné, et chaque défaut devient une story ou un correctif ; la décision sur les droits est prise à partir de ce constat
**And** chaque point noté « à constater en 8.10 » dans `docs/technique/` et `deferred-work.md` reçoit son constat ; les Goals Atlassian, hors de cet essai, sont consignés « non couverts »

### Story 8.11: Activer le Sprint Planning dans le paquet

As a équipe qui installe l'extension depuis le paquet distribué,
I want trouver Sprint Planning,
So that je planifie mes sprints sans build local.

**Acceptance Criteria:**

**Given** les stories 8.1 à 8.10, 8.12 à 8.35, 8.40 et 8.41 terminées (dont 8.41, la documentation) et le constat de 8.10 favorable ; les stories de droits 8.36 à 8.38 étaient prévues avant l'activation (décision du 06/11/2026), qui a été faite avant elles sur demande de Denis du 24/11/2026
**When** le paquet est construit (`npm run package`)
**Then** `SPRINT_PLANNING_ENABLED` vaut vrai dans le paquet, `npm run verify:planning:package` le vérifie, et AGENTS.md, le CHANGELOG, la version et les notes de publication sont à jour ; les résumés `_locales` et le tableau de `fiche.md` reprennent ceux de la section « Activation de Sprint Planning », `fiche.md` ne dit plus que Sprint Planning est désactivé, et le manuel, le site, la politique de confidentialité et la fiche du Store écrits en 8.41 sont publiés avec cette version

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

### Story 8.19: Le même menu de carte dans le planning et sur le board

As a Scrum Master qui passe du Sprint Board au Sprint Planning,
I want retrouver le même menu de carte sur les deux écrans,
So that je n'ai qu'une seule façon d'envoyer un ticket vers un objectif ou de le classer.

**Acceptance Criteria:**

**Given** une carte du board ou du planning qui n'est pas en consultation
**When** j'ouvre son menu (bouton ⋯, clic droit, touche Menu ou Maj+F10)
**Then** le même composant de menu s'ouvre sur les deux écrans : même structure, même ouverture des sous-menus au survol et au clavier, Échap referme et rend le focus à la carte

**Given** le sous-menu « Envoyer vers un goal › », sur le board comme dans le planning
**When** il s'ouvre
**Then** chaque objectif a sa pastille de couleur à gauche de son nom (couleur de sa swimlane), « Sans objectif » compris

**Given** une carte du sprint en préparation dans le planning
**When** je choisis « Mettre en top priorité » ou « Mettre en basse priorité »
**Then** le ticket passe en tête ou en fin de la swimlane de son objectif (« Sans objectif » compris), comme sur le board, par une seule écriture de rang E2, relue ; une carte d'une source (backlog, autre sprint futur) n'a pas ces choix

**Given** une carte du planning
**When** son menu s'ouvre
**Then** les destinations de sprint (« Renvoyer au backlog », « Vers {sprint} ») sont regroupées dans un sous-menu dépliable, comme celui des objectifs ; le mode lot de la story 8.15 est conservé (une carte sélectionnée applique le choix à toute la sélection), et top / basse priorité restent des gestes d'un seul ticket

**Given** les tests du menu du board (stories 3.1, 3.2) et du planning (8.4, 8.13, 8.15)
**When** le composant est partagé
**Then** ils passent tous, et aucune écriture nouvelle n'apparaît : E2, E3/E4, E5, E9, E10 seulement

*Notes :* demande de Denis du 02/11/2026 (backlog). Décision de Denis : tête ou fin de la swimlane de l'objectif dans le sprint en préparation. Aujourd'hui `CardMenu.tsx` (board, sous-menus) et `<details>` à plat dans `PlanningView.tsx` (planning). Indépendante des stories 8.20 et 8.21.

### Story 8.20: Un seul en-tête d'objectif, avec une barre par état

As a équipe qui suit ses objectifs du planning au sprint en cours,
I want le même en-tête d'objectif sur les deux écrans, avec une barre de progression colorée par état,
So that je lis d'un coup d'œil où en est chaque objectif, en points, avec la même règle partout.

**Acceptance Criteria:**

**Given** les décisions de Denis du 02/11/2026 : l'état d'un ticket vient des colonnes du board, jamais de la catégorie de statut Jira
**When** l'avancement d'un objectif est calculé, sur le board comme dans le planning
**Then** un ticket est « à faire » si son statut est dans la première colonne visible du board, « en cours » s'il est dans une colonne du milieu, « terminé » s'il est dans la dernière (règle de `goalProgress` et du report 8.7) ; un board à une seule colonne visible n'a que « terminé », un board à deux colonnes n'a pas d'« en cours » ; la répartition de la story 8.16, aujourd'hui par catégorie de statut, adopte cette règle

**Given** la même décision
**When** un autre calcul du board ou du planning juge l'état d'un ticket
**Then** il passe aussi par les colonnes, au moyen d'une seule fonction de `core` : barre et chiffres du sprint en haut du board (`sprintMetrics` : terminés, à faire, en cours, points terminés), santé du sprint (avancement des objectifs, tickets surveillés), tickets vieillissants, reste à faire d'un sprint actif dans le planning ; plus aucun calcul d'état ne lit la catégorie de statut (`isIssueDone`, `isDoneStatus`, `progressCategory`), hors du refus de Jira d'ajouter au sprint un ticket résolu (`canJoinSprint`)

**Given** la décision de Denis du 02/11/2026 (option A) : un ticket dont le statut n'est dans aucune colonne visible est ignoré, comme sur le board Jira
**When** le board ou le planning s'affiche
**Then** ce ticket n'est ni affiché ni compté nulle part : ni dans « n/N » et le marqueur « atteint » d'un objectif, ni dans les barres, la charge, la santé ou le reste à faire ; l'avis existant du board (« N tickets ont un statut qui n'appartient à aucune colonne visible : non affichés, comme dans Jira ») reste, et le planning affiche le même avis pour le sprint en préparation

**Given** une swimlane d'objectif sur le board ou dans le planning
**When** son en-tête s'affiche
**Then** un seul composant montre le marqueur de l'objectif (atteint quand tous ses tickets sont terminés, sur les deux écrans), son titre, « n/N terminés · x/y pts », et une barre empilée en trois segments : gris à faire, bleu en cours, vert terminé, de largeur proportionnelle aux points (aux tickets sur un board sans estimation) ; un objectif sans ticket affiche « Aucun ticket rattaché » sur les deux écrans

**Given** la barre empilée
**When** je la regarde sans la survoler
**Then** les points (ou tickets) de chaque état restent lisibles à côté de la barre, dans une légende aux mêmes couleurs (les pastilles de la story 8.16) ; chaque valeur est aussi donnée au survol et en texte pour les lecteurs d'écran, et aucune information ne passe par la couleur seule

**Given** ce qui reste propre à chaque écran (actions de l'objectif dans le planning ; repli et déplacement de la swimlane sur le board ; déjà livré, story 8.21)
**When** l'en-tête s'affiche
**Then** ces éléments gardent leur place dans le composant commun, sans changer de comportement

**Given** la barre du sprint en haut de page (avancement sur le board, charge comparée à la vélocité dans le planning)
**When** elle s'affiche
**Then** elle prend le même gabarit visuel que la barre d'objectif ; l'avancement du board suit les colonnes (critère ci-dessus), la charge du planning reste comparée à la vélocité

**Given** les données déjà lues (colonnes du board, statut de chaque ticket)
**When** l'en-tête se calcule
**Then** aucune lecture ni écriture n'est ajoutée

*Notes :* demandes de Denis du 02/11/2026 (backlog : en-tête homogène, barre par catégorie). Ce que Denis veut garder : la barre du sprint en cours et les points par catégorie du planning. Constat du 02/11/2026 : trois règles cohabitaient (colonne pour l'en-tête d'objectif du board et le report, catégorie pour la barre du sprint, la santé, le vieillissement et le planning, rien pour les tickets sans colonne, comptés dans l'objectif mais jamais terminés). À constater en 8.10 : Jira déplace-t-il au sprint suivant, à la clôture, un ticket sans colonne ? Colonnes et statuts déjà lus (`visibleColumns`, `src/core/boardConfiguration.ts`).

### Story 8.21: Le déjà livré dans la partie terminée de la barre

As a équipe qui reprend un objectif sur plusieurs sprints,
I want voir ce qui a déjà été livré dans la partie « terminé » de l'objectif,
So that l'avancement réel de l'objectif se lit d'un seul coup, sans mention à part.

**Acceptance Criteria:**

**Given** un objectif du planning avec des tickets déjà livrés avant ce sprint (story 8.16)
**When** son en-tête s'affiche
**Then** le déjà livré apparaît comme un segment vert hachuré à la suite du segment terminé, et la légende de « Terminé » le mentionne (« Terminé : 3 · 5 pts, plus déjà livré : 2 · 8 pts ») ; la mention à part « Déjà livré » disparaît

**Given** un objectif avec du déjà livré
**When** la charge, la vélocité et « n/N terminés · x/y pts » s'affichent
**Then** ils ne comptent que le sprint en préparation ; seule la largeur des segments tient compte du déjà livré

**Given** la décision « terminé = dernière colonne visible du board » (story 8.20)
**When** le déjà livré est lu
**Then** il suit la même règle : en mode texte, un ticket des sprints clos compte si son statut est dans la dernière colonne visible ; pour un Goal Atlassian, la lecture JQL vise les statuts de cette colonne (`status in (…)`) au lieu de `statusCategory = Done`

**Given** une lecture incomplète de l'historique ou des Goals
**When** l'en-tête s'affiche
**Then** elle reste signalée, comme dans la story 8.16

*Notes :* demande de Denis du 02/11/2026 (backlog). Dépend de la story 8.20. Planning seulement : le board n'affiche pas de déjà livré. Lectures seulement, aucune écriture.

### Story 8.22: Ne plus voir les tickets terminés dans « Où sont les tickets »

As a Scrum Master qui prépare son sprint,
I want ne voir, dans le backlog et les autres sprints du planning, que les tickets encore à faire,
So that la colonne « Où sont les tickets » ressemble au backlog de Jira et ne m'encombre pas de tickets terminés ou annulés.

**Acceptance Criteria:**

**Given** la décision de Denis du 02/11/2026 (« terminé » = statut dans la dernière colonne visible du board, story 8.20) et la règle du backlog Jira (les statuts de la colonne la plus à droite y sont masqués)
**When** la colonne « Où sont les tickets » s'affiche
**Then** le backlog et les autres sprints futurs n'y montrent aucun ticket dont le statut est dans la dernière colonne visible du board, quelle que soit sa catégorie de statut ou sa résolution

**Given** le reste à faire d'un sprint actif dans la même colonne
**When** il s'affiche
**Then** il suit la même règle (aujourd'hui, il retire les tickets de catégorie « terminé »), pour qu'un seul critère décide de ce qui est terminé dans tout le planning

**Given** un ticket dont le statut n'est dans aucune colonne visible du board (statut « Annulé » non rattaché, par exemple)
**When** la colonne s'affiche
**Then** il est masqué aussi, comme sur le board Jira (décision de Denis du 02/11/2026, option A de la story 8.20)

**Given** un ticket masqué par cette règle et déjà sélectionné (story 8.15), ou un ticket qui passe dans la dernière colonne pendant la séance
**When** le planning est relu
**Then** il disparaît de la colonne et de la sélection, sans avis

**Given** les tickets du sprint en préparation
**When** ses swimlanes s'affichent
**Then** rien ne change : un ticket terminé du sprint reste visible et compté, comme dans la page du sprint

**Given** les données déjà lues (configuration des colonnes, statut de chaque ticket)
**When** la règle s'applique
**Then** aucune lecture ni écriture n'est ajoutée ; les compteurs de section et le résultat des filtres (8.14) ne comptent que les tickets affichés

*Notes :* retour d'essai du 02/11/2026 (backlog « À investiguer »). Cause : `GET /rest/software/1.0/board/{id}/backlog` renvoie aussi les tickets de la dernière colonne, que l'écran de Jira masque ([base de connaissances Atlassian](https://support.atlassian.com/jira/kb/done-or-resolved-issues-appear-in-a-scrum-board-backlog/)) ; `sections` (`PlanningModel.ts`) n'avait aucun filtre. Règle à réutiliser : `visibleColumns(configuration.columns).at(-1)`, déjà employée par le report (8.7). `canJoinSprint` (refus de Jira pour les tickets résolus et les sous-tâches) reste inchangé pour les tickets encore affichés.

### Story 8.23: Ne plus voir les tickets terminés du sprint en préparation

As a Scrum Master qui prépare son sprint,
I want ne plus voir dans le sprint en préparation les tickets déjà terminés,
So that le sprint à planifier ne montre et ne compte que le travail qui reste à faire.

**Acceptance Criteria:**

**Given** la décision de Denis du 02/11/2026 (« Les masquer aussi », après essai sur le sandbox) qui remplace, pour le sprint en préparation, celle de la story 8.22
**When** le sprint en préparation s'affiche
**Then** un ticket dont le statut est dans la dernière colonne visible du board n'apparaît ni dans les swimlanes ni dans « Sans objectif », comme un statut sans colonne (8.20)

**Given** un tel ticket
**When** la charge, l'avancement des objectifs, les options de filtre et le compteur « n / N tickets » se calculent
**Then** il n'y est pas compté, et il ne peut pas être sélectionné ; il disparaît sans avis, comme en 8.22

**Given** les données déjà lues
**When** la règle s'applique
**Then** aucune lecture ni écriture n'est ajoutée ; le ticket reste lu dans Jira pour les gestes et le déjà livré

*Notes :* filtre dans `PlanningModel.#sprintItems` (`shownInSprint`), pas dans `loadSprintPlanning`. La partie « terminé » des barres ne vient plus que du déjà livré (8.21).

### Story 8.24: Faire défiler le board et le planning pendant le glisser d'un ticket

*Type : bug, signalé par Denis le 02/11/2026.*

As a membre de l'équipe qui glisse un ticket vers un objectif,
I want que la zone défile quand j'approche la carte de son bord haut ou bas,
So that j'atteins un objectif qui est hors de l'écran.

**Acceptance Criteria:**

**Given** un Sprint Board plus haut que la fenêtre
**When** je glisse une carte et que le pointeur entre dans une bande en haut ou en bas du conteneur du board
**Then** le conteneur défile vers ce bord, d'autant plus vite que le pointeur s'en approche
**And** le défilement s'arrête au dépôt, à l'abandon du glisser ou quand le pointeur quitte la bande

**Given** le Sprint Planning (`.planning-lanes`, `.planning-sources`)
**When** je glisse une ou plusieurs cartes
**Then** la zone survolée défile de la même façon

**Given** le correctif
**When** il est vérifié
**Then** aucune lecture ni écriture n'est ajoutée, le dépôt est inchangé, et le constat est fait dans un Chrome réel sur le banc fictif, avec un board plus haut que la fenêtre

*Notes :* glisser-déposer HTML natif (`draggable`, `onDragStart` dans `IssueCard.tsx`, `BoardView.tsx`), aucun défilement automatique de notre côté ; le board défile dans son propre conteneur (`.board`, `overflow: auto`, `app.css`), dans l'iframe injectée dans Jira. Piste à confirmer : la zone de défilement automatique de Chrome, au bord du conteneur, est trop étroite ou masquée (en-têtes, bord de l'iframe). Correctif envisagé : défilement piloté par `dragover`.

### Story 8.25: Voir les Goals liés à la première lecture des Goals Atlassian

*Type : bug, relevé par la revue du 02/11/2026 (correctif « objectifs masqués au démarrage »).*

As a équipe dont le board passe de la source texte aux Goals Atlassian, ou sort d'un repli en texte,
I want que la première lecture des Goals Atlassian ne masque aucun Goal lié,
So that je ne perds pas de vue des objectifs que je n'ai jamais choisi de masquer.

**Acceptance Criteria:**

**Given** une lecture précédente en texte (source texte ou repli quand les Goals sont illisibles)
**When** la première lecture des Goals Atlassian réussit
**Then** elle se comporte comme une première lecture : aucun Goal lié, épinglé ou non, n'est ajouté à `hiddenGoalIds`

**Given** les lectures suivantes des Goals Atlassian
**When** un Goal inconnu, non épinglé, arrive par un ticket
**Then** il est masqué, comme aujourd'hui (`docs/technique/invariants.md`)

**Given** un board Kanban dont un Goal est épinglé pendant une lecture
**When** la lecture se termine
**Then** ce Goal n'est pas masqué, et un test le vérifie avec un lecteur bloqué (l'épinglage est relu dans `latest`, pas dans `configuration`)

*Notes :* cause dans `BoardLoadingService.ts` : `knownGoalIds` contient les objectifs texte et `goalColorIndex`, donc la grâce de la première lecture est consommée par la lecture texte. Aucune écriture dans Jira ; les préférences restent locales.

### Story 8.26: Confirmer un geste du planning malgré le délai d'indexation de Jira

*Type : bug, constaté à l'essai réel 8.10 (03/11/2026), défaut D1.*

As a membre de l'équipe qui ajoute, classe ou retire des tickets pendant la séance,
I want que le planning reconnaisse un geste que Jira a bien appliqué,
So that le ticket arrive sur l'objectif visé sans « Write not confirmed » ni « To redo » trompeur.

**Acceptance Criteria:**

**Given** une E9 (ajout au sprint, depuis le backlog ou un autre sprint futur, ticket ou lot), une E2 (top ou basse priorité) ou une E10 (retour au backlog) acceptée par Jira
**When** la relecture par la route des tickets du board ne voit pas encore le changement
**Then** le planning relit de nouveau, à intervalles bornés (quelques secondes au total), sans jamais rejouer l'écriture, et poursuit le geste (E5 du lien vers l'objectif, retrait du lien) dès que le changement est relu

**Given** le changement toujours absent à la fin des relectures
**When** le geste se termine
**Then** l'avis dit que Jira a reçu l'écriture sans l'avoir encore relue, ne demande pas de refaire des tickets déjà ajoutés, et la page n'affiche jamais un ticket à deux endroits

**Given** le correctif
**When** il est vérifié
**Then** un test de `core` simule une route en retard d'une ou deux relectures (ticket seul, lot dont un seul ticket est relu, rang, retour au backlog), et un essai sur le sandbox le confirme

*Notes :* essai 8.10 : 7 gestes sur 7 annoncés « non confirmés » alors qu'appliqués (JQL) ; CLIENT-7122 visible ~0,9 s après la réponse de l'E9, CLIENT-3693 du même lot pas encore ; ensuite, ticket déposé sur un objectif arrivé « Sans objectif », lien périmé laissé dans `sprintgoals.v1` après un retrait (le ticket rendu sur C réapparaît sous B), ticket affiché dans le backlog et le sprint. Relecture unique dans `placePlanningIssue`, `placePlanningIssues` et voisines (`src/core/sprintPlanning.ts`) ; même famille que les relectures bornées de la clôture (8.18). L'estimation (E11) et les E5 seules ne sont pas touchées.

### Story 8.27: Ouvrir et isoler les fenêtres natives de clôture et de démarrage sur un vrai Jira

*Type : bug, constaté à l'essai réel 8.10 (03/11/2026), défauts D3 et D4.*

As a membre de l'équipe qui clôture puis démarre un sprint depuis le planning,
I want que seule la fenêtre de Jira s'affiche, puis que la popin se referme d'elle-même,
So that je ne me retrouve ni devant la page backlog entière ni devant le board de Jira dans la popin.

**Acceptance Criteria:**

**Given** « Terminer » sur un vrai Jira, page backlog encore en cours de chargement
**When** l'unique bouton « Complete sprint » est reconnu
**Then** il n'est cliqué qu'une fois la page prête à l'ouvrir, et la fenêtre native s'ouvre seule (essai : le clic partait, aucune fenêtre ; repli manuel nécessaire)

**Given** la fenêtre « Start Sprint » avec son bandeau d'avertissement (estimations manquantes)
**When** elle s'ouvre
**Then** elle est reconnue et isolée comme celle de clôture (essai : `fenêtre de sprint non reconnue, page rendue à l'utilisateur 1`)

**Given** une clôture ou un démarrage validés dans la fenêtre
**When** Jira navigue dans la popin (après « Start », board natif avec `?sprintStarted=true`)
**Then** la popin se referme et la vue relit Jira, comme à la fermeture de la fenêtre

**Given** le correctif
**When** il est vérifié
**Then** une seule tentative de clic reste la règle, le repli (page rendue) est conservé, et un essai sur le sandbox couvre clôture et démarrage

*Notes :* traces de `injectBoard.ts` relevées par la console de la page hôte ; S13 dans `docs/technique/securite.md`. La fenêtre de clôture du sandbox propose par défaut un sprint d'un autre board et coche « Join Confluence now to create a sprint retrospective » : l'extension ne remplit rien, ces valeurs restent à l'utilisateur.

### Story 8.28: Garder la vue du planning immobile quand des cartes lointaines sont sélectionnées

*Type : bug, constaté à l'essai réel 8.10 (03/11/2026), défaut D2.*

As a membre de l'équipe qui sélectionne des cartes bas dans « Où sont les tickets »,
I want que seule la colonne défile,
So that l'en-tête et les filtres restent à l'écran, y compris pendant un glisser.

**Acceptance Criteria:**

**Given** des cartes sélectionnées loin dans une colonne qui défile
**When** la vue s'affiche ou qu'un glisser approche du bas de la fenêtre
**Then** le document de la vue ne défile pas : l'annonce « Selected » (`.visually-hidden`) reste contenue dans sa carte

**Given** le correctif
**When** il est vérifié
**Then** un contrôle en Chrome réel (banc fictif) mesure `document.scrollingElement.scrollHeight` égal à la hauteur de la fenêtre avec une sélection en bas de colonne

*Notes :* essai 8.10 : annonces placées jusqu'à 3 526 px pour 691 visibles, vue défilée de 2 835 px pendant un glisser. `.visually-hidden` est en `position: absolute` (`app.css`) sans bloc conteneur dans `.planning-card` ni la colonne.

### Story 8.29: Garder à sa place un ticket classé sur le board malgré le délai d'indexation de Jira

*Type : bug, signalé par Denis le 03/11/2026 ; même cause que la 8.26 (constat de 8.10), côté Sprint Board.*

As a membre de l'équipe qui réordonne les tickets sur le board,
I want que la carte reste là où je l'ai posée,
So that je n'aie pas à actualiser pour voir le rang que Jira a pourtant enregistré.

**Acceptance Criteria:**

**Given** un changement de rang sur le board (glisser dans une colonne, ou top / basse priorité du menu), E2 acceptée par Jira
**When** la route des tickets du board relue juste après montre encore l'ancien ordre
**Then** le board relit cet ordre à intervalles bornés (quelques secondes au total), sans jamais rejouer l'écriture, et ne se relit en entier qu'une fois le nouveau rang visible : la carte ne revient pas à sa position initiale

**Given** le nouveau rang toujours absent à la fin des relectures
**When** le geste se termine
**Then** l'avis dit que Jira a reçu le classement sans le montrer encore et invite à actualiser ; le journal garde le classement comme réussi

**Given** le correctif
**When** il est vérifié
**Then** un test de `core` simule une route en retard d'une ou plusieurs relectures (Scrum et Kanban), et un test du board vérifie une seule E2 et l'avis

*Notes :* `#runMovement` (`src/app/model/BoardModel.ts`) relit le board (`sync`) aussitôt après `executeMove` (`src/core/boardMove.ts`) puis efface la projection : l'ordre relu, encore ancien, ramène la carte. Mêmes délais que la 8.26 (`READ_BACK_DELAYS_MS`). Les transitions sont confirmées par la lecture directe du ticket ; leur affichage après relecture reste à observer à l'essai sur le sandbox.

### Story 8.30: Les mêmes gestes à la souris sur une carte du board et du planning

*Type : bug, signalé par Denis le 04/11/2026 en testant la 8.28. Décision de Denis du 04/11/2026 : clic = fiche, Ctrl = sélection, sur les deux écrans.*

As a membre de l'équipe qui passe du Sprint Board au Sprint Planning,
I want qu'un même geste sur une carte fasse la même chose sur les deux écrans,
So that je n'ouvre pas un onglet en croyant sélectionner, ni l'inverse.

**Acceptance Criteria:**

**Given** une carte du board ou du planning, hors consultation
**When** je clique n'importe où sur la carte, sans touche
**Then** la fiche native Jira du ticket s'ouvre, comme aujourd'hui sur le board (dans le planning, plus seulement sur la clé) ; un clic sur un bouton de la carte (⋯, estimation) garde son action

**Given** une carte du board
**When** je fais Ctrl/Cmd+clic ou Maj+clic
**Then** la carte est ajoutée à la sélection ou en est retirée (Maj+clic : plage dans la même colonne et swimlane), avec le même repère visuel et le même compteur que le planning, et Échap vide la sélection ; aucun onglet ni fenêtre ne s'ouvre

**Given** une carte du board ou du planning
**When** je fais un clic du milieu
**Then** le ticket s'ouvre dans un nouvel onglet sur les deux écrans

**Given** le correctif
**When** il est vérifié
**Then** aucune lecture ni écriture Jira n'est ajoutée, les bancs Chrome (`verify:drag`, `verify:planning`) jouent ces gestes sur les deux écrans, et la sélection du planning (8.15) reste inchangée

*Notes :* board : la carte est un lien `a.card` (`IssueCard.tsx`, `target="_blank"`), le clic simple est intercepté par `src/integration/embedded.ts` (`onClick`, fiche native), les touches laissent faire le navigateur. Planning : `article.planning-card` gère Ctrl/Cmd+clic et Maj+clic (`PlanningView.tsx`, `PlanningModel.toggleSelection` / `extendSelection`), seule la clé ouvre la fiche (`planning.openIssue`), le clic du milieu ne fait rien. Sur le board, la sélection n'a encore aucune action groupée (glisser, menu) : périmètre de cette story limité à la sélection elle-même, actions groupées à décider (backlog).

### Story 8.31: Ne plus montrer le sprint actif dans « Où sont les tickets »

*Type : bug, signalé par Denis le 04/11/2026 en testant la 8.28. Décision de Denis du 04/11/2026 : le sprint actif n'a pas sa place dans la colonne de gauche du planning.*

As a membre de l'équipe qui cherche des tickets à planifier,
I want que « Où sont les tickets » ne montre que ce que je peux ajouter au sprint (sprints futurs et backlog),
So that je ne perds pas de temps à essayer de sélectionner ou glisser des cartes du sprint actif qui ne réagissent pas.

**Acceptance Criteria:**

**Given** un board avec un ou plusieurs sprints actifs
**When** j'ouvre Sprint Planning
**Then** « Où sont les tickets » ne contient que les autres sprints futurs du board et le backlog : aucune section ni carte du reste à faire d'un sprint actif, et aucun compte qui l'inclut

**Given** la clôture et le démarrage depuis le planning (8.7, 8.8, 8.18)
**When** un sprint actif existe
**Then** « Terminer », le menu des sprints actifs à clôturer, la raison de « Démarrer » désactivé, le report des objectifs non atteints et son compte rendu restent inchangés

**Given** les filtres du planning (8.14)
**When** un filtre rapide Jira est appliqué
**Then** son périmètre n'inclut plus le reste à faire du sprint actif, et le résultat reste correct sur les autres sections

**Given** le correctif
**When** il est vérifié
**Then** aucune écriture n'est ajoutée, `verify:planning` constate l'absence de la section du sprint actif (banc : « Sprint 42 ») et le cycle clôture/démarrage du banc passe toujours

*Notes :* revient sur la story 8.2 (« le reste à faire du sprint actif (consultation) » dans la colonne de gauche), sur le dernier critère de la 8.4 et sur le périmètre des filtres rapides (8.14). Section rendue par `PlanningView.tsx` (`section.kind === "active"`, cartes `readOnly`) depuis `PlanningModel` (liste des sections, `activeSprints`) ; `loadSprintPlanning` (`src/core/sprintPlanning.ts`) lit les tickets des sprints actifs, dont dépendent aussi `closableSprintIds` et la clôture : n'abandonner cette lecture que si plus rien ne s'en sert (sinon la garder, et seulement ne plus l'afficher). Mettre à jour `docs/manuel-utilisateur.md`.

### Story 8.32: Changer d'objectif sur le board sans changer d'état

*Type : amélioration, demandée par Denis le 05/11/2026. Décision de Denis du 05/11/2026 : changer d'objectif ou de swimlane ne change jamais l'état ; la swimlane d'arrivée est une seule zone de dépôt.*

As a membre de l'équipe qui range les tickets par objectif pendant le sprint,
I want qu'une carte glissée vers un autre objectif ou une autre swimlane garde sa colonne,
So that je change son objectif sans risquer de changer aussi son état par un dépôt dans la mauvaise colonne.

**Acceptance Criteria:**

**Given** une carte du Sprint Board que je glisse
**When** je survole la swimlane d'un autre objectif, ou la swimlane par défaut de son type
**Then** toute la swimlane d'arrivée est une seule zone de dépôt, avec le message « Rattacher à cet objectif » ou « Retour dans la swimlane par défaut », sans zone par colonne ni zone de statut

**Given** ce dépôt
**When** je lâche la carte n'importe où dans cette swimlane
**Then** seul son objectif change (E5 en mode texte, E4 puis E3 en Goals Atlassian, selon les règles actuelles) : ni transition, ni rang ; la carte apparaît dans sa colonne actuelle de la nouvelle swimlane

**Given** un glisser dans la swimlane de départ de la carte
**When** je la dépose dans une autre colonne ou à un autre rang
**Then** le comportement reste celui d'aujourd'hui : transition (zones de statut, formulaire natif) et rang, sans changer d'objectif

**Given** une swimlane refusée pour ce type de ticket (règle actuelle `accepts`)
**When** je la survole
**Then** elle reste indisponible, avec son message actuel

**Given** le changement
**When** il est vérifié
**Then** aucune lecture ni écriture Jira n'est ajoutée (le chemin « objectif + colonne » d'un même dépôt n'est plus emprunté), `verify:drag` joue un glisser vers un autre objectif depuis une colonne et constate l'objectif changé, l'état et le rang inchangés, en Scrum comme en Kanban ; le manuel et ses guides EN/ES le disent

*Notes :* aujourd'hui, `BoardView.tsx` (`LaneView`) propose une zone par cellule `lane-cell` dans toutes les swimlanes compatibles, et `BoardModel.dropIssue` passe par `resolveDrop` (`src/core/dropPlan.ts`), qui sait changer l'objectif et la colonne d'un seul dépôt (`changesColumn`), puis rang et transition. La swimlane de départ est celle du glisser (`DragState.lane`). Le défilement pendant le glisser (8.24) et l'anomalie de mise en page du message « Rattacher à cet objectif » relevée en 8.24 (deferred-work) sont à revoir avec la zone unique. Le Sprint Planning n'est pas concerné : ses swimlanes n'ont pas de colonnes.

### Story 8.33: Déplacer plusieurs cartes du board vers un objectif

*Type : amélioration, demandée par Denis le 05/11/2026 ; tranche la question « actions groupées d'une sélection sur le Sprint Board » ouverte par la 8.30. Décision de Denis du 05/11/2026 : une sélection de plusieurs cartes ne change que d'objectif ou de swimlane, jamais d'état ni de rang.*

As a membre de l'équipe qui réorganise le sprint par objectif,
I want glisser d'un coup plusieurs cartes sélectionnées vers un objectif ou une swimlane,
So that je n'ai pas à rattacher chaque ticket un par un.

**Acceptance Criteria:**

**Given** plusieurs cartes sélectionnées sur le board (Ctrl/Cmd+clic, Maj+clic, story 8.30)
**When** je glisse l'une d'elles
**Then** toute la sélection part avec elle, et seules les swimlanes d'objectif ou par défaut sont des zones de dépôt, en entier, comme en 8.32 ; aucune zone de colonne ni de statut n'est proposée, même dans la swimlane de départ

**Given** ce dépôt sur une swimlane qui accepte tous les tickets du lot
**When** je lâche
**Then** seul l'objectif de chaque ticket change, en une écriture du lot quand c'est possible (une seule E5 par sprint en mode texte ; E4 si besoin puis E3 par ticket en Goals Atlassian) : ni transition, ni rang ; chaque carte garde sa colonne ; la sélection est vidée

**Given** un lot dont un ticket n'est pas accepté par la swimlane visée (règle `accepts`)
**When** je la survole puis lâche
**Then** la swimlane est indisponible pour le lot, avec un message, et rien n'est écrit

**Given** un échec ou un résultat incertain au milieu du lot
**When** Jira répond
**Then** une seule tentative par écriture, arrêt au premier échec, relecture ; l'avis dit quels tickets sont confirmés et lesquels restent à refaire, comme le lot du planning (8.15), en français, anglais et espagnol

**Given** une carte d'une sélection de plusieurs cartes
**When** j'ouvre son menu (clic droit, ⋯)
**Then** ses entrées d'objectif s'appliquent à tout le lot ; ses entrées de statut et de rang sont désactivées, avec leur raison

**Given** le changement
**When** il est vérifié
**Then** aucune nouvelle route d'écriture (E3, E4, E5 seulement), au plus 50 tickets par lot (refus avant toute écriture au-delà), journal du board avec une entrée par lot ; `verify:drag` joue la sélection de deux cartes, leur glisser vers un objectif et le refus d'une swimlane incompatible

*Notes :* dépend de la 8.32 (swimlane entière comme zone de dépôt) et de la 8.30 (`CardSelection`, `BoardModel.selectedKeys`). Le glisser du board transmet aujourd'hui une seule clé (`DRAG_TYPE`, `BoardModel.startDrag`) ; le planning transmet le lot (`gestureKeys`, `PLANNING_DRAG_TYPE`). Les liens passent par les écritures de `src/core/boardWrites.ts` (`withTextGoalLink`, liens Goals) et la porte du board. Un ticket sélectionné puis masqué par un filtre part-il avec le lot ? Même question qu'en 8.15 (backlog) : à trancher avec elle.

### Story 8.34: Valider le Sprint Planning en Goals Atlassian sur le sandbox

*Type : essai réel, demandé par l'essai 8.10 (Goals Atlassian non couverts) avant l'activation (8.11). Décisions de Denis du 06/11/2026.*

As a Scrum Master d'un board en Goals Atlassian,
I want préparer, clôturer et démarrer un sprint avec des Goals épinglés,
So that le planning est vérifié sur un vrai Jira dans les deux sources d'objectifs avant d'être livré.

**Acceptance Criteria:**

**Given** le board 3013 du sandbox passé par Denis en source « Goals Atlassian » dans les réglages
**When** le planning s'ouvre sur 17310 « Accueil-26T2.9 »
**Then** les Goals se cherchent par nom, MOUSQ1-16, MOUSQ1-17 et MOUSQ1-18 s'épinglent au sprint préparé (E5) et aucun Goal n'est créé

**Given** des tickets posés sur un Goal (depuis le backlog, un autre sprint futur, en lot)
**When** chaque geste est relu
**Then** le ticket est dans le sprint (E9) et lié au Goal par le champ Goals (E3, après E4 si besoin), confirmé malgré le délai d'indexation (8.26) ; l'avancement de chaque Goal suit les colonnes du board

**Given** la clôture de 17309 puis le démarrage de 17310 par les fenêtres natives, avec le feu vert de Denis avant chaque geste
**When** la popin se referme
**Then** les Goals non atteints sont reportés sur 17310 et le compte rendu est juste ; le sprint démarré montre ses Goals sur le Sprint Board

**Given** la fin de l'essai
**When** Denis remet le board 3013 en source texte
**Then** le board relit ses objectifs texte sans perte ; le constat (coûts, défauts devenus stories) est consigné dans la spec

### Story 8.35: Relire chaque ticket d'un lot renvoyé au backlog

*Type : bug, constaté à l'essai 8.34 (06/11/2026), défaut D5.*

As a membre de l'équipe qui renvoie plusieurs tickets au backlog,
I want que chaque ticket du lot quitte sa swimlane ou soit annoncé « pas encore relu »,
So that la page ne montre jamais un ticket à une place qu'il n'occupe plus sans le dire.

**Acceptance Criteria:**

**Given** un lot du sprint en préparation renvoyé au backlog (E10), en texte ou en Goals Atlassian
**When** la relecture ne voit pas encore l'un des tickets hors du sprint
**Then** il est classé « pas encore relu » avec l'avis de 8.26, sans nouvelle écriture ; sinon il apparaît dans le backlog

**Given** le correctif
**When** il est vérifié
**Then** un test reproduit un lecteur en retard pour un seul ticket du lot, et un essai sur le sandbox rejoue le renvoi de trois tickets

*Notes :* essai 8.34 : CLIENT-7121, -5800 et -5294 renvoyés ensemble ; E10 appliquée pour les trois, CLIENT-5800 resté dans « Goal 2 » sans avis jusqu'à l'actualisation. Voir `removePlanningIssues` (`src/core/sprintPlanning.ts`) et `unseenKeys` (8.26).

*Stories 8.36 à 8.39 (droits) : déplacées le 25/11/2026 dans l'Epic 12 (Sprint Planning V2), où elles deviennent 12.1 à 12.4 (décision de Denis : Epic 8 terminée).*

### Story 8.40: Voir les swimlanes par type dans « Sans objectif » du planning

*Type : amélioration, demandée par Denis le 24/11/2026.*

*Traçabilité :* livrée sous l'ancien numéro 8.34, avant la fusion `4510319` : commits `b14f1cb`, `8532351`, `f6c692a`, `eee9bae`, `aa5885f`, `b15044e` et `d46bdfd` (« Story 8.34 : … »). Les autres commits « 8.34 », du 06/11/2026, sont ceux de la story 8.34 actuelle.

As a membre de l'équipe qui prépare le sprint,
I want que la partie « Sans objectif » du sprint en préparation montre les tickets rangés dans les swimlanes définies pour leur type (Build, RUN, etc.),
So that je retrouve dans le planning le même classement que sur le Sprint Board, et que je vois d'un coup d'œil ce qui reste à rattacher à un objectif, type par type.

**Acceptance Criteria:**

**Given** le sprint en préparation avec des tickets sans objectif, et des swimlanes définies dans Board → Swimlanes (Default / Build et groupes dédiés, un type dans une seule swimlane)
**When** j'ouvre le planning
**Then** « Sans objectif » est découpée en sous-sections, une par swimlane de type, dans l'ordre des swimlanes du board (`settingsLaneOrder`), chacune avec son nom et le nombre de tickets ; les tickets d'un type Default sont dans la sous-section Default, ceux d'un type de groupe dédié dans ce groupe

**Given** une sous-section sans ticket (ou dont tous les tickets sont masqués par les filtres)
**When** le planning s'affiche
**Then** elle n'est pas affichée, comme les lignes vides du board ; si « Sans objectif » entière est vide, son comportement actuel est inchangé

**Given** un ticket d'un type `IGNORED` dans les réglages du board
**When** le planning s'affiche
**Then** il reste traité comme aujourd'hui par le planning (règle du board appliquée à l'identique sur les deux écrans, voir Notes)

**Given** les gestes actuels sur une carte de « Sans objectif » (glisser, lot, menu, top / basse priorité, estimation, clic, sélection)
**When** je les joue dans une sous-section
**Then** ils se comportent comme avant ; déposer un ticket sur « Sans objectif » le range dans la sous-section de son type ; le rang (top / basse priorité) s'entend dans la sous-section de son type ; une Maj+clic couvre une plage dans la même sous-section

**Given** les totaux, la charge, l'avancement et les filtres du planning
**When** « Sans objectif » est découpée
**Then** ils sont inchangés (charge et totaux calculés sur toute la section, filtres appliqués aux sous-sections)

**Given** le changement
**When** il est vérifié
**Then** aucune lecture ni écriture Jira n'est ajoutée, aucune écriture des réglages (préférences et réglages partagés en lecture seule ici) ; tests de `PlanningModel` (découpage, ordre, sous-sections vides, filtre) et de vue ; `verify:planning` constate les sous-sections sur le banc avec au moins deux swimlanes de type ; manuel et guides EN/ES mis à jour ; nouveaux textes dans les trois langues

*Notes :* lecture à confirmer avec Denis avant le build : « swimlanes définies dans le sprint par rapport au type de tickets » est comprise comme les swimlanes par type des réglages du board (`normalizeSwimlanes`, `swimlaneId` conserve la destination par défaut du ticket, voir `docs/technique/invariants.md`), et non les swimlanes JQL de Jira (aucune API de swimlanes Jira n'est lue ; ne pas en inventer). `PlanningModel.unassigned` renvoie aujourd'hui une liste plate ; le découpage se fait dans le modèle (pur, testable), la vue ne fait que le rendre. Ce découpage ne s'applique qu'à « Sans objectif » : les swimlanes d'objectif restent par objectif. À trancher au build : sous-sections repliables ou non ; nom affiché quand la swimlane Default est vide de nom ; rôle des types `IGNORED` dans le planning. Réutiliser le composant d'en-tête de `LaneHeader` si cela suffit, sans barre d'avancement (hors objectif).

### Story 8.41: Documenter Sprint Planning avant son activation

*Type : documentation et données de publication, demandée par Denis le 24/11/2026 ; se joue avant l'activation (8.11), qui en dépend.*

*Traçabilité :* livrée sous l'ancien numéro 8.35, avant la fusion `4510319` : commits `16bd2a5`, `6eaed19` et `7ebfb75` (« Story 8.35 : documenter… »). Les autres commits « 8.35 », du 06/11/2026, sont ceux de la story 8.35 actuelle.

As a équipe qui découvrira Sprint Planning dans le paquet distribué,
I want le manuel, le site public et la fiche du Chrome Web Store qui décrivent cette vue,
So that je sais à quoi elle sert, ce qu'elle écrit dans Jira et comment l'utiliser dès l'activation.

**Acceptance Criteria:**

**Given** le manuel utilisateur et ses versions anglaise et espagnole
**When** je cherche à préparer un sprint
**Then** une section « Préparer le sprint » décrit, dans les trois langues, Sprint Planning de bout en bout : ouvrir la vue depuis la barre latérale, choisir le sprint futur (le titre est le sélecteur), objectifs selon la source du board (texte, ou Goals Atlassian épinglés, jamais créés), colonne « Où sont les tickets » (backlog et sprints futurs du board), poser un ticket sur un objectif ou sur « Sans objectif » par swimlane de type, retirer du sprint en préparation, sélection multiple et menu de carte, filtres et recherche, vélocité partagée, estimation sur la carte, avancement par objectif et par swimlane, clôture du sprint actif et report des objectifs non atteints, démarrage du sprint préparé, plein écran ; chaque geste est dit écrit aussitôt dans Jira, Jira restant la seule source

**Given** les fenêtres natives de Jira
**When** je clôture ou je démarre
**Then** le manuel dit que ces fenêtres sont celles de Jira, que l'extension ne les remplit ni ne les valide, que « Clôturer » et « Démarrer » s'alternent selon la présence d'un sprint actif, et ce qui se passe sans droit ou en cas de résultat incertain (une seule tentative, relecture de Jira, pas de réussite annoncée avant confirmation)

**Given** le site public (`site/`, `docs/site-web.md`)
**When** je consulte son guide
**Then** une fiche « Préparer le sprint » est ajoutée dans les trois langues, avec le même slug, ses titres courts et résumés (`site/guide-content.mjs`, `sourceHeading` aligné sur le H2 du Markdown), l'accueil et la recherche du guide la trouvent, et `npm run site:check` et `npm run site:verify` sont verts ; rien n'est publié avant l'activation

**Given** les données du Chrome Web Store (`docs/store/`)
**When** le paquet qui active Sprint Planning est préparé
**Then** les descriptions détaillées FR/EN/ES, des notes de version dédiées (`release-notes-planning-*`), la fiche de publication (`fiche.md`, section « Activation de Sprint Planning » : tableau des éléments, résumés `_locales` proposés, objectif unique, captures à retenir sous la limite de cinq du Store, instructions de revue) et la politique de confidentialité FR/EN/ES (fin des brouillons, écritures de Sprint Planning listées) décrivent la fonction sans promettre ce qu'elle ne fait pas (aucune création de sprint ni de Goal) ; la justification des permissions est relue (aucun nouvel hôte, droit ni endpoint : seules les écritures autorisées par la décision du 01/11/2026 sont citées) ; ces textes ne se publient qu'avec le paquet qui active la fonction : les résumés `_locales` et les passages « désactivé » de `fiche.md` sont changés par la 8.11, avec le drapeau

**Given** les captures du Store (`npm run store:screenshots`)
**When** elles sont renouvelées
**Then** au moins deux captures montrent Sprint Planning sur données fictives (un sprint en préparation avec ses objectifs et « Sans objectif » par swimlane, un sprint actif prêt à clôturer), le script construit pour cela le banc avec la fonction activée et sa preuve (`captures.json`) distingue les captures du board, prises sans Sprint Planning, de celles du planning, les cinq captures actuelles restent valides si elles sont inchangées, et `site:check` retrouve les nouvelles images

**Given** la documentation produite
**When** je relis le dépôt
**Then** aucune donnée fictive n'entre dans `src/`, `public/` ou le paquet, le manuel, le site et la fiche ne se contredisent pas (mêmes noms de boutons, mêmes limites), `npm run check`, `verify:i18n` et `site:check` sont verts, et le CHANGELOG indique que la documentation est prête pour l'activation

*Notes :* le manuel est la source du site (`render-guide.mjs`) : écrire d'abord `docs/manuel-utilisateur.md`, puis `docs/user-guide.en.md` et `docs/user-guide.es.md`, avec les boutons et libellés réels des catalogues `src/i18n/`. Le manuel et le site sont publiés avec la version qui active la fonction (8.11), pas avant : tant que le paquet l'a désactivée, le texte décrirait une fonction absente du Store. `store-screenshots.mjs` construit aujourd'hui en mode `package` et affirme l'absence du planning (`planningViewAbsent`) : ajouter un second jeu de captures, sans modifier la preuve des cinq premières. Le constat de l'essai réel 8.10, la décision sur les droits du planning (lecture seule annoncée ou découverte au premier refus) et la 8.27, close sans code, sont à citer fidèlement dans le manuel.

### Story 8.42: Ranger l'écran du planning par zone avant les stories de droits

*Type : technique, sans changement visible, décidée par Denis le 25/11/2026 sur le constat A1 de la
[rétrospective de l'Epic 8](../implementation-artifacts/epic-8-retro-2026-11-24.md) ; se joue avant 8.38.*

As a développeur des stories de droits (8.36 à 8.39),
I want que l'écran du planning soit rangé en fichiers par zone (en-tête, filtres, colonne de gauche, objectifs, carte),
So that chaque story ne relit que la zone qu'elle change et que deux sessions se gênent moins.

**Acceptance Criteria:**

**Given** `src/app/views/planning/PlanningView.tsx` (environ 1 940 lignes, 38 composants et fonctions)
**When** il est rangé
**Then** l'écran principal, les filtres, l'en-tête (clôture, dates, vélocité, charge, messages), la colonne « Où sont les tickets », les objectifs (swimlanes, ajout et épinglage, compte rendu de report), la carte (estimation, menu) et l'aide au glisser vivent chacun dans leur fichier du même dossier, aucun ne dépassant environ 600 lignes

**Given** le diff
**When** il est relu
**Then** il ne fait que déplacer du code et ajuster imports et exports : aucune logique, aucun texte, aucune classe CSS ni aucun attribut ne change ; `PLANNING_DRAG_TYPE` et `PLANNING_SPRINT_DRAG_TYPE` restent importables depuis `PlanningView.tsx`

**Given** `src/app/model/BoardModel.ts`
**When** la story est livrée
**Then** ses copies de `sameOrder` et `sameIdOrder` sont remplacées par `sameOrder` de `src/core/reorder.ts`, et `sameIds`, présent à l'identique dans `BoardModel.ts` et `PlanningModel.ts`, n'existe plus qu'une fois

**Given** les vérifications
**When** elles tournent
**Then** `npm run check`, `verify:planning`, `verify:drag` et `verify:jira` sont verts sans qu'aucune assertion de test change ; la carte du code de la spec 8.38 cite les nouveaux fichiers ; version de correctif et CHANGELOG sans changement visible

*Notes :* `PlanningModel.ts` n'est pas découpé ici (une classe à état privé partagé : génération de lecture,
compteur d'occupation, journal, `#gesture`) ; règle pour 8.36 à 8.39 : la logique des droits va dans
`src/core/sprintPermissions.ts`, le modèle ne fait que la brancher ; à réévaluer après 8.39 (première
candidate : clôture, démarrage et report). Point d'action 3 de la rétrospective de l'Epic 8.

## Epic 9: Bilan des Sprint Goals d'un sprint fermé

Après la clôture, l'équipe veut savoir, sprint par sprint, si ses objectifs ont été atteints, sans reconstituer le bilan à la main. L'extension n'enregistre aucun état à la fermeture et n'écrit rien de nouveau : le bilan est recalculé à chaque demande depuis ce que Jira garde déjà. En mode « texte du sprint », la propriété `sprintgoals.v1` d'un sprint fermé n'est plus modifiée par l'extension (le board ne charge que les sprints `active`, `src/core/boardSync.ts`, et le planning n'écrit que dans un sprint futur) : ses objectifs (`goals`) et rattachements (`links`) sont ceux de la fermeture. L'état des tickets à la fermeture se lit dans leur historique.

Ordre : 9.1 (contrats de lecture), 9.7 (règle d'atteinte commune), 9.8 (report des objectifs sans ticket), 9.2 (calcul), 9.3 (écran d'un sprint), 9.9 (bilan en fin de clôture), 9.4 (plusieurs sprints), 9.5 (partage), puis 9.6 (essai réel et activation). Les stories 9.7 à 9.9, ajoutées le 25/11/2026, gardent leur numéro (pas de renumérotation) ; chaque story ne dépend que de celles qui la précèdent dans cet ordre.

**Constat de départ (06/11/2026, essai réel autorisé par Denis, lecture seule par le connecteur Atlassian) :** bilan manuel du board 3013 (`mousquetaires.atlassian.net`, projet CLIENT). La propriété `sprintgoals.v1` n'était pas lisible par le connecteur : les rattachements ont été **déduits des titres des tickets**, l'état à la fermeture tiré de JQL `status WAS IN (…) ON "<date>"`. Résultat, à confirmer par la story 9.6 avec les vrais rattachements :

| Sprint (id) | Fermeture (Paris) | Objectifs | Bilan déduit |
|---|---|---|---|
| Accueil-26T3.5 (19288) | 15/09/2026 15:50 | 3 | 2 OK, 1 KO (APP, parcours d'activation MFA : CLIENT-10415, 10260, 10053, 10455 terminés après la fermeture) |
| Accueil-26T3.6 (19289) | 29/09/2026 18:05 | 0 (texte natif vide) | Pas de données |
| Accueil-26T3.7 I&P (19290) | 13/10/2026 10:51 | 4 | 2 OK, 1 KO (custom actions Batch, CLIENT-10138), 1 sans ticket identifié (plan d'action tests de connexion) |
| Accueil-26T4.1 (22620) | 27/10/2026 10:45 | 7 | 6 OK, 1 KO (accessibilité de la modale, CLIENT-8287 terminé le 28/10) |

Pièges relevés pendant ce bilan, à couvrir par les tests de la story 9.2 :
- tickets rouverts après la fermeture (PITM-18813 fermé à la clôture de 26T4.1 puis rouvert ; CLIENT-10315 terminé à la clôture de 26T3.5, refermé le 03/11) : seul compte l'état à la fermeture ;
- ticket terminé quelques secondes avant la fermeture (CLIENT-10522, 10:51:42 pour une fermeture à 10:51:57) : la précision de JQL `WAS … ON` (minute, fuseau de l'utilisateur) ne suffit pas, il faut les horodatages de l'historique comparés à `completeDate` ;
- statuts propres à l'équipe (To Deliver, TO DELIVER IN PROD, In Delivery, Pour recette, Pret pour MEP, Closed, Corrigée, Canceled) : la colonne du board fait foi, ni la catégorie ni une liste de noms (décision du 25/11/2026) ;
- ticket annulé (CLIENT-10316, Canceled) : terminé si son statut est dans la dernière colonne, non compté s'il n'est dans aucune colonne ;
- un ticket n'a qu'un objectif dans `links` ; la déduction par les titres en avait placé un (CLIENT-10317) sous deux objectifs ;
- ticket reporté : terminé dans le sprint suivant (CLIENT-10138, KO en 26T3.7 puis OK en 26T4.1), il reste KO dans le bilan du premier.

*Décisions (Denis, 25/11/2026, table ronde) :*
- **Terminé = dernière colonne du board**, comme le report des objectifs non atteints (8.7, règle des colonnes de la 8.20), et non la catégorie Done. Les colonnes ne sont pas historisées : le bilan applique celles du jour où il est calculé et le dit ; un ticket dont le statut n'est dans aucune colonne n'est pas compté.
- **Objectif sans ticket compté = « Pas de données »**, dans le bilan comme dans la règle commune (story 9.7). Aujourd'hui le report le traite comme atteint (`progress`, `src/core/sprintPlanning.ts`) et ne le reporte pas : il le reportera désormais (story 9.8).
- **Sous-tâches** : une sous-tâche sans lien propre compte sous l'objectif de son parent, comme sur le board (`inheritedLinks`, `src/core/boardSync.ts`).
- **Objectifs masqués** (`hiddenGoalIds` de la propriété de board, état actuel) : retirés du bilan, leur nombre signalé.
- **Objectif présent dans le texte natif `goal` du sprint mais absent de `goals[]`** (écrit directement dans Jira) : affiché en « Pas de données », avec la raison.
- **Où ouvrir le bilan** : en fin de clôture dans le Sprint Planning (story 9.9), en plus d'un accès depuis le board (story 9.3).
- **Compteur** : « tickets terminés / comptés » affiché à côté du verdict ; pas de troisième couleur « Partiel ».

*Questions ouvertes (Denis) :*
- Format de partage (story 9.5) : tableau copié pour Confluence ou un e-mail, fichier HTML téléchargé, ou les deux ?
- Mode Goals Atlassian : le lien Goal → ticket est porté par le ticket et peut changer après la fermeture, et `atlassianStatus` est celui de la dernière écriture ; bilan exclu, ou affiché avec cette réserve ?

### Story 9.1: Vérifier les lectures d'un sprint fermé

As a développeur qui prépare le bilan,
I want savoir quelles lectures Jira donnent, pour un sprint fermé, ses objectifs, ses tickets et leur historique,
So that le bilan ne repose que sur des contrats Atlassian vérifiés, sans nouvelle écriture.

**Acceptance Criteria:**

**Given** les lectures existantes de `src/jira/client.ts` : `sprints(boardId, ["closed"])`, `sprint(sprintId)`, `sprintProperty(sprintId, "com.scrumboardmac.sprintgoals.v1")` et les tickets avec `includeChangelog`
**When** leur contrat est vérifié dans les références officielles (Sprint, Board, Issue search, Issue changelog)
**Then** une note dans `docs/technique/integration-jira.md` dit, pour un sprint fermé : la lecture de sa propriété, la liste de ses tickets (terminés compris, reportés compris), la présence de `completeDate`, et si l'historique fourni par `expand=changelog` peut être tronqué
**And** si l'historique peut être tronqué, la note désigne la lecture paginée de l'historique d'un ticket à utiliser et vérifie qu'elle reste une lecture passant par `transport.ts`
**And** l'API interne du rapport de sprint (`greenhopper`) est écartée, et aucune écriture n'est ajoutée à `writes.ts`

**Given** l'autorisation de Denis pour un essai réel en lecture seule
**When** ces lectures sont jouées sur le sprint 22620 du board 3013
**Then** le constat (propriété présente ou non, nombre de tickets, historique complet ou non) est ajouté à la note, sans donnée personnelle

*Notes :* `sprints` accepte déjà `closed` ; `sprintScope` et `CARRY_OVER_WINDOW_MS` (`src/jira/models.ts`) lisent déjà l'historique Sprint pour les tickets reportés (story 2.2).

### Story 9.2: Calculer l'état de chaque objectif à la fermeture

As a membre de l'équipe qui fait le bilan d'un sprint,
I want que chaque objectif reçoive OK, KO ou « Pas de données » selon l'état de ses tickets à la fermeture,
So that le verdict ne dépend ni de ce qui s'est passé après, ni d'une lecture à la main.

**Acceptance Criteria:**

**Given** le document `sprintgoals.v1` d'un sprint fermé, sa `completeDate`, ses tickets et leur historique, et les colonnes actuelles du board
**When** une fonction pure de `core` (sans DOM, sans `chrome.*`, sans phrase) calcule le bilan
**Then** chaque objectif de `goals`, dans l'ordre `position`, reçoit ses tickets comptés (rattachés par `links`, ou par le lien de leur parent pour une sous-tâche sans lien propre, et dans le sprint à `completeDate` d'après l'historique Sprint) et, pour chacun, terminé ou non (statut en vigueur à `completeDate`, à la seconde, dans la dernière colonne du board)
**And** le verdict vient de la règle commune de la story 9.7 : OK si tous les tickets comptés étaient terminés, KO si au moins un ne l'était pas, « Pas de données » si aucun ticket n'est compté
**And** chaque objectif porte le nombre de tickets terminés et le nombre de tickets comptés

**Given** un ticket dont le statut à `completeDate` n'est dans aucune colonne du board
**When** le bilan est calculé
**Then** il n'est pas compté, comme sur le board (décision 8.20, option A)

**Given** un objectif masqué dans les réglages partagés du board (`hiddenGoalIds`)
**When** le bilan est calculé
**Then** il est retiré du bilan, et le nombre d'objectifs retirés est rendu avec le bilan

**Given** une ligne du texte natif `goal` du sprint qui ne correspond à aucun titre de `goals` (comparaison sans casse ni espaces superflus)
**When** le bilan est calculé
**Then** elle devient un objectif « Pas de données », avec la raison « absent de la propriété du sprint », placé après les objectifs de `goals`

**Given** un ticket rouvert après la fermeture, ou terminé après la fermeture
**When** le bilan est calculé
**Then** seul son statut à `completeDate` compte (cas PITM-18813, CLIENT-10315, CLIENT-8287)

**Given** un ticket terminé quelques secondes avant `completeDate`
**When** le bilan est calculé
**Then** il est terminé (cas CLIENT-10522), et un ticket terminé une seconde après ne l'est pas

**Given** un ticket présent dans `links` mais retiré du sprint avant la fermeture, un ticket du sprint sans rattachement, ou un lien vers un objectif absent de `goals`
**When** le bilan est calculé
**Then** le premier n'est pas compté, le deuxième n'apparaît sous aucun objectif, le troisième est ignoré ; aucun ne fait échouer le calcul

**Given** une propriété absente, illisible ou de version inconnue
**When** le bilan est calculé
**Then** le sprint donne « Pas de données » avec la raison, sans rien écrire (NFR3)

*Notes :* tests sur données fictives sous `tests/` reprenant les pièges du constat de départ, plus une sous-tâche héritée, un objectif masqué, un statut sans colonne et une ligne du texte natif absente de la propriété. `goalProgress` (`src/core/boardIssue.ts`) mesure l'avancement en direct (colonne actuelle) : le bilan est un calcul distinct, à la date de fermeture, qui partage avec lui la règle des colonnes et avec le report la règle d'atteinte (9.7). Dépend des stories 9.1 et 9.7.

### Story 9.3: Voir le bilan d'un sprint fermé

As a Scrum Master qui prépare la rétrospective,
I want ouvrir le bilan d'un sprint fermé du board,
So that je vois d'un coup d'œil quels objectifs ont été atteints.

**Acceptance Criteria:**

**Given** un board Scrum en mode « texte du sprint » avec des sprints fermés
**When** j'ouvre le bilan et choisis un sprint fermé
**Then** un tableau à deux colonnes s'affiche : en-tête « Sprint Goals {nom du sprint} » et « OK / KO », une ligne par objectif, les lignes OK en vert
**And** à côté de chaque verdict, le compteur « terminés / comptés » ; pas de couleur pour un KO partiel
**And** sous chaque objectif, ses tickets avec leur clé (lien vers la fiche Jira) et leur état à la fermeture ; sous le tableau, la date et l'heure de fermeture, la mention « état jugé avec les colonnes actuelles du board » et, s'il y en a, le nombre d'objectifs masqués retirés
**And** un objectif « Pas de données » affiche sa raison (aucun ticket compté, absent de la propriété du sprint)
**And** un sprint sans objectif affiche une seule ligne « Pas de données »

**Given** un board Scrum
**When** j'ouvre le menu du board
**Then** une entrée ouvre le bilan, avec le choix du sprint fermé

**Given** un utilisateur sans droit `canEdit`
**When** il ouvre le bilan
**Then** le bilan est le même : il ne demande aucune écriture

**Given** le bilan affiché
**When** je regarde l'interface en français, anglais ou espagnol
**Then** les libellés viennent des catalogues `src/i18n/` ; titres d'objectifs, noms de sprint et de statuts restent ceux de Jira (NFR10)

*Notes :* derrière un interrupteur déclaré dans `app/featureFlags.ts`, désactivé dans le paquet jusqu'à la story 9.6 (AD-5, NFR8). Emplacement de l'écran : question ouverte de l'epic. Manuel à mettre à jour.

### Story 9.4: Faire le bilan de plusieurs sprints d'un coup

As a manager qui suit plusieurs sprints,
I want choisir plusieurs sprints fermés du board,
So that j'obtiens un tableau par sprint sans recommencer pour chacun.

**Acceptance Criteria:**

**Given** la liste des sprints fermés du board, du plus récent au plus ancien
**When** j'en coche plusieurs
**Then** un tableau par sprint s'affiche, du plus ancien au plus récent, chacun selon la story 9.3

**Given** un sprint dont la lecture échoue ou dont la propriété manque
**When** les bilans se chargent
**Then** ce sprint affiche « Pas de données » avec la raison, et les autres s'affichent normalement

**Given** beaucoup de sprints choisis
**When** les bilans se chargent
**Then** les lectures restent celles de la story 9.1, sans relecture inutile d'un ticket présent dans plusieurs sprints, et l'interface signale le chargement en cours

### Story 9.5: Garder ou partager le bilan

As a Scrum Master qui envoie le bilan à l'équipe,
I want copier ou exporter les tableaux affichés,
So that je les colle dans Confluence ou un e-mail sans les recopier.

**Acceptance Criteria:**

**Given** un ou plusieurs bilans affichés
**When** j'utilise l'action de partage retenue (copie ou fichier, décision ouverte)
**Then** le contenu reprend les mêmes tableaux (en-têtes, verdicts, couleur verte des OK, date de fermeture), lisible hors de l'extension
**And** rien n'est écrit dans Jira, aucune donnée n'est envoyée à un service tiers, aucune permission Chrome n'est ajoutée (NFR1, NFR12)

### Story 9.6: Valider le bilan sur un vrai Jira et l'activer

As a mainteneur qui distribue l'extension,
I want comparer le bilan de l'extension au bilan manuel du 06/11/2026,
So that la fonction n'est activée dans le paquet qu'une fois juste sur de vraies données.

**Acceptance Criteria:**

**Given** l'autorisation de Denis et le board 3013
**When** le bilan est produit pour Accueil-26T3.5, Accueil-26T3.6, Accueil-26T3.7 I&P et Accueil-26T4.1
**Then** chaque écart avec le tableau du constat de départ est expliqué (rattachement réel différent de la déduction par les titres, ticket annulé, horodatage, règle des colonnes au lieu de la catégorie)
**And** pour un sprint clôturé par l'extension, les objectifs KO correspondent à ceux que le report a recopiés dans le sprint suivant (même identifiant) ; un écart signale une colonne modifiée depuis la clôture et est expliqué
**And** le constat est consigné dans cet epic, et les défauts trouvés deviennent des stories

**Given** un constat favorable
**When** le paquet est construit (`npm run package`)
**Then** l'interrupteur du bilan est actif dans le paquet, un contrôle `verify:` le vérifie sur faux Jira, et le manuel, le CHANGELOG et les captures Store sont à jour
**And** la politique de confidentialité (trois langues) et la fiche Store citent les nouvelles lectures (sprints fermés, historique des tickets) et restent sans nouvelle écriture

### Story 9.7: Une seule règle d'atteinte pour le report et le bilan

As a équipe qui clôture un sprint puis en fait le bilan,
I want que le report des objectifs non atteints et le bilan jugent un objectif de la même façon,
So that un objectif reporté est toujours un objectif KO du bilan, et inversement.

**Acceptance Criteria:**

**Given** la fonction `progress` de `src/core/sprintPlanning.ts` (dernière colonne du board, « sans ticket » rendu comme atteint)
**When** la règle est sortie dans un module de `core` partagé
**Then** elle rend trois états, atteint, non atteint et pas de données (aucun ticket compté), à partir des tickets comptés et d'une fonction « terminé » fondée sur les colonnes du board
**And** le report de la story 8.7 l'utilise ; son comportement visible ne change pas dans cette story (un objectif « pas de données » n'est toujours pas reporté), ses tests existants restent verts
**And** les sous-tâches sans lien propre sont rattachées à l'objectif de leur parent par une fonction partagée avec `boardSync` (`inheritedLinks`), pas recopiée (AD-2)

*Notes :* aucune écriture, aucune lecture Jira ajoutée ; story de structure qui précède la 9.2. Un test de garde vérifie qu'il ne reste qu'une définition de la règle dans `src/`.

### Story 9.8: Reporter aussi les objectifs sans ticket

As a Scrum Master qui clôture un sprint,
I want qu'un objectif sans aucun ticket soit reporté dans le sprint suivant comme un objectif non atteint,
So that un objectif écrit mais jamais outillé ne disparaît pas sans bruit.

**Acceptance Criteria:**

**Given** un sprint relu clos dont un objectif texte n'a aucun ticket compté (« pas de données » selon la story 9.7)
**When** le report de la story 8.7 s'exécute à la clôture
**Then** l'objectif est ajouté au sprint en préparation (même identifiant, même couleur, sans lien), dans la même écriture `writeTextGoals` que les objectifs non atteints, sans écriture supplémentaire
**And** le compte rendu du report le signale comme « sans ticket », distinct d'un objectif non atteint
**And** l'idempotence est conservée : un titre déjà présent dans la cible n'est pas ajouté deux fois

**Given** le mode Goals Atlassian
**When** le report s'exécute
**Then** le comportement d'épinglage reste celui de la 8.7 tant que la règle « sans ticket » n'est pas décidée pour les Goals (question ouverte de l'epic)

*Notes :* changement de comportement d'une fonction livrée (Epic 8) : régression ajoutée, `verify:planning` et `verify:planning:package` rejoués avec tous les bancs Chrome de la CI, manuel et CHANGELOG mis à jour. Aucune nouvelle écriture : E5 (propriété de sprint), déjà utilisée par le report. Dépend de la story 9.7.

### Story 9.9: Voir le bilan du sprint qu'on vient de clôturer

As a Scrum Master qui vient de clôturer son sprint dans le Sprint Planning,
I want que le bilan du sprint clôturé me soit proposé aussitôt,
So that je l'emporte en rétrospective sans aller le chercher.

**Acceptance Criteria:**

**Given** une clôture confirmée par la fenêtre native de Jira, suivie du report des objectifs (story 8.7)
**When** le Sprint Planning affiche le compte rendu du report
**Then** il propose d'ouvrir le bilan de ce sprint, affiché selon la story 9.3
**And** le bilan s'appuie sur la relecture du sprint clos (`completeDate` connue), jamais sur un état local antérieur à la clôture
**And** si la clôture n'est pas confirmée par la relecture, aucun bilan n'est proposé

**Given** la clôture réalisée dans Jira hors de l'extension
**When** j'ouvre le Sprint Planning
**Then** rien n'est proposé automatiquement ; le bilan reste accessible depuis le board (story 9.3)

*Notes :* lecture seule, derrière l'interrupteur du bilan (9.3). Réutiliser les tickets déjà relus par le report quand ils suffisent, sinon les lectures de la story 9.1. Dépend des stories 9.3 et 8.7.

## Epic 10: Retrouver ses tickets plus vite

L'équipe trouve vite ce qu'elle cherche sur le board, même quand un sprint compte beaucoup de tickets, de parents ou de valeurs de filtre. Lecture seule : aucune écriture, aucune nouvelle lecture Jira.

### Story 10.1: Chercher un parent dans le filtre Parent

*Type : amélioration, demandée par Denis le 24/11/2026, à faire à part du Sprint Planning.*

As a membre de l'équipe qui filtre le board par parent,
I want taper du texte dans le menu Parent pour retrouver un parent par sa clé ou son résumé,
So that je n'ai pas à parcourir une longue liste quand le sprint compte beaucoup de parents.

**Acceptance Criteria:**

**Given** le menu de filtre Parent ouvert, avec plus de parents que de lignes visibles
**When** je tape du texte dans son champ de recherche
**Then** la liste ne montre que les parents dont la clé ou le résumé contient ce texte, accents et casse ignorés (même règle que la recherche du board, `searchNeedle`), avec le nombre de tickets de chaque parent inchangé ; un texte sans résultat affiche « Aucun résultat » ; vider le champ rend toute la liste

**Given** des parents déjà cochés
**When** je cherche un autre parent
**Then** un parent coché que le texte ne trouve pas disparaît de la liste mais reste coché : le filtre du board ne change pas et le badge du bouton du menu le compte toujours (décision de Denis, 24/11/2026) ; cocher ou décocher un parent trouvé change le filtre comme aujourd'hui, et « Sans parent » reste toujours affiché, hors de la recherche

**Given** le menu fermé puis rouvert
**When** je l'ouvre de nouveau
**Then** le champ de recherche est vide ; la sélection de parents, elle, est conservée

**Given** le clavier ou un lecteur d'écran
**When** j'ouvre le menu Parent
**Then** le champ prend le focus, Échap ferme le menu comme aujourd'hui, le champ a un nom accessible et le nombre de résultats est annoncé (nouveaux textes en français, anglais et espagnol)

**Given** les autres menus (Personne, Type, Statut, Label)
**When** ils s'ouvrent
**Then** ils sont inchangés : la recherche est réservée au menu Parent (décision de Denis, 24/11/2026)

**Given** le changement
**When** il est vérifié
**Then** aucune lecture ni écriture Jira n'est ajoutée, le Sprint Board et le Sprint Planning proposent la même recherche dans leur menu Parent, les tests de `FilterMenu` couvrent recherche, parents cochés cachés par le texte et réouverture, `verify:i18n` est vert, le manuel et ses guides EN/ES le disent

*Notes :* `FilterMenu` (`src/app/views/board/FilterMenu.tsx`) est un composant partagé, utilisé par le board (`BoardView.tsx`) et par le planning (`PlanningView.tsx`, filtres de la story 8.14) : la recherche s'ajoute au composant, activée pour Parent par une propriété (`searchable`), sans nouvelle logique de filtrage dans `core/filters.ts` (la sélection reste `parentKeys`). Les parents viennent de `issueFilterOptions` (`parents`, `withoutParentCount`) : leur libellé porte déjà clé et résumé (`CLE · résumé`, `src/core/boardLayout.ts`), la recherche porte donc sur le libellé. Le menu est un `<details>` qui n'est pas démonté à la fermeture : vider le champ à l'événement `toggle`. Étendre la recherche aux menus Personne et Label : écarté (Denis, 24/11/2026). Mettre à jour `docs/manuel-utilisateur.md` et ses guides EN/ES (ligne « Utilisez **Rechercher**, puis les filtres… »).

## Epic 11: Le code sur le GitLab de l'entreprise

Le code de l'extension quitte GitHub pour le GitLab de l'entreprise. Constat du 25/11/2026 : le dépôt GitHub est **public** (l'API répond sans jeton), alors que `docs/site-web.md` le dit privé, et il contient des données internes (adresse du site Jira de l'entreprise et de son sandbox, numéros de board et de sprint, clés et intitulés de tickets dans les specs, l'epic 9 et quelques tests), sans fichier LICENSE. Le site public (vitrine, guides, politique de confidentialité) doit rester en ligne : le Store exige une politique accessible à tous.

Principe retenu en table ronde : séparer le code et le site. Le code part en privé sur GitLab ; le site se publie depuis un dépôt public dédié qui ne contient que le site construit (`release/sprint-goals-site.zip`, déjà prévu par `docs/site-web.md`) ; le domaine `sprintgoals.soneira.es` ne change pas sans décision. Aucun miroir du code vers un dépôt public.

Ordre : 11.1 (décisions), 11.2 (site dédié), 11.3 (code GitHub non public), puis 11.9 (identité des commits) et 11.10 (branche `develop`), ajoutées le 25/11/2026 et numérotées sans renumérotation, 11.4 (import), 11.5 (CI), 11.6 (poste de travail et agents), 11.7 (bascule et documentation) ; 11.8 (adresse du site) seulement si un changement de domaine est décidé.

*Questions ouvertes (Denis) :*
- Passer le dépôt GitHub en privé tout de suite, quitte à interrompre le site tant que la story 11.2 n'est pas faite (GitHub Pages sur dépôt privé exige une offre payante) ?
- GitLab hébergé par GitLab ou installé dans l'entreprise ; groupe, visibilité, droits ?
- Runners Windows disponibles ? Accès sortant à `registry.npmjs.org` (ou proxy npm interne) et à `storage.googleapis.com` (Chrome for Testing) ?
- Règles de push : adresse de l'auteur (historique en adresse personnelle), format des messages (clé Jira imposée ?), format des branches (`agent/...`, `codex/...`), commits signés ?
- Identité des commits (demande de Denis, 25/11/2026, story 11.9) : les commits doivent passer de l'adresse personnelle à l'adresse professionnelle de Denis (domaine de l'entreprise). Pour l'historique, trois options :
  - **A. Garder l'historique tel quel** et ne changer que l'identité des nouveaux commits, avec un fichier `.mailmap` qui affiche l'adresse professionnelle dans `git log` et `git blame` sans rien réécrire. Possible seulement si les règles de push acceptent les anciens auteurs (ou si l'import passe par l'importateur GitLab, à vérifier).
  - **B. Réécrire l'auteur de tout l'historique** (`git filter-repo --mailmap`, sur un clone neuf, au moment de l'import) : historique, dates et messages conservés, mais toutes les empreintes changent. Les références de commit écrites dans AGENTS.md, le CHANGELOG et `_bmad-output/` (par exemple `4510319`) deviennent fausses : la table de correspondance produite par `filter-repo` est gardée et ces références sont mises à jour ou annotées.
  - **C. Un seul commit initial sans historique** : écarté par la table ronde. Le projet s'appuie sur son historique (AGENTS.md : « l'historique détaillé reste dans Git » ; rétrospectives BMAD sur diffs et commits ; `git blame`) ; on perdrait la trace de toutes les décisions.
  - Recommandation : **A si les règles de push le permettent, sinon B ; jamais C.** Attribuer à l'adresse de l'entreprise des commits faits avec l'adresse personnelle engage aussi la question de la propriété du code (Epic 5) : à confirmer avec l'entreprise avant de choisir B.
- Branches (constat de Denis, 25/11/2026, story 11.10) : le dépôt GitLab existe et sa seule branche est `develop`, il n'a pas de `main`. Convention de l'entreprise (GitFlow : `develop` pour l'intégration, `main` ou `master` pour la production ?), contenu actuel de `develop` (vide, fichiers d'amorce ou vrais commits ?), protection (push direct permis ou merge request obligatoire ?), préfixes de branches de travail (`agent/...` acceptés ?). Recommandation : `develop` prend le rôle de notre `main` ; pas de `main` créée sur GitLab sauf si la convention en impose une pour la production.
- Devenir de GitHub après la bascule : privé, archivé ou supprimé ; et du dépôt de la politique historique `sprint-goals-privacy` ?
- Domaine : rester sur `soneira.es` ou passer sur un domaine de l'entreprise (DNS et certificat gérés par l'IT, hébergement public obligatoire) ?
- Propriété du code (éditeur Store, contact, licence) : Epic 5, à trancher à part.

### Story 11.1: Décider le cadre de la migration

As a mainteneur qui déplace le code,
I want les réponses aux questions ouvertes de l'epic avant tout geste,
So that l'import et la CI ne butent pas sur une règle de l'entreprise découverte trop tard.

**Acceptance Criteria:**

**Given** les questions ouvertes de l'epic
**When** Denis les tranche, avec l'IT pour les runners, les règles de push et le domaine
**Then** les décisions sont consignées dans `docs/technique/developpement.md` (dépôt, branches, runners, accès réseau, règles de push, devenir de GitHub, domaine) et dans cet epic
**And** les règles de push sont vérifiées sur l'historique réel (plus de 330 commits, adresse de l'auteur, messages en français, branches `agent/...`) avant l'import, par un essai sur un dépôt GitLab de test ou la lecture des règles du groupe
**And** ce résultat dit si les anciens commits, signés de l'adresse personnelle, sont acceptés : il décide l'option d'identité de la story 11.9

### Story 11.2: Publier le site depuis un dépôt public dédié

As a utilisateur du Store qui ouvre le site, le guide ou la politique de confidentialité,
I want que ces pages restent en ligne quand le code devient privé,
So that aucun lien de la fiche Store ne casse.

**Acceptance Criteria:**

**Given** `npm run site:build`, qui produit `release/sprint-goals-site.zip`
**When** son contenu est publié dans un dépôt public dédié au site (GitHub Pages ou autre hébergement statique retenu en 11.1)
**Then** le dépôt dédié ne contient que le site construit : aucune source de l'extension, aucun document de travail, aucune donnée interne
**And** `sprintgoals.soneira.es` sert ce nouveau dépôt, et les URL publiques citées par `docs/store/fiche.md` répondent toutes (accueils, guides et politiques en trois langues)

**Given** les URL écrites en dur pour l'ancienne adresse (`https://2nis6mon.github.io/jira-scrum-board-chrome/` dans `site/*.html`, `scripts/build-site.mjs`, `scripts/render-guide.mjs`, `tests/site-guide.test.ts`)
**When** le site est construit
**Then** canonical, `og:url`, `og:image` et `hreflang` désignent l'adresse publique réelle, sans sous-chemin de dépôt ; `npm run site:preview` reproduit le chemin servi ; `site:check` et `site:verify` sont verts

**Given** la publication du site
**When** elle est relancée après une modification
**Then** la procédure est décrite dans `docs/site-web.md` (construction dans le dépôt de code, copie du ZIP dans le dépôt dédié), et `.github/workflows/pages.yml` est retiré ou adapté

### Story 11.3: Ne plus exposer le code sur GitHub

As a mainteneur d'un code qui contient des données internes de l'entreprise,
I want que le dépôt GitHub cesse d'être public,
So that ces données ne sont plus lisibles par n'importe qui.

**Acceptance Criteria:**

**Given** le site publié depuis son dépôt dédié (11.2), ou la décision de Denis d'accepter une interruption du site
**When** le dépôt GitHub passe en privé
**Then** l'API GitHub sans jeton ne le voit plus, et `docs/site-web.md` ne dit plus rien de faux sur sa visibilité
**And** le suivi de la CI par les agents, qui passait par l'API publique sans jeton, utilise un jeton en lecture seule rangé hors du dépôt (jamais dans Git ni dans les journaux)
**And** les copies faites pendant la période publique (forks, caches) sont recherchées et signalées à Denis ; rien n'est réécrit dans l'historique sans sa décision

### Story 11.4: Importer le dépôt sur le GitLab de l'entreprise

As a mainteneur,
I want le dépôt complet sur le GitLab de l'entreprise,
So that le code y vit avec son historique.

**Acceptance Criteria:**

**Given** le dépôt GitLab (seule branche : `develop`), les règles de push de 11.1 et le modèle de branches de 11.10
**When** l'historique est poussé (branches utiles ; au 25/11/2026, ni issue, ni PR, ni release, ni tag à reprendre)
**Then** notre `main` arrive sur `develop` selon la story 11.10 ; `develop` est protégée (pas de push forcé, fusion selon la règle d'AGENTS.md adaptée en 11.10) et les branches `agent/**` sont autorisées
**And** l'historique poussé est celui préparé par la story 11.9 : inchangé avec `.mailmap` (option A, empreinte de `develop` sur GitLab identique à celle de notre `main`) ou réécrit et contrôlé (option B)
**And** aucun secret n'est poussé : `.secrets/extension-key.pem` reste hors de Git et est rangé dans le coffre retenu en 11.1 ; `dist/`, `release/` et `_bmad-output/party-mode/` restent ignorés

### Story 11.5: Une CI GitLab équivalente à la CI GitHub

As a mainteneur qui pousse une branche,
I want que GitLab CI joue tous les contrôles de `validation.yml`,
So that rien ne régresse sans être vu après la bascule.

**Acceptance Criteria:**

**Given** `.github/workflows/validation.yml`
**When** `.gitlab-ci.yml` est écrit
**Then** il joue, dans le même ordre, la préparation de Chrome for Testing, `verify:jira`, `verify:drag`, `verify:settings`, `verify:i18n`, `verify:planning`, `verify:planning:package`, `verify:loading`, `check`, `site:check`, `site:verify`, `package` et `store:kit`, sur `develop` (branche d'intégration, story 11.10), `agent/**`, `codex/**` et les merge requests qui visent `develop`
**And** `workflow:rules` évite les pipelines en double (branche + merge request) et `interruptible: true` remplace `cancel-in-progress`
**And** `CHROME_PATH` est transmis sans `GITHUB_ENV` (même script ou `dotenv`), et les droits du sandbox Chrome (`icacls`) sont revus pour le runner retenu, Windows ou Linux

**Given** le réseau de l'entreprise
**When** le pipeline installe ses dépendances et Chrome for Testing
**Then** `npm ci` passe par le registre retenu en 11.1 (URL `resolved` du `package-lock.json` réécrites par `replace-registry-host`), `.npmrc` (`ignore-scripts=true`, `save-exact=true`) reste en vigueur, et Chrome for Testing vient d'une source autorisée, à version fixe
**And** les images de runner sont épinglées par digest, comme les actions GitHub le sont par SHA

**Given** un même commit
**When** il passe sur GitHub et sur GitLab pendant la transition
**Then** les deux pipelines sont verts ; le paquet et le kit Store peuvent être gardés comme artefacts du pipeline (option, durée de conservation à fixer)

### Story 11.6: Le poste de travail et les agents sur GitLab

As a Denis qui travaille avec des agents,
I want que mon poste et mes agents lisent le nouveau dépôt et sa CI,
So that je ne perds ni mémoire, ni réglages, ni suivi de la CI.

**Acceptance Criteria:**

**Given** le clone actuel `C:\ClaudeCode\jira-scrum-board-chrome`
**When** `origin` passe sur GitLab
**Then** le clone reste au même chemin (`git remote set-url`), ou la mémoire de Claude Code et `.claude/settings.local.json`, rangés par chemin, sont recopiés vers le nouveau
**And** `glab` est installé et authentifié par un jeton en lecture seule, et les agents savent lire l'état d'un pipeline
**And** les intégrations branchées sur GitHub (agents cloud des branches `codex/**`, revue de PR) sont recensées, avec pour chacune : conservée sur GitLab, remplacée ou abandonnée
**And** les configurations IntelliJ partagées (`.run/`) fonctionnent toujours

### Story 11.7: Basculer `origin` et réécrire la documentation

As a toute personne qui reprend le projet,
I want une documentation qui décrit GitLab, et un GitHub qui ne fait plus foi,
So that personne ne pousse au mauvais endroit.

**Acceptance Criteria:**

**Given** les stories 11.4 à 11.6 terminées
**When** la bascule a lieu
**Then** AGENTS.md (fichier de CI cité, branches surveillées, suivi de la CI ; la ligne « Identité » est changée par la story 11.9, les règles de fusion et de réservation des numéros par la story 11.10), `README.md`, `docs/technique/developpement.md` et `docs/site-web.md` décrivent GitLab ; `.github/workflows/` est retiré
**And** les garde-fous contre les fuites (`scripts/build-site.mjs`, `scripts/verify-site.mjs`, `tests/site-guide.test.ts`, qui refusent aujourd'hui `github.com/2nis6mon`) refusent aussi l'adresse du dépôt GitLab interne dans le site public
**And** le dépôt GitHub est archivé ou supprimé selon 11.1, et `2nis6mon/sprint-goals-privacy` suit la même décision
**And** les documents de travail terminés (`_bmad-output/`) gardent leurs anciennes adresses (historique)

### Story 11.8: Changer l'adresse publique du site

**En attente :** seulement si 11.1 décide de quitter `sprintgoals.soneira.es`.

As a utilisateur du Store,
I want que le site, les guides et la politique de confidentialité restent accessibles à la nouvelle adresse,
So that la fiche Store et les anciens liens continuent de marcher.

**Acceptance Criteria:**

**Given** la nouvelle adresse publique (DNS et certificat gérés par l'IT, hébergement accessible hors du réseau de l'entreprise)
**When** les références sont mises à jour
**Then** sont alignés : `site/*.html`, `scripts/build-site.mjs`, `scripts/render-guide.mjs`, `scripts/prepare-store-kit.mjs`, `tests/site-guide.test.ts`, `docs/store/fiche.md`, `docs/store/listing-*.txt`, `docs/privacy/index.html` et le manuel
**And** l'ancienne adresse redirige vers la nouvelle ou reste servie, et le site est de nouveau vérifié dans Google Search Console pour la fiche Store
**And** la fiche Store est mise à jour par Denis (URL du site et de la politique), sachant qu'un changement d'URL de la politique peut déclencher une nouvelle revue

### Story 11.9: Passer les commits à l'adresse professionnelle

*Ajoutée le 25/11/2026 à la demande de Denis.* Se joue **après 11.1 et 11.3, avant 11.4** : l'import pousse l'historique qu'elle prépare.

As a Denis qui déplace le code sur le GitLab de l'entreprise,
I want que mes commits portent mon adresse professionnelle,
So that les règles du GitLab les acceptent et que l'historique est attribué à mon compte de l'entreprise.

**Acceptance Criteria:**

**Given** le résultat de l'essai des règles de push (11.1) et la confirmation de l'entreprise sur la propriété du code (Epic 5)
**When** l'option est choisie
**Then** A (historique gardé avec `.mailmap`) ou B (auteur réécrit) est consignée dans `docs/technique/developpement.md` avec sa raison ; C (un seul commit sans historique) reste écartée
**And** B n'est choisie qu'après cette confirmation, puisqu'elle attribue à l'adresse de l'entreprise des commits faits avec l'adresse personnelle

**Given** l'option A
**When** l'import se prépare
**Then** un fichier `.mailmap` associe l'adresse personnelle à l'adresse professionnelle ; `git log` et `git blame` affichent l'adresse professionnelle ; aucune empreinte ne change

**Given** l'option B
**When** `git filter-repo --mailmap` est joué sur un clone neuf, jamais sur le clone de travail
**Then** auteur et committer sont réécrits, le nombre de commits est inchangé et chaque commit garde l'arbre, la date et le message de son original (vérifié commit par commit grâce à la table de correspondance produite par `filter-repo`)
**And** cette table est conservée hors de Git ; les références de commit des documents vivants (AGENTS.md, `docs/`, CHANGELOG) sont mises à jour, celles des documents de travail terminés (`_bmad-output/`) sont laissées et la table indique où les retrouver
**And** le dépôt GitHub n'est pas réécrit : il garde les anciennes empreintes jusqu'à son archivage (11.7)

**Given** les commits suivants
**When** le code vit sur GitLab
**Then** la ligne « Identité » d'AGENTS.md porte l'adresse professionnelle (auteur et committer), vérifiée sur le compte GitLab de Denis, et la signature des commits suit la règle de 11.1 si elle est imposée
**And** ce changement n'est pas fait tant que le dépôt GitHub est public, pour ne pas y publier l'adresse professionnelle

*Notes :* aucune modification de l'extension. La mémoire des agents qui cite l'identité de commit (règle « Mode autonome et commits ») est mise à jour en même temps qu'AGENTS.md.

### Story 11.10: Faire arriver notre `main` sur la branche `develop` du GitLab

*Ajoutée le 25/11/2026 à la demande de Denis.* Constat : le dépôt GitLab existe, sa seule branche est `develop`, il n'a pas de `main`. Se joue **après 11.9, avant 11.4** : l'import pousse vers la branche qu'elle fixe. Son premier critère se tranche dès 11.1.

As a mainteneur qui importe le code sur le GitLab de l'entreprise,
I want que notre `main` arrive sur `develop` sans rien écraser et selon la convention de l'entreprise,
So that l'historique, la CI et la règle de fusion visent la bonne branche dès le premier jour.

**Acceptance Criteria:**

**Given** le dépôt GitLab, dont la seule branche est `develop`
**When** Denis vérifie la convention de branches de l'entreprise (avec l'IT, en 11.1)
**Then** le modèle retenu est consigné dans `docs/technique/developpement.md` : `develop` prend le rôle de notre `main` (branche d'intégration, branche par défaut du dépôt)
**And** si la convention impose une branche de production (`main` ou `master`, branches `release/*`, tags), le moment où le code y passe est fixé, par exemple à chaque version soumise au Chrome Web Store ; sinon aucune `main` n'est créée sur GitLab
**And** les préfixes des branches de travail sont confirmés : `agent/...` accepté, ou remplacé par celui de la convention (par exemple `feature/...`), avec la règle d'AGENTS.md et le filtre de la CI mis à jour en conséquence

**Given** le contenu actuel de `develop`
**When** il est inspecté avant l'import (`git ls-remote`, puis `git log` et la liste des fichiers sur un clone)
**Then** si `develop` est vide, notre `main` y est poussée telle quelle (`git push <gitlab> main:develop`), en avance rapide, sans commit de fusion
**And** si `develop` ne contient que des fichiers d'amorce créés par GitLab (README, `.gitignore`, modèle de licence), leur contenu est relevé, puis `develop` est remplacée une seule fois par notre historique, protection levée le temps du push par un mainteneur du dépôt, avec l'accord explicite de Denis
**And** si `develop` contient de vrais commits, rien n'est remplacé : Denis choisit entre une fusion des deux historiques (`--allow-unrelated-histories`, un commit de fusion) et une autre organisation décidée avec l'IT
**And** après l'import, l'empreinte de `develop` est celle de notre `main` (ou de son historique préparé par 11.9, option B), ou celle du commit de fusion retenu

**Given** `develop` protégée sur GitLab
**When** un agent livre une story ou réserve un numéro de story
**Then** les règles d'AGENTS.md « Fusion dans `main` sur demande explicite » et « réserver d'abord son numéro sur `main` » visent `develop` et suivent les droits réels : push direct en avance rapide s'il est permis, sinon merge request ouverte par `glab` vers `develop` et fusionnée par Denis
**And** les branches de travail partent de `develop`, et leurs merge requests la visent par défaut

**Given** le clone de travail
**When** `origin` passe sur GitLab (11.6)
**Then** la branche locale `main` devient `develop` et suit `origin/develop` (`git branch -m main develop`, `git branch -u origin/develop`, `git remote set-head origin -a`)
**And** les branches de travail en cours sont rebasées ou fusionnées sur `develop`, sans push forcé sur une branche partagée
**And** pendant la transition (11.5), le même commit est poussé sur la `main` de GitHub (`git push github develop:main`) jusqu'à l'archivage de GitHub (11.7) ; aucun miroir automatique

**Given** les références à `main` en tant que branche
**When** la bascule a lieu (11.7)
**Then** elles désignent `develop` : `.gitlab-ci.yml` (11.5), AGENTS.md (fusion, réservation des numéros), `README.md`, `docs/technique/developpement.md`, `docs/site-web.md` si la publication du site dépend encore d'une branche, et le LIRE-MOI du kit Store (`scripts/prepare-store-kit.mjs`, étape 1)
**And** le CHANGELOG et les documents de travail terminés (`_bmad-output/`) gardent `main` (historique)

*Notes :* aucune modification de l'extension. Références à `main` recensées le 25/11/2026 : `.github/workflows/validation.yml` (déclencheurs), `.github/workflows/pages.yml` (retiré ou adapté par 11.2), AGENTS.md (fusion, réservation des numéros), `README.md`, `docs/site-web.md`, `docs/technique/developpement.md`, `scripts/prepare-store-kit.mjs`. La mémoire des agents qui cite `main` est mise à jour en même temps qu'AGENTS.md. L'adresse du dépôt GitLab n'est pas écrite ici tant que le dépôt GitHub est public.

## Epic 12: Sprint Planning V2, à la mesure des droits Jira

Suite du Sprint Planning livré par l'Epic 8 (terminée le 25/11/2026, décision de Denis). Le planning et le Sprint Board tiennent compte des droits Jira de l'utilisateur : ils ne proposent plus un geste que Jira refuserait, et un sprint futur non modifiable reste une source de tickets. Décision produit des droits : Denis, 06/11/2026 ([backlog](backlog.md)). Aujourd'hui, un refus 403 s'affiche au premier geste, sans nouvelle tentative.

Reprises de l'Epic 8, numéros changés le 25/11/2026 : 8.36 → 12.1, 8.37 → 12.2, 8.38 → 12.3 (spec prête, renommée `spec-12-3-…`), 8.39 → 12.4. Les commits, la rétrospective et le contexte de l'Epic 8 gardent les anciens numéros.

Ordre : 12.3 (droits d'un ticket, lecture commune), 12.4 (même lecture sur le Sprint Board), 12.1 (sprint futur non modifiable, s'appuie sur 12.3), 12.2 (entrée fermée sans droit, essai avec un compte sans droit). Règle reprise de la story 8.42 : la logique des droits va dans `src/core/sprintPermissions.ts`, le modèle ne fait que la brancher ; l'écran du planning est déjà rangé par zone (8.42).

### Story 12.1: Planifier les tickets d'un sprint futur que je ne peux pas modifier

*Ex-8.36.* *Type : évolution, décision de Denis du 06/11/2026 (droits du planning, point 1).*

As a membre de l'équipe qui prépare son sprint,
I want voir dans « Où sont les tickets » un sprint futur que je n'ai pas le droit de modifier, s'il contient des tickets du board, et en tirer ces tickets,
So that aucun ticket du board ne m'échappe, sans pour autant préparer un sprint qui ne m'appartient pas.

**Acceptance Criteria:**

**Given** un sprint futur non modifiable par l'utilisateur (règle de 0.43.1 : ni administrateur, ni « Gérer les sprints » sur les projets de son board d'origine) qui contient des tickets restants du board
**When** le planning s'ouvre
**Then** il apparaît dans « Où sont les tickets » avec ses tickets, marqué en consultation ; il n'apparaît ni dans le menu des sprints à préparer, ni comme destination « Vers… », ni à la clôture

**Given** un ticket de ce sprint
**When** je le pose sur un objectif ou dans le sprint préparé (glisser, menu, lot)
**Then** il rejoint le sprint préparé comme depuis un autre sprint futur (E9, puis E5 ou E3/E4), si les droits sur son projet le permettent (story 12.3)

**Given** un tel sprint sans ticket restant du board
**When** le planning s'ouvre
**Then** il n'est pas affiché (règle de 0.48.1 et 0.48.2 inchangée)

**Given** le changement
**When** il est vérifié
**Then** aucune nouvelle route ; le sprint non modifiable est lu par la route des tickets déjà utilisée ; l'essai sur le sandbox confirme que Jira accepte de sortir un ticket d'un sprint que l'utilisateur ne peut pas modifier (contrat à constater, refus 403 affiché sinon)

*Notes :* aujourd'hui `loadSprintPlanning` (`src/core/sprintPlanning.ts`) ne lit que les sprints futurs `proposable` (`proposableSprintIds`, `src/core/sprintPermissions.ts`) ; il faut distinguer « lisible comme source » et « proposable à la préparation ».

### Story 12.2: Pas de Sprint Planning sans le droit de gérer les sprints du board

*Ex-8.37.* *Type : évolution, décision de Denis du 06/11/2026 (droits du planning, point 3), à confirmer par l'essai sans droit.*

As a membre de l'équipe sans droit sur les sprints du board,
I want que l'entrée « Sprint Planning » me dise pourquoi elle m'est fermée,
So that je n'ouvre pas une page vide ou des gestes qui échoueront.

**Acceptance Criteria:**

**Given** un utilisateur ni administrateur Jira, ni titulaire de « Gérer les sprints » sur les projets du board, ou sans *Schedule issues* sur aucun de ces projets
**When** il affiche le board
**Then** l'entrée « Sprint Planning » est désactivée avec sa raison ; le Sprint Board reste entier ; aucune lecture du planning n'est faite

**Given** des droits indécidables (lecture refusée, board sans projet)
**When** le board s'affiche
**Then** l'entrée reste ouverte et le refus de Jira s'affiche au premier geste, sans nouvelle tentative (règle actuelle)

**Given** le changement
**When** il est vérifié
**Then** lectures seules (`mypermissions`, `board/{id}/project`), textes en fr/en/es ; essai sur le sandbox avec un compte sans ces droits, avec l'accord de Denis

### Story 12.3: Gestes d'un ticket désactivés sans droit sur son projet

*Ex-8.38.* *Type : évolution, décision de Denis du 06/11/2026 (droits du planning, point 4).*

As a membre de l'équipe sur un board qui mélange plusieurs projets,
I want que les gestes que Jira me refuserait soient désactivés sur la carte, avec leur raison,
So that je ne découvre pas un refus en pleine séance.

**Acceptance Criteria:**

**Given** les droits lus une fois par projet du board (`GET /rest/api/3/mypermissions`, déjà au contrat, en cache jusqu'à l'actualisation)
**When** un ticket appartient à un projet sans *Schedule issues* (`SCHEDULE_ISSUES`)
**Then** sa carte ne se glisse pas, et l'ajout au sprint, le retrait vers le backlog ou un autre sprint (E9, E10) sont désactivés dans son menu, avec la raison

**Given** un ticket d'un projet sans *Edit issues* (`EDIT_ISSUES`)
**When** j'affiche sa carte
**Then** l'estimation sur la carte (E11) et le lien à un Goal Atlassian (E3/E4) sont désactivés, avec la raison ; la fiche native reste le recours

**Given** une sélection qui mêle des tickets permis et refusés
**When** je la déplace
**Then** le geste est refusé avant toute écriture en nommant les tickets en cause

**Given** des droits indécidables
**When** le geste est tenté
**Then** il part comme aujourd'hui, une seule tentative, refus de Jira affiché

*Notes :* mêmes gestes sur le Sprint Board quand ils écrivent les mêmes routes (rattachement à un objectif en Goals : E3/E4). Aucune nouvelle route ; textes en fr/en/es.

### Story 12.4: Rattachement à un Goal désactivé sur le Sprint Board sans droit sur le projet

*Ex-8.39.* *Type : évolution, séparée de la 8.38 (devenue 12.3) par décision de Denis du 06/11/2026 (le Sprint Board est dans le paquet distribué).*

As a membre de l'équipe sur un board en Goals Atlassian,
I want que le rattachement d'une carte à un Goal soit désactivé quand je n'ai pas *Edit issues* sur son projet,
So that je ne découvre pas le refus de Jira en déplaçant la carte.

**Acceptance Criteria:**

**Given** un board en Goals Atlassian et une carte d'un projet sans *Edit issues* (lecture de la 12.3, en cache)
**When** je la glisse vers une autre swimlane d'objectif ou ouvre son menu
**Then** le dépôt et les entrées d'objectif sont refusés avec la raison, sans écriture (E3, E4) ; les autres gestes ne changent pas

**Given** des droits indécidables
**When** le geste est tenté
**Then** il part comme aujourd'hui, une seule tentative, refus de Jira affiché

*Notes :* réutilise la lecture des droits de ticket de la 12.3 ; coût au chargement du board (une requête par projet) à mesurer, le board étant livré.
