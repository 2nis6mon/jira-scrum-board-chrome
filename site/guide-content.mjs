// Navigation uniquement : les textes viennent des deux manuels sous docs/.
// sourceHeading correspond exactement au titre H2 du Markdown, sans les caractères ##.
export const guideCards = [
  {
    slug: "demarrer",
    number: "01",
    eyebrow: "PREMIERS PAS",
    title: "Installer l'extension",
    description: "Ajoutez Sprint Goals à Chrome et retrouvez-le en un clic.",
    icon: "download",
    sourceHeading: "Installer l'extension",
  },
  {
    slug: "connecter-jira",
    number: "02",
    eyebrow: "VOTRE ESPACE",
    title: "Connecter votre Jira",
    description: "Autorisez votre site et utilisez votre session Jira habituelle.",
    icon: "shield",
    sourceHeading: "Connecter votre Jira",
  },
  {
    slug: "ajouter-board",
    number: "03",
    eyebrow: "VOS BOARDS",
    title: "Ajouter un board",
    description: "Ouvrez un board existant depuis Jira ou depuis Sprint Goals.",
    icon: "boards",
    sourceHeading: "Ajouter un board",
  },
  {
    slug: "utiliser-board",
    number: "04",
    eyebrow: "AU QUOTIDIEN",
    title: "Utiliser le board",
    description: "Lisez, filtrez et déplacez vos tickets sans perdre leur contexte.",
    icon: "layout",
    sourceHeading: "Utiliser le board",
  },
  {
    slug: "objectifs",
    number: "05",
    eyebrow: "UN CAP COMMUN",
    title: "Organiser les objectifs",
    description:
      "Choisissez vos objectifs, rattachez les tickets et gardez les priorités visibles.",
    icon: "target",
    sourceHeading: "Organiser les objectifs",
  },
  {
    slug: "administration",
    number: "06",
    eyebrow: "À VOTRE FAÇON",
    title: "Configurer le board",
    description: "Adaptez les swimlanes, les champs et les couleurs à votre équipe.",
    icon: "sliders",
    sourceHeading: "Configurer le board",
  },
  {
    slug: "daily",
    number: "07",
    eyebrow: "LE RENDEZ-VOUS D'ÉQUIPE",
    title: "Animer la Daily",
    description: "Parcourez le travail ligne par ligne et facilitez la discussion.",
    icon: "users",
    sourceHeading: "Animer la Daily",
  },
  {
    slug: "aide",
    number: "08",
    eyebrow: "UN COUP DE MAIN",
    title: "Trouver de l'aide",
    description: "Retrouvez un élément manquant et préparez un retour utile.",
    icon: "help",
    sourceHeading: "Trouver de l'aide",
  },
];

const englishCards = [
  {
    eyebrow: "GETTING STARTED",
    title: "Install the extension",
    description: "Add Sprint Goals to Chrome and keep it one click away.",
  },
  {
    eyebrow: "YOUR WORKSPACE",
    title: "Connect your Jira",
    description: "Authorize your site and use your usual Jira session.",
  },
  {
    eyebrow: "YOUR BOARDS",
    title: "Add a board",
    description: "Open an existing board from Jira or from Sprint Goals.",
  },
  {
    eyebrow: "EVERYDAY WORK",
    title: "Use the board",
    description: "Read, filter and move issues without losing their context.",
  },
  {
    eyebrow: "A SHARED DIRECTION",
    title: "Organize goals",
    description: "Choose your goals, link issues and keep priorities visible.",
  },
  {
    eyebrow: "MAKE IT YOURS",
    title: "Configure the board",
    description: "Adapt swimlanes, fields and colors to the way your team works.",
  },
  {
    eyebrow: "TIME TO CONNECT",
    title: "Run your Daily",
    description: "Review work one row at a time and guide the conversation.",
  },
  {
    eyebrow: "A HELPING HAND",
    title: "Get help",
    description: "Find a missing item and prepare useful feedback.",
  },
];

export const guideCardsByLanguage = {
  fr: guideCards,
  en: englishCards.map((card, index) => ({
    ...guideCards[index],
    ...card,
    sourceHeading: card.title,
  })),
};
