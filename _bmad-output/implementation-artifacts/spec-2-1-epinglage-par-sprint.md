---
title: 'Story 2.1 — Épingler les Goals du sprint de mon choix'
type: 'feature'
created: '2026-10-31'
status: 'done'
baseline_commit: '3db4fd418fcf99c5c5aa1efff85d7b3a3fa8f393'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Avec plusieurs sprints actifs du board, les épinglages de tous les sprints sont lus, mais l'onglet Objectifs ne modifie que celui du sprint principal : impossible de garder visibles, sans ticket, les Goals d'un autre sprint.

**Approach:** En Scrum « Goals Atlassian » avec au moins deux sprints actifs du board, l'onglet Objectifs propose le sprint de l'épinglage (présélection : sprint principal). Le résolveur `pinnedGoalsStorage` reçoit ce choix et renvoie la propriété du sprint choisi ; l'écriture reste `pinAtlassianGoals` (E5) par la porte du board.

## Boundaries & Constraints

**Always:** seuls les sprints du board (`goalSprintIds`), dans l'ordre d'affichage ; une seule écriture E5 sur le sprint choisi, base de conflit = épinglage de ce sprint lu au chargement ; changement de sprint refusé (contrôle désactivé et méthode du modèle sans effet) tant que le brouillon est modifié ou en cours d'écriture ; un sprint choisi qui disparaît après relecture ramène au sprint principal ; nouveaux textes en FR/EN/ES.

**Never:** aucun sprint étranger proposé ; aucune nouvelle écriture, aucun changement de format de `sprintgoals.v1` ni de `boards.v1` ; la vue ne choisit pas la propriété (pas de test de `boardType`) ; pas de choix de sprint avec un seul sprint du board, en Kanban ou en Scrum sans sprint actif ; pas de nouvelle tentative après conflit ou refus.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Choix proposé | Scrum, Goals Atlassian, sprints du board 42 et 43 + étranger 77 | Choix 42, 43 ; 42 présélectionné | N/A |
| Enregistrer sur 43 | choix 43, épingle G | Un seul `PUT …/sprint/43/properties/…sprintgoals.v1` ; propriété de 42 inchangée ; board relu, swimlane G affichée | N/A |
| Brouillon modifié | sélection ≠ base | Choix désactivé, `choosePinSprint` sans effet | N/A |
| Conflit | épinglage de 43 changé dans Jira | Rien d'écrit, brouillon recalé sur Jira avec avis (comportement actuel) | Pas de nouvelle tentative |
| Propriété de 43 illisible | lecture 43 refusée | 43 non épinglable : message actuel « propriété du sprint n'a pas pu être lue » | N/A |
| Un seul sprint / Kanban / sans sprint | — | Aucun choix ; comportement actuel | N/A |
| Repli local sur 43 | refus de droits sur 43, « Garder dans ce navigateur » | Sélection gardée pour 43 (`localPinnedGoalIds["43"]`), affichée tant que Jira n'a aucune sélection pour 43 ; bannière cumulant les Goals locaux des sprints du board | « Oublier » efface le repli de tous les sprints du board |

**Décision (Denis, 31/10/2026) :** le repli local après refus de droits vaut par sprint : lu pour chaque sprint du board, la bannière du board cumule leurs Goals locaux et « Oublier cette sélection » les efface tous.

</frozen-after-approval>

## Code Map

