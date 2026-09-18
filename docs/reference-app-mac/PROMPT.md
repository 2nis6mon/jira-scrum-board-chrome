# CRÉATION D’UNE APPLICATION MACOS STANDALONE — SCRUM BOARD CONNECTÉ À JIRA / ATLASSIAN

Je veux que tu développes une **application macOS standalone complète, fonctionnelle et prête à être utilisée en production** par une équipe Agile.

L’application doit être une interface desktop spécialisée dans la gestion opérationnelle d’un Sprint Scrum, connectée directement à Jira / Atlassian.

L’objectif n’est pas de remplacer Jira, mais de créer une **meilleure expérience de Scrum Board**, notamment en mettant réellement en valeur les **Sprint Goals natifs d’Atlassian**, qui existent déjà mais sont aujourd’hui insuffisamment visibles et exploités dans un Scrum Board classique.

---

# ⚠️ CONSIGNES ABSOLUES

* **Ne me pose aucune question de clarification.**
* Prends toi-même les décisions techniques nécessaires lorsqu'un point n'est pas explicitement défini.
* Ne me livre pas uniquement une maquette ou un prototype.
* Je veux une **application réellement fonctionnelle de bout en bout**.
* Je veux une **véritable application macOS standalone**.
* Aucun serveur distant ne doit être nécessaire au fonctionnement de l'application.
* Chaque utilisateur doit pouvoir télécharger l'application, l'installer sur son Mac et l'utiliser directement.
* Chaque utilisateur doit utiliser **son propre compte Jira et son propre API Token**.
* Les credentials Jira doivent être gérés localement et de manière sécurisée.
* Jira / Atlassian reste la **source de vérité**.
* Ne crée pas un système parallèle de Sprint Goals.
* Ne crée pas de Backlog.
* Ne transforme pas l'application en deuxième Jira.
* Je veux une V1 suffisamment aboutie pour être utilisée directement par une équipe.

---

# ⚠️ LIMITES DE L’IA GÉNÉRATIVE

Tu es une IA générative et tu dois tenir compte de tes propres limites.

**Ne jamais masquer une limitation technique par une implémentation fictive ou approximative.**

## 1. Ne pas inventer les capacités de Jira / Atlassian

Avant d'utiliser une fonctionnalité Jira ou Atlassian :

* vérifier qu'elle est réellement disponible via l'API utilisée ;
* vérifier la version et le type de Jira concernés ;
* vérifier les permissions nécessaires ;
* vérifier le format réel des données retournées ;
* vérifier les méthodes d'écriture réellement disponibles.

**Interdiction absolue d'inventer :**

* endpoints ;
* paramètres API ;
* champs Jira ;
* objets Atlassian ;
* méthodes d'authentification ;
* mécanismes de Sprint Goals ;
* relations Ticket ↔ Goal ;
* transitions ;
* permissions.

Si une capacité n'est pas disponible ou ne peut pas être vérifiée :

```text
NE PAS SIMULER
NE PAS INVENTER
NE PAS FAIRE SEMBLANT
```

Il faut alors isoler proprement la fonctionnalité et prévoir une alternative réaliste ou la déclarer comme non disponible.

---

## 2. Ne pas simuler une fonctionnalité qui devrait être réelle

Une fonctionnalité connectée à Jira doit réellement fonctionner avec Jira.

Par exemple :

```text
ABC-123

IN PROGRESS
      ↓
      TEST
```

doit déclencher :

```text
Drag & Drop
↓
Transition Jira réelle
↓
Réponse Jira
↓
Succès
↓
Mise à jour de l'interface
```

Si Jira refuse la transition :

```text
Erreur Jira
↓
Rollback visuel
↓
Message utilisateur
```

Une fausse mise à jour locale est interdite.

---

## 3. Ne pas confondre « code généré » et « application fonctionnelle »

Le fait de générer du code ne signifie pas que l'application fonctionne.

Tu dois vérifier autant que possible :

* compilation ;
* dépendances ;
* imports ;
* types ;
* appels API ;
* gestion des erreurs ;
* authentification ;
* stockage Keychain ;
* navigation ;
* Drag & Drop ;
* packaging ;
* configuration macOS.

Après chaque étape importante, corriger les erreurs détectées avant de poursuivre.

Ne pas déclarer :

> « Fonctionnalité terminée »

si elle n'est que partiellement implémentée.

---

## 4. Ne pas produire de placeholders dans la version finale

Ne pas laisser dans la V1 des éléments tels que :

```text
TODO
FIXME
Coming soon
Implement later
Mock data
Fake API
Demo mode
Lorem ipsum
```

sauf lorsqu'une limitation externe réelle l'impose.

Dans ce cas, l'élément doit être clairement identifié comme limitation et ne doit pas être présenté comme fonctionnel.

---

## 5. Ne pas utiliser de fausses données Jira

