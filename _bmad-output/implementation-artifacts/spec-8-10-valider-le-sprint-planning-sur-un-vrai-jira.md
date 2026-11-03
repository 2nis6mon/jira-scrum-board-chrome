---
title: 'Story 8.10 — Valider le Sprint Planning sur un vrai Jira'
type: 'chore'
created: '2026-11-03'
status: 'draft'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-8-context.md'
  - '{project-root}/docs/technique/integration-jira.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Le Sprint Planning (builds locaux, 0.48.4) n'a été vérifié que sur Jira fictif, plus des essais ponctuels sur le sandbox. Son activation dans le paquet (8.11) exige un constat réel, et plusieurs contrats sont « à confirmer en 8.10 » dans `docs/technique/`.

**Approach:** Jouer un cycle complet sur le Jira sandbox, consigner le constat étape par étape, transformer chaque défaut en story ou correctif, et préparer la décision sur les droits.

**Décisions de Denis (03/11/2026) :**
- Claude pilote le Chrome de Denis (Claude in Chrome), connecté au sandbox, extension `dist/` dans la version qui livre 8.24 (défilement pendant le glisser, nécessaire à l'étape 3 ; mise à jour du 03/11/2026, au lieu de 0.48.4) ; Denis valide chaque étape irréversible (clôture, démarrage) avant qu'elle soit jouée.
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

## Tasks & Acceptance

**Execution:**
- [ ] Préalables -- story 8.24 livrée et acceptée, `dist/` dans cette version chargé dans le Chrome de Denis, Claude in Chrome connecté, « Accueil-26T2.7 » choisi dans le menu (Jira le liste après les sprints « [Accueil] … ») -- sans eux, rien ne commence.
- [ ] Étapes 1 à 7 -- jouer, relire Jira, consigner (constat ci-dessous) -- cycle complet avec le droit.
- [ ] Étape 8 -- après le retrait des droits par Denis (ou avec un autre compte) ; sinon « non jouée » -- décision sur les droits.
- [ ] Défauts -- une story ou un correctif par défaut dans `backlog.md` / `epics.md` ; « à confirmer en 8.10 » remplacés par le constat dans `docs/technique/` et dans `deferred-work.md` (entrée retirée si conforme, story ou correctif sinon).

**Acceptance Criteria:**
- Given le constat consigné, when Denis le relit, then chaque étape a son résultat (conforme, défaut et sa suite), les coûts sont chiffrés, et la décision sur les droits peut être prise.

## Constat

_(rempli pendant l'essai)_

## Verification

**Manual checks (if no CLI):**
- Relecture de Jira (MCP, lecture seule) après chaque écriture : sprint, propriété `sprintgoals.v1`, tickets du sprint.
