# Historique

Les détails des anciennes versions et les validations restent dans Git. Les procédures actuelles
sont dans le [guide développeur](DEVELOPER.md).

## 0.36.0 — Plusieurs sprints actifs

- Les objectifs de tous les sprints actifs du board sont affichés ensemble, chacun préfixé du nom
  de son sprint. Un ticket peut être rattaché à l'objectif de n'importe lequel de ces sprints.
- Un sprint d'un autre board, remonté par un ticket partagé, est affiché après ceux du board et
  signalé par la couleur de son nom ; ses tickets restent affichés et comptés comme les autres.
- Nouveau filtre **Sprint**, présent dès que plusieurs sprints sont affichés : il ne garde que
  les tickets du sprint choisi, sans masquer d'objectif.

## 0.35.3 — Tickets reportés non marqués « ajout »

- Les tickets non terminés reportés au sprint suivant ne sont plus marqués « ajout » lorsque Jira
  date le démarrage de ce sprint quelques secondes avant d'écrire le report. Une entrée dans les
  2 minutes qui suivent le démarrage compte comme présente au démarrage.
- L'historique Sprint est lu par identifiant de sprint quand Jira le fournit : un sprint renommé
  ou un nom contenant une virgule ne fausse plus le marquage.

## 0.35.2 — Espagnol dans l'extension, le site et le manuel

- Interface espagnole complète, détectée pour les variantes espagnoles de Jira et disponible
  dans le choix personnel **Español**. Français et anglais restent disponibles ; les autres
  langues et les langues inconnues utilisent l'anglais.
- Formats de dates, nombres et pluriels espagnols ; contenus Jira inchangés. Reconnaissance
  des commandes natives espagnoles **Cerrar** et **Cambiar estado** dans les fenêtres Jira.
- Site, huit fiches du manuel et confidentialité en espagnol, avec navigation FR/EN/ES.
  Captures du board et promotions communes conservées.
- Paquet Chrome Store multilingue et fiche espagnole prêts à publier. Sprint Planning reste
  désactivé dans la distribution.

## 0.35.1 — Site, manuel et publication bilingues

- Site public disponible en français et en anglais, avec un sélecteur qui conserve la page
  consultée. L'accueil choisit la langue du navigateur au premier accès, puis mémorise le choix.
- Manuel en huit fiches dans chaque langue, recherche locale traduite et politique de confidentialité
  localisée. Les captures du board restent communes et inchangées.
- Kit Chrome Web Store réunissant le paquet bilingue, les textes FR/EN, les captures existantes,
  l'icône et les promotions communes. Sprint Planning reste désactivé dans le paquet Store.

## 0.35.0 — Interface en français et en anglais

- Détection de la langue Jira : français pour les variantes françaises, anglais pour les autres
  langues et lorsqu'aucune langue n'est connue.
- Choix personnel **Automatique — suivre Jira**, **Français** ou **English**, accessible dans
  **Site Jira → Préférences personnelles** et dans l'administration du board. Le choix est
  conservé dans ce navigateur, commun aux boards, sans modifier Jira ni les réglages de l'équipe.
- Traduction de l'interface, des aides, notifications et contrôles accessibles ; dates et nombres
  suivent la langue choisie. Les contenus Jira et les noms personnalisés restent intacts.
- Bascule immédiate conservant les saisies et brouillons en cours ; vérifications des deux langues,
  de la préférence locale et de la conservation du JQL. Sprint Planning garde son activation
  limitée aux builds locaux.

## 0.34.12 — Validation GitHub fiabilisée

- Chrome for Testing reçoit les droits de lecture et d'exécution nécessaires à ses processus
  sandboxés sur le runner Windows, pour éviter l'échec de navigation du contrôle du site.
- Le contrôle des réglages attend la fin du défilement avant d'ouvrir le menu d'une swimlane,
  puis utilise de vrais clics ; le défilement ne referme plus le menu juste après son ouverture.