- `src/core/boardSync.ts:282-345` -- lit déjà la propriété de chaque `goalSprints` ; ne garde que `pinnedGoalIds` du sprint de référence (`otherPins` fusionnés pour le chargement des Goals). Exposer les épinglages lus de chaque sprint.
- `src/core/boardIssue.ts:240-290` -- `BoardSnapshot` : ajouter des champs optionnels (comme `goalSprintIds`) `sprintPinnedGoalIds?` (sprints lus seulement) et `sprintLocalPinnedGoalIds?` (repli local par sprint, si Jira n'a aucune sélection), `Readonly<Record<number, readonly string[]>>` ; garder `pinnedGoalIds`/`localPinnedGoalIds` (référence) pour leurs usages actuels. Le chargement des Goals reçoit l'épinglage effectif de chaque sprint.
- `src/app/views/board/BoardView.tsx:883-915` -- bannière du repli local : cumul de tous les sprints ; `BoardModel.forgetLocalPins` efface chaque sprint du board (`BoardSettingsService.forgetLocalPins` par sprint).
- `src/core/pinnedGoals.ts` -- `pinnedGoalsStorage(configuration, snapshot, sprintId?)` : sprint choisi s'il est dans `goalSprintIds`, sinon référence ; `pinnedGoalIdsIn` lit le sprint du stockage ; nouvelle `pinnableSprints(configuration, snapshot)` (sprints du board si Scrum et ≥ 2, sinon vide).
- `src/app/model/BoardModel.ts:202-225,1049-1111` -- signal `pinSprintId` (null = principal), `choosePinSprint(id)`, `pinStorage`/`canPinGoals` sur le sprint choisi ; réinitialisé au changement de board.
- `src/app/services/BoardSettingsService.ts:80-185` -- déjà paramétré par `editor.storage.sprintId` ; à ne modifier que si le repli local l'exige.
- `src/app/views/settings/SprintGoalsPanel.tsx` -- sélecteur dans l'en-tête de la carte « Épingler un Goal du site » ; le recalage du brouillon (`useEffect`) suit le sprint du stockage, plus `snapshot.sprint.id`.
- `src/i18n/settings.ts`, `src/i18n/es/settings.ts` -- libellé du choix et aide du blocage.
- Ne pas toucher : `pinAtlassianGoals`/`updateSprintGoalProperty` (`core/boardWrites.ts`, `core/sprintGoals.ts`), `writes.ts`.

## Tasks & Acceptance

**Execution:**
- [x] `src/core/boardIssue.ts`, `src/core/boardSync.ts` -- exposer `sprintPinnedGoalIds` -- base par sprint.
- [x] `src/core/pinnedGoals.ts` -- sprint choisi et `pinnableSprints` -- le résolveur reste seul à choisir.
- [x] `src/app/model/BoardModel.ts` -- `pinSprintId`, `choosePinSprint`, garde du brouillon -- état côté modèle (AD-3).
- [x] `src/app/views/settings/SprintGoalsPanel.tsx`, `src/app/styles` si besoin -- sélecteur et blocage.
- [x] `src/i18n/settings.ts`, `src/i18n/es/settings.ts` -- textes.
- [x] `tests/core/pinnedGoals.test.ts`, `tests/core/boardSync.test.ts`, `tests/app/BoardModel.pin.test.ts` -- matrice I/O (deux sprints du board + un étranger).
- [x] `docs/manuel-utilisateur.md`, `docs/technique/invariants.md`, `docs/technique/donnees.md`, `CHANGELOG.md`, versions 0.37.0 -- documenter.

**Acceptance Criteria:**
- Given deux sprints du board, when j'épingle sur le second et enregistre, then après relecture les deux sprints affichent leurs swimlanes épinglées et le journal note un épinglage réussi.
- Given le choix du second sprint et une relecture du board, when le brouillon n'est pas modifié, then il se recale sur l'épinglage de ce sprint, pas du principal.

## Implementation Notes

- `BoardSettingsService`, `pinAtlassianGoals`, `sprintGoals.ts` et `writes.ts` inchangés pour l'écriture : le service écrivait déjà sur `editor.storage.sprintId`. Seul le détail du journal change (clé `propriété du sprint « {p0} »`, l'ancienne clé reste lue).
- Choix : sans brouillon (propriété du sprint choisi illisible), le sélecteur s'affiche dans la carte Objectifs pour pouvoir revenir au sprint principal.
- Verrou du choix (`pinSprintLocked`) : écriture en cours, ou sélection différente de celle d'ouverture (repli local si `fromLocal`, sinon `base`) ; faux quand `canPinGoals` est faux.
- Sprint choisi disparu à la relecture (`sync`, dans un `finally`) : retour au principal et fermeture du brouillon qui le visait, sauf pendant une écriture.
- Restent sur le sprint principal : l'avis du board « propriété illisible », le titre « Objectifs du sprint « X » » et l'entrée de barre latérale.
- Vérification (31/10/2026, après correctifs de revue) : `npm run check` (105 fichiers, 1550 tests, 1 ignoré), `verify:jira`, `verify:settings`, `verify:i18n`, tous avec code de sortie 0. Bancs `verify:*` à un seul sprint : le sélecteur est couvert par `tests/app/App.test.tsx` et les tests du modèle. Aucun essai réel.

