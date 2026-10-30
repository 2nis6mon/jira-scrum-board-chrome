# Relecture adversaire — Architecture Spine « Sprint Goals Board pour Jira »

- Spine relue : `../ARCHITECTURE-SPINE.md` (draft du 2026-10-27)
- Méthode : construire deux unités « un niveau plus bas » qui respectent AD-1 à AD-5 et les conventions
  à la lettre mais divergent (forme de donnée partagée, double propriétaire, chemins de mutation
  concurrents). Chaque trou est vérifié contre le code (`src/core`, `src/app/services`, `src/app/model`,
  `src/jira/writes.ts`, `src/jira/transport.ts`), `DEVELOPER.md`, `CLAUDE.md` et `tests/guards/sources.test.ts`.
- Lecture seule : aucun fichier du dépôt modifié hors ce rapport.

## Verdict

La spine fixe les bonnes frontières de couches mais laisse ouvertes les deux zones où des unités
indépendantes se heurtent réellement : **la propriété `sprintgoals.v1` (trois écrivains, trois codecs,
trois politiques de conflit)** et **le chemin geste → écriture (qui déclenche, qui sérialise, qui
orchestre)**. Plusieurs règles sont démenties par le code sans figurer dans « Écarts à résorber », ce qui
donne à un agent deux précédents contradictoires tous deux « conformes ». À corriger avant de passer
la spine en `adopted`.

## Synthèse

| # | Gravité | Paire d'unités | Règle à créer / resserrer |
|---|---|---|---|
| 1 | Critique | « Rattacher via menu contextuel » (mode texte) × extension du Sprint Planning | AD-4 : primitive unique de mise à jour par propriété, détenue par le module propriétaire |
| 2 | Haute | « Envoyer vers un Goal » depuis un menu × glisser-déposer existant | AD-2 : une fonction `core` par intention métier, services réduits au rendu du résultat |
| 3 | Haute | Nouveau service d'écriture (menu, rang rapide) × `BoardMovementService` / `BoardSettingsService` / `PlanningModel` | Nouvel AD-6 : porte d'écriture unique par board, déclencheur et `JiraWriter` décoré obligatoires |
| 4 | Moyenne | « Épingler depuis l'en-tête de swimlane » × éditeur d'épinglage des réglages | AD-4 étendu à l'entité : un seul résolveur de stockage pour les Goals épinglés |
| 5 | Moyenne | Nouveau modèle qui construit son transport × modèle qui le reçoit | AD-1 : graphe complété, racine de composition nommée, garde automatisée alignée |
| 6 | Moyenne | Message utilisateur produit en `core` × même message produit dans un modèle ; journal persisté | Convention Erreurs/Textes resserrée : texte source du catalogue = format persisté |
| 7 | Moyenne | Nouveau message hôte/vue côté `embedded.ts` × validation côté `injectBoard.ts` | Convention messages → AD : liste déclarative unique + doublon nommé testé |
| 8 | Moyenne | Nouvelle clé locale « carte par site » × nouvelle clé « suffixée par site » | AD-4 : partition, effacement à la déconnexion et concurrence inter-onglets normés |
| 9 | Basse | Fonction expérimentale gardée dans la vue × gardée dans le modèle | AD-5 : lieu de la garde, codecs et nettoyages jamais conditionnés |
| 10 | Basse | Nouvelle lecture via endpoint « enhanced » × lecture Agile | Deferred → règle provisoire « Agile seulement » |

---

## Constat 1 — `sprintgoals.v1` : trois écrivains, trois codecs, trois notions de « version de base » (critique)

**Unité A** — « Rattacher un ticket à un objectif texte depuis un menu contextuel ». L'agent réutilise
`linkToTextGoal` (`core/boardWrites.ts`), fonction de `core` qui encode via `encodeSprintGoalDocument`
du module propriétaire `core/sprintGoals.ts`, relit juste avant d'écrire, une seule tentative.
**Unité B** — « Sprint Planning : ajouter une note par objectif ». L'agent ajoute un champ `note` aux
objets de `goals[]` dans `core/sprintPlanning.ts`, qui préserve déjà les extensions par objectif.

