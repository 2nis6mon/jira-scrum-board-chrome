import { language, localize } from "../i18n";

const formats = (locale: string) => ({
  day: new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }),
  time: new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }),
  points: new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }),
  plural: new Intl.PluralRules(locale),
});
const FORMATS = { fr: formats("fr-FR"), en: formats("en-GB"), es: formats("es-ES") };

export function formatDay(date: Date): string {
  return FORMATS[language.value].day.format(date);
}

export function formatTime(date: Date): string {
  return FORMATS[language.value].time.format(date);
}

export function formatPoints(points: number): string {
  return FORMATS[language.value].points.format(points);
}

/** « 1 ticket », « 3 tickets ». */
export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${pluralWord(count, singular, pluralForm)}`;
}

/** Libellé seul, lorsque le nombre est mis en valeur séparément dans le rendu. */
export function pluralWord(count: number, singular: string, pluralForm = `${singular}s`): string {
  const word = FORMATS[language.value].plural.select(count) === "one" ? singular : pluralForm;
  return localize(word);
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter((part) => part !== "")
    .slice(0, 2)
    .map((part) => [...part][0] ?? "")
    .join("")
    .toUpperCase();
}

/** Copie d'un ensemble avec `value` ajouté ou retiré. */
export function toggled<T>(set: ReadonlySet<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

/** Libellés des codes de statut des Goals Atlassian ; un code inconnu est montré tel quel. */
const GOAL_STATUS_LABELS: Record<string, string> = {
  pending: "En attente",
  on_track: "En bonne voie",
  at_risk: "À risque",
  off_track: "En retard",
  paused: "En pause",
  done: "Terminé",
  completed: "Terminé",
  cancelled: "Annulé",
  archived: "Archivé",
};

export function goalStatusLabel(value: string): string {
  const label = GOAL_STATUS_LABELS[value.toLowerCase().replace(/[\s-]+/g, "_")];
  return label === undefined ? value : localize(label);
}