En production, ne pas utiliser :

* tickets fictifs ;
* utilisateurs fictifs ;
* Sprint fictif ;
* Sprint Goals fictifs ;
* statuts fictifs ;
* transitions simulées.

Les données affichées dans le Board doivent provenir de Jira.

Pour les tests automatisés, des mocks peuvent être utilisés **uniquement dans l'environnement de test**, jamais dans l'application de production.

---

## 6. Ne pas inventer une API manquante pour les Sprint Goals

Les Sprint Goals constituent une fonctionnalité particulièrement importante de cette application.

Si l'API Atlassian ne permet pas exactement :

* de lire ;
* créer ;
* modifier ;
* supprimer ;
* associer ;

les Sprint Goals comme attendu, tu dois le détecter.

Dans ce cas :

1. implémenter ce qui est réellement possible ;
2. isoler ce qui ne l'est pas ;
3. ne pas créer une base parallèle de Goals sans l'indiquer ;
4. ne pas prétendre utiliser une API Atlassian inexistante.

La priorité est :

> **Exactitude > complétude artificielle.**

---

## 7. Ne pas contourner les permissions Jira

L'application doit fonctionner avec les permissions réelles de l'utilisateur.

Ne jamais :

* contourner une permission ;
* utiliser un compte administrateur caché ;
* utiliser un token partagé ;
* utiliser un proxy permettant d'élever les droits ;
* stocker les credentials d'un autre utilisateur.

Si l'utilisateur n'a pas le droit d'effectuer une action :

```text
Action refusée par Jira
```

doit être affiché proprement.

---

## 8. Ne pas exiger d'infrastructure non prévue

Le produit demandé est une application macOS standalone.

Ne pas transformer automatiquement le projet en :

```text
Mac App
+
Backend
+
Database
+
Authentication Server
+
Cloud
```

uniquement parce que cela simplifierait le développement.

Si une architecture sans serveur est techniquement possible, elle doit rester privilégiée.

Si une fonctionnalité nécessite réellement un backend pour des raisons incontournables de sécurité ou d'API, l'indiquer explicitement et ne pas l'introduire silencieusement.

---

## 9. Ne pas stocker les secrets dans le code

Ne jamais mettre dans le projet :

* API Token Jira ;
* mot de passe ;
* secret ;
* credential ;
* token de test utilisable ;
* clé privée.

Ne jamais générer de credential fictif en laissant entendre qu'il est prêt à fonctionner.

Le code doit être distribué sans secret utilisateur.

---

## 10. Ne pas prétendre avoir testé ce qui n'a pas pu l'être

Si ton environnement ne permet pas de tester une fonctionnalité avec un véritable Jira :

ne pas dire :

> « Testé avec succès sur Jira »

si ce test n'a pas réellement été effectué.

Utiliser alors une formulation factuelle :

> « Implémenté mais nécessite une validation avec une instance Jira réelle. »

Les tests réellement effectués doivent être distingués des tests théoriques.

---

## 11. Ne pas masquer les limitations de l'environnement

Si ton environnement ne permet pas :

* de signer une application avec un certificat Apple réel ;
* de notariser auprès d'Apple ;
* d'accéder à un Jira réel ;
* de tester le Keychain sur macOS ;
* de générer un `.dmg` valide ;
* de vérifier certaines API Atlassian ;

tu dois continuer à construire tout ce qui est possible, mais **ne jamais prétendre avoir effectué l'opération impossible**.

Dans ce cas, fournir :

* le code ;
* la configuration ;
* les scripts ;
* les instructions ;
* les prérequis ;
* les étapes restantes.

---

## 12. Prioriser la robustesse sur la quantité de fonctionnalités

Si tu dois choisir entre :

```text
10 fonctionnalités partiellement fonctionnelles
```

et :

```text
5 fonctionnalités réellement fiables
```

privilégier les fonctionnalités réellement fiables.

Ordre de priorité :

1. connexion Jira ;
2. authentification ;
3. récupération des données ;
4. exactitude des données ;
5. transitions Jira ;
6. Sprint Goals ;
7. relations Ticket ↔ Goal ;
8. Scrum Board ;
9. RUN ;
10. filtres et confort d'utilisation.

---

## 13. Ne pas sur-architecturer

Ne pas ajouter de technologies uniquement parce qu'elles sont disponibles.

Éviter inutilement :

* microservices ;
* backend ;
* base cloud ;
* architecture distribuée ;
* Kubernetes ;
* Docker ;
* message broker ;
* infrastructure complexe.

L'application doit rester :

```text
Simple
↓
Standalone
↓
Sécurisée
↓
Maintenable
↓
Performante
```

---

## 14. Conserver une architecture extensible

Même si la V1 est volontairement limitée, le code doit permettre ultérieurement d'ajouter :

