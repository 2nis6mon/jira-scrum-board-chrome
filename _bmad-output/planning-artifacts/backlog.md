# Backlog — Sprint Goals Board pour Jira

Travaux restants et pistes à décider, à transformer en epics et stories avec le workflow BMAD
`bmad-create-epics-and-stories` au moment de les planifier. Une piste produit n'est pas
engagée tant qu'elle n'est pas décidée. Mise en conformité d'architecture :
[spec dédiée](../specs/spec-conformite-architecture/SPEC.md).

## Fiabilité et distribution

- [ ] Workflows réels : Time Spent, Story Points, Resolution, commentaires, plusieurs champs,
  widgets tiers ; validation et annulation. Améliorer le diagnostic des formulaires non reconnus sans données sensibles.
- [ ] Schémas Goals réels : plus de 100 liens, absence de `workItems`, champ Goals manquant ;
  contrôler pagination et signalement des résultats incomplets déjà implémentés.
- [ ] Réglages/conflits sur deux postes, avec et sans `canEdit` ; volumes importants et limites WIP réelles.
- [ ] Routes des boards gérés par l'équipe, changement de board et placement du bouton sur les dispositions Jira.
- [ ] Étudier les lectures Software « enhanced » avant de remplacer les endpoints Agile ; préserver filtre, sprints et pagination.
- [ ] Confirmer publication et canal de mise à jour ; fiche, empaquetage et politique existent.
- [ ] Renouveler les captures Store après chaque évolution visuelle ; revue de sécurité indépendante avant diffusion large.

## Pistes produit à décider

- [ ] Export/import JSON validé avec aperçu des différences.
- [ ] Menu contextuel (clic droit) sur un ticket du board : « Envoyer vers un goal », « Mettre en top priorité »,
  « Mettre en basse priorité ». Priorité = rang en tête/en fin, écritures déjà autorisées ; le champ Priorité Jira serait une nouvelle écriture.
- [ ] Préférences personnelles entre postes : propriété utilisateur Jira = nouvelle écriture à autoriser ; `storage.sync` exclu.
- [ ] WIP en points et minimums de colonne ; présentation des sources Goals selon capacités du site.
- [ ] Déploiement IT via `storage.managed` si besoin ; déplacement clavier si la décision d'abandon est réouverte.

## Sprint Planning

Sprint Planning est réservé au `dist/` local : valider ensuite les droits
et volumes sur une instance réelle avant son activation dans le paquet.
Le démarrage/création de sprint, le report automatique du RAF et la création de Goals restent hors périmètre.
Contrats de publication et backlog vérifiés le 14/10/2026 dans les références officielles
[Sprint](https://developer.atlassian.com/cloud/jira/software/rest/api-group-sprint/) et
[Board](https://developer.atlassian.com/cloud/jira/software/rest/api-group-board/).
