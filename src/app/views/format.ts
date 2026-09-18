const DATE = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" });
const TIME = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" });
const POINTS = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });

export function formatDay(date: Date): string {
  return DATE.format(date);
}

export function formatTime(date: Date): string {
  return TIME.format(date);
}

export function formatPoints(points: number): string {
  return POINTS.format(points);
}

/** « 1 ticket », « 3 tickets ». */
export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count > 1 ? pluralForm : singular}`;
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
  return GOAL_STATUS_LABELS[value.toLowerCase().replace(/[\s-]+/g, "_")] ?? value;
}
