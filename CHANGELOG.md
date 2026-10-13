# Historique

Les détails des anciennes versions et les validations restent dans Git. Les procédures actuelles
sont dans le [guide développeur](DEVELOPER.md).

## 0.29.3 — Documentation regroupée

- Six fichiers Markdown au lieu de dix, avec un index dans le README.
- Intégration Jira, contrats API, suivi de sécurité et travaux ouverts réunis dans le guide développeur.
- Manuel, consignes et fiche Store raccourcis ; liens corrigés. Aucun changement fonctionnel.

## 0.29.2 — Temps de chargement masqués

Retrait de l'indicateur et de sa fenêtre dans l'extension distribuée. Optimisations conservées ;
interface de diagnostic réservée au banc d'essai.

## 0.29.1 — Ouverture accélérée

Types déduits des tickets chargés, sans parcourir tout l'historique du board. Réglages des types
absents conservés ; recensement complet toujours disponible manuellement. Correction ciblant
les 6,77 s et 14 requêtes de découverte relevées sur un chargement de 9,54 s ; gain réel à mesurer.

## 0.29.0 — Diagnostic du chargement

Mesure des phases et lectures, données prêtes, affichage estimé après deux frames et fin de
synchronisation. Cinq rapports locaux copiables, sans contenu métier ; navigation Jira préalable
hors mesure. L'accès visuel a été retiré en 0.29.2.

## Versions précédentes

| Versions | Évolution principale |
|---|---|
| 0.28.0–0.28.2 | Bouton Jira déplaçable à la souris, au toucher et au clavier ; position locale par site, adaptation au viewport. Réinitialisation retirée en 0.28.1 ; contrôle Windows corrigé en 0.28.2. |
| 0.27.1 | Sources d'intégration regroupées, formulaire local et anciens alias de test retirés ; formulaires natifs Jira, paquet et documentation nettoyés. |
| 0.27.0 | Accueil à l'installation et permission du seul site Jira choisi. |
| 0.26.0–0.26.6 | Reconnaissance de l'onglet, bouton flottant, URL du board et retour à Jira ; texte du sprint par défaut pour les nouveaux Scrum. |
| 0.25.0 | Mode unique dans Jira, lanceur sans lecture de tickets ; identité et stockage conservés. |
| 0.24.0–0.24.4 | Kanban, sous-filtre, Goals épinglés au board, pagination et erreurs explicites ; swimlanes vides hors objectifs masquées, avis refermables, IntelliJ. |
| 0.23.0–0.23.1 | Swimlanes par groupes de types ; détection des tickets ajoutés en cours de sprint. |
| 0.22.0–0.22.7 | Réglages partagés à chaque modification, droit `canEdit`, épinglage et préparation du Store. |
| 0.20.0–0.21.2 | Daily avec minuteur et stock limité, présentation plein écran. |
| 0.19.x | Sous-tâches, Goals atteints, tickets limités au board, fiche et transition natives Jira. |
| 0.16.x–0.18.x | Dépôt par statut, choix de transition, erreurs de déplacement et recherche de boards. |

Les premières versions ont porté les règles du board, les Goals, les filtres et les contrôles
de sécurité. L'application macOS est abandonnée depuis septembre 2026.
