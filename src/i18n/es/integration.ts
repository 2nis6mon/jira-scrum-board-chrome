import type { integrationMessages } from "../integration";

/** Catalogue espagnol ; les clés françaises et les paramètres restent inchangés. */
export const integrationMessagesEs = {
  "Fermer Sprint Goals et revenir au board Jira": "Cerrar Sprint Goals y volver al tablero de Jira",
  "Possible dès que l'écriture en cours dans Jira est terminée":
    "Disponible cuando termine la escritura en curso en Jira",
  "Retour à Jira": "Volver a Jira",
  "Diagnostic du site": "Diagnóstico del sitio",
  "Mode présentation": "Modo presentación",
  Échap: "Esc",
  "pour revenir": "para volver",
  "La langue est appliquée, mais n'a pas pu être enregistrée dans ce navigateur.":
    "El idioma se ha aplicado, pero no se ha podido guardar en este navegador.",
  "Sprint Goals s'utilise dans Jira. Ouvrez votre board Jira, puis cliquez sur l'icône de l'extension.":
    "Sprint Goals se utiliza dentro de Jira. Abre tu tablero de Jira y haz clic en el icono de la extensión.",
  "Sprint Goals est installé": "Sprint Goals está instalado",
  "Sprint Goals dans Jira": "Sprint Goals en Jira",
  "Indiquez l'adresse de votre Jira pour l'autoriser. Vos objectifs et vos tickets s'ouvriront ensuite directement dans leur board Jira.":
    "Introduce la dirección de tu Jira para autorizar el acceso. Tus objetivos e incidencias se abrirán después directamente en su tablero de Jira.",
  "Ouvrez vos objectifs et vos tickets directement dans leur board Jira.":
    "Abre tus objetivos e incidencias directamente en su tablero de Jira.",
  "Board Jira reconnu dans cet onglet.": "Tablero de Jira detectado en esta pestaña.",
  "Cet onglet n'est pas un board. Autorisez ce site ci-dessous, ou ouvrez un board puis cliquez de nouveau sur l'icône.":
    "Esta pestaña no es un tablero. Autoriza el sitio a continuación o abre un tablero y vuelve a hacer clic en el icono.",
  "Adresse de votre Jira ou d'un board": "Dirección de tu Jira o de un tablero",
  "https://votre-site.atlassian.net": "https://tu-sitio.atlassian.net",
  "Ouverture…": "Abriendo…",
  "Autoriser et ouvrir Jira": "Autorizar y abrir Jira",
  "Ouvrir dans Jira": "Abrir en Jira",
  "Au premier accès, Chrome vous demande l'autorisation pour ce site. Ensuite, un bouton « Sprint Goals » apparaît sur chacun de ses boards. Votre session Jira habituelle est utilisée.":
    "En el primer acceso, Chrome te pide permiso para este sitio. Después aparece un botón «Sprint Goals» en cada uno de sus tableros. Se utiliza tu sesión habitual de Jira.",
  "Impossible d'ouvrir le board dans Jira. Vous pouvez réessayer.":
    "No se puede abrir el tablero en Jira. Puedes volver a intentarlo.",
  "Impossible de retrouver le dernier board. Saisissez son adresse Jira.":
    "No se ha podido encontrar el último tablero. Introduce su dirección de Jira.",
  "Saisissez l'adresse de votre Jira Cloud (https://votre-site.atlassian.net) ou celle d'un de ses boards.":
    "Introduce la dirección de tu Jira Cloud (https://tu-sitio.atlassian.net) o la de uno de sus tableros.",
  "L'accès à {host} n'a pas été autorisé. Vous pouvez réessayer.":
    "No se ha autorizado el acceso a {host}. Puedes volver a intentarlo.",
  "Impossible d'ouvrir Jira. Réessayez depuis l'extension.":
    "No se puede abrir Jira. Inténtalo de nuevo desde la extensión.",
  "Déplacer le bouton Sprint Goals": "Mover el botón Sprint Goals",
  "Glisser pour déplacer ; flèches du clavier : 10 px, Maj : 1 px ; Échap : annuler le glissement":
    "Arrastra para mover; flechas del teclado: 10 px, Mayús: 1 px; Esc: cancelar el arrastre",
  "Ouvrir ce board dans Sprint Goals": "Abrir este tablero en Sprint Goals",
  "Position du bouton déplacée.": "Posición del botón actualizada.",
  "Position déplacée, mais impossible de l'enregistrer pour la prochaine visite.":
    "El botón se ha movido, pero no se ha podido guardar su posición para la próxima visita.",
  "Ticket Jira {key}": "Incidencia de Jira {key}",
  "Chargement de {key}…": "Cargando {key}…",
  "Ouverture de « {name} »…": "Abriendo «{name}»…",
  "Jira n'a pas permis d'afficher ce ticket ici. Rechargez la vue puis réessayez.":
    "Jira no ha permitido mostrar esta incidencia aquí. Vuelve a cargar la vista e inténtalo de nuevo.",
  "Retour à Jira…": "Volviendo a Jira…",
  "Ouverture du board dans Jira…": "Abriendo el tablero en Jira…",
} as const satisfies Record<keyof typeof integrationMessages, string>;
