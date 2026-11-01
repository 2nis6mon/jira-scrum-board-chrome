---
status: approuvé (Denis, 01/11/2026)
date: 2026-11-01
trigger: _bmad-output/forge/sprint-planning-complet/forged-idea.md
mode: lot
scope: modéré (une epic redéfinie, règles produit et architecture amendées)
---

# Proposition de changement — Sprint Planning en direct dans Jira

## 1. Résumé du problème

Le 01/11/2026, la revue de la maquette du Sprint Planning puis une session de réflexion
([forged-idea.md](../forge/sprint-planning-complet/forged-idea.md),
[maquette v2](../forge/sprint-planning-complet/maquette-sprint-planning-v2.html)) ont abouti à un
changement d'orientation produit. Il renverse la décision du 14/10/2026 sur laquelle reposent
l'Epic 8, `AGENTS.md`, `docs/technique/` et la note d'architecture.

| Décision du 14/10/2026 (en vigueur) | Décision du 01/11/2026 (Denis) |
|---|---|
| Préparation locale, relecture, publication explicite | Chaque geste écrit aussitôt dans Jira ; Jira seule source |
| Ajout de tickets du backlog seulement | Backlog et autres sprints futurs du board, sans alerte |
| Aucun retrait de ticket | Retrait depuis le sprint en préparation, vers le backlog ou un sprint futur |
| RAF actif consultatif, aucun report automatique | Clôture par la fenêtre native Jira, puis report des objectifs non atteints |
| Aucun démarrage de sprint | Démarrage par la fenêtre native Jira |
| Objectifs texte seulement, sans Goals Atlassian | Source du board : texte, ou Goals Atlassian cherchés par nom et épinglés |
| Capacité locale au brouillon | Vélocité partagée dans `sprintgoals.v1` |

Type : changement d'orientation produit, issu des parties prenantes (pas d'une limite technique).
Preuves : maquette v2, journal de la session (`.memlog.md`), décisions confirmées une à une par Denis.

## 2. Analyse d'impact

### Checklist