* plusieurs Boards ;
* plusieurs projets ;
* davantage de types RUN ;
* métriques ;
* WIP ;
* Aging ;
* Sprint Health ;
* notifications ;
* intégrations supplémentaires.

Mais **ne pas développer ces fonctionnalités au détriment du MVP**.

---

## 15. Distinguer obligatoire / optionnel / impossible

Pour chaque fonctionnalité, utiliser cette classification :

### MUST HAVE

Fonctionnalité obligatoire et fonctionnelle dans la V1.

### SHOULD HAVE

Fonctionnalité utile pouvant être intégrée si elle ne compromet pas le MVP.

### PHASE 2

Fonctionnalité volontairement reportée.

### BLOCKED

Fonctionnalité impossible à réaliser correctement avec les capacités réelles de Jira, macOS ou de l'environnement de développement.

Une fonctionnalité `BLOCKED` ne doit jamais être remplacée par une simulation présentée comme réelle.

---

## 16. Ne pas ajouter de fonctionnalités non demandées

Ne transforme pas progressivement l'application en :

* clone complet de Jira ;
* outil de gestion de projet ;
* outil de reporting complexe ;
* outil de planification ;
* outil de gestion RH ;
* outil de chat ;
* outil de documentation.

Si une idée supplémentaire semble intéressante, elle peut être identifiée comme **Phase 2**, mais ne doit pas alourdir la V1.

---

## 17. En cas d'incertitude technique

Lorsque tu rencontres une ambiguïté technique :

1. rechercher la solution officielle ;
2. vérifier la documentation disponible ;
3. choisir la solution la plus simple ;
4. privilégier les standards macOS et Atlassian ;
5. éviter toute hypothèse non vérifiée.

**Ne me pose pas la question : prends la décision technique lorsque plusieurs solutions réalistes existent.**

En revanche, lorsqu'une information est techniquement impossible à déterminer sans accès à mon environnement Jira, ne l'invente pas.

---

## 18. Principe final

Applique cette règle pendant toute la génération :

> **Ne jamais compenser une limite technique par une fiction logicielle.**

Je préfère :

```text
Une fonctionnalité réellement fonctionnelle
```

à :

```text
Une fonctionnalité visuellement convaincante mais fictive.
```

Et je préfère :

```text
Une limitation clairement identifiée
```

à :

```text
Une fausse promesse de fonctionnement.
```

La qualité de l'application doit être évaluée sur son **fonctionnement réel**, sa robustesse et son intégration réelle avec Jira, et non sur la quantité de code ou le nombre de fonctionnalités affichées dans l'interface.

---

# 1. CONCEPT DE L'APPLICATION

L'application doit permettre de gérer visuellement un Scrum Board Jira avec :

* Sprints ;
* Sprint Goals ;
* User Stories ;
* colonnes Jira ;
* statuts Jira ;
* filtres ;
* Drag & Drop ;
* RUN en mode Kanban ;
* vue Daily ;
* progression du Sprint et des Sprint Goals.

Le concept central est :

> **Jira gère les données.
> L'application améliore l'expérience de pilotage du Sprint.**

L'application doit notamment permettre à l'équipe de passer d'une vision :

> « Quels tickets avons-nous dans le Sprint ? »

à une vision :

> « Quels objectifs du Sprint sommes-nous en train d'accomplir et où en sommes-nous ? »

---

# 2. ARCHITECTURE : APPLICATION MACOS STANDALONE

**Aucune infrastructure serveur distante ne doit être nécessaire.**

Architecture cible :

```text
┌──────────────────────────────┐
│       APPLICATION MACOS      │
│                              │
│ Scrum Board                  │
│ Sprint Goals                 │
│ RUN / Kanban                 │
│ Filtres                      │
│ Administration               │
│                              │
│ Jira API Client              │
└──────────────┬───────────────┘
               │
             HTTPS
               │
               ▼
        ┌──────────────┐
        │ Jira /       │
        │ Atlassian    │
        └──────────────┘
```

Ne pas nécessiter :

* serveur backend distant ;
* API intermédiaire ;
* serveur d'entreprise ;
* base de données cloud ;
* infrastructure SaaS ;
* Docker ;
* Node.js ;
* Python ;
* Java ;
* ou autre installation technique côté utilisateur.

Toutes les dépendances nécessaires doivent être embarquées dans l'application.

---

# 3. TECHNOLOGIE

Choisis toi-même la technologie la plus adaptée pour construire une vraie application macOS.

Tu peux utiliser par exemple :

* Swift / SwiftUI ;
* Tauri ;
* Electron ;
* ou une autre technologie appropriée.

**Ne me demande pas de choisir.**

Privilégie :

* intégration macOS ;
* sécurité ;
* performances ;
* simplicité de distribution ;
* Drag & Drop fluide ;
* stockage sécurisé des credentials ;
* maintenance ;
* accès HTTPS à Jira ;
* interface moderne.