## 0.34.11 — Retour Jira lié à la barre latérale

- Barre latérale repliée : le bouton Retour à Jira et son bandeau de remplacement disparaissent.
  Réafficher la barre restaure le bouton en bas de la navigation.
- Suppression de l'espace réservé au bandeau dans le board, le planning et les réglages ; manuel
  et contrôles de navigation actualisés.

## 0.34.10 — Bouton Jira plus discret

- Intégration du bouton compact, avec la nouvelle icône et une poignée séparée, pour tenir dans
  un espace libre de l'en-tête Jira.
- Placement jusqu'à 4 px des bords, déplacement au clavier et conservation de la position par site,
  y compris après redimensionnement ou zoom.
- Manuel actuel conservé et complété avec le placement du bouton ; rebranding et site préservés.

## 0.34.9 — Kit de publication du rebranding

- Cinq captures du mode de distribution régénérées sur le jeu de démonstration, avec une date
  de référence stable pour le sprint fictif et sans Sprint Planning.
- Icône Store 128 px avec dessin centré de 96 px et marges transparentes de 16 px, également
  incluse dans le paquet Chrome ; petites tailles conservées.
- Visuels promotionnels 440 × 280 et 1400 × 560 alignés sur la nouvelle marque, avec police locale
  et aperçu réel du board. Kit de fichiers regroupé pour la mise à jour de la fiche Store.

## 0.34.8 — Marque commune et guide par fiches

- Nouvelle icône du plugin alignée sur le site, dans toutes les tailles Chrome ; captures et
  promotion du Store actualisées avec cette marque.
- Manuel simplifié en huit fiches, présentées dans un mini-site avec recherche, navigation et
  mise en page adaptée au mobile, dans le style du site de présentation.
- Installation exclusivement depuis la fiche officielle Chrome Web Store ; références au dépôt
  privé, installation locale et informations de version techniques retirées du guide public.
- Vérification automatique de toutes les fiches, de la recherche et des liens d’installation.

## 0.34.7 — Site de présentation prêt pour GitHub Pages

- Site public avec nouvelle identité visuelle, police locale, animations au défilement,
  démonstration interactive des objectifs et de la Daily, et aperçus du plugin agrandissables.
- Parcours responsive, navigation clavier, pause des animations et respect de la réduction
  des mouvements ; démonstration fictive sans accès aux données Jira.
- Manuel complet généré en HTML, politique bilingue intégrée et archive statique autonome.
- Construction et contrôles dédiés ; workflow GitHub Pages déclenché manuellement depuis `main`.
  Aucune modification du fonctionnement de l'extension et aucun déploiement automatique.

## 0.34.6 — Manuel utilisateur complet

- Manuel réécrit à partir des fonctions de `main` 0.34.5 : installation Store ou locale,
  autorisation du site, ajout d'un board depuis Jira ou l'extension, utilisation et administration.
- Parcours détaillés pour les quatre onglets de réglages, avec les modalités d'enregistrement,
  les droits et la distinction entre préférences personnelles et réglages partagés.
- Précisions sur les sous-tâches, filtres, objectifs, aperçu JQL, Daily et diagnostic ; cinq
  captures conservées et Sprint Planning isolé dans une annexe réservée à la version locale.
- Aucun changement du comportement de l'extension.

## 0.34.5 — Préparation de la publication Chrome Web Store

- Fiche de publication, procédure de livraison et informations de confidentialité actualisées
  pour les fonctions réellement disponibles dans le paquet distribué.
- Captures Scrum, Kanban, swimlanes, couleurs et Daily renouvelées sur des données fictives,
  avec Sprint Planning désactivé à la compilation et son absence contrôlée avant chaque capture.
- Vignette promotionnelle 440 × 280 ajoutée pour la fiche Store.
- Génération des captures adaptée à Windows, macOS et Linux ; version affichée fournie au
  démarrage du banc et métadonnées des images conservées pour la préparation de la soumission.

