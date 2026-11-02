import type { businessMessages } from "../messages";

/** Catalogue espagnol ; les clés françaises et les paramètres restent inchangés. */
export const businessMessagesEs = {
  "Publication suspendue : {p0}": "Publicación suspendida: {p0}",
  "Nom de Build, seuil de vieillissement": "Nombre de Build, umbral de antigüedad",
  "Identifiant de ticket invalide.": "Identificador de incidencia no válido.",
  "votre compte Jira": "tu cuenta de Jira",
  "compte reconnu": "cuenta reconocida",
  "Lecture REST par POST": "lectura REST por POST",
  "session non reconnue": "sesión no reconocida",
  "Lecture GraphQL par POST": "lectura GraphQL por POST",
  "l'analyse JQL": "análisis JQL",
  "Lecture GraphQL par POST, {p0}": "Lectura GraphQL por POST, {p0}",
  "refus XSRF": "rechazo XSRF",
  "refus 403": "rechazo 403",
  "l'API Goals d'Atlassian": "la API de Atlassian Goals",
  "Adresse d'image invalide : {p0}": "Dirección de imagen no válida: {p0}",
  "Chemin Jira invalide : {p0}": "Ruta de Jira no válida: {p0}",
  "ajout au sprint": "añadir al sprint",
  "identifiant de transition": "identificador de transición",
  "identifiant de {p0}": "identificador de {p0}",
  "identifiant de Goal ou de ticket": "identificador de Goal o incidencia",
  "lien Goal Atlassian natif": "vínculo nativo de Atlassian Goal",
  "transition choisie": "transición seleccionada",
  classement: "ordenación",
  rattachement: "vinculación",
  "Suppression (DELETE) {p0}": "Eliminación (DELETE) {p0}",
  "sprint planning": "planificación del sprint",
  "Filtre rapide Jira inapplicable : {p0}": "No se puede aplicar el filtro rápido de Jira: {p0}",
  "Aucune transition disponible": "Ninguna transición disponible",
  "Recherche des objectifs du board : {p0}": "Búsqueda de objetivos del tablero: {p0}",
  "Recherche des objectifs du site : {p0}": "Búsqueda de objetivos del sitio: {p0}",
  "Libellés des objectifs : {p0}": "Nombres de los objetivos: {p0}",
  "statut modifié, objectif modifié": "estado cambiado, objetivo cambiado",
  "texte des objectifs, {p0} ticket(s) ajouté(s)":
    "texto de objetivos, {p0} incidencia(s) añadida(s)",
  "texte des objectifs, {p0} ticket(s) ajouté(s), rattachements aux objectifs":
    "texto de objetivos, {p0} incidencia(s) añadida(s), vínculos con objetivos",
  "texte des objectifs, rattachements aux objectifs": "texto de objetivos, vínculos con objetivos",
  "{p0} ticket(s) ajouté(s), rattachements aux objectifs":
    "{p0} incidencia(s) añadida(s), vínculos con objetivos",
  "{p0} sans en-tête particulier": "{p0} sin cabecera especial",
  "{p0} avec l'en-tête X-Atlassian-Token: no-check":
    "{p0} con la cabecera X-Atlassian-Token: no-check",
  "sans en-tête particulier : {p0}": "sin cabecera especial: {p0}",
  "avec l'en-tête X-Atlassian-Token: no-check : {p0}":
    "con la cabecera X-Atlassian-Token: no-check: {p0}",
  "Le champ Goals Jira n'a pas été identifié ; relisez la structure du board.":
    "No se ha identificado el campo Goals de Jira. Vuelve a cargar la estructura del tablero.",
  "Le champ Goals Jira est absent de certains tickets du board ({p0}).":
    "El campo Goals de Jira falta en algunas incidencias del tablero ({p0}).",
  "Recherche des objectifs du board": "Búsqueda de objetivos del tablero",
  "Recherche des objectifs du site": "Búsqueda de objetivos del sitio",
  "Tickets rattachés aux objectifs": "Incidencias vinculadas a los objetivos",
  "Tickets rattachés aux objectifs : {p0}. {p1}":
    "Incidencias vinculadas a los objetivos: {p0}. {p1}",
  "Tickets rattachés aux objectifs : {p0}": "Incidencias vinculadas a los objetivos: {p0}",
  "Libellés des objectifs": "Nombres de los objetivos",
  "Build par défaut": "Build predeterminado",
  "Swimlane par défaut": "Carril predeterminado",
  Ignoré: "Excluidos",
  "Le seuil « vieillissant » doit être un nombre entier de jours, entre 1 et 365.":
    "El umbral de antigüedad debe ser un número entero de días entre 1 y 365.",
  "La durée de la daily doit être un nombre entier de minutes, entre 1 et {p0}.":
    "La duración de la Daily debe ser un número entero de minutos entre 1 y {p0}.",
  "Le nombre de cartes du stock en daily doit être un entier, entre 1 et {p0}.":
    "El número de tarjetas pendientes en la Daily debe ser un número entero entre 1 y {p0}.",
  "Cette adresse ne désigne pas un board Jira.": "Esta dirección no identifica un tablero de Jira.",
  "Ce board appartient à {p0}, pas à {p1}.": "Este tablero pertenece a {p0}, no a {p1}.",
  "Collez l'adresse complète de votre board, par exemple https://societe.atlassian.net/jira/software/c/projects/ABC/boards/123":
    "Pega la dirección completa del tablero, por ejemplo https://empresa.atlassian.net/jira/software/c/projects/ABC/boards/123",
  "Collez l'adresse complète du board, par exemple {p0}/jira/software/c/projects/ABC/boards/123":
    "Pega la dirección completa del tablero, por ejemplo {p0}/jira/software/c/projects/ABC/boards/123",
  "L'extension n'a accès qu'au site auquel vous êtes connecté.":
    "La extensión solo tiene acceso al sitio al que estás conectado.",
  "Lecture des Goals Atlassian indisponible.": "No se han podido leer los Atlassian Goals.",
  "Lecture des Goals Atlassian indisponible : le board Kanban ne peut pas déterminer ses objectifs.":
    "No se han podido leer los Atlassian Goals: el tablero Kanban no puede determinar sus objetivos.",
  "Objectifs du board Kanban indisponibles : {p0}":
    "Objetivos del tablero Kanban no disponibles: {p0}",
  "la passerelle GraphQL d'Atlassian refuse l'origine des requêtes de l'extension (« Invalid CORS request »). Site Jira → Diagnostic, en bas de la barre latérale, essaie les variantes de l'en-tête Origin et retient celle qui passe.":
    "la pasarela GraphQL de Atlassian rechaza el origen de las consultas de la extensión («Invalid CORS request»). Sitio de Jira → Diagnóstico, al pie de la barra lateral, prueba las opciones de la cabecera Origin y conserva la que funciona.",
  "Jira a refusé de classer {p0}.": "Jira ha rechazado cambiar el orden de {p0}.",
  "Cet objectif n'existe plus dans le sprint. Actualisez le board.":
    "Este objetivo ya no existe en el sprint. Actualiza el tablero.",
  "propriété des objectifs du sprint : objet JSON attendu, rien n'a été écrit":
    "propiedad de objetivos del sprint: se esperaba un objeto JSON; no se ha escrito nada",
  "propriété des objectifs du sprint : version inconnue ou illisible, rien n'a été écrit":
    "propiedad de objetivos del sprint: versión desconocida o contenido ilegible; no se ha escrito nada",
  "Ajouté en cours de sprint": "Añadida durante el sprint",
  Bloqués: "Bloqueadas",
  Ajoutés: "Añadidas",
  "Tickets bloqués par un lien Jira « est bloqué par »":
    "Incidencias bloqueadas por un vínculo de Jira «está bloqueada por»",
  "Tickets ajoutés au sprint après son démarrage":
    "Incidencias añadidas al sprint después de su inicio",
  Reportés: "Arrastradas",
  "Tickets reportés du sprint précédent du board":
    "Incidencias arrastradas del sprint anterior del tablero",
  "Démarrage dans Jira": "Inicio en Jira",
  "Configuration du board": "Configuración del tablero",
  "Statuts Jira": "Estados de Jira",
  "Champs Jira": "Campos de Jira",
  "Types de tickets": "Tipos de incidencia",
  "Réglages du board": "Configuración del tablero",
  "Compte courant": "Cuenta actual",
  Sprints: "Sprints",
  Tickets: "Incidencias",
  "Réglages des objectifs": "Ajustes de los objetivos",
  "Objectifs et rattachements": "Objetivos y vínculos con incidencias",
  "Préparation du board": "Preparación del tablero",
  "Filtres rapides": "Filtros rápidos",
  "Couleurs des cartes": "Colores de las tarjetas",
  "Lecture Jira GET": "Consulta GET a Jira",
  "Lecture Jira POST": "Consulta POST a Jira",
  "Lecture Goals GraphQL": "Consulta GraphQL de Goals",
  "Attente avant nouvelle tentative": "Espera antes del reintento",
  "Jira a renvoyé un autre sprint.": "Jira ha devuelto un sprint diferente.",
  "Ce sprint n’est plus futur. Rien n’a été écrit.":
    "Este sprint ya no es futuro. No se ha escrito nada.",
  "Le sprint a changé dans Jira. Rechargez ses données avant de publier ; votre brouillon est conservé.":
    "El sprint ha cambiado en Jira. Vuelve a cargar sus datos antes de publicar; tu borrador se ha conservado.",
  "La sélection contient des doublons.": "La selección contiene duplicados.",
  "Les tickets déjà présents dans le sprint doivent être conservés.":
    "Las incidencias que ya están en el sprint deben conservarse.",
  "{p0} n’est plus un ticket du backlog disponible. Les tickets actifs et sous-tâches ne sont pas déplacés.":
    "{p0} ya no está disponible en el backlog. Las incidencias activas y las subtareas no se mueven.",
  "{p0} Rien n’a été écrit.": "{p0} No se ha escrito nada.",
  "Le texte des objectifs n’a pas été confirmé par Jira.":
    "Jira no ha confirmado el texto de los objetivos.",
  "texte des objectifs": "texto de los objetivos",
  "Un ticket retenu a quitté le backlog pendant la publication.":
    "Una incidencia seleccionada ha salido del backlog durante la publicación.",
  "Jira n’a pas confirmé tous les ajouts au sprint.":
    "Jira no ha confirmado todas las incorporaciones al sprint.",
  "{p0} ticket(s) ajouté(s)": "{p0} incidencia(s) añadida(s)",
  "Les rattachements ont été modifiés par un collègue pendant la publication.":
    "Un compañero ha modificado los vínculos de las incidencias durante la publicación.",
  "Les rattachements n’ont pas été confirmés par Jira.":
    "Jira no ha confirmado los vínculos de las incidencias.",
  "rattachements aux objectifs": "vínculos con objetivos",
  "Le sprint a changé pendant la vérification finale.":
    "El sprint ha cambiado durante la verificación final.",
  "Planning publié et vérifié dans Jira. Le sprint reste à démarrer dans Jira.":
    "Planificación publicada y verificada en Jira. El sprint aún debe iniciarse en Jira.",
  "{p0} Aucune écriture n’a été rejouée. Vérifiez Jira avant de reprendre ; votre brouillon est conservé.":
    "{p0} No se ha reintentado ninguna escritura. Comprueba Jira antes de continuar; tu borrador se ha conservado.",
  "Étapes confirmées : {p0}. {p1}": "Etapas confirmadas: {p0}. {p1}",
  "Publication non confirmée. {p0}": "Publicación sin confirmar. {p0}",
  "Le sprint ou ses objectifs ont changé pendant la publication.":
    "El sprint o sus objetivos han cambiado durante la publicación.",
  "Chaque objectif doit avoir un titre non vide sur une ligne, sans préfixe de liste.":
    "Cada objetivo necesita un título no vacío, en una sola línea y sin prefijo de lista.",
  "Un rattachement ne correspond plus à la sélection ou aux objectifs.":
    "Un vínculo de incidencia ya no coincide con la selección o los objetivos.",
  "La propriété des objectifs du sprint est illisible ou utilise une version inconnue. Elle ne sera pas écrasée.":
    "La propiedad de objetivos del sprint no se puede leer o utiliza una versión desconocida. No se sobrescribirá.",
  "La vérification Jira a échoué.": "La verificación en Jira ha fallado.",
  "Types de tickets et swimlanes par type": "Tipos de incidencia y carriles por tipo",
  "Daily : durée et stock": "Daily: duración e incidencias pendientes",
  "Source des objectifs": "Origen de los objetivos",
  "Goals épinglés au board": "Goals fijados en el tablero",
  "Couleurs des objectifs": "Colores de los objetivos",
  "Ordre des swimlanes": "Orden de los carriles",
  "Objectifs masqués": "Objetivos ocultos",
  "Champs des cartes": "Campos de las tarjetas",
  "Règles de couleur des cartes": "Reglas de color de las tarjetas",
  "réglages d'équipe": "ajustes del equipo",
  "réglages d'équipe du board : objet JSON attendu, rien n'a été écrit":
    "ajustes del equipo para el tablero: se esperaba un objeto JSON; no se ha escrito nada",
  "réglages d'équipe du board dans un format inconnu (version plus récente ?)":
    "los ajustes del equipo para el tablero usan un formato desconocido (¿una versión más reciente?)",
  "rien n'a été écrit": "no se ha escrito nada",
  "la langue Jira": "el idioma de Jira",
  "la validation JQL": "validación JQL",
  "l'aide à la saisie JQL": "autocompletado JQL",
  "les suggestions JQL": "sugerencias JQL",
  "Une correspondance JQL accepte de 1 à 50 tickets et de 1 à 10 requêtes.":
    "La comprobación de coincidencias JQL admite de 1 a 50 incidencias y de 1 a 10 consultas.",
  "les correspondances JQL": "coincidencias JQL",
  "les boards accessibles": "tableros accesibles",
  "les droits sur le board {p0}": "permisos del tablero {p0}",
  "le board {p0}": "tablero {p0}",
  "la configuration du board {p0}": "configuración del tablero {p0}",
  "les statuts Jira": "estados de Jira",
  "les champs Jira": "campos de Jira",
  "les sprints du board {p0}": "sprints del tablero {p0}",
  "le sprint {p0}": "sprint {p0}",
  "le backlog du board {p0}": "backlog del tablero {p0}",
  "Chargement incomplet : Jira a répété des tickets du backlog.":
    "Carga incompleta: Jira ha devuelto incidencias duplicadas del backlog.",
  "Le backlog dépasse la limite de {p0} tickets.":
    "El backlog supera el límite de {p0} incidencias.",
  "Chargement incomplet : la pagination du backlog Jira est incohérente.":
    "Carga incompleta: la paginación del backlog de Jira es incoherente.",
  "les filtres rapides du board {p0}": "filtros rápidos del tablero {p0}",
  "les tickets du sprint {p0} sur le board {p1}": "incidencias del sprint {p0} en el tablero {p1}",
  "les tickets du board {p0}": "incidencias del tablero {p0}",
  "le ticket {p0}": "incidencia {p0}",
  "les transitions de {p0}": "transiciones de {p0}",
  "les réglages d'équipe du board {p0}": "ajustes del equipo para el tablero {p0}",
  "la propriété « {p0} » du sprint {p1}": "propiedad «{p0}» del sprint {p1}",
  "Chargement incomplet : Jira a renvoyé une page de tickets inattendue. Actualisez le board.":
    "Carga incompleta: Jira ha devuelto una página de incidencias inesperada. Actualiza el tablero.",
  "Chargement incomplet : Jira a renvoyé une page vide avant la fin des tickets. Actualisez le board.":
    "Carga incompleta: Jira ha devuelto una página vacía antes de cargar todas las incidencias. Actualiza el tablero.",
  "Chargement incomplet : la pagination Jira contient des tickets répétés. Actualisez le board.":
    "Carga incompleta: la paginación de Jira contiene incidencias duplicadas. Actualiza el tablero.",
  "Chargement incomplet : le périmètre dépasse la limite de {p0} tickets. Réduisez le filtre du board dans Jira.":
    "Carga incompleta: el alcance supera el límite de {p0} incidencias. Limita el filtro del tablero en Jira.",
  "en-tête Origin de l'extension conservé": "cabecera Origin de la extensión conservada",
  "en-tête Origin retiré": "cabecera Origin eliminada",
  "en-tête Origin remplacé par l'adresse du site":
    "cabecera Origin sustituida por la dirección del sitio",
  "sans en-tête particulier": "sin cabecera especial",
  "avec l'en-tête X-Atlassian-Token: no-check": "con la cabecera X-Atlassian-Token: no-check",
  "Session Jira du navigateur (GET)": "Sesión de Jira del navegador (GET)",
  "l'identifiant du site": "el identificador del sitio",
  "identifiant du site lu": "identificador del sitio leído",
  "réponse {p0} au contenu inattendu": "respuesta {p0} con contenido inesperado",
  "réponse reçue": "respuesta recibida",
  "réponse {p0} au contenu inattendu, {p1}": "respuesta {p0} con contenido inesperado, {p1}",
  "{p0} sans en-tête, puis {p1}": "{p0} sin cabecera, después {p1}",
  "même refus sans en-tête ; {p0}": "mismo rechazo sin cabecera; {p0}",
  "sprints du board": "sprints del tablero",
  "la propriété de diagnostic": "la propiedad de diagnóstico",
  "Lecture d'une propriété du sprint": "Lectura de una propiedad del sprint",
  autorisée: "permitida",
  "autorisée (propriété de diagnostic absente, comme attendu)":
    "permitida (la propiedad de diagnóstico no existe, como se esperaba)",
  "Écriture (PUT) {p0}": "Escritura (PUT) {p0}",
  "acceptée par Jira": "aceptada por Jira",
  "Relecture de la valeur écrite": "Nueva lectura del valor escrito",
  "valeur retrouvée dans Jira": "valor encontrado en Jira",
  "Jira a répondu, mais la valeur écrite n'y est pas":
    "Jira ha respondido, pero falta el valor escrito",
  "propriété de test supprimée": "propiedad de prueba eliminada",
  "{p0} La propriété « {p1} » est peut-être restée sur le sprint {p2} : elle est invisible dans Jira et sans effet.":
    "{p0} Puede que la propiedad «{p1}» siga en el sprint {p2}: es invisible en Jira y no tiene efecto.",
  "Relecture après une écriture à l'issue inconnue":
    "Nueva lectura tras una escritura con resultado desconocido",
  "la propriété de test EXISTE dans Jira : l'écriture avait abouti. Elle est invisible et sans effet ; relancez le test pour la supprimer":
    "la propiedad de prueba EXISTE en Jira: la escritura se ha realizado. Es invisible y no tiene efecto; vuelve a ejecutar la prueba para eliminarla",
  "Jira accepte les écritures de l'extension sans en-tête particulier.":
    "Jira acepta escrituras de la extensión sin cabecera especial.",
  "Jira refuse les écritures sans en-tête (XSRF) et les accepte avec X-Atlassian-Token: no-check.":
    "Jira rechaza las escrituras sin cabecera (XSRF) y las acepta con X-Atlassian-Token: no-check.",
  "Jira refuse les écritures de l'extension (XSRF), avec ou sans en-tête : une autre voie est nécessaire.":
    "Jira rechaza las escrituras de la extensión (XSRF), con o sin cabecera: se necesita otro método.",
  "L'écriture n'a pas abouti, pour une raison autre que le contrôle XSRF (voir le détail).":
    "La escritura ha fallado por un motivo distinto de la validación XSRF (ver detalles).",
  "refusé dans toutes les variantes de l'en-tête Origin.":
    "rechazada con todas las opciones de la cabecera Origin.",
  "accepté, {p0} (variante retenue).": "aceptada, {p0} (opción seleccionada).",
  Lectures: "Lecturas",
  "GraphQL : {detail}": "GraphQL: {detail}",
  "Lectures : non lancées": "Lecturas: sin iniciar",
  "Écriture (propriété de diagnostic du sprint)": "Escritura (propiedad de diagnóstico del sprint)",
  "Écriture : test non lancé": "Escritura: prueba sin iniciar",
  "Conclusion : {p0}": "Conclusión: {p0}",
  "refus XSRF — {p0}": "rechazo XSRF — {p0}",
  "refusé — {p0}": "rechazada — {p0}",
  "corps de réponse vide": "cuerpo de respuesta vacío",
  "réponse : {p0}": "respuesta: {p0}",
  "refusé sans message Jira — {p0}": "rechazada sin mensaje de Jira — {p0}",
  "Connexion à Jira impossible.": "No se puede conectar con Jira.",
  "Jira n'a pas répondu dans le délai imparti.": "Jira no ha respondido a tiempo.",
  "L'adresse Jira « {p0} » n'est pas valide.": "La dirección de Jira «{p0}» no es válida.",
  "« {p0} » n'est pas un site Jira Cloud (*.atlassian.net).":
    "«{p0}» no es un sitio de Jira Cloud (*.atlassian.net).",
  "Jira ne reconnaît pas votre session dans ce navigateur.":
    "Jira no reconoce tu sesión en este navegador.",
  "Jira a refusé la requête à cause de son origine (contrôle XSRF).":
    "Jira ha rechazado la consulta por su origen (validación XSRF).",
  "Action refusée par Jira : {p0}": "Acción rechazada por Jira: {p0}",
  "Action refusée par Jira : votre compte n'a pas les droits nécessaires.":
    "Acción rechazada por Jira: tu cuenta no tiene los permisos necesarios.",
  "Introuvable dans Jira : {p0}.": "No se ha encontrado en Jira: {p0}.",
  "Jira a temporairement limité le nombre de requêtes.":
    "Jira ha limitado temporalmente el número de consultas.",
  "Jira est momentanément indisponible (erreur {p0}).":
    "Jira no está disponible temporalmente (error {p0}).",
  "Jira a refusé la requête.": "Jira ha rechazado la consulta.",
  "Jira a répondu par une redirection au lieu de données.":
    "Jira ha devuelto una redirección en lugar de datos.",
  "Atlassian a refusé la requête.": "Atlassian ha rechazado la consulta.",
  "Atlassian a refusé la requête : {p0}": "Atlassian ha rechazado la consulta: {p0}",
  "Réponse Jira inattendue ({p0}).": "Respuesta de Jira inesperada ({p0}).",
  "Données trop volumineuses pour Jira : {p0} octets pour une limite de {p1}.":
    "Los datos son demasiado grandes para Jira: {p0} bytes, con un límite de {p1}.",
  "Erreur Jira inattendue (code {p0}).": "Error inesperado de Jira (código {p0}).",
  "Vérifiez votre connexion réseau et que l'accès au site est toujours accordé à l'extension, puis réessayez.":
    "Comprueba tu conexión de red y que la extensión siga teniendo acceso al sitio; después, inténtalo de nuevo.",
  "Réessayez. Si le problème persiste, votre instance Jira est peut-être surchargée.":
    "Inténtalo de nuevo. Si el problema persiste, puede que tu instancia de Jira esté sobrecargada.",
  "Attendu : une adresse HTTPS, par exemple https://votre-societe.atlassian.net":
    "Se espera una dirección HTTPS, por ejemplo https://tu-empresa.atlassian.net",
  "Vérifiez l'orthographe. L'extension ne peut accéder qu'à un site *.atlassian.net.":
    "Comprueba la dirección. La extensión solo puede acceder a un sitio *.atlassian.net.",
  "Connectez-vous à Jira dans un onglet de ce navigateur, puis réessayez.":
    "Inicia sesión en Jira en una pestaña de este navegador y vuelve a intentarlo.",
  "Ce refus ne vient pas de vos droits. Lancez le diagnostic et transmettez son rapport.":
    "Este rechazo no se debe a tus permisos. Ejecuta el diagnóstico y comparte el informe.",
  "Demandez le droit correspondant à votre administrateur Jira. L'extension n'effectue aucune modification sans l'accord de Jira.":
    "Solicita el permiso necesario a tu administrador de Jira. La extensión no hace cambios sin la aprobación de Jira.",
  "Vérifiez que « {p0} » existe toujours et que votre compte Jira peut le consulter.":
    "Comprueba que «{p0}» siga existiendo y que tu cuenta de Jira pueda consultarlo.",
  "Patientez quelques instants avant de réessayer.":
    "Espera un momento antes de volver a intentarlo.",
  "Réessayez dans {p0} seconde(s).": "Vuelve a intentarlo en {p0} segundo(s).",
  "Réessayez dans quelques minutes.": "Vuelve a intentarlo en unos minutos.",
  "Corrigez la demande dans Jira, puis actualisez.": "Corrige la consulta en Jira y actualiza.",
  "Le diagnostic de l'extension montre ce que la passerelle GraphQL d'Atlassian répond.":
    "El diagnóstico de la extensión muestra la respuesta de la pasarela GraphQL de Atlassian.",
  "Signalez cette anomalie : la réponse de votre instance Jira ne correspond pas au format attendu.":
    "Informa de este problema: tu instancia de Jira ha devuelto un formato inesperado.",
  "Réduisez la taille des réglages, des objectifs ou des rattachements à enregistrer.":
    "Reduce el tamaño de los ajustes, los objetivos o los vínculos de incidencias que quieres guardar.",
  "Réessayez. Si l'erreur persiste, lancez le diagnostic.":
    "Inténtalo de nuevo. Si el error persiste, ejecuta el diagnóstico.",
  "identifiant du site": "identificador del sitio",
  "Recherche des objectifs incomplète : un objectif est illisible dans la réponse Atlassian.":
    "Búsqueda de Goals incompleta: no se puede leer un objetivo en la respuesta de Atlassian.",
  "Recherche des objectifs incomplète : Atlassian n'expose pas de pagination exploitable.":
    "Búsqueda de Goals incompleta: Atlassian no expone una paginación utilizable.",
  "Recherche des objectifs incomplète : pagination absente de la réponse Atlassian.":
    "Búsqueda de Goals incompleta: falta la paginación en la respuesta de Atlassian.",
  "Recherche des objectifs incomplète : limite ou incohérence de pagination Atlassian.":
    "Búsqueda de Goals incompleta: la paginación de Atlassian es incoherente o se ha alcanzado un límite.",
  "aucun ARI de site": "falta el ARI del sitio",
  "Lecture incomplète des liens des objectifs : liste absente de la réponse Atlassian.":
    "Vínculos de Goals incompletos: falta la lista en la respuesta de Atlassian.",
  "un objectif ne fournit pas ses liens vers les tickets":
    "un objetivo no proporciona sus vínculos con incidencias",
  "les tickets rattachés à un objectif sont illisibles":
    "no se pueden leer las incidencias vinculadas a un objetivo",
  "la pagination des liens des objectifs est illisible":
    "no se puede leer la paginación de los vínculos de los objetivos",
  "la lecture complète des liens des objectifs dépasse la pagination prise en charge":
    "la lectura de todos los vínculos de los objetivos supera la paginación admitida",
  "un objectif atteint 100 liens sans pagination exploitable ; certains tickets peuvent manquer":
    "un objetivo tiene 100 vínculos sin paginación utilizable; pueden faltar incidencias",
  "certains objectifs demandés sont absents ou inaccessibles dans la réponse des liens":
    "algunos objetivos solicitados faltan o no son accesibles en la respuesta de vínculos",
  "résultat de validation absent": "falta el resultado de la validación",
  "Le tri ORDER BY ne change pas l'ordre des cartes du board.":
    "ORDER BY no cambia el orden de las tarjetas en el tablero.",
  "référentiel de saisie absent": "falta la referencia de autocompletado",
  "résultats de correspondance incomplets": "resultados de coincidencias incompletos",
  "tickets correspondants absents": "faltan las incidencias coincidentes",
  "POST de lecture non répertorié : {p0}":
    "Consulta POST de lectura no incluida en el inventario: {p0}",
  "Seules les requêtes GraphQL de lecture (query) passent par graphqlQuery.":
    "Solo las consultas GraphQL de lectura (query) pueden usar graphqlQuery.",
  "Image hors du site Jira refusée : {p0}": "Imagen fuera del sitio de Jira rechazada: {p0}",
  "Requête hors du site Jira refusée : {p0}": "Consulta fuera del sitio de Jira rechazada: {p0}",
  "les objectifs du sprint {p0}": "objetivos del sprint {p0}",
  "1 à 50 tickets distincts attendus": "se esperan de 1 a 50 incidencias distintas",
  "les tickets du sprint {p0}": "incidencias del sprint {p0}",
  "la transition de {p0}": "transición de {p0}",
  "ticket de référence identique": "incidencia de referencia idéntica",
  "le classement de {p0}": "orden de {p0}",
  "clé de ticket": "clave de incidencia",
  "le rattachement du ticket au Goal": "vinculación de la incidencia al Goal",
  "le détachement du ticket de son Goal": "desvinculación de la incidencia de su Goal",
  "réponse GraphQL": "respuesta GraphQL",
  "résultat absent": "falta el resultado",
  "certains liens d'un objectif ne fournissent pas de clé de ticket lisible":
    "algunos vínculos de objetivos no proporcionan una clave de incidencia legible",
  "Arguments du lien Goal → tickets illisibles dans le schéma Atlassian.":
    "No se pueden leer los argumentos de vínculo Goal → incidencia en el esquema de Atlassian.",
  "le champ workItems exige des arguments non pris en charge : {p0}":
    "el campo workItems requiere argumentos no admitidos: {p0}",
  "le schéma Atlassian n'expose pas de lien Goal → tickets exploitable":
    "el esquema de Atlassian no expone un vínculo Goal → incidencias utilizable",
  "Évaluation Jira indisponible.": "Evaluación de Jira no disponible.",
  "Goals Atlassian illisibles : {p0} Les objectifs affichés sont les lignes du champ « Objectif » du sprint.":
    "No se pueden leer los Atlassian Goals: {p0} Los objetivos mostrados son las líneas del campo «Objetivo» del sprint.",
  "statut modifié": "estado cambiado",
  "objectif modifié": "objetivo cambiado",
  "{p0} Déjà effectué : {p1}.": "{p0} Ya realizado: {p1}.",
  "Le board est relu pour montrer l'état de Jira. Aucun retour arrière automatique n'est effectué.":
    "El tablero se vuelve a cargar para mostrar el estado de Jira. No se revierte ningún cambio automáticamente.",
  "aucun objectif": "sin objetivo",
  réussi: "correcto",
  échec: "fallido",
  incertain: "incierto",
  "propriété du sprint": "propiedad del sprint",
  "propriété du sprint « {p0} »": "propiedad del sprint «{p0}»",
  "Rattacher un ticket à un objectif du sprint exige en général la permission Jira de gérer les sprints.":
    "Vincular una incidencia a un objetivo del sprint suele requerir el permiso de Jira para gestionar sprints.",
  "aucun détail fourni par Atlassian": "Atlassian no ha proporcionado detalles",
  "{p0} Le lien avec l’ancien Goal a déjà été retiré.":
    "{p0} El vínculo con el Goal anterior ya se ha eliminado.",
  "{p0}. Vérifiez le board après sa relecture.":
    "{p0}. Comprueba el tablero después de que se vuelva a cargar.",
  "Atlassian a refusé de détacher le ticket de son Goal actuel.":
    "Atlassian ha rechazado desvincular la incidencia de su Goal actual.",
  "lien Goal retiré": "Vínculo con el Goal eliminado",
  "Atlassian a refusé de rattacher le ticket au Goal.":
    "Atlassian ha rechazado vincular la incidencia al Goal.",
  "{p0} a changé dans Jira : il est maintenant « {p1} ».":
    "{p0} ha cambiado en Jira: su estado ahora es «{p1}».",
  "L'affichage a été relu dans Jira. Relancez le déplacement si besoin.":
    "La vista se ha vuelto a cargar desde Jira. Repite el movimiento si es necesario.",
  "conflit : statut modifié dans Jira": "conflicto: estado cambiado en Jira",
  "Ce ticket a été modifié par quelqu'un d'autre depuis le chargement.":
    "Otra persona ha modificado esta incidencia desde la carga.",
  "Le board a été rechargé ; recommence si besoin.":
    "El tablero se ha vuelto a cargar; repite la acción si es necesario.",
  "conflit : lien modifié dans Jira": "conflicto: vínculo cambiado en Jira",
  "Complétez « {p0} » dans Jira pour {p1}.": "Completa «{p0}» en Jira para {p1}.",
  "Le board sera actualisé à la fermeture du ticket.":
    "El tablero se actualizará al cerrar la incidencia.",
  "Impossible d'ouvrir le formulaire Jira pour {p0}.":
    "No se puede abrir el formulario de Jira para {p0}.",
  "Rechargez la page Jira puis recommencez le déplacement. Rien n'a été modifié.":
    "Vuelve a cargar la página de Jira y repite el movimiento. No se ha modificado nada.",
  "La transition prévue vers « {p0} » n'est plus disponible pour {p1}.":
    "La transición prevista a «{p0}» ya no está disponible para {p1}.",
  "Aucune transition disponible vers « {p0} » pour {p1} depuis « {p2} ».":
    "Ninguna transición a «{p0}» está disponible para {p1} desde «{p2}».",
  "Rien n'a été modifié. Le board est actualisé ; recommencez le déplacement si besoin.":
    "No se ha modificado nada. El tablero se ha actualizado; repite el movimiento si es necesario.",
  "Rien n'a été modifié.": "No se ha modificado nada.",
  "aucune transition proposée": "ninguna transición disponible",
  "après {p0}": "después de {p0}",
  "avant {p0}": "antes de {p0}",
  "Transition « {p0} »": "Transición «{p0}»",
  "rang du board Jira": "orden del tablero de Jira",
  "Réordonner un ticket exige la permission Jira « Planifier les tickets ».":
    "Cambiar el orden de una incidencia requiere el permiso de Jira para programar incidencias.",
  "Jira n'a pas confirmé l'écriture sur {p0} ({p1}).":
    "Jira no ha confirmado la escritura en {p0} ({p1}).",
  "Elle a peut-être eu lieu : l'affichage a été relu dans Jira. Vérifiez-le avant de recommencer ; l'extension ne rejoue jamais une écriture.":
    "Puede haberse realizado: la vista se ha vuelto a cargar desde Jira. Compruébala antes de volver a intentarlo; la extensión nunca reintenta una escritura.",
  "{p0} Goal épinglé": "{p0} Goal fijado",
  "{p0} Goals épinglés": "{p0} Goals fijados",
  épinglage: "fijación",
  "Les Goals épinglés ont été modifiés dans Jira pendant votre sélection.":
    "Los Goals fijados han cambiado en Jira mientras los seleccionabas.",
  "Rien n'a été écrit. La fenêtre montre maintenant la sélection enregistrée dans Jira : refaites vos changements, puis enregistrez.":
    "No se ha escrito nada. La ventana muestra ahora la selección guardada en Jira: vuelve a hacer tus cambios y guarda.",
  "conflit : sélection modifiée dans Jira": "conflicto: selección modificada en Jira",
  "Jira n'a pas confirmé l'enregistrement ({p0}).":
    "Jira no ha confirmado que se haya guardado ({p0}).",
  "Il a peut-être eu lieu : le board vient d'être relu. Vérifiez-le avant de recommencer ; l'extension ne rejoue jamais une écriture.":
    "Puede haberse guardado: el tablero acaba de volver a cargarse. Compruébalo antes de volver a intentarlo; la extensión nunca reintenta una escritura.",
  "Épingler un Goal au sprint exige en général la permission Jira de gérer les sprints. Vous pouvez garder cette sélection dans ce navigateur, sans la partager.":
    "Fijar un Goal en el sprint suele requerir el permiso de Jira para gestionar sprints. Puedes conservar esta selección en este navegador sin compartirla.",
  "Les Goals épinglés ou les réglages du board ont changé dans Jira pendant votre sélection.":
    "Los Goals fijados o los ajustes del tablero han cambiado en Jira mientras los seleccionabas.",
  "Rien n'a été écrit. La sélection de Jira est affichée : refaites vos changements, puis enregistrez.":
    "No se ha escrito nada. Se muestra la selección de Jira: vuelve a hacer tus cambios y guarda.",
  "conflit : réglages du board modifiés": "conflicto: ajustes del tablero modificados",
  "Il faut pouvoir modifier le board pour y épingler des Goals.":
    "Necesitas permiso para editar el tablero para poder fijar Goals en él.",
  "Les réglages du board sont illisibles : rien n'a été écrit.":
    "No se pueden leer los ajustes del tablero: no se ha escrito nada.",
  "Le board ou vos droits ont changé : rien n'a été écrit.":
    "El tablero o tus permisos han cambiado: no se ha escrito nada.",
  "propriété du board Kanban": "propiedad del tablero Kanban",
  "Le board va être relu. Vérifiez sa sélection avant de recommencer ; l'extension ne rejoue jamais une écriture.":
    "El tablero se volverá a cargar. Comprueba su selección antes de volver a intentarlo; la extensión nunca reintenta una escritura.",
  "Réglage non enregistré dans Jira : les réglages du board y sont dans un format inconnu.":
    "Ajuste no guardado en Jira: los ajustes del tablero usan un formato desconocido.",
  "Ils ne sont jamais écrasés. Une version plus récente de l'extension les a peut-être écrits.":
    "Nunca se sobrescriben. Puede que los haya guardado una versión más reciente de la extensión.",
  "Ces règles ont changé dans Jira pendant votre saisie. Rien n'a été écrasé.":
    "Estas reglas han cambiado en Jira mientras las editabas. No se ha sobrescrito nada.",
  "Votre brouillon est conservé. Copiez-le si nécessaire, puis rechargez les règles avant de les modifier.":
    "Tu borrador se ha conservado. Cópialo si es necesario y vuelve a cargar las reglas antes de editarlas.",
  // Anciens refus de la porte (jusqu'à 0.36.2), avec « Le board ou vos droits ont changé : rien
  // n'a été écrit. » : gardés car les entrées { text } du journal de ces versions sont traduites
  // par `localize` seulement si leur phrase figure exactement au catalogue.
  "Le board ou ses droits ont changé avant l'enregistrement.":
    "El tablero o sus permisos han cambiado antes de guardar.",
  "Rien n'a été envoyé à Jira : il faut pouvoir modifier le board.":
    "No se ha enviado nada a Jira: necesitas permiso para editar el tablero.",
  "Rien n'a été envoyé à Jira : le board a changé avant l'envoi.":
    "No se ha enviado nada a Jira: el tablero ha cambiado antes del envío.",
  "réglages du board": "ajustes del tablero",
  enregistrement: "guardado",
  "Quelqu'un": "Alguien",
  "Réglage non enregistré : {p0} a modifié les réglages du board au même moment.":
    "Ajuste no guardado: {p0} ha cambiado los ajustes del tablero al mismo tiempo.",
  "Ses réglages sont maintenant affichés ; refaites votre modification.":
    "Ahora se muestran sus ajustes; vuelve a hacer tu cambio.",
  "modifiés au même moment": "modificado al mismo tiempo",
  "Jira a refusé d'enregistrer ce réglage : il faut pouvoir modifier le board.":
    "Jira ha rechazado guardar este ajuste: necesitas permiso para editar el tablero.",
  "Les réglages du board sont maintenant en lecture seule ici ; ceux de l'équipe vont être rechargés.":
    "Aquí, los ajustes del tablero son ahora de solo lectura; los ajustes del equipo se volverán a cargar.",
  "Jira n'a pas confirmé l'enregistrement du réglage ({p0}).":
    "Jira no ha confirmado que se haya guardado el ajuste ({p0}).",
  "Les réglages du board vont être relus. L'extension ne rejoue jamais une écriture.":
    "Los ajustes del tablero se volverán a cargar. La extensión nunca reintenta una escritura.",
  "Réglage non enregistré dans Jira ({p0}).": "Ajuste no guardado en Jira ({p0}).",
  "Il sera remplacé par les réglages du board au prochain chargement.":
    "Se sustituirá por los ajustes del tablero en la próxima carga.",
  "Les réglages du board enregistrés dans Jira sont dans un format inconnu (version plus récente de l'extension ?) : ils ne sont pas appliqués.":
    "Los ajustes del tablero guardados en Jira usan un formato desconocido (¿una versión más reciente de la extensión?): no se han aplicado.",
  "La lecture JQL n'a pas pu être confirmée auprès de Jira.":
    "Jira no ha podido confirmar la lectura del JQL.",
  "Saisissez une requête JQL.": "Escribe una consulta JQL.",
  "Résultat de correspondance incomplet.": "Resultado de coincidencias incompleto.",
  "Ce board n'est plus enregistré dans ce navigateur.":
    "Este tablero ya no está guardado en este navegador.",
  "Ajoutez-le de nouveau par son adresse.": "Vuelve a añadirlo con su dirección.",
  "Ce board s'affiche ici, mais la page Jira derrière reste celle du board précédent.":
    "Este tablero se muestra aquí, pero la página de Jira que hay detrás sigue mostrando el tablero anterior.",
  "Son adresse Jira n'a pas pu être formée : il n'a pas de clé de projet.":
    "No se ha podido crear su dirección de Jira: no tiene clave de proyecto.",
  "{p0} Les filtres rapides Jira ont été désactivés.":
    "{p0} Los filtros rápidos de Jira se han desactivado.",
  "Le statut a changé. Recommencez le déplacement.": "El estado ha cambiado. Repite el movimiento.",
  "Lecture des transitions…": "Cargando las transiciones…",
  "Le statut du ticket a changé. Recommencez le déplacement.":
    "El estado de la incidencia ha cambiado. Repite el movimiento.",
  "JQL non vérifié par Jira.": "JQL sin verificar por Jira.",
  "Réglage appliqué, mais pas enregistré dans ce navigateur ({p0}).":
    "Ajuste aplicado, pero no guardado en este navegador ({p0}).",
  "Il sera perdu à la fermeture de l'onglet. Rien n'a été écrit dans Jira.":
    "Se perderá al cerrar la pestaña. No se ha escrito nada en Jira.",
  "Ce board n'a aucun sprint actif.": "Este tablero no tiene ningún sprint activo.",
  "Le test d'écriture a besoin d'un sprint actif pour y poser sa propriété technique.":
    "La prueba de escritura necesita un sprint activo para guardar su propiedad técnica.",
  "Diagnostic de chargement : aucune mesure disponible.":
    "Diagnóstico de carga: ninguna medición disponible.",
  "Sprint Goals Board — diagnostic de chargement v1":
    "Sprint Goals Board — diagnóstico de carga v1",
  "Sprint Goals Board (extension Chrome) {p0} — diagnostic de connexion":
    "Sprint Goals Board (extensión de Chrome) {p0} — diagnóstico de conexión",
  "Version : {p0}": "Versión: {p0}",
  "Date : {p0}": "Fecha: {p0}",
  "Action : {p0}": "Acción: {p0}",
  ouverture: "apertura",
  actualisation: "actualización",
  "Périmètre : depuis le démarrage du document de l'extension ; la navigation Jira précédente est hors mesure.":
    "Alcance: desde el inicio del documento de la extensión; la navegación previa en Jira queda fuera de la medición.",
  "État : {p0}": "Estado: {p0}",
  "Board : {p0} ; tickets : {p1} ; objectifs : {p2}":
    "Tablero: {p0}; incidencias: {p1}; objetivos: {p2}",
  "non déterminé": "sin determinar",
  "Temps écoulé : {p0} ms": "Tiempo transcurrido: {p0} ms",
  "Données prêtes : {p0} ; board affiché : {p1}": "Datos listos: {p0}; tablero mostrado: {p1}",
  "Board affiché : mesure après deux frames, estimation du rendu navigateur.":
    "Tablero mostrado: medición tras dos fotogramas, estimación del renderizado del navegador.",
  "Requêtes : {p0} tentatives ; nouvelles tentatives : {p1} ; attentes : {p2}":
    "Consultas: {p0} intentos; reintentos: {p1}; esperas: {p2}",
  "Erreurs de requête : {p0} ; phases en erreur : {p1}":
    "Errores de consulta: {p0}; fases con error: {p1}",
  "Mesures non détaillées (limite {p0}) : {p1}": "Mediciones sin detalle (límite {p0}): {p1}",
  "Les compteurs de requêtes, reprises, attentes et erreurs portent uniquement sur les mesures détaillées ; ils sont partiels.":
    "Los recuentos de consultas, reintentos, esperas y errores solo incluyen las mediciones detalladas y son parciales.",
  "Chronologie : départ relatif et durée, en ms. Les appels parallèles ne s'additionnent pas au temps total.":
    "Cronología: inicio relativo y duración, en ms. Las llamadas paralelas no se suman al tiempo total.",
  "Les durées des requêtes incluent le réseau, la lecture de la réponse et son décodage.":
    "La duración de las consultas incluye la red, la lectura de la respuesta y su decodificación.",
  "Un chargement terminé peut inclure des erreurs récupérées ou des phases complémentaires en échec ; voir leur détail ci-dessous.":
    "Una carga completada puede incluir errores recuperados o fases adicionales fallidas; consulta su detalle a continuación.",
  "en cours": "en curso",
  "appel {p0}": "consulta {p0}",
  "tentative {p0}": "intento {p0}",
  "attente prévue {p0} ms": "espera prevista {p0} ms",
  "erreur {p0}": "error {p0}",
  "Rapport local : aucun nom, URL, JQL, contenu de ticket, identifiant Jira ou message d'erreur brut.":
    "Informe local: sin nombres, URL, JQL, contenido de incidencias, identificadores de Jira ni mensajes de error sin procesar.",
  "non mesuré": "sin medir",
  tickets: "incidencias",
  "Sprint Planning est désactivé dans cette version.":
    "Sprint Planning está desactivado en esta versión.",
  "Choisissez un sprint futur à préparer.": "Elige un sprint futuro para prepararlo.",
  "Ce sprint n'est plus un sprint futur.": "Este sprint ya no es futuro.",
  "Chaque objectif doit avoir un titre sur une seule ligne.":
    "Cada objetivo debe tener un título de una sola línea.",
  "Saisissez les titres sans puce ni numéro au début : la mise en forme est automatique.":
    "Escribe los títulos sin viñetas ni números al principio: el formato es automático.",
  "Donnez un titre différent à chaque objectif.": "Asigna un título diferente a cada objetivo.",
  "Certains tickets du brouillon ne sont plus disponibles. Retirez-les du plan avant de publier.":
    "Algunas incidencias del borrador ya no están disponibles. Quítalas de la planificación antes de publicar.",
  "Attendez la fin de l'opération en cours sur le board.":
    "Espera a que termine la operación actual del tablero.",
  "Le brouillon local n'a pas pu être relu. Les données Jira restent disponibles.":
    "No se ha podido leer el borrador local. Los datos de Jira siguen disponibles.",
  "Jira a changé depuis ce brouillon. Copiez la synthèse pour le conserver, puis repartez de Jira avant de publier.":
    "Jira ha cambiado desde este borrador. Copia el resumen para conservarlo y vuelve a empezar desde Jira antes de publicar.",
  "Brouillon conservé en mémoire, mais sa sauvegarde locale a échoué. Copiez la synthèse avant de fermer.":
    "El borrador se conserva en memoria, pero no se ha podido guardar localmente. Copia el resumen antes de cerrar.",
  "Votre brouillon a été retrouvé dans ce navigateur.":
    "Se ha encontrado tu borrador en este navegador.",
  "{p0} L'ancien brouillon local n'a pas pu être effacé.":
    "{p0} No se ha podido borrar el borrador local anterior.",
  "La publication doit être réexaminée. Votre brouillon reste disponible : copiez sa synthèse, puis repartez de Jira pour voir le résultat confirmé.":
    "La publicación debe revisarse. Tu borrador sigue disponible: copia su resumen y vuelve a empezar desde Jira para ver el resultado confirmado.",
  "Publication non confirmée. Copiez votre brouillon puis repartez de Jira avant toute nouvelle publication.":
    "Publicación sin confirmar. Copia tu borrador y vuelve a empezar desde Jira antes de publicar de nuevo.",
  "Afficher la barre latérale": "Mostrar la barra lateral",
  "Masquer la barre latérale": "Ocultar la barra lateral",
  "Retour au board": "Volver al tablero",
  "Sprint à préparer": "Sprint por preparar",
  "Aucun sprint futur": "Ningún sprint futuro",
  "Aucun sprint futur que vous pouvez modifier": "Ningún sprint futuro que puedas modificar",
  "1 ticket sélectionné": "1 ticket seleccionado",
  "Estimer {p0}": "Estimar {p0}",
  "Estimation de {p0}": "Estimación de {p0}",
  "Sans estimation : cliquez pour estimer": "Sin estimación: haz clic para estimar",
  "Modifier l'estimation": "Cambiar la estimación",
  "{count} tickets sélectionnés": "{count} tickets seleccionados",
  "Vider la sélection": "Vaciar la selección",
  Sélectionné: "Seleccionado",
  "Glissez-les ou ouvrez le menu de l'une d'elles ; Échap vide la sélection.":
    "Arrástralos o abre el menú de uno de ellos; Escape vacía la selección.",
  "À faire : {p0}": "Por hacer: {p0}",
  "En cours : {p0}": "En curso: {p0}",
  "Terminé : {p0}": "Terminado: {p0}",
  "Déjà livré : {p0}": "Ya entregado: {p0}",
  "Tickets terminés avant ce sprint, hors de sa charge":
    "Tickets terminados antes de este sprint, fuera de su carga",
  "Lecture incomplète de ce qui a déjà été livré : il peut en manquer.":
    "No se pudo leer por completo lo ya entregado: puede faltar algo.",
  "Jira demande le droit « Gérer les sprints » sur les projets du board de chaque sprint. Demandez-le à un administrateur, puis actualisez.":
    "Jira exige el permiso «Gestionar sprints» en los proyectos del board de cada sprint. Pídeselo a un administrador y actualiza.",
  "Lecture de Jira…": "Cargando desde Jira…",
  "Relire les tickets depuis Jira": "Volver a cargar las incidencias desde Jira",
  Actualiser: "Actualizar",
  "Créez un sprint futur dans le backlog Jira, puis actualisez pour préparer ses objectifs et ses stories ici.":
    "Crea un sprint futuro en el backlog de Jira y actualiza para preparar aquí sus objetivos e historias.",
  "{p0} sans estimation": "{p0} sin estimación",
  "Rechercher un ticket à planifier": "Buscar una incidencia para planificar",
  "Aucun ticket ne correspond à cette recherche.": "Ninguna incidencia coincide con esta búsqueda.",
  "Objectif {p0} : {p1}": "Objetivo {p0}: {p1}",
  "Titre de l’objectif {p0}": "Título del objetivo {p0}",
  "Monter l’objectif {p0}": "Subir el objetivo {p0}",
  "Descendre l’objectif {p0}": "Bajar el objetivo {p0}",
  "Supprimer l’objectif {p0}": "Eliminar el objetivo {p0}",
  "Nouvel objectif du sprint": "Nuevo objetivo del sprint",
  "Ajouter l’objectif": "Añadir el objetivo",
  "Ouvrir {p0} dans Jira": "Abrir {p0} en Jira",
  "Sans estimation": "Sin estimación",
  "Estimation Jira": "Estimación de Jira",
  // ─── Sprint Planning en direct ───
  "Jira n'a pas relu la propriété des objectifs du sprint telle qu'elle a été écrite.":
    "Jira no ha vuelto a leer la propiedad de objetivos del sprint tal como se escribió.",
  "Jira n'a pas relu {p0} à sa nouvelle place.": "Jira no ha vuelto a leer {p0} en su nuevo lugar.",
  "Atlassian a refusé le rattachement au Goal : {p0}":
    "Atlassian ha rechazado la vinculación con el Goal: {p0}",
  "Atlassian a refusé le rattachement au Goal.":
    "Atlassian ha rechazado la vinculación con el Goal.",
  "propriété des objectifs du sprint": "propiedad de objetivos del sprint",
  "ticket ajouté au sprint": "incidencia añadida al sprint",
  "ticket rattaché à son objectif": "incidencia vinculada a su objetivo",
  "ancien Goal retiré du ticket": "Goal anterior retirado de la incidencia",
  "ticket retiré du sprint": "incidencia retirada del sprint",
  "Goals épinglés au sprint": "Goals fijados en el sprint",
  "vélocité de l'équipe": "velocidad del equipo",
  "Le texte des objectifs a changé dans Jira depuis son affichage.":
    "El texto de los objetivos ha cambiado en Jira desde que se mostró.",
  "Les objectifs du sprint ont changé dans Jira depuis leur affichage.":
    "Los objetivos del sprint han cambiado en Jira desde que se mostraron.",
  "{p0} ne peut pas rejoindre le sprint : c'est une sous-tâche ou il est terminé.":
    "{p0} no puede unirse al sprint: es una subtarea o ya está completada.",
  "{p0} est dans le sprint actif : il y reste en consultation.":
    "{p0} está en el sprint activo: permanece allí en solo lectura.",
  "{p0} n'est plus dans le sprint en préparation.": "{p0} ya no está en el sprint en preparación.",
  "Le rattachement de {p0} a changé dans Jira depuis son affichage.":
    "La vinculación de {p0} ha cambiado en Jira desde que se mostró.",
  "La vélocité a changé dans Jira depuis son affichage.":
    "La velocidad ha cambiado en Jira desde que se mostró.",
  "La vélocité doit être un nombre entre 0 et 100 000.":
    "La velocidad debe ser un número entre 0 y 100 000.",
  "Le sprint n'est pas clos dans Jira.": "El sprint no está cerrado en Jira.",
  "Lot de {p0} tickets : au plus 50 par geste.": "Lote de {p0} tickets: 50 como máximo por acción.",
  "Jira n'a pas relu l'estimation de {p0} telle qu'elle a été écrite.":
    "Jira no ha releído la estimación de {p0} tal como se escribió.",
  "estimation du ticket": "estimación del ticket",
  "L'estimation de {p0} a changé dans Jira depuis son affichage.":
    "La estimación de {p0} ha cambiado en Jira desde que se mostró.",
  "L'estimation de {p0} ne se modifie pas ici : ouvrez sa fiche dans Jira.":
    "La estimación de {p0} no se modifica aquí: abre su ficha en Jira.",
  "L'estimation doit être un nombre entre 0 et 10 000.":
    "La estimación debe ser un número entre 0 y 10 000.",
  estimation: "estimación",
  "{p0} Tickets confirmés : {p1}. À refaire : {p2}.":
    "{p0} Tickets confirmados: {p1}. Por rehacer: {p2}.",
  "{p0} À refaire : {p1}.": "{p0} Por rehacer: {p1}.",
  "Tickets {p0} : {p1}": "Tickets {p0}: {p1}",
  "{p0} Rien n’a été écrit : la page a été relue, refaites votre modification.":
    "{p0} No se ha escrito nada: la página se ha vuelto a cargar, repite tu cambio.",
  "Enregistré et vérifié dans Jira.": "Guardado y verificado en Jira.",
  "Jira porte déjà cette modification : rien n'a été écrit.":
    "Jira ya tiene este cambio: no se ha escrito nada.",
  "{p0} Aucune écriture n’a été rejouée ; la page a été relue dans Jira.":
    "{p0} No se ha repetido ninguna escritura; la página se ha vuelto a cargar desde Jira.",
  "Écriture non confirmée. {p0}": "Escritura no confirmada. {p0}",
  "Objectifs non atteints reportés dans {p0}.": "Objetivos no alcanzados trasladados a {p0}.",
  "Sprint clos : rien de nouveau à reporter.": "Sprint cerrado: nada nuevo que trasladar.",
  "Report des objectifs non atteints : {p0}": "Traslado de objetivos no alcanzados: {p0}",
  "Un sprint est actif : clôturez-le avant de démarrer celui-ci.":
    "Hay un sprint activo: complétalo antes de iniciar este.",
  "La fenêtre de Jira ne s'ouvre que depuis le board Jira qui héberge Sprint Goals Board.":
    "La ventana de Jira solo se abre desde el tablero de Jira que aloja Sprint Goals Board.",
  "Le sprint est toujours actif : rien n'a été reporté.":
    "El sprint sigue activo: no se ha trasladado nada.",
  "Reporté dans {p0}.": "Trasladado a {p0}.",
  "Non atteint, report non confirmé.": "No alcanzado; traslado no confirmado.",
  "Non reporté : aucun ticket rattaché.": "No trasladado: ninguna incidencia vinculada.",
  "Non reporté : tous ses tickets sont dans la dernière colonne.":
    "No trasladado: todas sus incidencias están en la última columna.",
  "Non reporté : déjà présent dans {p0}.": "No trasladado: ya está en {p0}.",
} as const satisfies Record<keyof typeof businessMessages, string>;
