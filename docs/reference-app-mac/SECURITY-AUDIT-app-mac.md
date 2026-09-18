# Audit de sécurité — Scrum Board 1.6.3

> **Suivi (1.6.4)** — C1 à C6, C9 et C10 sont corrigés ; chaque correctif est couvert par
> des tests (`SecurityHardeningTests`, `AtlassianHostTests`), sauf C2 et C10 qui touchent
> WebKit et le système de fichiers. C7 et C8 restent structurels. Détail en fin de document.

Date : 17 septembre 2026 · Périmètre : commit `ce08c0d`, bundle `dist/Scrum Board.app`.

## Méthode et limites

- **Revue statique exhaustive** du code source (tous les points de sortie réseau, toutes
  les méthodes HTTP autres que GET, toutes les mutations GraphQL, stockage, journalisation,
  vue web, signature).
- **Un essai dynamique local**, sans Jira, avec de faux identifiants : comportement de
  `URLSession` lors d'une redirection vers un autre hôte.
- Inspection de la signature et des habilitations du bundle livré ; recherche de secrets
  dans tout l'historique Git.

Ce qui **n'a pas** été fait : test d'intrusion, analyse dynamique contre votre instance
Jira, interception du trafic réel, lecture du contenu de vos fichiers locaux
(`audit.json` n'a pas été ouvert). Autre limite à connaître : cet audit est réalisé par
l'auteur du code ; il ne remplace pas une revue indépendante.

## Synthèse

| # | Constat | Gravité | État |
|---|---|---|---|
| C1 | Le site Jira saisi n'est pas restreint à `*.atlassian.net` : une faute de frappe envoie e-mail + jeton à un autre hôte | **Moyenne** | À corriger |
| C2 | « Se déconnecter » n'efface pas la session web Atlassian de la vue intégrée | **Moyenne** | À corriger |
| C3 | Une transition (POST) peut être rejouée automatiquement après un délai d'attente ou une erreur 5xx | Faible | À corriger |
| C4 | Changement d'objectif : l'échec du détachement de l'ancien Goal est ignoré → ticket possiblement lié à deux Goals | Faible | À corriger |
| C5 | Vue web : test de domaine par suffixe (`hasSuffix("atlassian.net")`) accepte `evil-atlassian.net` | Faible | À corriger |
| C6 | `imageData` vérifie l'hôte mais pas le schéma `https` | Faible (ATS bloque déjà le HTTP clair) | Durcissement |
| C7 | Jeton d'API « classique » : il porte **tous** vos droits Jira ; la retenue de l'application n'est garantie que par son code | Information | Structurel |
| C8 | Application non sandboxée et non notarisée | Information | Structurel |
| C9 | Trois clés réelles de votre organisation (un Goal, deux tickets) dans des fichiers de test versionnés | Information | À nettoyer |
| C10 | `audit.json` lisible en `rw-r--r--` ; l'acteur retombe sur l'e-mail si le nom d'affichage manque | Information | Durcissement |

Aucune vulnérabilité critique ou élevée identifiée. Aucun secret dans le code ni dans
l'historique Git. Aucune dépendance tierce.

---

## 1. Inventaire exhaustif des écritures dans Jira / Atlassian

Recherche de toute méthode HTTP autre que GET et de toute mutation GraphQL dans
`Sources/`. Il n'en existe **aucune autre** que celles-ci.

### Écritures métier

| # | Opération | Appel | Déclencheur utilisateur | Code |
|---|---|---|---|---|
| E1 | Changer le statut d'un ticket | `POST /rest/api/3/issue/{key}/transitions` corps `{"transition":{"id"}}` | Glisser une carte vers une autre colonne ; choisir une transition dans la fenêtre de choix ; « Réessayer » d'un bandeau | [JiraClient.swift:328](../Sources/JiraKit/JiraClient.swift) |
| E2 | Rattacher un ticket à un Goal | mutation GraphQL `goals_linkWorkItem(input:{goalId, workItemId})` | Liste déroulante de la fiche / menu contextuel de la carte ; dépôt d'une carte dans le bloc d'un objectif | [GoalsClient.swift:752](../Sources/JiraKit/GoalsClient.swift) |
| E3 | Détacher un ticket d'un Goal | mutation GraphQL `goals_unlinkWorkItem` | « Aucun objectif » ; dépôt dans *Build* ; implicite avant E2 quand le ticket change d'objectif | [GoalsClient.swift:757](../Sources/JiraKit/GoalsClient.swift) |
| E3b | Réordonner un ticket (rang du board) | `PUT /rest/agile/1.0/issue/rank` | Glisser-déposer vertical dans une colonne (ajouté en 1.8.0, hors des trois catégories d'origine, validé par l'utilisateur) | [JiraClient.swift](../Sources/JiraKit/JiraClient.swift) |
| E4 | Enregistrer la sélection d'objectifs du sprint | `PUT /rest/agile/1.0/sprint/{id}/properties/com.scrumboardmac.sprintgoals.v1` | « Épingler au sprint » ; rattachement ticket↔objectif en mode « texte du sprint ». Depuis la 2.0.0, l'ordre et la couleur des objectifs restent locaux et ne déclenchent plus cette écriture | [SprintGoals.swift:230-268](../Sources/ScrumBoardCore/SprintGoals.swift) |

E4 écrit une **propriété d'entité** : donnée technique invisible dans l'interface Jira,
limitée à 32 Ko, propre à la clé `com.scrumboardmac.*`. Elle ne modifie aucun champ du
sprint.

### Écritures techniques (diagnostic)

| # | Opération | Appel | Déclencheur |
|---|---|---|---|
| E5 | Test d'écriture | `PUT` puis `DELETE /rest/agile/1.0/sprint/{id}/properties/com.scrumboardmac.diagnostic` | Bouton « Tester l'enregistrement » (Administration → Objectifs) uniquement |

### Ce que l'application ne peut pas écrire

Vérifié par absence de code : aucune création, modification ou suppression de ticket ;
aucun commentaire, worklog, pièce jointe ; aucune modification d'assignation, de
priorité, d'estimation, de sprint (contenu, dates, **champ `goal`** — la méthode a été
retirée, voir le commentaire dans `JiraClient.swift`) ; aucune création / modification /
suppression de Goal ; aucune modification de board, de filtre ou de workflow.