## 0.34.4 — Défilement natif des formulaires de transition

- Fenêtres de transition conservées dans leur disposition Jira : dimensions, en-tête,
  boutons et défilement du formulaire ne sont plus réécrits par l'extension.
- Même comportement pour les formulaires classiques dans une iframe ; les menus disposent
  de tout l'espace natif et les fenêtres s'adaptent au redimensionnement via Jira.
- Contrôles sur formulaires longs modernes et classiques, sans saisie ni validation automatiques.

## 0.34.3 — Défilement natif des fiches Jira

- Fiche affichée avec le même espace disponible que dans Jira, sans réécriture de sa taille,
  de sa position ni de son défilement : en-tête et colonnes conservent leur disposition native.
- Menus hors de la fiche préservés, adaptation au redimensionnement et nouvelle détection
  lorsque Jira remplace le panneau après une édition.
- Régressions navigateur sur les deux colonnes longues, leur défilement indépendant et les
  formulaires de transition ; aucun accès à la session Jira réelle pour ces contrôles.

## 0.34.2 — Transition automatique vers un même statut

- Plusieurs transitions vers un même statut : première action disponible dans l'ordre Jira,
  sans configuration ni choix supplémentaire. Les statuts distincts gardent leurs zones de dépôt.
- Action annoncée au survol conservée au dépôt, puis revérifiée. Aucun remplacement ni nouvelle
  tentative si elle disparaît, change de destination ou échoue ; le board est actualisé.
- Formulaire Jira conservé si l'action retenue l'exige ; il reste à remplir et valider par l'utilisateur.

## 0.34.1 — Swimlanes par types et aide JQL pour les couleurs

- Retour aux swimlanes par types de tickets, avec objectifs prioritaires et groupe Default.
- Suppression des règles, aperçus et évaluations JQL des swimlanes ; récupération à la lecture
  des affectations par types conservées dans les réglages 0.34.0, sans écriture automatique.
- Validation stricte et autocomplétion Jira conservées pour les couleurs des cartes, avec blocage
  des requêtes invalides et conservation des brouillons en cas d'échec ou de conflit.

## 0.34.0 — Swimlanes JQL et saisie assistée

- Swimlanes définies par JQL : objectif visible prioritaire, première règle active correspondante,
  puis Default. Aperçu avant application, activation et masquage distincts, ordre modifiable.
- Migration explicite des groupes de types existants, avec conservation des noms, identifiants,
  ordre et visibilité. Sous-tâches classées individuellement, héritage de l'objectif conservé.
- Éditeur JQL partagé avec les couleurs : suggestions fournies par Jira, clavier, validation avant
  enregistrement et conservation du brouillon en cas d'erreur ou d'indisponibilité.
- Évaluation des couleurs et swimlanes regroupée sur les tickets du board, sans doublons de lecture.
  Classement incomplet signalé sans perdre les cartes ; notification refermable.
- Action « Retirer de l'objectif » : le ticket retrouve ensuite la destination déterminée par JQL.
  Tests métier, API, interface et parcours Chrome isolé ajoutés.

## 0.33.1 — Réglages des swimlanes réunis

- Types de tickets intégrés aux swimlanes : le groupe Default accueille les types sans swimlane
  dédiée et permet de les déplacer vers une autre ligne, par glissé ou par leur menu.
- Suppression du panneau séparé « Types de tickets » et introduction réduite à une phrase sur
  la priorité des objectifs.

## 0.33.0 — Objectifs prioritaires sur les swimlanes par type

- Les tickets des swimlanes RUN, OPS et autres types configurés peuvent rejoindre un objectif,
  en Scrum comme en Kanban. Leur objectif détermine leur ligne ; après détachement, ils reviennent
  dans la swimlane par défaut de leur type.
- Glisser-déposer entre objectifs et destination par défaut, avec réapparition temporaire de la
  ligne vide pour le retour. Les compteurs et les sous-tâches suivent ce classement.
