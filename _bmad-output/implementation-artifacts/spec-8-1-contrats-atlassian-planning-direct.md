---
title: 'Story 8.1 — Vérifier les contrats Atlassian du planning en direct'
type: 'chore'
created: '2026-11-01'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Le planning en direct (décision du 01/11/2026) a besoin d'usages Jira non encore vérifiés : retour au backlog, ajout à un sprint futur d'un ticket venant d'un autre sprint, fenêtres natives de clôture et de démarrage, droits requis par E5, E8, E9 et E10.

**Approach:** Vérifier chaque usage dans les spécifications OpenAPI officielles (Jira Software et plateforme), consigner le constat dans `docs/technique/integration-jira.md`, ajouter E10 (`POST /rest/agile/1.0/backlog/issue`) à l'inventaire fermé `writes.ts`, à ses tests exhaustifs et à `securite.md`. Décisions prises en autonomie (Denis, 01/11/2026 : « tu es autonome, prends toutes les décisions ») : les droits ne sont pas lus à l'ouverture (un board peut couvrir plusieurs projets), un refus 403 s'affiche au premier geste jusqu'au constat de 8.10 ; les fenêtres natives sont ouvertes par l'hôte depuis la page backlog du board, sans API.

</frozen-after-approval>

## Implementation Notes

- Sources : `https://dac-static.atlassian.com/cloud/jira/software/swagger.v3.json` et `.../platform/swagger-v3.v3.json`, téléchargés et interrogés le 01/11/2026 (les pages HTML de référence sont tronquées par l'outil de lecture).
- E10 : POST, corps `{"issues": [...]}` à clés uniques, 204, 50 au plus, 403 sans droit d'affecter les tickets. Validation commune avec E9 (`assertIssueBatch`).
- E9 : « Moves issues to a sprint… only open or active sprints… 50 » ; le retrait de l'autre sprint futur découle du verbe « move » et de la règle Jira d'un seul sprint ouvert par ticket, à confirmer en 8.10.
- E8 : mise à jour partielle, `state` jamais envoyé (démarrer/clore resterait possible par l'API : exclu).
- E5 : « permissions to modify the sprint » (écriture), « view the sprint » (lecture).
- `GET /rest/api/3/mypermissions` et la clé `MANAGE_SPRINTS_PERMISSION` existent ; non utilisés.
- Fichiers : `src/jira/writes.ts`, `tests/jira/writes.test.ts`, `docs/technique/securite.md`, `docs/technique/integration-jira.md`, `docs/technique/index.md`, `AGENTS.md` (E1–E10).

## Review Triage Log

- Section « Contrats du planning en direct » insérée au milieu du bloc GraphQL — medium, corrigé (déplacée après les références).
- Docs décrivant le planning en direct avant son code — low, corrigé : note « Epic 8 livré story par story » dans `securite.md`.
- E10 retire aussi d'un sprint actif — high, corrigé côté doc (relecture d'appartenance juste avant, refus d'un ticket de sprint actif) ; garde implémentée avec l'intention de retrait (8.4).
- E9 vers un autre sprint futur hors décision — false : story 8.4 et forged-idea prévoient « renvoyer au backlog ou vers un autre sprint futur (E10 ou E9) ».
- Garde de sources sans chemin backlog — medium, corrigé (`tests/guards/sources.test.ts` n'admet que `/rest/agile/1.0/backlog/issue`).
- Droits « assign issues » ambigus — low, corrigé (*Schedule issues*, `SCHEDULE_ISSUES`).
- Borne de 50 non testée — low, corrigé (50 clés acceptées pour E9 et E10).
- Choix de l'endpoint sans board non justifié, operationId absents — low, corrigé.
- Fenêtres natives sans constat de sécurité — medium, corrigé (S13).
- CHANGELOG et version — différé à la livraison de l'epic (une version pour l'ensemble de l'Epic 8) ; en-tête de `writes.ts` reformulé.
