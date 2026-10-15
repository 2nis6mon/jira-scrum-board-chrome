# Publication Chrome Web Store — version bilingue 0.35.1

Dossier préparé le **15 octobre 2026** pour mettre à jour l'article existant
[Sprint Goals Board](https://chromewebstore.google.com/detail/sprint-goals-board-pour-j/pepbknjnielcbfcoefcdmadmomapicgp?hl=fr),
identifiant `pepbknjnielcbfcoefcdmadmomapicgp`. Rien n'est soumis au Store par la préparation de ce dossier.

Un seul paquet contient le français et l'anglais. Les fiches traduites appartiennent au **même article**.
Sprint Planning est désactivé dans ce paquet et ne figure pas dans les descriptions publiques.

## Textes prêts à copier

Les noms et résumés viennent des fichiers `_locales/fr/messages.json` et `_locales/en/messages.json`
du paquet. Chaque nom reste sous 75 caractères et chaque résumé sous 132 caractères.

| Champ | Français | English |
| --- | --- | --- |
| Nom | Sprint Goals Board pour Jira | Sprint Goals Board for Jira |
| Résumé | Boards Scrum et Kanban Jira Cloud : swimlanes par objectif, Build et RUN configurables, glisser-déposer et Daily. | Jira Cloud Scrum and Kanban boards: goal swimlanes, configurable Build and RUN lanes, drag and drop, and Daily mode. |
| Description détaillée | [listing-fr.txt](listing-fr.txt) | [listing-en.txt](listing-en.txt) |
| Note de version | [release-notes-fr.txt](release-notes-fr.txt) | [release-notes-en.txt](release-notes-en.txt) |

Les notes de version peuvent être ajoutées en fin de description si souhaité : il ne faut pas
chercher un champ « nouveautés » obligatoire distinct. Les descriptions proposent les mêmes fonctions.

- **Catégorie** : Productivité → Workflow et planification, selon les choix proposés par le tableau de bord.
- **Contact** : `denis.simon.consulting@gmail.com`.
- **Site public** : <https://2nis6mon.github.io/jira-scrum-board-chrome/>.
- **Manuel français** : <https://2nis6mon.github.io/jira-scrum-board-chrome/guide.html>.
- **English guide** : <https://2nis6mon.github.io/jira-scrum-board-chrome/en/guide.html>.
- **Politique de confidentialité proposée** : <https://2nis6mon.github.io/jira-scrum-board-chrome/confidentialite.html>, avec lien vers sa version anglaise.
- **English privacy policy** : <https://2nis6mon.github.io/jira-scrum-board-chrome/en/privacy.html>.

Ces nouvelles pages doivent être publiées et accessibles avant de changer les URL du Store.
La politique historique <https://2nis6mon.github.io/sprint-goals-privacy/> reste une adresse distincte :
la modifier localement ici ne publie pas ce second site. Aucune adresse du dépôt privé n'est à renseigner.

La langue de l'interface est automatique à partir de Jira (français si Jira est en français, anglais
sinon), avec choix personnel Auto / Français / English. La langue affichée par Chrome pour le nom et
le résumé de l'extension dépend, elle, de Chrome et des métadonnées du paquet (`default_locale: en`).
Les contenus Jira ne sont pas traduits.

## Images communes aux deux langues

Les **cinq captures du board restent celles de la version 0.34.9**, avec leurs textes en français,
conformément au choix de conserver les images. Le [manifeste des captures](captures/captures.json)
garde leur provenance réelle. Elles montrent l'interface sur des données fictives en mode `package`,
avec Sprint Planning désactivé. Elles ne sont pas présentées comme de nouvelles captures 0.35.1.

| Fichier | Sujet FR | English caption |
| --- | --- | --- |
| [01-board.png](captures/01-board.png) | Scrum : objectifs et progression | Scrum: goals and progress |
| [02-kanban.png](captures/02-kanban.png) | Kanban : Goals et tickets sans sprint | Kanban: Goals and issues without a sprint |
| [03-swimlanes.png](captures/03-swimlanes.png) | Répartir les types entre Default, RUN et OPS | Assign issue types to Default, RUN and OPS |
| [04-couleurs.png](captures/04-couleurs.png) | Couleurs des cartes et règles JQL | Card colors and JQL rules |
| [05-daily.png](captures/05-daily.png) | Daily guidée par objectifs | A Daily organized by goal |

Dans les captures globales, conserver ces cinq PNG RGB opaques **1280 × 800**, dans cet ordre.
Pas besoin de créer une seconde série de captures localisées.