Toutes les requêtes GraphQL autres que E2/E3 sont des lectures (`tenantContexts`,
`goals_search`, `goals_byIds`, introspection `__type`), bien qu'émises en POST comme
l'impose GraphQL.

### Réserve importante : la vue web intégrée

La page Jira affichée dans l'application **est Jira** : connecté dans cette vue, vous
pouvez y faire tout ce que vos droits permettent (modifier, commenter, supprimer). Ces
actions sont les vôtres, faites dans l'interface d'Atlassian ; l'application n'injecte
aucun script, n'a aucun pont JavaScript (`WKScriptMessageHandler`, `evaluateJavaScript`
absents) et ne lit ni la page ni ses cookies. Mais la garantie « trois catégories
d'écriture » ne s'applique qu'au code de l'application, pas à cette vue.

### Garde-fous constatés sur les écritures

- Aucune écriture sans geste explicite ; la synchronisation automatique ne fait que lire.
- E1 : relecture du ticket avant écriture et abandon si le statut a changé dans Jira ;
  seules les transitions proposées par Jira sont utilisées ; pas d'affichage optimiste.
- Depuis la 1.6.3, un dépôt n'est traité que si la clé existe dans le board chargé : un
  texte glissé depuis une autre application ne peut pas viser un ticket arbitraire.
- Chaque écriture est consignée dans le journal d'audit local (succès et échecs).

---

## 2. Fuites possibles — analyse

### 2.1 Jeton d'API