**Conformité à la lettre.** Les deux écrivent depuis `core` (AD-2), encodent par le module propriétaire
(AD-4 l'autorise explicitement : « `sprintgoals.v1` par `boardWrites` et `sprintPlanning` »), relisent
avant écriture, ne rejouent rien.

**Incompatibilité concrète (vérifiée dans le code).**

| Aspect | `boardWrites.linkToTextGoal` | `sprintPlanning.publishSprintPlanning` | `boardWrites.pinAtlassianGoals` |
|---|---|---|---|
| Base de conflit | **aucune** : relit, fusionne, écrit (dernier écrivain gagne sur `goals`) | égalité JSON complète de la propriété brute (`sameJson(freshProperty, current.rawGoalProperty)`) | égalité de `atlassianGoalIds` seulement |
| Version inconnue | conservée telle quelle puis réencodée au format v1 (`version: fresh?.version`) → un document v2 est écrasé sous forme v1 étiquetée v2 | refus (`raw.version !== 1` → « ne sera pas écrasée ») | comme `linkToTextGoal` |
| Clés inconnues | seulement au niveau racine (`DOCUMENT_KEYS` dans `boardWrites.ts`) ; les champs inconnus **d'un objectif** sont perdus par `decodeSprintGoalDocument` | conservées aussi par objectif (« Les extensions de format restent ») | racine seulement |
| `updatedAt` | ISO à la seconde (`timestamp()`) | ISO à la milliseconde (`toISOString()`) | seconde |
| Décodage | `decodeSprintGoalDocument` + tri des clés dans `boardWrites.ts` | `readGoalProperty` (validation stricte réimplémentée dans `sprintPlanning.ts`) | idem `boardWrites` |

Conséquence : la `note` de l'unité B est silencieusement effacée au premier rattachement par l'unité A ;
une publication de planning concurrente à un rattachement n'est pas détectée côté rattachement.
`DEVELOPER.md` (Données persistantes, E5) exige « conflits refusés, données illisibles jamais écrasées,
clés inconnues conservées » : `linkToTextGoal` le viole, et la spine ne le liste pas dans les écarts.
AD-4 lui-même est contradictoire : « seul le module propriétaire décode/encode » alors que trois modules
décodent la forme brute, et « comparaison à la version de base » sans dire **qui** définit cette base.

**Correction proposée — AD-4 resserré :**
> Le module propriétaire d'une propriété Jira expose **la seule** primitive de mise à jour
> `update<Prop>(reader, writer, { base, mutate })` : décodage strict, refus d'une version inconnue ou
> d'une valeur illisible, conservation des clés inconnues **à tous les niveaux**, jeton de conflit
> **défini par le propriétaire** (`sprintgoals.v1` : égalité JSON normalisée hors `updatedAt/updatedBy` ;
> `boardsettings.v1` : `publishedAt`), format d'horodatage unique. Les fonctions de `core` écrivantes ne
> fournissent qu'une mutation pure du document décodé. Garde : `SPRINT_PROPERTY_KEYS.goals` et
> `BOARD_PROPERTY_KEYS.teamSettings` n'apparaissent dans une valeur `JiraWrite` que dans leur module
> propriétaire (test dans `tests/guards`).

Ajouter aux écarts : `linkToTextGoal` sans base de conflit ; décodage hors propriétaire dans
`boardWrites.ts` (`DOCUMENT_KEYS`, `readStoredDocument`) et `sprintPlanning.ts` (`readGoalProperty`,
`planningProperty`) ; perte des extensions par objectif.

---

## Constat 2 — Le lien ticket ↔ Goal a deux chemins de mutation possibles (haute)

**Unité A** — « Envoyer vers un Goal » depuis un menu de carte. L'agent lit AD-2 (« toute écriture passe
par une fonction de `core` qui porte séquence, relecture, arrêt au premier échec et résultat partiel »)
et crée `core/goalLinks.assignGoal()` : en mode Atlassian, il **lie d'abord le nouveau Goal puis détache
l'ancien** (évite un ticket sans Goal), et renvoie un résultat typé.
**Unité B** — le glisser-déposer existant, dont la séquence vit dans
`app/services/BoardMovementService.ts` (`execute` : transition → Goal → rang ; `#assignAtlassianGoal` :
**détacher puis lier**, arrêt si le détachement échoue ; branchement `snapshot.goalsOrigin`).