L'application doit être conçue comme un **produit desktop**, pas comme un site web nécessitant un serveur.

---

# 4. CONNEXION JIRA PAR UTILISATEUR

Chaque utilisateur doit configurer sa propre connexion Jira.

Lors du premier démarrage :

```text
Bienvenue

Connexion à Jira

URL Jira
[________________________]

Email / utilisateur
[________________________]

API Token
[________________________]

[ Tester la connexion ]

[ Continuer ]
```

Après validation :

```text
Connexion Jira ✓

URL du Scrum Board
[________________________]

[ Détecter le Board ]
```

Chaque utilisateur possède donc :

```text
Son Mac
+
Son compte Jira
+
Son API Token
+
Sa configuration locale
```

Il n'existe **aucun token Jira partagé entre les utilisateurs**.

---

# 5. STOCKAGE DU TOKEN

Le token/API credential Jira doit être stocké localement de manière sécurisée.

Privilégier obligatoirement le :

**macOS Keychain**

Ne jamais stocker le token en clair dans :

* un fichier JSON ;
* localStorage ;
* cookies ;
* `.env` distribué avec l'application ;
* SQLite non chiffré ;
* logs ;
* code source.

Ne jamais transmettre le token à un serveur tiers.

---

# 6. DÉTECTION AUTOMATIQUE DU BOARD

L'utilisateur doit pouvoir simplement fournir l'URL de son Scrum Board Jira.

Exemple :

```text
https://mon-jira.com/.../boards/123
```

À partir de cette URL, l'application doit essayer de récupérer automatiquement :

* board ;
* nom du board ;
* projet(s) ;
* Sprint actif ;
* Sprints disponibles ;
* colonnes ;
* statuts ;
* mapping colonnes → statuts ;
* types de tickets ;
* utilisateurs ;
* workflows ;
* transitions ;
* Sprint Goals ;
* données nécessaires au fonctionnement.

L'objectif est de **réduire au minimum la configuration manuelle**.

Si Jira/Atlassian ne permet pas de récupérer automatiquement une information :

* ne pas inventer d'API ;
* identifier la limitation ;
* prévoir une configuration manuelle uniquement pour cette information.

---

# 7. VÉRIFICATION DES API ATLASSIAN

Avant d'implémenter les fonctionnalités avancées, vérifie précisément les capacités réelles de l'API Atlassian/Jira utilisée concernant :

* lecture des Sprint Goals ;
* création des Sprint Goals ;
* modification des Sprint Goals ;
* suppression des Sprint Goals ;
* association ticket ↔ Sprint Goal ;
* récupération des Sprints ;
* colonnes ;
* statuts ;
* transitions ;
* workflows ;
* configuration des boards.

Ne jamais inventer un endpoint ou une fonctionnalité.

Si une fonctionnalité visible dans Jira n'est pas accessible via l'API publique :

* utiliser l'alternative officielle si elle existe ;
* sinon prévoir une solution élégante ;
* ne jamais créer artificiellement une deuxième source de vérité.

---

# 8. JIRA EST LA SOURCE DE VÉRITÉ

Toutes les données Jira doivent provenir de Jira.

Au chargement :

```text
Application
   ↓
Connexion Jira
   ↓
Récupération du Board
   ↓
Sprint
   ↓
Sprint Goals
   ↓
Tickets
   ↓
Affichage
```

L'application peut utiliser un cache local pour les performances, mais Jira reste toujours la source de vérité.

Prévoir :

* synchronisation au démarrage ;
* bouton « Actualiser » ;
* timestamp de dernière synchronisation ;
* refresh après modification ;
* éventuellement refresh automatique configurable.

---

# 9. PÉRIMÈTRE DES MODIFICATIONS AUTORISÉES

L'application doit volontairement avoir un **périmètre d'écriture très limité**.

Les seules modifications métier autorisées depuis l'application sont :

## A. Sprint Goals

Permettre :

* créer ;
* modifier ;
* supprimer si l'API Atlassian le permet.

Les modifications doivent agir sur les Sprint Goals **natifs Atlassian**.

Ne pas créer de Sprint Goals propriétaires à l'application.

## B. Association Ticket ↔ Sprint Goal

Permettre :

* associer une User Story à un Sprint Goal ;
* désassocier une User Story ;
* changer son Sprint Goal.

Utiliser le mécanisme natif Atlassian lorsqu'il existe.

## C. Statuts Jira

Permettre de déplacer un ticket d'une colonne à une autre.

Le déplacement doit déclencher la transition Jira correspondant à la colonne cible.

---

# 10. CE QUI NE DOIT PAS ÊTRE MODIFIABLE

L'application ne doit pas permettre de modifier :

* résumé d'une User Story ;
* description ;
* Story Points ;
* priorité ;
* assignee ;
* labels ;
* composants ;
* commentaires ;
* autres champs Jira ;
* création de tickets ;
* suppression de tickets ;
* création de Sprint ;
* dates de Sprint ;
* Product Backlog ;
* Releases ;
* configuration générale du projet.