| Ressource | Champ du Store | Format |
| --- | --- | --- |
| [icon-128.png](icon-128.png) | Store icon | PNG 128 × 128, identique à l'icône du paquet |
| [promo-440x280.png](promo-440x280.png) | Small promo tile | PNG RGB opaque 440 × 280 |
| [promo-1400x560.png](promo-1400x560.png) | Marquee promo tile, facultatif | PNG RGB opaque 1400 × 560 |

Les deux promotions ont une marque commune, sans slogan à traduire, et reprennent la capture existante.
Leur provenance et leurs empreintes figurent dans [promotions.json](promotions.json).
Les tuiles promotionnelles ne sont pas localisables dans le Store ; seule une paire commune est fournie.
[Formats et fonctionnement officiels des images](https://developer.chrome.com/docs/webstore/images).

Pour régénérer seulement les promotions : `npm run store:promotions`.
`npm run store:screenshots` refait aussi les captures : inutile pour cette livraison.

## Confidentialité et permissions

**Objectif unique** : afficher et utiliser un board Scrum ou Kanban Jira Cloud organisé en swimlanes
par objectif : consulter et filtrer ses tickets, modifier leur statut, leur rang ou leur rattachement
et partager les réglages d'affichage du board.

La version bilingue ne demande aucune nouvelle permission. La langue de Jira est consultée pour
choisir l'interface ; le choix personnel de langue reste dans le navigateur, jamais dans les réglages
partagés du board. La [politique source](../privacy/index.html) explique ce traitement dans les deux langues.

| Permission | Justification à renseigner |
| --- | --- |
| `storage` | Conserver sur cet appareil le site et les boards choisis, une copie des réglages, les préférences personnelles dont la langue, le journal local des modifications et les mesures techniques de chargement. Aucun stockage synchronisé ni serveur de l'éditeur. |
| `activeTab` | Reconnaître le board et la langue de la page Jira dans l'onglet actif après le clic sur l'icône, afin d'ouvrir la vue dans Jira. Aucun suivi général de navigation. |
| `scripting` | Afficher le bouton Sprint Goals et la vue intégrée sur le site autorisé. Ouvrir les fiches et formulaires natifs et sélectionner la transition prévue après un déplacement, sans remplir ni valider les formulaires. |
| `declarativeNetRequestWithHostAccess` | Adapter l'en-tête Origin des seuls POST émis par cette extension vers l'URL exacte `https://<site autorisé>/gateway/api/graphql`, pour les échanges Goals Atlassian. Ne concerne pas les requêtes des pages web ou d'autres sites. |
| Hôte facultatif `https://*.atlassian.net/*` | Lire board, tickets, Goals et langue du compte, et effectuer les modifications demandées via le site Jira Cloud choisi. Aucun site accordé à l'installation ; Chrome demande l'accès au site précis lors de la connexion. La déconnexion retire cet accès. |

**Code distant : Non.** Le code de l'extension est inclus dans le ZIP et sa CSP impose
`script-src 'self'`. Les fiches et formulaires natifs s'ouvrent dans la page Jira hôte ; leurs
ressources sont fournies par Jira et ses apps, sans exécution de code téléchargé dans le contexte de l'extension.

| Catégorie du Store | Traitement à déclarer d'après le code |
| --- | --- |
| Informations personnelles | Nom affiché et identifiant du compte connecté, des personnes assignées et de l'auteur des derniers réglages partagés. |
| Contenu du site Web | Tickets, objectifs, champs, réglages, langue de Jira, JQL et suggestions. Pendant l'édition d'une règle de couleur, la saisie est envoyée au site Jira pour validation et suggestions ; seules les règles appliquées deviennent des réglages partagés. |
| Historique Web | Accès ponctuel à l'URL active pour reconnaître Jira, conservation locale des boards choisis. Aucun historique général des sites visités. |
| Activité de l'utilisateur | Journal local des modifications et mesures locales de chargement. Aucun suivi général des clics, frappes ou déplacements de souris ; aucun envoi automatique à l'éditeur. |

Ces catégories restent à comparer aux définitions du formulaire lors de la soumission. Le traitement
local compte aussi : ne pas déclarer « aucune donnée ». L'extension ne lit ni mot de passe, ni jeton,
ni valeur de cookie ; le navigateur joint la session Jira aux requêtes autorisées.
[Déclarations du tableau de bord](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy) et
[FAQ des données utilisateur](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq).

L'éditeur confirme lui-même les attestations du Store : aucune vente ou transmission hors des usages
autorisés, utilisation limitée à l'objectif déclaré, aucune utilisation pour la solvabilité ou le prêt.
Les données enregistrées dans Jira restent accessibles selon les droits Jira. Un rapport envoyé
volontairement à l'assistance peut être lu pour traiter la demande.

## Instructions privées pour l'équipe de revue

Fournir un site Jira Cloud de test, des boards Scrum et Kanban avec données fictives et un compte de
test disposant des droits nécessaires. Prévoir un sprint actif, des Goals accessibles et une transition
avec formulaire. Mettre les adresses et le moyen de connexion uniquement dans **Test instructions**,
jamais dans la description publique. Les coordonnées réelles sont à compléter par l'éditeur.
[Onglet officiel des instructions de test](https://developer.chrome.com/docs/webstore/cws-dashboard-test-instructions).

Texte anglais à copier dans cet onglet après avoir complété l'environnement :

```text
This update adds English and French. It uses the same Jira integration and Chrome permissions.

Test site, Scrum board, Kanban board and test account access: provided separately in this private field by the publisher.

1. Sign in to the provided Jira Cloud test site. The extension uses that browser session and does not ask for an API token.
2. Install the submitted package, authorize the test site and open the provided Scrum board.
3. Click Sprint Goals in Jira or the extension icon. The view opens inside Jira. Opening board.html outside an authorized Jira page is intentionally refused.
4. Check goals, issues, search and filters. Open an issue and close its native Jira dialog to return to the refreshed board.
5. Move a test issue to another column. A transition without a form uses the account's Jira permissions. If a form is required, fill it in and submit it yourself; the extension does not do this automatically.
6. Open Board settings from the board-name menu. Check issue-type swimlanes, card fields and card colors. Try JQL suggestions, validation and preview before applying a valid color rule.
7. Open Personal preferences from the Jira site menu or the language card in board settings. Select English, then Français. Labels change immediately, while Jira issue content, names and native dialogs keep their original language. The preference is personal and does not change shared settings.
8. Select Auto. With Jira in French the extension is French; with Jira in English or another language it is English. Reload the Jira page after changing Jira's own language. An unavailable Jira language falls back to English.
9. Run Daily, move between swimlanes, then finish the Daily. Open the provided Kanban board and check its goals and issues without a sprint.
10. Sprint Planning is disabled in the distributed package and cannot be enabled through the interface. Back to Jira returns to the native board; it is hidden while the extension sidebar is collapsed.
```

## Mettre à jour l'article existant, pas à pas

1. Publier le site bilingue et vérifier les liens publics du site, du manuel et de la confidentialité.
2. Dans le [Developer Dashboard](https://chrome.google.com/webstore/devconsole), ouvrir l'article
   `pepbknjnielcbfcoefcdmadmomapicgp` avec le compte éditeur habituel.
3. Dans **Package → Upload New Package**, envoyer **`release/sprint-goals-board-0.35.1.zip`**.
   La version doit être supérieure à celle déjà publiée. Utiliser ce paquet produit par
   `npm run package`, jamais un ZIP manuel de `dist/` qui active Sprint Planning.
4. Dans **Store listing**, sélectionner **Français** puis coller [listing-fr.txt](listing-fr.txt).
   Sélectionner **English** et coller [listing-en.txt](listing-en.txt). Les deux langues sont
   proposées grâce aux répertoires `_locales/fr` et `_locales/en` du même paquet.
5. Conserver les cinq captures globales et l'icône commune. Remplacer les deux tuiles promotionnelles
   par les nouveaux fichiers sans slogan. Les captures ne demandent pas de traduction.
6. Renseigner les URL publiques, relire **Privacy practices**, puis compléter **Test instructions**
   avec le compte de test et le parcours ci-dessus. Conserver les choix de distribution souhaités.
7. Enregistrer et choisir **Submit for Review**. Choisir la publication automatique après validation
   ou la publication différée. La version installable ne change qu'après publication.

Le dossier **`release/chrome-store-bilingual-0.35.1/`** regroupe le paquet de l'extension,
les textes et les images. Choisir chaque ressource dans son champ : seul le ZIP
`sprint-goals-board-0.35.1.zip` est destiné au champ **Package**.

Procédures officielles vérifiées le 15 octobre 2026 :
[localiser la fiche](https://developer.chrome.com/docs/webstore/cws-dashboard-listing#localize-your-listing),
[mettre à jour un article](https://developer.chrome.com/docs/webstore/update/).
