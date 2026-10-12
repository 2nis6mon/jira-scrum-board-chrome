# Travaux ouverts

Mis à jour le 12 octobre 2026. Les fonctionnalités livrées sont décrites dans `DEVELOPER.md` et
`CHANGELOG.md` ; cette liste ne reprend que les vérifications ou évolutions encore utiles.

## Fiabilité et validation

- [ ] Valider les formulaires natifs sur les workflows réels : Time Spent, Story Points,
  Resolution, commentaires, plusieurs champs, widgets d'applications tierces ; validation et annulation.
- [ ] Vérifier la pagination des liens Goals sur les schémas du site réel : plus de 100 liens,
  absence de `workItems`, absence du champ Goals sur certains tickets. La pagination est déjà
  implémentée quand le schéma la permet ; les réponses incomplètes sont signalées.
- [ ] Vérifier les réglages partagés et les conflits depuis deux postes, avec et sans `canEdit`.
- [ ] Vérifier les routes des boards gérés par l'équipe, notamment au changement de board, et le
  placement du bouton flottant sur les différentes dispositions Jira.
- [ ] Étudier la migration de la lecture Agile des tickets vers le contrat Software « enhanced » :
  vérifier l'API disponible avant toute modification, préserver filtres, sprints et pagination.
- [ ] Améliorer le diagnostic du formulaire natif non reconnu, sans données sensibles de ticket.
- [ ] Réévaluer les limites WIP et les charges importantes sur le Jira réel.

## Distribution

- [ ] Confirmer la publication et le canal de mise à jour pour les autres utilisateurs.
  L'empaquetage, la fiche et la politique de confidentialité existent déjà.
- [ ] Actualiser les captures du Store et du manuel lors de la prochaine livraison visuelle.
- [ ] Prévoir une revue de sécurité indépendante avant diffusion large.

## Pistes produit à décider

- [ ] Export/import JSON validé, avec aperçu des différences.
- [ ] Préférences personnelles sur plusieurs postes ; une propriété utilisateur Jira nécessiterait
  une nouvelle autorisation d'écriture. `storage.sync` reste exclu.
- [ ] Limites WIP en points et minimums de colonne.
- [ ] Présenter les sources de Goals selon les capacités disponibles sur le site.
- [ ] Déploiement géré via `storage.managed` si un besoin IT apparaît.
- [ ] Réexaminer l'accessibilité du déplacement clavier si la décision d'abandon est réouverte.

## Sprint Planning : périmètre à définir

Préparation du prochain sprint demandée, mais non implémentée. Décider du choix du sprint futur,
de la source des objectifs, de la capacité et du périmètre préparation/démarrage. L'ajout de
tickets au sprint, son démarrage et la création de Goals sont de nouvelles écritures à autoriser
et documenter séparément. Le texte natif « Sprint Goal » reste en lecture seule.