| Point | État | Constat |
|---|---|---|
| 1.1 Story déclenchante | N/A | Aucune : revue de maquette et session de réflexion |
| 1.2 Problème | Fait | Changement d'orientation, voir § 1 |
| 1.3 Preuves | Fait | Maquette v2, `forged-idea.md`, `.memlog.md` |
| 2.1 Epic en cours | Fait | Epic 8 non commencée (5 stories `backlog`) ; ne peut pas être menée telle quelle |
| 2.2 Changement d'epic | Fait | Epic 8 redéfinie : objectif, notes et stories |
| 2.3 Autres epics | Fait | Aucune autre epic touchée ; Epic 1 (porte d'écriture, `updateSprintGoalProperty`) réutilisée |
| 2.4 Epics obsolètes / nouvelles | Fait | Aucune ; stories 8.1 et 8.2 actuelles caduques ou absorbées |
| 2.5 Ordre | Fait | Inchangé : Epic 8 indépendante, après l'Epic 1 livrée |
| 3.1 PRD | N/A | Pas de PRD (décision du 30/10) ; FR17 et backlog amendés |
| 3.2 Architecture | Action | AD-2, AD-6, AD-7, « Modules et flux », environnements |
| 3.3 UX | Fait | Pas de document UX ; maquette v2 sert de référence d'écran |
| 3.4 Autres artefacts | Action | `AGENTS.md`, `docs/technique/` (invariants, sécurité, données, intégration, développement), `verify:planning`, sprint-status |
| 4.1 Ajustement direct | Viable | Effort élevé, risque moyen-élevé |
| 4.2 Retour arrière | Non viable | Rien de livré à défaire ; le code expérimental existant sera repris |
| 4.3 Révision du MVP | N/A | Pas de MVP formel ; le périmètre de l'Epic 8 s'élargit, activation toujours conditionnée à l'essai réel |
| 6.4 sprint-status | Action | Remplacer les entrées de l'Epic 8 après approbation |

### Impact sur les epics et stories

- **Epic 8 redéfinie** : de « publier un planning préparé localement sans conflit inutile » à
  « planifier en direct dans Jira, de la clôture au démarrage ».
- **Story 8.1 actuelle** (publication sans refuser un changement sans rapport) : caduque, il n'y a
  plus de publication d'ensemble ; la règle de conflit devient celle de chaque geste.
- **Story 8.2 actuelle** (le planning attend son tour) : absorbée ; chaque geste passe par la porte
  du board (AD-6), et le journal « rien n'a été envoyé » (entrée de `deferred-work.md`) s'applique à
  chaque geste.
- **Stories 8.3, 8.4, 8.5 actuelles** (avis traduits, essai réel, activation) : conservées,
  renumérotées et adaptées.

### Conflits avec les artefacts

- **`AGENTS.md`** : deux règles produit contredites (écritures du planning, décision du 14/10) ; la
  règle des formulaires natifs s'étend aux fenêtres de sprint.
- **`docs/technique/invariants.md`** : règle en gras « seule la publication explicite… » et paragraphe
  Sprint Planning entier.
- **`docs/technique/securite.md`** : E8 et E9 (déclencheurs, périmètre) ; nouvel appel de retour au
  backlog (E10) une fois le contrat vérifié.
- **`docs/technique/donnees.md`** : clé `sprint-planning.v1` (brouillons) sans usage ; nouveau champ
  vélocité de `sprintgoals.v1` ; « document entier pour le planning » dans la règle de conflit.
- **`docs/technique/integration-jira.md`** : ouverture des fenêtres natives « Terminer le sprint » et
  « Démarrer le sprint », messages hôte ↔ vue associés ; lecture des sprints futurs du board.
- **`docs/technique/developpement.md`** : périmètre de `verify:planning` et `verify:planning:package`.
- **Note d'architecture** : AD-2 (« publier le planning »), AD-6 (lie E8, E9 ; nouvel appel),
  AD-7 (nouveaux messages), « Modules et flux ».
- **`backlog.md`** : section Sprint Planning (« démarrage… report automatique… hors périmètre »).

### Impact technique

- Écritures : E8 et E9 déclenchés par geste ; E9 élargi aux tickets d'autres sprints futurs ;
  nouvel appel `POST /rest/agile/1.0/backlog/issue` (E10) ; aucune écriture de clôture ni de
  démarrage (fenêtres natives).
- `core/sprintPlanning.ts` : la publication en séquence laisse place à une fonction `core` par
  intention (écrire les objectifs, placer un ticket, retirer un ticket, reporter les objectifs,
  enregistrer la vélocité), conformément à AD-2.
- `PlanningModel` : plus de brouillon ; lecture de Jira à l'entrée et après chaque geste.
- Intégration hôte : dépendance supplémentaire au DOM du backlog Jira pour les fenêtres natives.
- Contrôles : `verify:planning` réécrit sur le banc fictif ; essai réel obligatoire avant activation.

## 3. Approche recommandée

**Ajustement direct** : redéfinir l'Epic 8 et ses stories, amender les règles et la documentation,
sans toucher aux autres epics.

- **Pourquoi** : l'epic n'est pas commencée, aucune livraison n'est à défaire, et l'Epic 1 a déjà
  fourni les fondations (porte d'écriture unique, mise à jour sans perte de `sprintgoals.v1`,
  une fonction `core` par intention).
- **Effort** : élevé (11 stories, dont une vérification de contrats et deux intégrations de fenêtres
  natives).
- **Risque** : moyen-élevé. Écritures immédiates en séance (une erreur arrive dans Jira),
  dépendance au DOM du backlog Jira, nouvel appel d'écriture. Atténuation : contrats vérifiés en
  premier (8.1), une seule tentative par écriture, relecture avant le texte des objectifs, essai réel
  avant activation.
- **Calendrier** : Sprint Planning reste désactivé dans le paquet jusqu'à la dernière story ;
  aucune livraison en cours n'est retardée.
- **Alternatives écartées** : garder la décision du 14/10 (refusée par Denis) ; écrire clôture et
  démarrage par l'extension (remplacé par les fenêtres natives, sans nouvelle écriture).

## 4. Propositions de modification détaillées

### 4.1 Epics et stories (`_bmad-output/planning-artifacts/epics.md`)

**En-tête `decisions`** — ajouter :

```
  - "Sprint Planning en direct (Denis, 01/11/2026) : remplace la décision produit du 14/10/2026 ; Epic 8 redéfinie depuis _bmad-output/forge/sprint-planning-complet/forged-idea.md (proposition sprint-change-proposal-2026-11-01.md)."
```

**FR17**

OLD :
```
FR17: Sprint Planning est validé sur une instance réelle (droits, volumes) avant son activation dans le paquet ; démarrage/création de sprint, report automatique du RAF et création de Goals restent hors périmètre.
```
NEW :
```
FR17: Sprint Planning planifie le prochain sprint en direct dans Jira : chaque geste écrit aussitôt ; objectifs selon la source du board (texte, ou Goals Atlassian cherchés et épinglés) ; tickets pris dans le backlog et les sprints futurs du board, retirés seulement du sprint en préparation ; clôture et démarrage par les fenêtres natives Jira, avec report des objectifs non atteints ; vélocité partagée. Il est validé sur une instance réelle avant son activation dans le paquet ; création de sprint et création de Goals restent hors périmètre.
```

**NFR1** — ajouter à la fin : « Exception décidée le 01/11/2026 : retour d'un ticket au backlog
depuis le sprint en préparation (E10), sous réserve de la vérification du contrat (story 8.1). »

**Epic List, Epic 8**

OLD :
```
### Epic 8: Sprint Planning prêt à activer
L'équipe prépare son prochain sprint dans l'extension et publie objectifs et tickets du backlog sans conflit inutile ni geste refusé, et la fonction, validée sur un vrai Jira, est activée dans le paquet distribué.
**FRs covered:** FR17
*Notes :* créé le 31/10/2026 (Denis) : Sprint Planning est aujourd'hui une fonction cachée (`dist/` local et tests seulement). Reprend l'action 5 de la rétrospective de l'Epic 1 et les écarts du planning relevés pendant l'Epic 1. Périmètre produit inchangé (décision du 14/10/2026) : ni démarrage ni création de sprint, ni retrait de ticket, ni création de Goal.
```
NEW :
```
### Epic 8: Sprint Planning en direct dans Jira
L'équipe clôture son sprint, construit le suivant par objectifs avec des tickets trouvés partout sur le board, puis le démarre, sans quitter l'extension ; chaque geste est aussitôt dans Jira, et la fonction, validée sur un vrai Jira, est activée dans le paquet distribué.
**FRs covered:** FR17
*Notes :* créé le 31/10/2026, redéfini le 01/11/2026 (Denis) depuis [forged-idea.md](../forge/sprint-planning-complet/forged-idea.md), qui remplace la décision du 14/10/2026. Création de sprint et de Goals hors périmètre. Droits (lecture seule annoncée ou découverte au premier refus) : décision en attente. Écran de référence : maquette v2.
```

**Section « Epic 8 » : remplacer le texte d'introduction et les stories 8.1 à 8.5** par :

```
## Epic 8: Sprint Planning en direct dans Jira

L'équipe clôture son sprint, construit le suivant par objectifs avec des tickets trouvés partout sur le board, puis le démarre. Chaque geste écrit aussitôt dans Jira, qui reste la seule source : la page se reconstruit à l'entrée depuis le texte de l'objectif du sprint, la propriété `sprintgoals.v1` et les tickets du sprint. Aujourd'hui, Sprint Planning n'existe que dans les builds locaux `dist/` et les tests (`SPRINT_PLANNING_ENABLED`) ; il le reste jusqu'à la story 8.11. Décisions : [forged-idea.md](../forge/sprint-planning-complet/forged-idea.md) ; écran : maquette v2.

Ordre : contrats d'abord, écran et objectifs ensuite, clôture et démarrage, puis essai réel et activation.

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
**When** un cycle complet est joué (clôture, report, objectifs, tickets venant de plusieurs sprints, retrait, vélocité, démarrage), avec et sans droit de gérer les sprints, sur un backlog volumineux
**Then** le constat est consigné, et chaque défaut devient une story ou un correctif ; la décision sur les droits est prise à partir de ce constat

### Story 8.11: Activer le Sprint Planning dans le paquet

As a équipe qui installe l'extension depuis le paquet distribué,
I want trouver Sprint Planning,
So that je planifie mes sprints sans build local.

**Acceptance Criteria:**

**Given** les stories 8.1 à 8.10 terminées et le constat de 8.10 favorable
**When** le paquet est construit (`npm run package`)
**Then** `SPRINT_PLANNING_ENABLED` vaut vrai dans le paquet, `npm run verify:planning:package` le vérifie, et AGENTS.md, le manuel, le CHANGELOG et les captures Store sont à jour
```

### 4.2 Suivi de sprint (`_bmad-output/implementation-artifacts/sprint-status.yaml`)

OLD :
```
  8-1-publier-le-planning-sans-refuser-un-changement-sans-rapport: backlog
  8-2-le-planning-attend-son-tour-au-lieu-d-être-refusé: backlog
  8-3-avis-du-planning-traduits-dans-les-trois-langues: backlog
  8-4-valider-le-sprint-planning-sur-un-vrai-jira: backlog
  8-5-activer-le-sprint-planning-dans-le-paquet: backlog
```
NEW :
```
  8-1-verifier-les-contrats-atlassian-du-planning-en-direct: backlog
  8-2-l-ecran-du-planning-parle-comme-la-page-du-sprint: backlog
  8-3-ecrire-les-objectifs-texte-au-fil-de-la-seance: backlog
  8-4-poser-un-ticket-sur-un-objectif-l-ajoute-au-sprint: backlog
  8-5-preparer-le-sprint-avec-les-goals-atlassian: backlog
  8-6-velocite-partagee-du-sprint: backlog
  8-7-cloturer-le-sprint-actif-et-reporter-ses-objectifs: backlog
  8-8-demarrer-le-sprint-prepare: backlog
  8-9-avis-du-planning-dans-les-trois-langues: backlog
  8-10-valider-le-sprint-planning-sur-un-vrai-jira: backlog
  8-11-activer-le-sprint-planning-dans-le-paquet: backlog
```

### 4.3 Backlog (`_bmad-output/planning-artifacts/backlog.md`, section Sprint Planning)

OLD :
```
Le démarrage/création de sprint, le report automatique du RAF et la création de Goals restent hors périmètre.
```
NEW :
```
Depuis le 01/11/2026, le planning se fait en direct dans Jira, clôture et démarrage par les fenêtres natives compris ([décisions](../forge/sprint-planning-complet/forged-idea.md)). La création de sprint et la création de Goals restent hors périmètre.
```

### 4.4 Règles produit (`AGENTS.md`)

OLD :
```
- Écritures métier limitées aux transitions, rang, liens ticket ↔ Goal, propriétés de sprint/board
  et publication explicite du Sprint Planning (texte `goal` et ajout de tickets du backlog à un sprint futur).
```
NEW :
```
- Écritures métier limitées aux transitions, rang, liens ticket ↔ Goal, propriétés de sprint/board
  et gestes du Sprint Planning (texte `goal`, ajout de tickets au sprint en préparation, retour au backlog).
```

OLD :
```
- Décision produit du 14/10/2026 : Sprint Planning prépare des objectifs texte, sans Goals Atlassian.
  Seule sa confirmation de publication peut modifier le texte natif et ajouter des tickets du backlog
  à un sprint futur ; RAF actif consultatif. Aucun démarrage/création de sprint, retrait de ticket,
  ni création de Goal. Préparation locale, relecture avant écriture, conflit conservant le brouillon.
```
NEW :
```
- Décision produit du 01/11/2026 (remplace celle du 14/10) : Sprint Planning écrit chaque geste
  aussitôt dans Jira, seule source. Objectifs selon la source du board (texte, ou Goals Atlassian
  épinglés, jamais créés). Tickets ajoutés depuis le backlog ou un sprint futur du board, retirés
  seulement du sprint en préparation. Clôture et démarrage par les fenêtres natives Jira, puis report
  des objectifs non atteints. Création de sprint exclue. Relecture du texte des objectifs avant écriture.
```

OLD :
```
- Fiches et formulaires de transition natifs Jira. L'extension ne remplit ni ne valide les champs ;
```
NEW :
```
- Fiches, formulaires de transition et fenêtres de clôture/démarrage de sprint natifs Jira.
  L'extension ne remplit ni ne valide les champs ;
```

### 4.5 Documentation technique (`docs/technique/`)

**`invariants.md`, règle en gras**

OLD : `**Seule la publication explicite du Sprint Planning peut modifier le champ natif d'un sprint futur.**`
NEW : `**Seuls les gestes du Sprint Planning modifient le champ natif d'un sprint futur ; le texte est relu avant chaque écriture.**`

**`invariants.md`, paragraphe Sprint Planning** — réécrire à la livraison des stories 8.2 à 8.8
(lecture à l'entrée, une fonction `core` par geste, séquences E8→E5 et E9→E5/E3, frontière du
retrait, fenêtres natives et report, vélocité). Le texte actuel (brouillons, publication en
séquence, synthèse copiable en cas de conflit) est supprimé à ce moment-là, pas avant.

**`securite.md`, inventaire** (à la clôture de la story 8.1, selon le constat)

OLD :
```
| E8 | `POST /rest/agile/1.0/sprint/{id}`, seul champ `goal` | Confirmation du planning, sprint futur relu, sans dates/état/nom |
| E9 | `POST /rest/agile/1.0/sprint/{id}/issue`, seul tableau `issues`, au plus 50 | Confirmation du planning, tickets du backlog relus, jamais du RAF actif |
```
NEW :
```
| E8 | `POST /rest/agile/1.0/sprint/{id}`, seul champ `goal` | Geste sur les objectifs du planning, sprint futur relu, texte inchangé depuis l'affichage, sans dates/état/nom |
| E9 | `POST /rest/agile/1.0/sprint/{id}/issue`, seul tableau `issues`, au plus 50 | Ticket posé sur un objectif (backlog ou sprint futur du board vers le sprint en préparation), ou retiré du sprint en préparation vers un autre sprint futur ; jamais depuis le sprint actif |
| E10 | `POST /rest/agile/1.0/backlog/issue`, seul tableau `issues` | Ticket retiré du sprint en préparation vers le backlog (contrat vérifié en 8.1) |
```

**`donnees.md`** : ligne `sprint-planning.v1` réécrite selon la décision de la story 8.2 ; champ
vélocité de `sprintgoals.v1` documenté en 8.6 ; « document entier pour le planning » retiré de la
règle de conflit en 8.3.

**`integration-jira.md`** : section « fenêtres natives de sprint » et messages hôte ↔ vue ajoutés en
8.7 et 8.8 ; lecture des sprints futurs du board en 8.2.

**`developpement.md`** : périmètre de `verify:planning` (gestes, retrait, fenêtres natives simulées
sur le banc fictif) et de `verify:planning:package` (« zéro requête Planning », sans brouillon).

### 4.6 Note d'architecture (`ARCHITECTURE-SPINE.md`)

- **AD-2** : remplacer « publier le planning » par « écrire les objectifs du planning, placer un
  ticket, retirer un ticket, reporter les objectifs, enregistrer la vélocité » dans la liste des
  intentions ayant une seule fonction `core`.
- **AD-6** : « Binds » passe à « E1–E6, E8–E10 » ; « E1–E5, E8 et E9 sont laissés aux droits Jira »
  devient « E1–E5 et E8–E10 » (décision sur les droits du planning en attente).
- **AD-7** : rappeler que les messages d'ouverture et de fermeture des fenêtres natives de sprint
  sont déclarés dans `src/integration/messages.ts`.
- **Modules et flux** : « publication du planning » → « gestes du planning » dans la file de
  `BoardWriteGate`.

### 4.7 Hors de cette proposition

- `CHANGELOG.md`, manuel utilisateur et captures Store : mis à jour à la livraison des stories
  concernées et à l'activation (8.11), comme le prévoit `AGENTS.md`.

## 5. Transmission

- **Classement : modéré.** Une seule epic redéfinie, mais des règles produit et l'architecture
  changent.
- **Denis (produit)** : approuve la proposition ; tranche le sort des anciens brouillons (8.2) et,
  après l'essai réel (8.10), la question des droits.
- **Architecte (Winston)** : amende la note d'architecture (§ 4.6) en même temps que `AGENTS.md`.
- **Développeur (Amelia, `bmad-build`)** : stories 8.1 à 8.11 dans l'ordre ; documentation
  technique mise à jour story par story (§ 4.5).
- **À l'approbation** : `epics.md`, `sprint-status.yaml`, `backlog.md`, `AGENTS.md`, la règle en
  gras de `invariants.md` et la note d'architecture sont modifiés ; le reste de `docs/technique/`
  suit les stories.

**Critères de réussite** : aucun document n'affirme encore la décision du 14/10 ; `npm run check`
et `npm run verify:jira` verts après chaque story ; Sprint Planning reste absent du paquet jusqu'à
8.11 ; aucun appel Jira utilisé sans contrat vérifié (8.1).

## 6. Exécution

Approuvé par Denis le 01/11/2026. Appliqué le jour même : `epics.md` (décisions, FR17, NFR1, Epic 8
et stories 8.1 à 8.11), `sprint-status.yaml`, `backlog.md`, `AGENTS.md` (trois règles, avec mention
que le code suit encore l'ancienne décision jusqu'à l'Epic 8), règle en gras de
`docs/technique/invariants.md` (même mention), note d'architecture (AD-2, AD-6, AD-7, « Modules et
flux »). Le reste de `docs/technique/` suit les stories. Transmission : Amelia (`bmad-build`) pour
les stories, en commençant par 8.1.
