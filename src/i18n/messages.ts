/** Messages métier conservés en français dans les modèles et traduits lors de leur présentation. */
export const businessMessages = {
  "Publication suspendue : {p0}": "Publication paused: {p0}",
  "Nom de Build, seuil de vieillissement": "Build name, ageing threshold",
  "Identifiant de ticket invalide.": "Invalid issue identifier.",
  "votre compte Jira": "your Jira account",
  "compte reconnu": "account recognised",
  "Lecture REST par POST": "REST read via POST",
  "session non reconnue": "session not recognised",
  "Lecture GraphQL par POST": "GraphQL read via POST",
  "l'analyse JQL": "JQL parsing",
  "Lecture GraphQL par POST, {p0}": "GraphQL read via POST, {p0}",
  "refus XSRF": "XSRF rejection",
  "refus 403": "403 rejection",
  "l'API Goals d'Atlassian": "the Atlassian Goals API",
  "Adresse d'image invalide : {p0}": "Invalid image address: {p0}",
  "Chemin Jira invalide : {p0}": "Invalid Jira path: {p0}",
  "ajout au sprint": "add to sprint",
  "identifiant de transition": "transition identifier",
  "identifiant de {p0}": "{p0} identifier",
  "identifiant de Goal ou de ticket": "Goal or issue identifier",
  "lien Goal Atlassian natif": "native Atlassian Goal link",
  "transition choisie": "selected transition",
  classement: "ranking",
  rattachement: "linking",
  "Suppression (DELETE) {p0}": "Delete (DELETE) {p0}",
  "sprint planning": "sprint planning",
  "Filtre rapide Jira inapplicable : {p0}": "Jira quick filter cannot be applied: {p0}",
  "Aucune transition disponible": "No transition available",
  "Recherche des objectifs du board : {p0}": "Find board goals: {p0}",
  "Recherche des objectifs du site : {p0}": "Find site goals: {p0}",
  "Libellés des objectifs : {p0}": "Goal labels: {p0}",
  "statut modifié, objectif modifié": "status changed, goal changed",
  "texte des objectifs, {p0} ticket(s) ajouté(s)": "goal text, {p0} issue(s) added",
  "texte des objectifs, {p0} ticket(s) ajouté(s), rattachements aux objectifs":
    "goal text, {p0} issue(s) added, links to goals",
  "texte des objectifs, rattachements aux objectifs": "goal text, links to goals",
  "{p0} ticket(s) ajouté(s), rattachements aux objectifs": "{p0} issue(s) added, links to goals",
  "{p0} sans en-tête particulier": "{p0} without a special header",
  "{p0} avec l'en-tête X-Atlassian-Token: no-check":
    "{p0} with the X-Atlassian-Token: no-check header",
  "sans en-tête particulier : {p0}": "without a special header: {p0}",
  "avec l'en-tête X-Atlassian-Token: no-check : {p0}":
    "with the X-Atlassian-Token: no-check header: {p0}",
  "Le champ Goals Jira n'a pas été identifié ; relisez la structure du board.":
    "The Jira Goals field was not identified. Reload the board structure.",
  "Le champ Goals Jira est absent de certains tickets du board ({p0}).":
    "The Jira Goals field is missing from some board issues ({p0}).",
  "Recherche des objectifs du board": "Find board goals",
  "Recherche des objectifs du site": "Find site goals",
  "Tickets rattachés aux objectifs": "Issues linked to goals",
  "Tickets rattachés aux objectifs : {p0}. {p1}": "Issues linked to goals: {p0}. {p1}",
  "Tickets rattachés aux objectifs : {p0}": "Issues linked to goals: {p0}",
  "Libellés des objectifs": "Goal labels",
  "Build par défaut": "Default Build",
  "Swimlane par défaut": "Default swimlane",
  Ignoré: "Ignored",
  "Le seuil « vieillissant » doit être un nombre entier de jours, entre 1 et 365.":
    "The ageing threshold must be a whole number of days between 1 and 365.",
  "La durée de la daily doit être un nombre entier de minutes, entre 1 et {p0}.":
    "The Daily duration must be a whole number of minutes between 1 and {p0}.",
  "Le nombre de cartes du stock en daily doit être un entier, entre 1 et {p0}.":
    "The number of cards in the Daily queue must be a whole number between 1 and {p0}.",
  "Cette adresse ne désigne pas un board Jira.": "This address does not identify a Jira board.",
  "Ce board appartient à {p0}, pas à {p1}.": "This board belongs to {p0}, not {p1}.",
  "Collez l'adresse complète de votre board, par exemple https://societe.atlassian.net/jira/software/c/projects/ABC/boards/123":
    "Paste the full board address, for example https://company.atlassian.net/jira/software/c/projects/ABC/boards/123",
  "Collez l'adresse complète du board, par exemple {p0}/jira/software/c/projects/ABC/boards/123":
    "Paste the full board address, for example {p0}/jira/software/c/projects/ABC/boards/123",
  "L'extension n'a accès qu'au site auquel vous êtes connecté.":
    "The extension only has access to the site you are connected to.",
  "Lecture des Goals Atlassian indisponible.": "Atlassian Goals could not be read.",
  "Lecture des Goals Atlassian indisponible : le board Kanban ne peut pas déterminer ses objectifs.":
    "Atlassian Goals could not be read: the Kanban board cannot determine its goals.",
  "Objectifs du board Kanban indisponibles : {p0}": "Kanban board goals unavailable: {p0}",
  "la passerelle GraphQL d'Atlassian refuse l'origine des requêtes de l'extension (« Invalid CORS request »). Site Jira → Diagnostic, en bas de la barre latérale, essaie les variantes de l'en-tête Origin et retient celle qui passe.":
    "the Atlassian GraphQL gateway rejects the origin of extension requests (‘Invalid CORS request’). Jira site → Diagnostics, at the bottom of the sidebar, tests the Origin header options and keeps the one that works.",
  "Jira a refusé de classer {p0}.": "Jira refused to rank {p0}.",
  "Cet objectif n'existe plus dans le sprint. Actualisez le board.":
    "This goal no longer exists in the sprint. Refresh the board.",
  "propriété des objectifs du sprint : objet JSON attendu, rien n'a été écrit":
    "sprint goals property: a JSON object was expected; nothing was written",
  "propriété des objectifs du sprint : version inconnue ou illisible, rien n'a été écrit":
    "sprint goals property: unknown version or unreadable content; nothing was written",
  "Ajouté en cours de sprint": "Added during the sprint",
  Bloqués: "Blocked",
  Ajoutés: "Added",
  "Tickets bloqués par un lien Jira « est bloqué par »":
    "Issues blocked by a Jira ‘is blocked by’ link",
  "Tickets ajoutés au sprint après son démarrage": "Issues added to the sprint after it started",
  "Démarrage dans Jira": "Startup in Jira",
  "Configuration du board": "Board configuration",
  "Statuts Jira": "Jira statuses",
  "Champs Jira": "Jira fields",
  "Types de tickets": "Issue types",
  "Réglages du board": "Board settings",
  "Compte courant": "Current account",
  Sprints: "Sprints",
  Tickets: "Issues",
  "Réglages des objectifs": "Goal settings",
  "Objectifs et rattachements": "Goals and issue links",
  "Préparation du board": "Prepare board",
  "Filtres rapides": "Quick filters",
  "Couleurs des cartes": "Card colours",
  "Lecture Jira GET": "Jira GET request",
  "Lecture Jira POST": "Jira POST request",
  "Lecture Goals GraphQL": "Goals GraphQL request",
  "Attente avant nouvelle tentative": "Wait before retry",
  "Jira a renvoyé un autre sprint.": "Jira returned a different sprint.",
  "Ce sprint n’est plus futur. Rien n’a été écrit.":
    "This is no longer a future sprint. Nothing was written.",
  "Le sprint a changé dans Jira. Rechargez ses données avant de publier ; votre brouillon est conservé.":
    "The sprint changed in Jira. Reload its data before publishing; your draft has been kept.",
  "La sélection contient des doublons.": "The selection contains duplicates.",
  "Les tickets déjà présents dans le sprint doivent être conservés.":
    "Issues already in the sprint must be kept.",
  "{p0} n’est plus un ticket du backlog disponible. Les tickets actifs et sous-tâches ne sont pas déplacés.":
    "{p0} is no longer available in the backlog. Active issues and subtasks are not moved.",
  "{p0} Rien n’a été écrit.": "{p0} Nothing was written.",
  "Le texte des objectifs n’a pas été confirmé par Jira.": "Jira did not confirm the goal text.",
  "texte des objectifs": "goal text",
  "Un ticket retenu a quitté le backlog pendant la publication.":
    "A selected issue left the backlog while publishing.",
  "Jira n’a pas confirmé tous les ajouts au sprint.":
    "Jira did not confirm all additions to the sprint.",
  "{p0} ticket(s) ajouté(s)": "{p0} issue(s) added",
  "Les rattachements ont été modifiés par un collègue pendant la publication.":
    "A colleague changed the issue links while publishing.",
  "Les rattachements n’ont pas été confirmés par Jira.": "Jira did not confirm the issue links.",
  "rattachements aux objectifs": "links to goals",
  "Le sprint a changé pendant la vérification finale.":
    "The sprint changed during final verification.",
  "Planning publié et vérifié dans Jira. Le sprint reste à démarrer dans Jira.":
    "Planning published and verified in Jira. The sprint still needs to be started in Jira.",
  "{p0} Aucune écriture n’a été rejouée. Vérifiez Jira avant de reprendre ; votre brouillon est conservé.":
    "{p0} No write was retried. Check Jira before continuing; your draft has been kept.",
  "Étapes confirmées : {p0}. {p1}": "Confirmed steps: {p0}. {p1}",
  "Publication non confirmée. {p0}": "Publication not confirmed. {p0}",
  "Le sprint ou ses objectifs ont changé pendant la publication.":
    "The sprint or its goals changed while publishing.",
  "Chaque objectif doit avoir un titre non vide sur une ligne, sans préfixe de liste.":
    "Each goal needs a non-empty, single-line title without a list prefix.",
  "Un rattachement ne correspond plus à la sélection ou aux objectifs.":
    "An issue link no longer matches the selection or goals.",
  "La propriété des objectifs du sprint est illisible ou utilise une version inconnue. Elle ne sera pas écrasée.":
    "The sprint goals property cannot be read or uses an unknown version. It will not be overwritten.",
  "La vérification Jira a échoué.": "Jira verification failed.",
  "Types de tickets et swimlanes par type": "Issue types and type swimlanes",
  "Daily : durée et stock": "Daily: duration and queue",
  "Source des objectifs": "Goal source",
  "Goals épinglés au board": "Goals pinned to the board",
  "Couleurs des objectifs": "Goal colours",
  "Ordre des swimlanes": "Swimlane order",
  "Objectifs masqués": "Hidden goals",
  "Champs des cartes": "Card fields",
  "Règles de couleur des cartes": "Card colour rules",
  "réglages d'équipe": "team settings",
  "réglages d'équipe du board : objet JSON attendu, rien n'a été écrit":
    "board team settings: a JSON object was expected; nothing was written",
  "réglages d'équipe du board dans un format inconnu (version plus récente ?)":
    "board team settings use an unknown format (a newer version?)",
  "rien n'a été écrit": "nothing was written",
  "la langue Jira": "the Jira language",
  "la validation JQL": "JQL validation",
  "l'aide à la saisie JQL": "JQL autocomplete",
  "les suggestions JQL": "JQL suggestions",
  "Une correspondance JQL accepte de 1 à 50 tickets et de 1 à 10 requêtes.":
    "JQL matching accepts 1 to 50 issues and 1 to 10 queries.",
  "les correspondances JQL": "JQL matches",
  "les boards accessibles": "accessible boards",
  "les droits sur le board {p0}": "permissions for board {p0}",
  "le board {p0}": "board {p0}",
  "la configuration du board {p0}": "configuration for board {p0}",
  "les statuts Jira": "Jira statuses",
  "les champs Jira": "Jira fields",
  "les sprints du board {p0}": "sprints for board {p0}",
  "le sprint {p0}": "sprint {p0}",
  "le backlog du board {p0}": "backlog for board {p0}",
  "Chargement incomplet : Jira a répété des tickets du backlog.":
    "Loading incomplete: Jira returned duplicate backlog issues.",
  "Le backlog dépasse la limite de {p0} tickets.": "The backlog exceeds the limit of {p0} issues.",
  "Chargement incomplet : la pagination du backlog Jira est incohérente.":
    "Loading incomplete: Jira backlog pagination is inconsistent.",
  "les filtres rapides du board {p0}": "quick filters for board {p0}",
  "les tickets du sprint {p0} sur le board {p1}": "issues in sprint {p0} on board {p1}",
  "les tickets du board {p0}": "issues on board {p0}",
  "le ticket {p0}": "issue {p0}",
  "les transitions de {p0}": "transitions for {p0}",
  "les réglages d'équipe du board {p0}": "team settings for board {p0}",
  "la propriété « {p0} » du sprint {p1}": "property ‘{p0}’ of sprint {p1}",
  "Chargement incomplet : Jira a renvoyé une page de tickets inattendue. Actualisez le board.":
    "Loading incomplete: Jira returned an unexpected page of issues. Refresh the board.",
  "Chargement incomplet : Jira a renvoyé une page vide avant la fin des tickets. Actualisez le board.":
    "Loading incomplete: Jira returned an empty page before all issues were loaded. Refresh the board.",
  "Chargement incomplet : la pagination Jira contient des tickets répétés. Actualisez le board.":
    "Loading incomplete: Jira pagination contains duplicate issues. Refresh the board.",
  "Chargement incomplet : le périmètre dépasse la limite de {p0} tickets. Réduisez le filtre du board dans Jira.":
    "Loading incomplete: the scope exceeds the limit of {p0} issues. Narrow the board filter in Jira.",
  "en-tête Origin de l'extension conservé": "extension Origin header kept",
  "en-tête Origin retiré": "Origin header removed",
  "en-tête Origin remplacé par l'adresse du site": "Origin header replaced with the site address",
  "sans en-tête particulier": "without a special header",
  "avec l'en-tête X-Atlassian-Token: no-check": "with the X-Atlassian-Token: no-check header",
  "Session Jira du navigateur (GET)": "Browser Jira session (GET)",
  "l'identifiant du site": "the site identifier",
  "identifiant du site lu": "site identifier read",
  "réponse {p0} au contenu inattendu": "response {p0} with unexpected content",
  "réponse reçue": "response received",
  "réponse {p0} au contenu inattendu, {p1}": "response {p0} with unexpected content, {p1}",
  "{p0} sans en-tête, puis {p1}": "{p0} without a header, then {p1}",
  "même refus sans en-tête ; {p0}": "same rejection without a header; {p0}",
  "sprints du board": "board sprints",
  "la propriété de diagnostic": "the diagnostic property",
  "Lecture d'une propriété du sprint": "Read a sprint property",
  autorisée: "allowed",
  "autorisée (propriété de diagnostic absente, comme attendu)":
    "allowed (diagnostic property absent, as expected)",
  "Écriture (PUT) {p0}": "Write (PUT) {p0}",
  "acceptée par Jira": "accepted by Jira",
  "Relecture de la valeur écrite": "Read back the written value",
  "valeur retrouvée dans Jira": "value found in Jira",
  "Jira a répondu, mais la valeur écrite n'y est pas":
    "Jira responded, but the written value is missing",
  "propriété de test supprimée": "test property deleted",
  "{p0} La propriété « {p1} » est peut-être restée sur le sprint {p2} : elle est invisible dans Jira et sans effet.":
    "{p0} Property ‘{p1}’ may still be on sprint {p2}: it is invisible in Jira and has no effect.",
  "Relecture après une écriture à l'issue inconnue":
    "Read back after a write with an unknown outcome",
  "la propriété de test EXISTE dans Jira : l'écriture avait abouti. Elle est invisible et sans effet ; relancez le test pour la supprimer":
    "the test property EXISTS in Jira: the write succeeded. It is invisible and has no effect; run the test again to delete it",
  "Jira accepte les écritures de l'extension sans en-tête particulier.":
    "Jira accepts writes from the extension without a special header.",
  "Jira refuse les écritures sans en-tête (XSRF) et les accepte avec X-Atlassian-Token: no-check.":
    "Jira rejects writes without a header (XSRF) and accepts them with X-Atlassian-Token: no-check.",
  "Jira refuse les écritures de l'extension (XSRF), avec ou sans en-tête : une autre voie est nécessaire.":
    "Jira rejects writes from the extension (XSRF), with or without a header: another method is needed.",
  "L'écriture n'a pas abouti, pour une raison autre que le contrôle XSRF (voir le détail).":
    "The write failed for a reason other than XSRF validation (see details).",
  "refusé dans toutes les variantes de l'en-tête Origin.":
    "rejected with every Origin header option.",
  "accepté, {p0} (variante retenue).": "accepted, {p0} (selected option).",
  Lectures: "Reads",
  "GraphQL : {detail}": "GraphQL: {detail}",
  "Lectures : non lancées": "Reads: not started",
  "Écriture (propriété de diagnostic du sprint)": "Write (sprint diagnostic property)",
  "Écriture : test non lancé": "Write: test not started",
  "Conclusion : {p0}": "Conclusion: {p0}",
  "refus XSRF — {p0}": "XSRF rejection — {p0}",
  "refusé — {p0}": "rejected — {p0}",
  "corps de réponse vide": "empty response body",
  "réponse : {p0}": "response: {p0}",
  "refusé sans message Jira — {p0}": "rejected without a Jira message — {p0}",
  "Connexion à Jira impossible.": "Cannot connect to Jira.",
  "Jira n'a pas répondu dans le délai imparti.": "Jira did not respond in time.",
  "L'adresse Jira « {p0} » n'est pas valide.": "The Jira address ‘{p0}’ is invalid.",
  "« {p0} » n'est pas un site Jira Cloud (*.atlassian.net).":
    "‘{p0}’ is not a Jira Cloud site (*.atlassian.net).",
  "Jira ne reconnaît pas votre session dans ce navigateur.":
    "Jira does not recognise your session in this browser.",
  "Jira a refusé la requête à cause de son origine (contrôle XSRF).":
    "Jira rejected the request because of its origin (XSRF validation).",
  "Action refusée par Jira : {p0}": "Action rejected by Jira: {p0}",
  "Action refusée par Jira : votre compte n'a pas les droits nécessaires.":
    "Action rejected by Jira: your account does not have the required permissions.",
  "Introuvable dans Jira : {p0}.": "Not found in Jira: {p0}.",
  "Jira a temporairement limité le nombre de requêtes.":
    "Jira has temporarily limited the number of requests.",
  "Jira est momentanément indisponible (erreur {p0}).":
    "Jira is temporarily unavailable (error {p0}).",
  "Jira a refusé la requête.": "Jira rejected the request.",
  "Jira a répondu par une redirection au lieu de données.":
    "Jira returned a redirect instead of data.",
  "Atlassian a refusé la requête.": "Atlassian rejected the request.",
  "Atlassian a refusé la requête : {p0}": "Atlassian rejected the request: {p0}",
  "Réponse Jira inattendue ({p0}).": "Unexpected Jira response ({p0}).",
  "Données trop volumineuses pour Jira : {p0} octets pour une limite de {p1}.":
    "Data too large for Jira: {p0} bytes for a limit of {p1}.",
  "Erreur Jira inattendue (code {p0}).": "Unexpected Jira error (code {p0}).",
  "Vérifiez votre connexion réseau et que l'accès au site est toujours accordé à l'extension, puis réessayez.":
    "Check your network connection and that the extension still has access to the site, then try again.",
  "Réessayez. Si le problème persiste, votre instance Jira est peut-être surchargée.":
    "Try again. If the problem persists, your Jira instance may be overloaded.",
  "Attendu : une adresse HTTPS, par exemple https://votre-societe.atlassian.net":
    "Expected: an HTTPS address, for example https://your-company.atlassian.net",
  "Vérifiez l'orthographe. L'extension ne peut accéder qu'à un site *.atlassian.net.":
    "Check the spelling. The extension can only access a *.atlassian.net site.",
  "Connectez-vous à Jira dans un onglet de ce navigateur, puis réessayez.":
    "Sign in to Jira in a tab in this browser, then try again.",
  "Ce refus ne vient pas de vos droits. Lancez le diagnostic et transmettez son rapport.":
    "This rejection is not caused by your permissions. Run diagnostics and share the report.",
  "Demandez le droit correspondant à votre administrateur Jira. L'extension n'effectue aucune modification sans l'accord de Jira.":
    "Ask your Jira administrator for the required permission. The extension makes no changes without Jira's approval.",
  "Vérifiez que « {p0} » existe toujours et que votre compte Jira peut le consulter.":
    "Check that ‘{p0}’ still exists and that your Jira account can view it.",
  "Patientez quelques instants avant de réessayer.": "Wait a moment before trying again.",
  "Réessayez dans {p0} seconde(s).": "Try again in {p0} second(s).",
  "Réessayez dans quelques minutes.": "Try again in a few minutes.",
  "Corrigez la demande dans Jira, puis actualisez.": "Correct the request in Jira, then refresh.",
  "Le diagnostic de l'extension montre ce que la passerelle GraphQL d'Atlassian répond.":
    "The extension diagnostics show the response from the Atlassian GraphQL gateway.",
  "Signalez cette anomalie : la réponse de votre instance Jira ne correspond pas au format attendu.":
    "Report this issue: your Jira instance returned an unexpected format.",
  "Réduisez la taille des réglages, des objectifs ou des rattachements à enregistrer.":
    "Reduce the size of the settings, goals or issue links to save.",
  "Réessayez. Si l'erreur persiste, lancez le diagnostic.":
    "Try again. If the error persists, run diagnostics.",
  "identifiant du site": "site identifier",
  "Recherche des objectifs incomplète : un objectif est illisible dans la réponse Atlassian.":
    "Goal search incomplete: a goal cannot be read in the Atlassian response.",
  "Recherche des objectifs incomplète : Atlassian n'expose pas de pagination exploitable.":
    "Goal search incomplete: Atlassian does not expose usable pagination.",
  "Recherche des objectifs incomplète : pagination absente de la réponse Atlassian.":
    "Goal search incomplete: pagination is missing from the Atlassian response.",
  "Recherche des objectifs incomplète : limite ou incohérence de pagination Atlassian.":
    "Goal search incomplete: Atlassian pagination is inconsistent or a limit was reached.",
  "aucun ARI de site": "no site ARI",
  "Lecture incomplète des liens des objectifs : liste absente de la réponse Atlassian.":
    "Goal links incomplete: the list is missing from the Atlassian response.",
  "un objectif ne fournit pas ses liens vers les tickets":
    "a goal does not provide its issue links",
  "les tickets rattachés à un objectif sont illisibles": "issues linked to a goal cannot be read",
  "la pagination des liens des objectifs est illisible": "goal link pagination cannot be read",
  "la lecture complète des liens des objectifs dépasse la pagination prise en charge":
    "reading all goal links exceeds the supported pagination",
  "un objectif atteint 100 liens sans pagination exploitable ; certains tickets peuvent manquer":
    "a goal has 100 links without usable pagination; some issues may be missing",
  "certains objectifs demandés sont absents ou inaccessibles dans la réponse des liens":
    "some requested goals are missing or inaccessible in the link response",
  "résultat de validation absent": "validation result missing",
  "Le tri ORDER BY ne change pas l'ordre des cartes du board.":
    "ORDER BY does not change the order of cards on the board.",
  "référentiel de saisie absent": "autocomplete reference missing",
  "résultats de correspondance incomplets": "incomplete match results",
  "tickets correspondants absents": "matching issues missing",
  "POST de lecture non répertorié : {p0}": "Unlisted read POST request: {p0}",
  "Seules les requêtes GraphQL de lecture (query) passent par graphqlQuery.":
    "Only read-only GraphQL requests (query) can use graphqlQuery.",
  "Image hors du site Jira refusée : {p0}": "Image outside the Jira site rejected: {p0}",
  "Requête hors du site Jira refusée : {p0}": "Request outside the Jira site rejected: {p0}",
  "les objectifs du sprint {p0}": "goals for sprint {p0}",
  "1 à 50 tickets distincts attendus": "1 to 50 distinct issues expected",
  "les tickets du sprint {p0}": "issues in sprint {p0}",
  "la transition de {p0}": "transition for {p0}",
  "ticket de référence identique": "identical reference issue",
  "le classement de {p0}": "ranking for {p0}",
  "clé de ticket": "issue key",
  "le rattachement du ticket au Goal": "linking the issue to the Goal",
  "le détachement du ticket de son Goal": "unlinking the issue from its Goal",
  "réponse GraphQL": "GraphQL response",
  "résultat absent": "result missing",
  "certains liens d'un objectif ne fournissent pas de clé de ticket lisible":
    "some goal links do not provide a readable issue key",
  "Arguments du lien Goal → tickets illisibles dans le schéma Atlassian.":
    "Goal → issue link arguments cannot be read in the Atlassian schema.",
  "le champ workItems exige des arguments non pris en charge : {p0}":
    "the workItems field requires unsupported arguments: {p0}",
  "le schéma Atlassian n'expose pas de lien Goal → tickets exploitable":
    "the Atlassian schema does not expose a usable Goal → issue link",
  "Évaluation Jira indisponible.": "Jira evaluation unavailable.",
  "Goals Atlassian illisibles : {p0} Les objectifs affichés sont les lignes du champ « Objectif » du sprint.":
    "Atlassian Goals cannot be read: {p0} Displayed goals come from the lines of the sprint Goal field.",
  "statut modifié": "status changed",
  "objectif modifié": "goal changed",
  "{p0} Déjà effectué : {p1}.": "{p0} Already completed: {p1}.",
  "Le board est relu pour montrer l'état de Jira. Aucun retour arrière automatique n'est effectué.":
    "The board is reloaded to show Jira's state. No automatic rollback is performed.",
  "aucun objectif": "no goal",
  réussi: "succeeded",
  échec: "failed",
  incertain: "uncertain",
  "propriété du sprint": "sprint property",
  "propriété du sprint « {p0} »": "property of sprint ‘{p0}’",
  "Rattacher un ticket à un objectif du sprint exige en général la permission Jira de gérer les sprints.":
    "Linking an issue to a sprint goal usually requires the Jira Manage sprints permission.",
  "aucun détail fourni par Atlassian": "no details provided by Atlassian",
  "{p0} Le lien avec l’ancien Goal a déjà été retiré.":
    "{p0} The link to the previous Goal has already been removed.",
  "{p0}. Vérifiez le board après sa relecture.": "{p0}. Check the board after it reloads.",
  "Atlassian a refusé de détacher le ticket de son Goal actuel.":
    "Atlassian refused to unlink the issue from its current Goal.",
  "lien Goal retiré": "Goal link removed",
  "Atlassian a refusé de rattacher le ticket au Goal.":
    "Atlassian refused to link the issue to the Goal.",
  "{p0} a changé dans Jira : il est maintenant « {p1} ».":
    "{p0} changed in Jira: its status is now ‘{p1}’.",
  "L'affichage a été relu dans Jira. Relancez le déplacement si besoin.":
    "The view was reloaded from Jira. Try the move again if needed.",
  "conflit : statut modifié dans Jira": "conflict: status changed in Jira",
  "Ce ticket a été modifié par quelqu'un d'autre depuis le chargement.":
    "Someone else changed this issue since the board was loaded.",
  "Le board a été rechargé ; recommence si besoin.":
    "The board has been reloaded; try again if needed.",
  "conflit : lien modifié dans Jira": "conflict: link changed in Jira",
  "Complétez « {p0} » dans Jira pour {p1}.": "Complete ‘{p0}’ in Jira for {p1}.",
  "Le board sera actualisé à la fermeture du ticket.":
    "The board will refresh when the issue is closed.",
  "Impossible d'ouvrir le formulaire Jira pour {p0}.": "Cannot open the Jira form for {p0}.",
  "Rechargez la page Jira puis recommencez le déplacement. Rien n'a été modifié.":
    "Reload the Jira page and try the move again. Nothing was changed.",
  "La transition prévue vers « {p0} » n'est plus disponible pour {p1}.":
    "The planned transition to ‘{p0}’ is no longer available for {p1}.",
  "Aucune transition disponible vers « {p0} » pour {p1} depuis « {p2} ».":
    "No transition to ‘{p0}’ is available for {p1} from ‘{p2}’.",
  "Rien n'a été modifié. Le board est actualisé ; recommencez le déplacement si besoin.":
    "Nothing was changed. The board has refreshed; try the move again if needed.",
  "Rien n'a été modifié.": "Nothing was changed.",
  "aucune transition proposée": "no transition available",
  "après {p0}": "after {p0}",
  "avant {p0}": "before {p0}",
  "Transition « {p0} »": "Transition ‘{p0}’",
  "rang du board Jira": "Jira board rank",
  "Réordonner un ticket exige la permission Jira « Planifier les tickets ».":
    "Reordering an issue requires the Jira Schedule issues permission.",
  "Jira n'a pas confirmé l'écriture sur {p0} ({p1}).":
    "Jira did not confirm the write to {p0} ({p1}).",
  "Elle a peut-être eu lieu : l'affichage a été relu dans Jira. Vérifiez-le avant de recommencer ; l'extension ne rejoue jamais une écriture.":
    "It may have succeeded: the view was reloaded from Jira. Check it before trying again; the extension never retries a write.",
  "{p0} Goal épinglé": "{p0} pinned Goal",
  "{p0} Goals épinglés": "{p0} pinned Goals",
  épinglage: "pinning",
  "Les Goals épinglés ont été modifiés dans Jira pendant votre sélection.":
    "Pinned Goals changed in Jira while you were selecting them.",
  "Rien n'a été écrit. La fenêtre montre maintenant la sélection enregistrée dans Jira : refaites vos changements, puis enregistrez.":
    "Nothing was written. The window now shows the selection saved in Jira: make your changes again, then save.",
  "conflit : sélection modifiée dans Jira": "conflict: selection changed in Jira",
  "Jira n'a pas confirmé l'enregistrement ({p0}).": "Jira did not confirm the save ({p0}).",
  "Il a peut-être eu lieu : le board vient d'être relu. Vérifiez-le avant de recommencer ; l'extension ne rejoue jamais une écriture.":
    "It may have succeeded: the board was just reloaded. Check it before trying again; the extension never retries a write.",
  "Épingler un Goal au sprint exige en général la permission Jira de gérer les sprints. Vous pouvez garder cette sélection dans ce navigateur, sans la partager.":
    "Pinning a Goal to the sprint usually requires the Jira Manage sprints permission. You can keep this selection in this browser without sharing it.",
  "Les Goals épinglés ou les réglages du board ont changé dans Jira pendant votre sélection.":
    "Pinned Goals or board settings changed in Jira while you were selecting them.",
  "Rien n'a été écrit. La sélection de Jira est affichée : refaites vos changements, puis enregistrez.":
    "Nothing was written. Jira's selection is displayed: make your changes again, then save.",
  "conflit : réglages du board modifiés": "conflict: board settings changed",
  "Il faut pouvoir modifier le board pour y épingler des Goals.":
    "You need permission to edit the board to pin Goals to it.",
  "Les réglages du board sont illisibles : rien n'a été écrit.":
    "The board settings cannot be read: nothing was written.",
  "Le board ou vos droits ont changé : rien n'a été écrit.":
    "The board or your permissions changed: nothing was written.",
  "propriété du board Kanban": "Kanban board property",
  "Le board va être relu. Vérifiez sa sélection avant de recommencer ; l'extension ne rejoue jamais une écriture.":
    "The board will be reloaded. Check its selection before trying again; the extension never retries a write.",
  "Réglage non enregistré dans Jira : les réglages du board y sont dans un format inconnu.":
    "Setting not saved in Jira: the board settings use an unknown format.",
  "Ils ne sont jamais écrasés. Une version plus récente de l'extension les a peut-être écrits.":
    "They are never overwritten. They may have been written by a newer version of the extension.",
  "Ces règles ont changé dans Jira pendant votre saisie. Rien n'a été écrasé.":
    "These rules changed in Jira while you were editing them. Nothing was overwritten.",
  "Votre brouillon est conservé. Copiez-le si nécessaire, puis rechargez les règles avant de les modifier.":
    "Your draft has been kept. Copy it if needed, then reload the rules before editing them.",
  // Anciens refus de la porte (jusqu'à 0.36.2), avec « Le board ou vos droits ont changé : rien
  // n'a été écrit. » : gardés car les entrées { text } du journal de ces versions sont traduites
  // par `localize` seulement si leur phrase figure exactement au catalogue.
  "Le board ou ses droits ont changé avant l'enregistrement.":
    "The board or its permissions changed before saving.",
  "Rien n'a été envoyé à Jira : il faut pouvoir modifier le board.":
    "Nothing was sent to Jira: you need permission to edit the board.",
  "Rien n'a été envoyé à Jira : le board a changé avant l'envoi.":
    "Nothing was sent to Jira: the board changed before sending.",
  "réglages du board": "board settings",
  enregistrement: "save",
  "Quelqu'un": "Someone",
  "Réglage non enregistré : {p0} a modifié les réglages du board au même moment.":
    "Setting not saved: {p0} changed the board settings at the same time.",
  "Ses réglages sont maintenant affichés ; refaites votre modification.":
    "Their settings are now displayed; make your change again.",
  "modifiés au même moment": "changed at the same time",
  "Jira a refusé d'enregistrer ce réglage : il faut pouvoir modifier le board.":
    "Jira refused to save this setting: you need permission to edit the board.",
  "Les réglages du board sont maintenant en lecture seule ici ; ceux de l'équipe vont être rechargés.":
    "Board settings are now read-only here; the team's settings will be reloaded.",
  "Jira n'a pas confirmé l'enregistrement du réglage ({p0}).":
    "Jira did not confirm that the setting was saved ({p0}).",
  "Les réglages du board vont être relus. L'extension ne rejoue jamais une écriture.":
    "The board settings will be reloaded. The extension never retries a write.",
  "Réglage non enregistré dans Jira ({p0}).": "Setting not saved in Jira ({p0}).",
  "Il sera remplacé par les réglages du board au prochain chargement.":
    "It will be replaced with the board settings on the next load.",
  "Les réglages du board enregistrés dans Jira sont dans un format inconnu (version plus récente de l'extension ?) : ils ne sont pas appliqués.":
    "The board settings saved in Jira use an unknown format (a newer extension version?): they have not been applied.",
  "La lecture JQL n'a pas pu être confirmée auprès de Jira.":
    "The JQL read could not be confirmed by Jira.",
  "Saisissez une requête JQL.": "Enter a JQL query.",
  "Résultat de correspondance incomplet.": "Incomplete match result.",
  "Ce board n'est plus enregistré dans ce navigateur.":
    "This board is no longer saved in this browser.",
  "Ajoutez-le de nouveau par son adresse.": "Add it again using its address.",
  "Ce board s'affiche ici, mais la page Jira derrière reste celle du board précédent.":
    "This board is displayed here, but the underlying Jira page still shows the previous board.",
  "Son adresse Jira n'a pas pu être formée : il n'a pas de clé de projet.":
    "Its Jira address could not be created: it has no project key.",
  "{p0} Les filtres rapides Jira ont été désactivés.":
    "{p0} Jira quick filters have been disabled.",
  "Le statut a changé. Recommencez le déplacement.": "The status changed. Try the move again.",
  "Lecture des transitions…": "Loading transitions…",
  "Le statut du ticket a changé. Recommencez le déplacement.":
    "The issue status changed. Try the move again.",
  "JQL non vérifié par Jira.": "JQL not verified by Jira.",
  "Réglage appliqué, mais pas enregistré dans ce navigateur ({p0}).":
    "Setting applied but not saved in this browser ({p0}).",
  "Il sera perdu à la fermeture de l'onglet. Rien n'a été écrit dans Jira.":
    "It will be lost when the tab closes. Nothing was written to Jira.",
  "Ce board n'a aucun sprint actif.": "This board has no active sprint.",
  "Le test d'écriture a besoin d'un sprint actif pour y poser sa propriété technique.":
    "The write test needs an active sprint to store its technical property.",
  "Diagnostic de chargement : aucune mesure disponible.":
    "Loading diagnostics: no measurements available.",
  "Sprint Goals Board — diagnostic de chargement v1": "Sprint Goals Board — loading diagnostics v1",
  "Sprint Goals Board (extension Chrome) {p0} — diagnostic de connexion":
    "Sprint Goals Board (Chrome extension) {p0} — connection diagnostics",
  "Version : {p0}": "Version: {p0}",
  "Date : {p0}": "Date: {p0}",
  "Action : {p0}": "Action: {p0}",
  ouverture: "opening",
  actualisation: "refresh",
  "Périmètre : depuis le démarrage du document de l'extension ; la navigation Jira précédente est hors mesure.":
    "Scope: from the extension document startup; previous Jira navigation is not measured.",
  "État : {p0}": "Status: {p0}",
  "Board : {p0} ; tickets : {p1} ; objectifs : {p2}": "Board: {p0}; issues: {p1}; goals: {p2}",
  "non déterminé": "undetermined",
  "Temps écoulé : {p0} ms": "Elapsed time: {p0} ms",
  "Données prêtes : {p0} ; board affiché : {p1}": "Data ready: {p0}; board displayed: {p1}",
  "Board affiché : mesure après deux frames, estimation du rendu navigateur.":
    "Board displayed: measured after two frames, an estimate of browser rendering.",
  "Requêtes : {p0} tentatives ; nouvelles tentatives : {p1} ; attentes : {p2}":
    "Requests: {p0} attempts; retries: {p1}; waits: {p2}",
  "Erreurs de requête : {p0} ; phases en erreur : {p1}":
    "Request errors: {p0}; failed phases: {p1}",
  "Mesures non détaillées (limite {p0}) : {p1}": "Measurements without detail (limit {p0}): {p1}",
  "Les compteurs de requêtes, reprises, attentes et erreurs portent uniquement sur les mesures détaillées ; ils sont partiels.":
    "Request, retry, wait and error counts only cover detailed measurements and are partial.",
  "Chronologie : départ relatif et durée, en ms. Les appels parallèles ne s'additionnent pas au temps total.":
    "Timeline: relative start and duration in ms. Parallel calls do not add up to the total time.",
  "Les durées des requêtes incluent le réseau, la lecture de la réponse et son décodage.":
    "Request durations include the network, reading the response and decoding it.",
  "Un chargement terminé peut inclure des erreurs récupérées ou des phases complémentaires en échec ; voir leur détail ci-dessous.":
    "A completed load may include recovered errors or failed additional phases; see details below.",
  "en cours": "in progress",
  "appel {p0}": "request {p0}",
  "tentative {p0}": "attempt {p0}",
  "attente prévue {p0} ms": "scheduled wait {p0} ms",
  "erreur {p0}": "error {p0}",
  "Rapport local : aucun nom, URL, JQL, contenu de ticket, identifiant Jira ou message d'erreur brut.":
    "Local report: no names, URLs, JQL, issue content, Jira identifiers or raw error messages.",
  "non mesuré": "not measured",
  tickets: "issues",
  "Sprint Planning est désactivé dans cette version.":
    "Sprint Planning is disabled in this version.",
  "Choisissez un sprint futur à préparer.": "Choose a future sprint to prepare.",
  "Ce sprint n'est plus un sprint futur.": "This is no longer a future sprint.",
  "Chaque objectif doit avoir un titre sur une seule ligne.":
    "Each goal must have a single-line title.",
  "Saisissez les titres sans puce ni numéro au début : la mise en forme est automatique.":
    "Enter titles without a bullet or number at the start: formatting is automatic.",
  "Donnez un titre différent à chaque objectif.": "Give each goal a different title.",
  "Certains tickets du brouillon ne sont plus disponibles. Retirez-les du plan avant de publier.":
    "Some issues in the draft are no longer available. Remove them from the plan before publishing.",
  "Attendez la fin de l'opération en cours sur le board.":
    "Wait for the current board operation to finish.",
  "Le brouillon local n'a pas pu être relu. Les données Jira restent disponibles.":
    "The local draft could not be read. Jira data is still available.",
  "Jira a changé depuis ce brouillon. Copiez la synthèse pour le conserver, puis repartez de Jira avant de publier.":
    "Jira has changed since this draft. Copy the summary to keep it, then start again from Jira before publishing.",
  "Brouillon conservé en mémoire, mais sa sauvegarde locale a échoué. Copiez la synthèse avant de fermer.":
    "The draft is kept in memory, but could not be saved locally. Copy the summary before closing.",
  "Votre brouillon a été retrouvé dans ce navigateur.": "Your draft was found in this browser.",
  "{p0} L'ancien brouillon local n'a pas pu être effacé.":
    "{p0} The previous local draft could not be deleted.",
  "La publication doit être réexaminée. Votre brouillon reste disponible : copiez sa synthèse, puis repartez de Jira pour voir le résultat confirmé.":
    "The publication needs review. Your draft is still available: copy its summary, then start again from Jira to see the confirmed result.",
  "Publication non confirmée. Copiez votre brouillon puis repartez de Jira avant toute nouvelle publication.":
    "Publication not confirmed. Copy your draft, then start again from Jira before publishing again.",
  "À organiser": "To organise",
  "Proposition de préparation": "Planning proposal",
  "Capacité envisagée : {p0} {p1}": "Proposed capacity: {p0} {p1}",
  "Tickets à réexaminer :": "Issues to review:",
  "Synthèse copiée.": "Summary copied.",
  "Le brouillon reste affiché mais sa sauvegarde locale a échoué. Copiez la synthèse avant de fermer.":
    "The draft is still displayed but could not be saved locally. Copy the summary before closing.",
  "ATELIER PRODUIT": "PRODUCT WORKSHOP",
  "Afficher la barre latérale": "Show sidebar",
  "Masquer la barre latérale": "Hide sidebar",
  "Retour au board": "Back to board",
  "Copier la synthèse": "Copy summary",
  "Publier dans Jira": "Publish to Jira",
  "Sprint à préparer": "Sprint to prepare",
  "Aucun sprint futur": "No future sprint",
  " — brouillon à réexaminer": " — draft to review",
  "Publication en cours…": "Publishing…",
  "Lecture de Jira…": "Loading from Jira…",
  "Brouillon local": "Local draft",
  "Version Jira": "Jira version",
  "Relire les tickets depuis Jira": "Reload issues from Jira",
  Actualiser: "Refresh",
  "Repartir de Jira": "Start again from Jira",
  "Préparons votre prochain sprint": "Let's prepare your next sprint",
  "Un sprint à construire ensemble": "Build a sprint together",
  "Lecture du backlog, du sprint futur et du reste à faire.":
    "Loading the backlog, future sprint and remaining work.",
  "Créez un sprint futur dans le backlog Jira, puis actualisez pour préparer ses objectifs et ses stories ici.":
    "Create a future sprint in the Jira backlog, then refresh to prepare its goals and stories here.",
  "Synthèse du sprint proposé": "Proposed sprint summary",
  objectif: "goal",
  objectifs: "goals",
  "ticket prévu": "planned issue",
  "tickets prévus": "planned issues",
  "Ajoutez des tickets pour composer le sprint": "Add issues to build the sprint",
  "{p0} sans estimation": "{p0} without estimates",
  "Tous les tickets prévus sont estimés": "All planned issues have estimates",
  "Capacité cible": "Target capacity",
  facultative: "optional",
  "Capacité cible en {p0}": "Target capacity in {p0}",
  "Capacité utilisée": "Used capacity",
  "{p0} au-dessus de la cible": "{p0} above target",
  "{p0} disponibles": "{p0} available",
  " · estimation partielle": " · partial estimate",
  "Tickets à examiner": "Issues to explore",
  Explorer: "Explore",
  "Choisir ce qui sert vos objectifs.": "Choose what supports your goals.",
  "Source des tickets": "Issue source",
  "Reste à faire": "Remaining work",
  "Rechercher un ticket à planifier": "Search for an issue to plan",
  "Rechercher une story, un epic…": "Search for a story, an epic…",
  "Tickets non terminés du sprint actif, à réexaminer avant la clôture. Leur présence ici ne les déplace pas.":
    "Unfinished issues from the active sprint, to review before closing it. Showing them here does not move them.",
  "Aucun ticket ne correspond à cette recherche.": "No issues match this search.",
  "Aucun reste à faire dans le sprint actif.": "No remaining work in the active sprint.",
  "Tous les tickets disponibles sont déjà dans votre proposition.":
    "All available issues are already in your proposal.",
  "Glissez un ticket vers un objectif ou utilisez « Affecter à ».":
    "Drag an issue to a goal or use ‘Assign to’.",
  "Proposition de sprint": "Sprint proposal",
  "Construire par objectifs": "Build around goals",
  "Décrivez le résultat attendu, puis réunissez les stories qui le rendent possible.":
    "Describe the expected outcome, then gather the stories that make it possible.",
  "Tous les objectifs": "All goals",
  "Tickets à vérifier": "Issues to check",
  "Ces tickets ne sont plus disponibles dans le backlog ou le sprint choisi. Retirez-les de la proposition pour pouvoir publier.":
    "These issues are no longer available in the backlog or selected sprint. Remove them from the proposal before publishing.",
  "Retirer {p0} de la proposition": "Remove {p0} from the proposal",
  "Retirer de la proposition": "Remove from proposal",
  "Quel résultat voulez-vous obtenir ?": "What outcome do you want to achieve?",
  "Commencez par un objectif concret. Les tickets viennent ensuite.":
    "Start with a concrete goal. The issues come next.",
  "Objectif {p0} : {p1}": "Goal {p0}: {p1}",
  OBJECTIF: "GOAL",
  "Titre de l’objectif {p0}": "Title of goal {p0}",
  "Un résultat concret pour vos utilisateurs": "A concrete outcome for your users",
  "Se concentrer sur cet objectif": "Focus on this goal",
  "Isoler l’objectif {p0}": "Focus on goal {p0}",
  "Monter l’objectif {p0}": "Move goal {p0} up",
  "Descendre l’objectif {p0}": "Move goal {p0} down",
  "Supprimer l’objectif {p0}": "Delete goal {p0}",
  "Retirer cet objectif ; ses tickets restent à organiser":
    "Remove this goal; its issues remain to be organised",
  "Déposez ici les stories qui contribuent à cet objectif.":
    "Drop stories that contribute to this goal here.",
  "Nouvel objectif du sprint": "New sprint goal",
  "Ajouter un résultat attendu pour ce sprint…": "Add an expected outcome for this sprint…",
  "Ajouter l’objectif": "Add goal",
  "Tickets à organiser": "Issues to organise",
  "Dans le sprint proposé, encore sans objectif.": "In the proposed sprint, without a goal yet.",
  "Un ticket à discuter ? Gardez-le ici avant de choisir son objectif.":
    "An issue to discuss? Keep it here before choosing its goal.",
  "Votre proposition reste un brouillon dans ce navigateur. Publiez quand l’équipe est prête.":
    "Your proposal stays as a draft in this browser. Publish when the team is ready.",
  "Publier la proposition de sprint": "Publish sprint proposal",
  "Abandonner le brouillon ?": "Discard the draft?",
  "Le sprint": "Sprint",
  "recevra les objectifs ci-dessous et les rattachements de vos tickets.":
    "will receive the goals below and your issue links.",
  "Texte du sprint dans Jira · un objectif par ligne": "Sprint text in Jira · one goal per line",
  "{p0} restera sans objectif.": "{p0} will remain without a goal.",
  "{p0} resteront sans objectif.": "{p0} will remain without a goal.",
  "Le sprint restera futur. Le reste à faire du sprint actif ne sera pas déplacé.":
    "The sprint will remain a future sprint. Remaining work in the active sprint will not be moved.",
  "Continuer la préparation": "Continue preparing",
  "Confirmer la publication": "Confirm publication",
  "Les objectifs et choix de tickets non publiés seront remplacés par la version actuelle de Jira. La capacité cible sera également réinitialisée.":
    "Unpublished goals and issue selections will be replaced with the current Jira version. Target capacity will also be reset.",
  "Garder le brouillon": "Keep draft",
  "Reprendre depuis Jira": "Start again from Jira",
  "{p0} à ajouter au sprint": "{p0} to add to the sprint",
  "Les tickets de la proposition sont déjà dans ce sprint.":
    "The issues in the proposal are already in this sprint.",
  "Ouvrir {p0} dans Jira": "Open {p0} in Jira",
  "Sans estimation": "No estimate",
  "Estimation Jira": "Jira estimate",
  "Déjà dans le sprint": "Already in the sprint",
  "Sprint actif": "Active sprint",
  "Consultation uniquement": "Read-only",
  " · sous-tâche": " · subtask",
  " · terminé": " · done",
  "Affecter {p0} à un objectif": "Assign {p0} to a goal",
  "Affecter à…": "Assign to…",
  "Objectif à nommer": "Untitled goal",
  "Remettre dans le backlog": "Return to backlog",
  "Fermer la confirmation": "Close confirmation",
} as const;