| Point | Constat |
|---|---|
| Stockage | Trousseau macOS uniquement, `kSecAttrAccessibleWhenUnlockedThisDeviceOnly`, `kSecAttrSynchronizable = false` (pas d'iCloud). ✅ |
| Hors trousseau | Jamais écrit dans `UserDefaults`, le journal d'audit, les rapports ou un fichier. `JiraCredentials` n'est pas `Codable` et sa `description` masque le jeton. ✅ |
| Journalisation | Aucun `print`, `NSLog`, `os_log` ni `Logger` dans tout le code. ✅ |
| Saisie | `SecureField`. ✅ |
| Destinataires | Envoyé en en-tête `Authorization: Basic` à **un seul hôte** : le site Jira saisi (REST, passerelle GraphQL `/gateway/api/graphql`, images du même hôte). Aucun tiers, aucune télémétrie, aucun service de l'éditeur. ✅ |
| Redirections | **Testé** : sur ce macOS, `URLSession` retire l'en-tête `Authorization` lors d'une redirection vers un autre hôte (`AUTH_AT_B=None` avec de faux identifiants). ✅ |
| Transport | HTTPS imposé à la saisie ; ATS actif (aucune exception `NSAllowsArbitraryLoads`) ; validation TLS système, non désactivée. Pas d'épinglage de certificat : un proxy TLS d'entreprise de confiance verrait le trafic, comme pour un navigateur. |
| Mémoire | Le jeton reste en mémoire tant que l'application est connectée. Inévitable ; le runtime durci est actif (`flags=runtime`), ce qui bloque l'injection de code et le débogage par un autre processus. |
| Vue web | Le jeton n'est **jamais** transmis à la vue web (sessions `URLSession` éphémères distinctes). ✅ |

**C1 — hôte non restreint (moyenne).** `normalizeSiteURL` exige HTTPS et un point dans
l'hôte, rien d'autre. `societe.atlassian.ne` ou un lien d'hameçonnage collé dans le champ
recevrait l'e-mail et le jeton dès « Se connecter ». Correctif : exiger `*.atlassian.net`
(et `*.jira.com`), ou demander une confirmation explicite pour tout autre domaine.

**C7 — portée du jeton (information).** Un jeton d'API classique agit avec l'intégralité
de vos permissions. Si l'application avait un défaut, rien côté Atlassian ne la limiterait
à ses trois écritures. Atlassian propose des jetons à portées restreintes ; à ma
connaissance ils s'utilisent via `api.atlassian.com/ex/jira/{cloudId}` et non via l'URL du
site, ce que l'application ne gère pas aujourd'hui — **point à vérifier avant de s'engager**.
Pensez aussi à la date d'expiration du jeton et révoquez-le si le Mac est perdu.

### 2.2 Session web de la vue intégrée

**C2 (moyenne).** La vue utilise `WKWebsiteDataStore.default()` : les cookies de session
Atlassian persistent sur disque dans les données WebKit de l'application.
`signOut()` supprime le jeton du trousseau et les préférences, **mais pas ces cookies**.
Après « Se déconnecter », quiconque rouvre l'application sur cette session macOS et se
reconnecte à l'API retrouve une vue web déjà authentifiée. Correctif : vider le magasin
de données web à la déconnexion.

**C5 (faible).** `isInternal` teste `host.hasSuffix("atlassian.net")` : `evil-atlassian.net`
serait conservé dans la vue au lieu d'être renvoyé au navigateur. Aucun secret de
l'application n'y est exposé (pas de jeton, pas de pont JS), mais c'est une surface
d'hameçonnage inutile. Correctif : égalité ou suffixe `.atlassian.net` / `.atlassian.com`.

### 2.3 Données locales

| Emplacement | Contenu | Risque |
|---|---|---|
| `UserDefaults` (`com.scrumboardmac.app`) | URL du site, e-mail, configuration du board, sprint choisi, sélection locale d'objectifs | Pas de secret. E-mail en clair dans le dossier utilisateur. |
| `~/Library/Application Support/ScrumBoard/audit.json` | 500 dernières actions : date, acteur, action, clé du ticket, statuts, détail d'erreur Jira | Pas de secret. **C10** : fichier en `rw-r--r--` ; il n'est protégé que par `~/Library` (`drwx------`). Durcir en `0600`. L'acteur est le nom d'affichage, à défaut l'e-mail. |
| Cache d'images | Mémoire uniquement (200 entrées max), jamais sur disque | — |
| Données WebKit | Cookies et cache de la session Jira web | Voir C2 |
| Presse-papiers | « Copier le rapport » : version, URL du site, nom/id du board et du sprint, compteurs, messages d'erreur Atlassian. Ni jeton ni e-mail. Le diagnostic « Lire les objectifs » contient en plus cloudId, clés et **noms de vos Goals**. | Action volontaire ; relisez avant de coller ailleurs. |

### 2.4 Intégrité des écritures

**C3 (faible).** `send()` rejoue jusqu'à 3 fois les erreurs transitoires **quelle que soit
la méthode**. Si un `POST` de transition aboutit côté Jira mais que la réponse se perd
(délai dépassé), il est renvoyé. Le plus souvent Jira refusera la 2ᵉ tentative (transition
indisponible depuis le nouveau statut) et l'application affichera une erreur alors que le
déplacement a réussi ; sur un workflow où la même transition existe aussi depuis le statut
d'arrivée, elle pourrait s'appliquer deux fois. Correctif : ne jamais rejouer un POST ;
resynchroniser à la place. (Le PUT et le DELETE de propriété sont idempotents.)

**C4 (faible).** Dans `assignAtlassianGoal`, le détachement de l'ancien Goal est fait avec
`try?` ([BoardController.swift:688](../Sources/ScrumBoardCore/BoardController.swift)). S'il
échoue et que le rattachement suivant réussit, le ticket reste lié aux deux Goals sans
que vous en soyez averti. Correctif : arrêter et signaler si le détachement échoue.

### 2.5 Chaîne de distribution

- **Aucune dépendance tierce** (`Package.swift` : uniquement des cibles locales) → pas de
  risque de chaîne d'approvisionnement côté bibliothèques.
- Dépôt GitHub **privé** (l'API publique répond 404). `dist/`, `*.dmg`, `build/` sont
  ignorés par Git. Aucun jeton, mot de passe ou en-tête `Basic` dans l'historique.
- **C9** : trois clés réelles de votre Jira figurent dans
  `Tests/JiraKitTests/GoalFieldTests.swift` et `GoalsClientTests.swift`. Sans gravité tant
  que le dépôt est privé ; à remplacer par des clés fictives avant toute ouverture.
- **C8** : signature *Apple Development* avec runtime durci, mais **pas de sandbox**
  (l'habilitation `network.client` présente n'a d'effet que sous sandbox) et **pas de
  notarisation** (pas de certificat *Developer ID*). L'application a donc les mêmes accès
  fichiers que vous, et macOS ne peut pas en vérifier la provenance : ne distribuez le DMG
  que par un canal de confiance. Activer la sandbox est faisable (réseau sortant +
  trousseau suffisent) mais demande un essai complet.

---

## 3. Recommandations, par priorité

1. **C1** — restreindre ou faire confirmer le domaine du site avant tout envoi du jeton.
2. **C2** — effacer les données web à la déconnexion.
3. **C3** — ne plus rejouer les POST ; **C4** — ne plus ignorer l'échec du détachement.
4. **C5 / C6 / C10** — comparaison stricte des domaines, schéma `https` exigé pour les
   images, `audit.json` en `0600`.
5. **C9** — anonymiser les clés dans les tests.
6. À étudier : sandbox (C8), jetons à portée restreinte (C7), notarisation dès qu'un
   certificat *Developer ID* est disponible.

---

## 4. Correctifs livrés en 1.6.4

| # | Correctif |
|---|---|
| C1 | `normalizeSiteURL` refuse tout hôte hors `*.atlassian.net` / `*.jira.com` **avant tout envoi** (`JiraError.untrustedSiteHost`). Un domaine personnalisé exige une case à cocher explicite, annulée dès que l'adresse change. Les identifiants embarqués dans l'URL sont retirés. |
| C2 | `signOut()` vide le magasin de données WebKit (cookies, stockage local, cache) via `JiraWebSession.clear()`. |
| C3 | Un `POST` n'est plus jamais rejoué. Si l'issue d'une transition est incertaine, l'application relit Jira et laisse le bouton « Réessayer » à l'utilisateur. |
| C4 | Si le détachement de l'ancien Goal échoue, l'opération s'arrête avec un message ; le nouveau lien n'est pas posé. La cause renvoyée par Atlassian est conservée. |
| C5 | Comparaison d'hôte sur frontière de libellé DNS (`AtlassianWebLogin.isAtlassianHost`). |
| C6 | `imageData` exige `https`, le même hôte et le même port que le site. |
| C9 | Clés remplacées par des clés fictives dans les tests. **L'historique Git les contient toujours** ; le réécrire est une opération destructive, à ne faire que si le dépôt doit être ouvert. |
| C10 | `audit.json` passé en `0600` à chaque écriture ; l'acteur ne retombe plus sur l'e-mail. |

Nouvelles lectures introduites en 1.6.4 (aucune écriture) : évaluation des règles de
couleur (`GET /rest/agile/1.0/board/{id}/issue?jql=…`, une à deux requêtes par règle) et
champ `subtasks` ajouté aux champs lus. Le JQL d'une règle est saisi par l'utilisateur et
transmis à Jira en paramètre de requête encodé ; il ne peut déclencher que des lectures.