Tout cela reste dans Jira.

La philosophie doit rester :

> **Application = pilotage du Sprint.
> Jira = gestion détaillée des tickets.**

---

# 11. SCRUM BOARD

La page principale doit être un Scrum Board moderne.

Les colonnes doivent être dynamiques et provenir de Jira.

Exemple :

```text
TO DO | IN PROGRESS | CODE REVIEW | TEST | DONE
```

Chaque carte doit afficher au minimum :

* clé Jira ;
* résumé ;
* assignee ;
* avatar ;
* type ;
* priorité ;
* statut ;
* Story Points si disponibles ;
* labels si pertinents ;
* Sprint Goal associé.

---

# 12. DRAG & DROP

Le Drag & Drop est une fonctionnalité centrale.

Exemple :

```text
IN PROGRESS
      ↓
Drag & Drop
      ↓
TEST
      ↓
Détermination du statut Jira
      ↓
Transition Jira
      ↓
Confirmation
      ↓
Refresh
```

L'application ne doit jamais considérer le changement comme réussi tant que Jira ne l'a pas confirmé.

En cas d'échec :

* remettre la carte à sa place ;
* afficher une erreur claire ;
* permettre de réessayer.

Gérer les workflows Jira nécessitant éventuellement des transitions intermédiaires.

---

# 13. SPRINTS

Afficher :

* Sprint actif ;
* Sprints futurs si utiles ;
* Sprints terminés pour consultation si pertinent ;
* nom ;
* dates ;
* nombre de tickets ;
* Story Points ;
* progression.

Le Sprint actif est affiché par défaut.

Exemple :

```text
SPRINT 42
12 Sep → 26 Sep

🎯 3 objectifs
📋 27 tickets
📊 82 Story Points
✅ 11 Done
🔄 9 In Progress
⏳ 7 To Do
🔥 4 RUN
```

---

# 14. SPRINT GOALS ATLASSIAN — FONCTIONNALITÉ CENTRALE

Les Sprint Goals existent déjà dans Atlassian.

**L'application doit les exploiter, pas les recréer.**

Le problème que l'application doit résoudre est leur manque de visibilité dans les Scrum Boards classiques.

Les Sprint Goals doivent devenir un élément central de l'interface.

Afficher clairement :

```text
🎯 Finaliser le parcours de paiement

🎯 Améliorer la stabilité

🎯 Préparer la release
```

---

# 15. CRÉER / MODIFIER / SUPPRIMER UN SPRINT GOAL

Depuis l'application, permettre si l'API Atlassian le permet :

```text
+ Ajouter un Sprint Goal
```

Puis :

* modifier ;
* supprimer.

Les opérations doivent modifier les données natives Atlassian.

Aucune copie locale indépendante ne doit devenir la source de vérité.

---

# 16. LIER LES TICKETS AUX SPRINT GOALS

Chaque User Story doit pouvoir être associée à un Goal.

Exemple :

```text
ABC-123
Finaliser paiement

🎯 Sprint Goal
[ Finaliser le parcours de paiement ▼ ]
```

Permettre :

* choisir un Goal ;
* changer de Goal ;
* supprimer le rattachement.

Idéalement, permettre également le Drag & Drop d'une carte d'une swimlane Goal vers une autre pour modifier directement son association.

Cette action doit utiliser le mécanisme Atlassian approprié.

---

# 17. BOARD ORGANISÉ PAR SPRINT GOAL

Le mode par défaut doit pouvoir afficher les tickets regroupés par Sprint Goal.

Exemple :

```text
🎯 OBJECTIF 1 — Finaliser le parcours de paiement
────────────────────────────────────────────────

TO DO       IN PROGRESS       TEST       DONE
------------------------------------------------
ABC-123     ABC-127           ABC-145    ABC-101
ABC-130     ABC-132


🎯 OBJECTIF 2 — Améliorer la stabilité
────────────────────────────────────────────────

TO DO       IN PROGRESS       TEST       DONE
------------------------------------------------
ABC-131     ABC-139           ABC-141    ABC-120


🎯 OBJECTIF 3 — Préparer la release
────────────────────────────────────────────────

TO DO       IN PROGRESS       TEST       DONE
------------------------------------------------
ABC-150
```

Le Sprint Goal devient donc la logique principale de lecture du board.

---

# 18. TICKETS SANS SPRINT GOAL

Les tickets qui ne peuvent pas être associés à un Sprint Goal doivent apparaître dans :

```text
⚠️ SANS SPRINT GOAL
```

Cette section :

* n'est pas un objectif ;
* ne crée aucun Goal ;
* sert uniquement à rendre visibles les tickets non associés.

Ne jamais forcer artificiellement une association.

---

