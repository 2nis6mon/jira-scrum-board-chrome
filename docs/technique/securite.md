# Sécurité

Consolidation de l'audit initial du 19 septembre 2026 (`c785ea0`) et des correctifs, sans nouvel audit
indépendant, test d'intrusion ni validation des workflows réels. Aucun serveur tiers ni télémétrie.
Autres références : [index technique](index.md).

## Permissions et frontières

| Permission / frontière | Restriction |
|---|---|
| Hôtes | HTTPS `*.atlassian.net` ; permission du site demandée au clic, aucune accordée d'office |
| `storage`, `activeTab` | Stockage local ; adresse de l'onglet seulement au clic de l'icône |
| `scripting` | Bouton sur sites autorisés, vue sur URL marquée |
| `declarativeNetRequestWithHostAccess` | Règle de session retirant/remplaçant Origin uniquement sur POST de l'extension, `initiatorDomains: [id]`, URL exacte `\|https://<site>/gateway/api/graphql\|` ; jamais les pages web |
| CSP / ressources exposées | Scripts/styles locaux, `object-src 'none'`, connexions Atlassian ; `board.html`, `assets/*`, `icons/*` accessibles à `https://*.atlassian.net/*`, encadrement limité aux mêmes sites, aucun code distant |

Contrôles de parent/source décrits dans [l'intégration](integration-jira.md#integration-dans-la-page-jira).
Liens Goals : HTTPS sur domaines Atlassian validés, sans identifiants ni port ; images contrôlées,
avatars externes non téléchargés. Données rendues en texte Preact, liens externes `noopener noreferrer`.
Toute évolution de permission, hôte, écriture ou CSP, soumise à décision produit
([AGENTS.md](../../AGENTS.md)), actualise l'inventaire et les tests.

## Inventaire fermé des écritures

[`writes.ts`](../../src/jira/writes.ts) est la référence exhaustive des écritures du transport de l'extension.

| ID | Opération / contrat | Geste |
|---|---|---|
| E1 | `POST /rest/api/3/issue/{clé}/transitions`, seul `transition.id`, sans formulaire | Dépôt autre colonne / choix explicite |
| E2 | `PUT /rest/agile/1.0/issue/rank` | Dépôt avant/après un ticket |
| E3 | `goals_linkWorkItem` | Dépôt vers un Goal |
| E4 | `goals_unlinkWorkItem` | Retour dans la destination par défaut / changement de Goal |
| E5 | `PUT /rest/agile/1.0/sprint/{id}/properties/com.scrumboardmac.sprintgoals.v1` | Épinglage Scrum / lien en mode texte |
| E6 | `PUT /rest/agile/1.0/board/{id}/properties/com.scrumboardmac.boardsettings.v1` | Réglage explicite, dont épinglage Kanban |
| E7 | `PUT` puis `DELETE /rest/agile/1.0/sprint/{id}/properties/com.scrumboardmac.diagnostic` | Test demandé dans Diagnostic |
| E8 | `POST /rest/agile/1.0/sprint/{id}`, seul champ `goal` | Confirmation du planning, sprint futur relu, sans dates/état/nom |
| E9 | `POST /rest/agile/1.0/sprint/{id}/issue`, seul tableau `issues`, au plus 50 | Confirmation du planning, tickets du backlog relus, jamais du RAF actif |

Une tentative par écriture POST/PUT/DELETE ; relecture après résultat incertain, jamais de succès
avant confirmation. Lectures rejouables seulement sur erreur transitoire. E1 relit statut/transitions ;
E3/E4 s'arrêtent si le détachement échoue, annoncent le succès partiel si seul le nouveau lien échoue,
sans rollback. E5/E6 appliquent les protections des [données persistantes](donnees.md) et les droits Jira.
Les réglages partagés, IDs de Goals et métadonnées d'auteur (nom/compte) sont visibles aux lecteurs
Jira de l'entité ; préférences personnelles exclues. Hors texte `goal` de E8, aucun champ natif de sprint/board n'est écrit ;
aucune création/suppression de ticket, modification de workflow, création de Goal ou démarrage de sprint.
Les formulaires et fiches **Jira natifs** gardent les droits et actions de Jira : leurs requêtes et
saisies sont hors du transport et du journal de l'extension, qui ne les remplit ni ne les valide.

## Constats conservés

| ID | Constat et état |
|---|---|
| S1 | URL de Goal insuffisamment bornée : corrigé, domaines Atlassian validés et tests de liens |
| S2 | Réglages/JQL des collègues exécutés avec la session du lecteur : choix produit, `canEdit`, relecture/conflits ; filtre du board appliqué par l'API |
| S3 | Filtres rapides natifs : restriction syntaxique et filtrage local du board. Couleurs évaluées par identifiants déjà chargés, sans élargissement possible du périmètre |
| S4 | Session avec droits de l'utilisateur : risque structurel, inventaire borné côté extension ; fiche native conserve les droits Jira |
| S5 | CSP de connexion plus large que le site connecté : site contrôlé dans transport et plateforme |
| S6 | Auteur des réglages enregistré : choix assumé, visible aux lecteurs du board |
| S7 | Identité/distribution : clé privée ignorée, archive vérifiée ; compilation et publication distinctes |
| S8 | Origin GraphQL modifié : règle bornée à initiateur, méthode et URL exacte |
| S9 | Hébergement par un autre site Atlassian : corrigé, parent/origine/permission validés avant modèle |
| S10 | Transition voisine cliquée : correspondance unique nom/statut, sinon fiche rendue sans clic |
| S11 | Dépendance au DOM Jira : risque structurel, délais/repli visible/fixtures ; validation réelle nécessaire |
| S12 | Navigation étrangère/forgée : origine/source et identifiants contrôlés ; URL construite par l'hôte |