/** Seuls ces paramètres sont des messages de l'application, jamais des noms ou contenus Jira. */
export const businessMessageParameters: Partial<
  Record<keyof typeof businessMessages, readonly string[]>
> = {
  "Publication suspendue : {p0}": ["p0"],
  "Lecture GraphQL par POST, {p0}": ["p0"],
  "Filtre rapide Jira inapplicable : {p0}": ["p0"],
  "Recherche des objectifs du board : {p0}": ["p0"],
  "Recherche des objectifs du site : {p0}": ["p0"],
  "Libellés des objectifs : {p0}": ["p0"],
  "Suppression (DELETE) {p0}": ["p0"],
  "{p0} sans en-tête particulier": ["p0"],
  "{p0} avec l'en-tête X-Atlassian-Token: no-check": ["p0"],
  "sans en-tête particulier : {p0}": ["p0"],
  "avec l'en-tête X-Atlassian-Token: no-check : {p0}": ["p0"],
  "Tickets rattachés aux objectifs : {p0}. {p1}": ["p0", "p1"],
  "Tickets rattachés aux objectifs : {p0}": ["p0"],
  "Objectifs du board Kanban indisponibles : {p0}": ["p0"],
  "{p0} Rien n’a été écrit.": ["p0"],
  "{p0} Aucune écriture n’a été rejouée. Vérifiez Jira avant de reprendre ; votre brouillon est conservé.":
    ["p0"],
  "Étapes confirmées : {p0}. {p1}": ["p0", "p1"],
  "Publication non confirmée. {p0}": ["p0"],
  "réponse {p0} au contenu inattendu, {p1}": ["p1"],
  "{p0} sans en-tête, puis {p1}": ["p0", "p1"],
  "même refus sans en-tête ; {p0}": ["p0"],
  "Écriture (PUT) {p0}": ["p0"],
  "{p0} La propriété « {p1} » est peut-être restée sur le sprint {p2} : elle est invisible dans Jira et sans effet.":
    ["p0"],
  "accepté, {p0} (variante retenue).": ["p0"],
  "Conclusion : {p0}": ["p0"],
  "Introuvable dans Jira : {p0}.": ["p0"],
  "Vérifiez que « {p0} » existe toujours et que votre compte Jira peut le consulter.": ["p0"],
  "Réponse Jira inattendue ({p0}).": ["p0"],
  "Goals Atlassian illisibles : {p0} Les objectifs affichés sont les lignes du champ « Objectif » du sprint.":
    ["p0"],
  "{p0} Déjà effectué : {p1}.": ["p0", "p1"],
  "{p0} Le lien avec l’ancien Goal a déjà été retiré.": ["p0"],
  "{p0}. Vérifiez le board après sa relecture.": ["p0"],
  "{p0} Les filtres rapides Jira ont été désactivés.": ["p0"],
  "{p0} L'ancien brouillon local n'a pas pu être effacé.": ["p0"],
  "Jira n'a pas confirmé l'écriture sur {p0} ({p1}).": ["p1"],
  "Jira n'a pas confirmé l'enregistrement ({p0}).": ["p0"],
  "Jira n'a pas confirmé l'enregistrement du réglage ({p0}).": ["p0"],
  "Réglage non enregistré dans Jira ({p0}).": ["p0"],
  "Réglage appliqué, mais pas enregistré dans ce navigateur ({p0}).": ["p0"],
  "Action : {p0}": ["p0"],
  "Board : {p0} ; tickets : {p1} ; objectifs : {p2}": ["p0"],
  "Données prêtes : {p0} ; board affiché : {p1}": ["p0", "p1"],
} as const;