# 19. PROGRESSION DES SPRINT GOALS

Pour chaque Goal, afficher des données factuelles :

* nombre de tickets ;
* nombre Done ;
* tickets restants ;
* Story Points totaux ;
* Story Points terminés ;
* progression.

Exemple :

```text
🎯 Finaliser le parcours de paiement

12 tickets
8 Done
4 restants

42 / 55 Story Points

██████████████░░░░ 76 %
```

La progression doit être calculée uniquement à partir des données Jira.

Ne pas inventer une note de « réussite » du Sprint Goal.

---

# 20. INTERACTION AVEC LES GOALS

Cliquer sur un Goal doit pouvoir filtrer automatiquement le board.

Exemple :

```text
🎯 Finaliser le parcours de paiement
              ↓
Afficher uniquement les tickets associés
```

Prévoir :

* afficher tous les Goals ;
* afficher un seul Goal ;
* afficher « Sans Sprint Goal » ;
* revenir au board complet.

---

# 21. MODES D'AFFICHAGE

Prévoir au minimum :

### Mode Sprint Goal

Swimlanes par Goal.

### Mode classique

Colonnes Jira sans regroupement.

### Mode compact

Goals visibles sous forme de bandeaux avec progression.

Le changement de mode doit être immédiat.

---

# 22. RUN / KANBAN

Créer une zone séparée dédiée au RUN.

Types RUN par défaut :

* Anomalie de Recette ;
* Anomalie Prod.

La configuration doit permettre d'ajouter d'autres types.

Exemple :

```text
RUN

À TRAITER | EN COURS | EN VALIDATION | TERMINÉ
------------------------------------------------
BUG-123   | BUG-128  | BUG-130       | BUG-110
BUG-125   | BUG-129
```

Le RUN doit fonctionner davantage comme un Kanban.

Les tickets RUN peuvent être déplacés entre colonnes.

Les déplacements déclenchent les transitions Jira correspondantes.

---

# 23. SCRUM / RUN

Les deux espaces doivent être visuellement séparés.

```text
┌────────────────────────────────────────────┐
│                 SCRUM                      │
│                                            │
│ 🎯 Goal 1                                  │
│ 🎯 Goal 2                                  │
│ 🎯 Goal 3                                  │
│ ⚠️ Sans Sprint Goal                        │
│                                            │
└────────────────────────────────────────────┘

┌────────────────────────────────────────────┐
│                 RUN                        │
│                                            │
│ À traiter | En cours | Validation | Done   │
│                                            │
└────────────────────────────────────────────┘
```

Les tickets RUN ne doivent pas être intégrés aux Sprint Goals.

---

# 24. FILTRES

Prévoir des filtres combinables :

* Assignee ;
* Type ;
* Priorité ;
* Sprint ;
* Sprint Goal ;
* Statut ;
* Scrum / RUN ;
* labels ;
* composants si disponibles.

Filtres rapides :

* Mes tickets ;
* RUN ;
* Sans Sprint Goal ;
* À tester ;
* Bloqués si l'information est disponible.

Prévoir :

```text
Réinitialiser les filtres
```

Les filtres ne modifient aucune donnée Jira.

---

# 25. RECHERCHE

Ajouter une recherche rapide par :

* clé Jira ;
* résumé ;
* assignee ;
* type ;
* label.

La recherche doit être rapide et ne pas nécessiter de recharger inutilement tout le board.

---

# 26. MODE DAILY

Prévoir un mode Daily simplifié permettant de se concentrer sur :

* tickets en cours ;
* tickets bloqués ;
* tickets récemment terminés ;
* Sprint Goals ;
* RUN.

Cette vue reste en lecture seule sauf pour les trois catégories de modifications autorisées :

* Goals ;
* relations Goal ↔ ticket ;
* statuts.

---

# 27. WIP / AGING / BLOQUÉS

Si cela apporte une vraie valeur, implémenter :

* âge du ticket dans une colonne ;
* indicateurs WIP ;
* seuil WIP configurable ;
* identification des tickets bloqués si Jira fournit l'information ;
* filtres correspondants.

Ces indicateurs doivent rester simples et factuels.

---

# 28. VUE SPRINT HEALTH

Prévoir éventuellement une vue synthétique :

```text
SPRINT HEALTH

🎯 Objectifs
████████████░░ 68 %

⚠️ Sans objectif
3 tickets

🔴 Bloqués
2 tickets

⏱ Tickets vieillissants
4 tickets

🔥 RUN
5 tickets
```

Les indicateurs doivent être calculés à partir des données disponibles.

Ne pas créer d'algorithmes complexes ou arbitraires.

---

# 29. MODE PRÉSENTATION / FULL SCREEN

Prévoir un vrai mode plein écran adapté :

* Daily ;
* Sprint Planning ;
* Sprint Review ;
* écran de salle de réunion.