**Conformité.** A suit AD-2 à la lettre ; B est le code existant, que la spine ne signale pas comme écart
(seul `BoardSettingsService` l'est). Un agent qui copie B est « conforme au précédent ».

**Incompatibilité.** Même entité (lien E3/E4), deux ordres d'opérations, deux états intermédiaires
possibles (ticket sur deux Goals vs ticket sans Goal), deux libellés de succès partiel, deux formes
d'entrée de journal. `DEVELOPER.md` fixe l'ordre pour E3/E4 (« s'arrêtent si le détachement échoue »)
mais la spine n'oblige pas à passer par une fonction unique.

**Correction — AD-2 resserré :**
> Chaque intention métier (déplacer, rattacher à un objectif quel que soit `goalsOrigin`, classer,
> épingler, publier les réglages, publier le planning) a **une seule** fonction de `core`, qui renvoie un
> résultat typé (`confirmed | partial{étapes} | conflict | refused | uncertain`). Un nouveau geste
> réutilise cette fonction ; il n'en crée pas une variante. Les services ne font que traduire le
> résultat en avis et en journal.

Ajouter aux écarts : orchestration de `BoardMovementService.execute`/`#assignAtlassianGoal` à déplacer
dans `core`.

---

## Constat 3 — Qui déclenche, qui sérialise : aucune porte d'écriture commune (haute)

**Preuves.**
- `PlanningModel` (un **modèle**, pas un service) appelle `publishSprintPlanning(this.client, this.transport, …)`
  et écrit lui-même au journal ; il passe le `JiraTransport` complet comme écrivain.
- `BoardSettingsService` sérialise par sa propre file `#teamQueue`.
- `BoardModel.dropIssue` sérialise par `pendingKeys.size > 0`, sans regarder `teamSaving` ni
  `planning.publishing`.
- AD-2 dit « un service déclenche… gère file, droits et journal » : une file **par service**, pas par
  ressource Jira, et le déclenchement depuis un modèle n'est ni interdit ni listé en écart.

**Unité A** — « Classer en haut de colonne » via un nouveau `QuickRankService` avec sa propre file,
décorant le `JiraWriter` d'une garde de droits fondée sur `canEdit`.
**Unité B** — glisser-déposer existant : garde `pendingKeys`, droits laissés à Jira (« exige la permission
Planifier les tickets »).

**Incompatibilité.** Les deux respectent AD-2 et AD-3, mais un classement rapide peut partir pendant un
dépôt sur le même ticket (deux files distinctes), la projection `pendingMove` ne couvre pas le geste A,
et la même écriture E2 est autorisée ou refusée selon le geste (droits `canEdit` vs droits Jira — CLAUDE.md
réserve `canEdit` aux réglages partagés). Même risque entre rattachement texte (pas de file) et
épinglage Scrum (`#teamQueue`) sur la même propriété `sprintgoals.v1`, aggravé par le constat 1.

**Correction — nouvel AD-6 « Porte d'écriture du board » :**
> Toute écriture déclenchée depuis la vue d'un board acquiert la porte unique détenue par `BoardModel`
> (exclusion mutuelle par board, ou par ressource Jira si justifié) ; aucun service ni modèle ne crée sa
> propre file d'écritures Jira. Le déclencheur est un service (le planning compris, ou bien la spine
> nomme explicitement l'exception `PlanningModel`). Le `JiraWriter` remis à `core` est toujours le
> décorateur fourni par la porte (péremption de génération, droits), jamais le `JiraTransport` brut.
> Les droits : `canEdit` pour E6 uniquement ; E1–E5, E8, E9 laissés à Jira.

---

## Constat 4 — « Goals épinglés » : une entité, deux propriétés, deux bases de conflit (moyenne)

`DEVELOPER.md` : épinglage Scrum dans `sprintgoals.v1.atlassianGoalIds` (via `pinAtlassianGoals`,
conflit = liste ordonnée), Kanban dans `boardsettings.v1.settings.boardPinnedGoalIds` (via
`BoardSettingsService.#saveBoardPinnedGoals`, conflit = liste **et** `publishedAt`). Le choix est fait
par `configuration.boardType === "kanban"` dans le service.

**Unité A** — épinglage depuis l'en-tête d'une swimlane : choisit la propriété selon la présence d'un
sprint actif (`snapshot.sprint`). **Unité B** — éditeur des réglages : selon `boardType`.
Un board Scrum sans sprint actif ou un Kanban avec sprints (cas Jira possibles) écrit à deux endroits ;
chaque unité respecte AD-4, car AD-4 raisonne **par propriété**, pas par entité.

**Correction — AD-4 étendu :** « Une entité métier persistée (objectifs texte, liens texte, Goals épinglés,
réglages d'équipe) a un seul résolveur de stockage en `core` ; aucun geste ne choisit lui-même la propriété ».
Ajouter un tableau entité → propriété → résolveur dans DEVELOPER.md (pas dans la spine).

---

## Constat 5 — AD-1 : le graphe est faux par rapport au code et aux gardes (moyenne)

Imports présents mais absents du graphe : `app/model → jira` (8 fichiers, dont la construction de
`JiraTransport`, `JiraClient`, `GoalsClient` dans `BoardModel`/`AppModel`), `app/services → app/model`
(4 fichiers, y compris une **fonction**, `toMessage`), `app/services → jira` (4 fichiers, dont
`JiraError`, `GoalsClient`). La garde `tests/guards/sources.test.ts` autorise explicitement
`services → model` hors `BoardModel`, et ne teste pas `jira → core`. Les écarts ne citent que
`transport.ts → loadTrace.ts`.

**Paire.** Unité A crée `ReportModel` qui instancie son propre `JiraTransport` (précédent `AppModel` l. 436 /
`BoardModel` l. 293) ; unité B reçoit le transport du board. Résultat : deux transports, deux traces de
chargement, une garde de péremption contournée — sans violer de règle vérifiable, puisque la règle
contredite par le code n'est pas appliquée.

**Correction — AD-1 :** ajouter les flèches réelles (`model → jira` limité à la racine de composition,
`services → model` limité aux types et à `messages.ts`, `services → jira` contrats seulement) ; nommer
`AppModel`/`BoardModel` comme **seuls** constructeurs de `JiraTransport`, `JiraClient`, `GoalsClient`,
`AuditLog` ; faire de la garde de sources la traduction exacte du graphe (Rule vérifiable).

---

## Constat 6 — Messages : trois producteurs, et du texte français persisté (moyenne)

La convention dit « messages utilisateur produits par les modèles », mais `core/sprintPlanning.ts`
renvoie du texte (« Publication suspendue : … »), `core/boardWrites.ts` lève `new Error("Cet objectif
n'existe plus…")`, `BoardMovementService` compose les avis. `localize()` (`src/i18n/index.ts`) traduit
par correspondance exacte ou par motifs `{p0}` triés par poids ; `audit.v1` stocke ces phrases et les
localise à la relecture (« relu dans son journal historique »).

**Paire.** Unité A reformule un message dans le catalogue ; les entrées anciennes du journal (format
persisté AD-4) ne sont plus traduites. Unité B ajoute un motif `« {p0} a changé dans Jira… »` plus lourd
qui capture un message de l'unité A et le traduit à tort. Aucune règle de la spine n'est violée.

**Correction :** convention resserrée — `core` renvoie des résultats typés ou des clés du catalogue,
jamais de phrase libre ; un texte source déjà écrit dans `audit.v1` est figé (ou le journal stocke
clé + paramètres) ; un test refuse deux motifs du catalogue pouvant capturer la même chaîne.

---

## Constat 7 — Messages hôte ↔ vue : « liste fermée » sans lieu ni schéma (moyenne)

Les types `sprint-goals:*` sont des littéraux répartis dans `integration/embedded.ts`,
`integration/injectBoard.ts` (sans import, par contrainte), `integration/worker.ts`,
`integration/bootstrap.ts`, `app/platform/launcherChrome.ts`, sur deux canaux (`postMessage` et
`chrome.runtime`). Aucune déclaration unique ni contrôle de charge utile partagé.

**Paire.** Unité A étend `sprint-goals:open-issue` avec `{ key, tab: "goal" }` côté vue ; unité B
durcit la validation de `open-issue` dans `injectBoard` (regex de clé, refus des champs inconnus) :
les deux respectent « préfixe, liste fermée, origine et source vérifiées », mais le message est
silencieusement rejeté.

**Correction :** promouvoir la convention en AD : une liste déclarative unique (types, canal, sens,
schéma de charge utile) dans `src/integration/messages.ts`, utilisée par tous les modules qui peuvent
importer ; la copie dans `injectBoard.ts` est un **doublon nommé** comme `language.v1`, couvert par un test
qui compare littéraux et validations.

---

## Constat 8 — Clés locales : partition, effacement et concurrence non normés (moyenne)

**Preuves.** Deux formes coexistent : carte par site sous une clé (`boards.v1`, `dismissedNotices.v1`,
`graphqlOrigin.v1`, `audit.v1`) et clé suffixée (`sprint-planning.v1:<origine>`,
`jira-button-position.v1:<origine>`). L'effacement à la déconnexion est une liste manuelle dans
`AppModel.disconnect()` (l. 239-268). La sérialisation n'existe que dans une instance
(`AuditLog.#queue`, `BoardModel.#saveQueue`) ; plusieurs onglets Jira et le lanceur font des
lecture-modification-écriture concurrentes sur la même clé (DEVELOPER.md ne l'assume que pour
`loadDiagnostics.v1`).

**Paire.** Unité A crée `favoriteFilters.v1` (carte par site) avec son module propriétaire ; unité B crée
`dailyTimer.v1:<origine>`. Toutes deux respectent AD-4, mais A n'est pas effacée à la déconnexion (rien ne
l'impose : AD-4 annonce l'effacement complet dans *Prevents* sans le mettre dans *Rule*) et perd des
entrées entre deux onglets ; B est effacée seulement si quelqu'un l'ajoute à la liste.

**Correction — AD-4 :** tout module propriétaire d'une clé contenant des données d'un site exporte
`forgetSite(origin)`, enregistré dans une liste unique appelée par la déconnexion, avec un test qui
confronte cette liste au tableau des clés de DEVELOPER.md ; forme de partition imposée pour les nouvelles
clés ; politique inter-onglets explicite (perte acceptée et documentée, ou fusion sur `storage.onChanged`).

---

## Constat 9 — AD-5 : où garder, et quoi ne jamais garder (basse)

Le mécanisme est sain (`define` Vite selon le mode, test `tests/buildModes.test.ts`). Mais AD-5 ne dit
pas **où** tester l'interrupteur : une unité qui garde seulement la vue (`Sidebar`) laisse le chemin
d'écriture du modèle atteignable (par exemple via une vue demandée par l'URL ou par un message hôte),
alors que `PlanningModel` garde chaque point d'entrée. Rien n'interdit non plus de conditionner un codec
ou un nettoyage (`forgetSite`) à l'interrupteur, ce qui casserait la lecture des données écrites par un
build `dist/` dans le paquet.

**Correction :** « La garde porte sur chaque point d'entrée du modèle ou service qui lit ou écrit pour la
fonction ; décodage, conservation des formats et effacement ne sont jamais conditionnés. » (L'écart
`SPRINT_HEALTH_ENABLED`/`DIAGNOSTIC_ENABLED` est déjà listé.)

---

## Constat 10 — Deferred « endpoints enhanced » laisse diverger les lectures (basse)

CLAUDE.md verrouille les **écritures** ; les lectures ne le sont pas. Tant que la décision est ouverte,
une unité peut lire le board via un endpoint Software « enhanced » (forme de rang/colonnes différente)
pendant qu'une autre lit l'Agile. **Correction :** règle provisoire dans la spine — « jusqu'à décision,
toute lecture passe par `JiraClient` et les endpoints Agile/REST v3 documentés dans DEVELOPER.md ».
Les autres éléments de Deferred (inversion hexagonale, canal de publication, contrats détenus ailleurs)
ne laissent pas diverger deux unités.

---

## Applicabilité des règles (Rule ↔ Prevents)

| AD | Vérifiable ? | Empêche ce qu'annonce *Prevents* ? |
|---|---|---|
| AD-1 | Partiellement : la garde de sources n'encode qu'une partie du graphe et contredit le graphe (services → model) | Non tant que le graphe ne reflète pas le code (constat 5) |
| AD-2 | Inventaire : oui (gardes exhaustives sur `writes.ts`, méthodes HTTP, mutations GraphQL). Orchestration dans `core` : non vérifiable, et démentie par `BoardMovementService` et `PlanningModel` | Partiellement (constats 2, 3) |
| AD-3 | Oui pour Preact/signals dans les services (garde existante) ; non pour « les vues n'affectent aucun signal » | Oui pour l'essentiel |
| AD-4 | Non : « version de base » indéfinie, propriétaire unique démenti par trois décodeurs, effacement absent de la Rule | Non (constats 1, 4, 8) |
| AD-5 | Oui (`buildModes.test.ts`) | Oui, sous réserve du lieu de la garde (constat 9) |

## Trous écartés car déjà couverts ailleurs

- Appels `fetch` hors transport, méthodes HTTP d'écriture, mutations GraphQL hors inventaire,
  `storage.sync`, en-têtes réseau, `chrome.*`/DOM dans `core`/`jira`/services : gardes de
  `tests/guards/sources.test.ts` et CLAUDE.md.
- Rejeu d'écriture et succès annoncé avant confirmation : CLAUDE.md (une seule tentative, relecture
  après résultat incertain) et `JiraError.isOutcomeUnknown`.
- Nouvelle écriture/endpoint/permission/CSP : décision produit exigée par CLAUDE.md.
- Doublon `language.v1` de `bootstrap.ts` : nommé dans AD-4 et imposé par CLAUDE.md.
- `boardsettings.v1` : un seul encodeur (`publishTeamSettings`), conflit par `publishedAt`, clés inconnues
  conservées aux deux niveaux ; le seul écart (relecture dans le service) est déjà listé.