## Spec Change Log

## Review Triage Log

| # | Source | Constat | Verdict | Preuve / route |
|---|--------|---------|---------|----------------|
| 1 | edge (1, 7) | Brouillon ouvert depuis le repli local : sélection ≠ base d'emblée, choix du sprint verrouillé, « Annuler » rouvre le même état | medium | `openPinEditor` pose `base` = Jira et `selection` = repli ; `pinSprintLocked` compare les deux. patch |
| 2 | edge (2), blind (5) | Comparaison ordonnée dupliquée entre modèle et vue, désaccord possible | false | Les deux comparent dans l'ordre (`sameIds` de la vue est ordonné) : décocher puis recocher rend `isChanged` vrai aussi, Enregistrer reste actif |
| 3 | edge (3), blind (1) | Sprint choisi disparu à la relecture avec brouillon modifié : le sélecteur montre le principal, l'enregistrement vise encore l'ancien sprint | medium | `sync` remet `pinSprintId` sans toucher `pinEditor`. patch |
| 4 | edge (4) | Propriété du sprint choisi devenue illisible pendant un brouillon modifié : brouillon caché, sélecteur verrouillé sans issue | low | La vue masque `editor` si `!canPin`, mais `pinSprintLocked` lit `pinEditor` ; correction directe (verrou seulement si `canPinGoals`). patch |
| 5 | edge (5) | `#loading.sync` qui lève : contrôle du sprint choisi sauté | low | Correction directe par `try/finally`. patch (avec 3) |
| 6 | edge (6), blind (4) | « Oublier » séquentiel, effacement partiel si une écriture locale échoue ; replis des sprints clos jamais purgés | low | Échec du stockage local improbable ; replis non purgés antérieurs à la story. rejeté |
| 7 | blind (2) | Propriété illisible du sprint choisi non signalée sur le board ; message de l'onglet sans nom de sprint | low | Bannière du board antérieure (sprint principal) ; l'onglet dit déjà l'illisibilité. rejeté |
| 8 | blind (3) | Journal d'épinglage sans le sprint visé | low | `detailMessage: message("propriété du sprint")` ; ambigu dès deux sprints ; correction directe (clé paramétrée). patch |
| 9 | blind (6) | Snapshot asymétrique (`sprintPinnedGoalIds` toujours présent) | false | Comme `pinnedGoalIds`, présent en mode texte sans effet : `canPinGoals` exige `goalsOrigin` atlassianGoals |
| 10 | blind (7) | Bannière : Goals dédupliqués, sprints non nommés | low | Compte des Goals, texte inchangé de la story. rejeté |
| 11 | blind (8), vg (1, 2) | Sélecteur, sortie de secours (propriété illisible) et bannière cumulée non testés en vue | medium | Aucun test de vue à deux sprints (`App.test.tsx` monte un seul sprint). patch |
| 12 | vg (3) | Condition `goalsOrigin === "atlassianGoals"` du repli par sprint non testée | low | Retirer la condition ne fait échouer aucun test. patch |
| 13 | blind (9) | Couleur de bordure codée en dur | false | Même valeur `#d5d9e0` que les autres champs de `settings.css` (l. 429, 729, 876, 1337) |
| 14 | blind (10) | Contenu de revue incomplet (`package-lock.json`) | false | Le lock passe bien à 0.37.0 (`git diff --stat`) ; seul le patch de revue l'omettait |
| 15 | blind (11) | Termes espagnols différents dans les deux chaînes | low | Les deux restent compréhensibles. rejeté |

## Verification

**Commands:**
- `npm run check` -- tout vert.
- `npm run verify:jira` et `npm run verify:settings` -- verts.
- `npm run verify:i18n` -- vert (nouveaux textes).