- Administration clarifiée : les types définissent une destination par défaut, les objectifs
  restent prioritaires. Les types ignorés restent exclus et les réglages existants sont conservés.

## 0.32.3 — Retrait de l'heure de chargement

- L'en-tête n'affiche plus « Jira · HH:mm » ; seule l'actualisation en cours est signalée.

## 0.32.2 — En-tête recentré

- Retrait du bouton Réglages de l'en-tête ; accès conservé dans les menus du board et des swimlanes.
- Bouton Daily déplacé à droite des actions ; progression et objectifs atteints centrés entre
  le titre du sprint et les boutons.

## 0.32.1 — Sprint Planning réservé aux essais locaux

- Feature flag fixé à la compilation : Sprint Planning actif dans `dist/` via `build` ou `watch`,
  désactivé dans le ZIP produit par `package`.
- L'entrée, la navigation, les lectures et la publication du planning sont bloquées dans le paquet.
  La création du ZIP conserve le `dist/` local et ses fonctionnalités expérimentales.

## 0.32.0 — Atelier Sprint Planning

- Préparation des sprints futurs par objectifs texte : backlog filtrable, RAF consultatif, affectation
  par glisser-déposer ou au clavier, focus sur un objectif, capacité et synthèse copiable, sans timer.
- Brouillons locaux par sprint ; publication explicitement confirmée du texte, des tickets retenus
  et de leurs rattachements, sans Goals Atlassian ni démarrage du sprint.
- Relectures Jira, protection des modifications concurrentes, résultats partiels expliqués et tests
  métier, interface et Chrome isolé ajoutés.

## 0.31.2 — Navigation et en-tête allégés

- Retrait de l'entrée Réglages sous Sprint ; accès conservés dans l'en-tête et les menus du board.
- Retour à Jira ancré au pied de la barre latérale, ou au-dessus du contenu lorsqu'elle est repliée.
- Retrait des compteurs bloqués, ajoutés et dans Build de l'en-tête ; filtres rapides conservés.

## 0.31.1 — Retrait du signalement des bugs liés

- Suppression du bouton Bug dans les réglages des types et du badge de bugs liés sur les cartes.
- Retrait de la détection, du comptage et du réglage associé ; les anciens réglages restent lisibles.
- Les types Jira, leurs swimlanes, les blocages et les compteurs de sous-tâches sont conservés.

## 0.31.0 — Réglages du board repensés

- Réglages ouverts depuis le board (en-tête, barre latérale, menu du board, menu d'une swimlane),
  en onglets Board, Objectifs, Champs et Couleurs des cartes ; le bouton Administration laisse
  place au menu « Site Jira » (diagnostic, déconnexion) en pied de barre latérale.
- Onglet Board : Build et swimlanes par type rangés par glissé, renommés dans la liste (nom de
  Build compris), créés à la volée avec leur premier type ; types glissés d'un groupe à l'autre.
  Les objectifs se rangent toujours sur le board.
- Champs et règles de couleur des cartes réordonnés par glissé, avec aperçu de cartes du board.
  Chaque glissé a son équivalent clavier ou menu ; `verify:settings` les contrôle dans Chromium.
- Retirés : personnalisation des colonnes (noms, masquage, WIP : ceux de Jira s'appliquent) et
  labels marquant un ticket bloqué (seul le lien « est bloqué par » compte). Leurs valeurs restent
  dans la propriété du board pour les versions précédentes.

## 0.30.0 — Architecture et tests automatisés

- Chargement, déplacements et réglages/épinglage extraits de `BoardModel` en services testables.
- Introspection et décodage des Goals séparés du client ; étapes des fenêtres natives Jira explicites.
- Régressions sur lectures concurrentes, cache et pagination Goals, sérialisation et parcours natifs.
- Garde-fous de dépendances entre couches et validation automatique sur GitHub, jusqu'au paquet Chrome.
- API des vues, données enregistrées et périmètre des écritures Jira conservés.

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