L'interface doit être lisible à distance.

---

# 30. ADMINISTRATION

Créer une section Administration permettant de configurer :

## Jira

* URL ;
* connexion ;
* board ;
* projet si nécessaire.

## Colonnes

```text
Colonne application → Statut Jira
```

## Types

```text
User Story → SCRUM
Bug → SCRUM
Anomalie Recette → RUN
Anomalie Prod → RUN
```

## RUN

* types RUN ;
* colonnes ;
* mapping des statuts ;
* WIP éventuellement.

Ne pas créer d'administration parallèle des Sprint Goals.

Les Sprint Goals sont administrés via les données Atlassian.

---

# 31. PERMISSIONS

Respecter strictement les permissions Jira de l'utilisateur.

L'application ne doit jamais permettre à quelqu'un d'effectuer une action que son compte Jira ne peut pas effectuer.

Si une action est interdite :

* message clair ;
* aucune modification locale trompeuse.

---

# 32. SYNCHRONISATION

Prévoir :

* synchronisation au démarrage ;
* refresh manuel ;
* refresh après modification ;
* timestamp ;
* éventuellement refresh automatique.

En cas de changement dans Jira pendant l'utilisation de l'application :

* détecter autant que possible le changement ;
* ne jamais écraser silencieusement une modification Jira ;
* privilégier Jira.

---

# 33. GESTION DES ERREURS

Gérer :

* Jira indisponible ;
* Internet indisponible ;
* token expiré ;
* authentification échouée ;
* permission insuffisante ;
* transition impossible ;
* ticket supprimé ;
* Sprint inexistant ;
* Goal inaccessible ;
* timeout API ;
* erreur API Atlassian.

Afficher des messages compréhensibles.

---

# 34. STOCKAGE LOCAL

Peuvent être stockés localement :

* préférences utilisateur ;
* board sélectionné ;
* préférences d'affichage ;
* filtres favoris ;
* configuration RUN ;
* cache temporaire.

Les credentials doivent être dans le Keychain.

Les Sprint Goals ne doivent pas être dupliqués dans une base locale indépendante.

---

# 35. MULTI-BOARD

Même si la première utilisation est centrée sur un board, prévoir une architecture permettant plusieurs boards ultérieurement.

Ne pas coder en dur :

* projet ;
* statuts ;
* colonnes ;
* types ;
* utilisateurs ;
* Sprints ;
* Sprint Goals.

---

# 36. PERFORMANCE

Le board doit rester fluide avec un nombre important de tickets.

Prévoir si nécessaire :

* virtualisation ;
* cache ;
* chargement optimisé ;
* appels API minimisés ;
* récupération des seules données nécessaires ;
* mise à jour efficace après Drag & Drop.

---

# 37. SÉCURITÉ

Prévoir :

* HTTPS ;
* Keychain ;
* gestion sécurisée des sessions ;
* validation des données ;
* protection contre les injections ;
* logs sans secrets ;
* aucun token exposé ;
* respect des permissions Jira.

---

# 38. LOGS / AUDIT

Prévoir un journal technique local pour diagnostiquer les problèmes de synchronisation.

Exemple :

```text
Utilisateur
Date / heure
Ticket
Ancien statut
Nouveau statut
Résultat Jira
```

Ne jamais enregistrer :

* API Token ;
* mot de passe ;
* secret ;
* credential.

---

# 39. DISTRIBUTION MACOS

Je veux pouvoir distribuer l'application comme une vraie application Mac :

```text
Scrum Board.app
```

Idéalement fournir :

* `.app` ;
* `.dmg` ;
* signature Apple ;
* notarisation Apple si possible.

Scénario :

```text
Télécharger
↓
Installer
↓
Ouvrir
↓
Configurer Jira
↓
Donner l'URL du Board
↓
Utiliser
```

Aucune installation technique supplémentaire ne doit être nécessaire.

---

# 40. MISE À JOUR

Prévoir une architecture permettant des mises à jour ultérieures.

Si possible :

* auto-update sécurisé ;
* conservation de la configuration ;
* conservation du Keychain ;
* conservation des préférences.

---

# 41. OFFLINE

L'application n'a pas besoin d'être pleinement fonctionnelle offline.

En cas de perte de connexion :

```text
Connexion Jira indisponible

Dernière synchronisation :
17/09/2026 09:42

[ Réessayer ]
```

Ne jamais faire croire qu'une modification Jira a réussi sans confirmation Jira.

---

# 42. PHILOSOPHIE PRODUIT

L'application doit rester volontairement simple.

Elle n'est pas destinée à remplacer toutes les fonctionnalités Jira.

### Jira gère :

* tickets ;
* contenu des tickets ;
* utilisateurs ;
* Sprints ;
* Sprint Goals ;
* workflows ;
* statuts ;
* Backlog ;
* Releases ;
* données projet.

### L'application gère :

* expérience Scrum Board ;
* visualisation des Sprint Goals ;
* organisation par Goal ;
* progression des Goals ;
* association Ticket ↔ Goal ;
* Drag & Drop des statuts ;
* RUN Kanban ;
* filtres ;
* Daily ;
* Full Screen.

---

# 43. LES SEULES CATÉGORIES D'ÉCRITURE

> **Ajout du 17 septembre 2026, validé par Denis** : une quatrième catégorie, le
> **classement** (rang du board), a été ajoutée pour permettre de réordonner les tickets
> dans une colonne comme dans Jira. Le reste de la règle est inchangé.

L'application doit respecter cette règle simple :

## 🎯 1. SPRINT GOALS

Créer / modifier / supprimer.

## 🔗 2. RELATIONS

Ticket ↔ Sprint Goal :

Associer / désassocier / changer.

## 🔄 3. WORKFLOW

Déplacer une carte :

```text
Colonne A → Colonne B
        ↓
Transition Jira
```

## 📊 4. CLASSEMENT

Réordonner une carte dans une colonne :

```text
Glisser-déposer vertical
        ↓
PUT /rest/agile/1.0/issue/rank
```

**Tout le reste est en lecture seule.**

---

# 44. UX CIBLE

Quand l'utilisateur ouvre l'application :

```text
Connexion
↓
Sprint actif
↓
Sprint Goals visibles immédiatement
↓
Tickets regroupés par Goal
↓
RUN séparé
↓
Filtres
↓
Progression
↓
Drag & Drop
↓
Jira mis à jour
```

En quelques secondes, l'utilisateur doit comprendre :

1. Quels sont les objectifs du Sprint ?
2. Où en est chaque objectif ?
3. Quels tickets contribuent à chaque objectif ?
4. Quels tickets sont en cours ?
5. Quels tickets sont sans objectif ?
6. Quelle est la situation du RUN ?

---

# 45. CRITÈRES DE RÉUSSITE

Le produit est réussi si :

1. L'utilisateur télécharge l'application Mac.
2. Il l'installe sans serveur.
3. Il configure son propre compte Jira.
4. Son token est stocké dans le Keychain.
5. Il fournit l'URL du Scrum Board.
6. Le board est détecté automatiquement.
7. Le Sprint actif est affiché.
8. Les Sprint Goals Atlassian natifs sont récupérés.
9. Les Sprint Goals sont beaucoup plus visibles que dans Jira.
10. Les tickets peuvent être organisés par Goal.
11. Les tickets sans Goal sont visibles.
12. L'utilisateur peut créer/modifier/supprimer les Goals si l'API le permet.
13. L'utilisateur peut associer/désassocier les tickets aux Goals.
14. L'utilisateur peut déplacer les tickets entre colonnes.
15. Le déplacement déclenche réellement une transition Jira.
16. L'application attend la confirmation Jira.
17. Le RUN est séparé du Scrum Board.
18. Les filtres fonctionnent.
19. La recherche fonctionne.
20. Le mode plein écran fonctionne.
21. L'application fonctionne sans serveur central.
22. Chaque utilisateur peut utiliser son propre compte Jira.
23. Les permissions Jira sont respectées.
24. L'application est distribuable comme une application macOS.

---

# 46. LIVRABLE FINAL

Je veux que tu **construises l'application complète**, pas simplement que tu me décrives comment la construire.

Ne me demande aucune validation intermédiaire.

Prends les décisions techniques nécessaires toi-même.

Je veux obtenir :

* application macOS fonctionnelle ;
* interface finalisée ;
* connexion Jira ;
* authentification ;
* stockage Keychain ;
* détection automatique du board ;
* lecture des Sprints ;
* lecture des Sprint Goals Atlassian ;
* création/modification/suppression des Sprint Goals si supporté ;
* gestion des relations tickets ↔ Goals ;
* Scrum Board ;
* Drag & Drop ;
* transitions Jira ;
* RUN Kanban ;
* filtres ;
* recherche ;
* vue Daily ;
* mode Full Screen ;
* administration ;
* gestion des erreurs ;
* logs ;
* configuration de production ;
* build macOS ;
* documentation minimale ;
* documentation de configuration Jira ;
* procédure de création/configuration du token ;
* procédure de build et distribution ;
* idéalement `.app` et `.dmg` signés/notarisés.

Si ta plateforme permet de fournir directement une application ou un artefact téléchargeable, fournis-le.

Sinon, fournis le projet complet permettant de générer l'application macOS prête à distribuer.

**Je ne veux pas une démonstration ou un prototype.**

Je veux une **V1 complète, cohérente, fonctionnelle et directement exploitable par une équipe Agile.**

Le résultat final doit être une application desktop macOS qui permet à l'équipe de voir et piloter son Sprint autour de ses **objectifs Atlassian**, tout en conservant Jira comme système de référence.
