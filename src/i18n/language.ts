/** Langues de l'interface ; aucun accès au navigateur dans ce module. */
export type Language = "fr" | "en" | "es";
export type LanguagePreference = "auto" | Language;
/** Clé distincte des dimensions : un autre onglet ne peut écraser la langue en redimensionnant. */
export const LANGUAGE_PREFERENCE_KEY = "language.v1";

export function languagePreference(value: unknown): LanguagePreference {
  return value === "fr" || value === "en" || value === "es" ? value : "auto";
}

/** Normalise les formes Atlassian fr_FR et les balises HTML fr-FR. */
export function normalizeLocale(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const locale = value.trim().replaceAll("_", "-");
  return /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(locale) ? locale.toLowerCase() : null;
}

export function resolveLanguage(preference: LanguagePreference, jiraLocale: unknown): Language {
  if (preference !== "auto") return preference;
  const primary = normalizeLocale(jiraLocale)?.split("-")[0];
  return primary === "fr" || primary === "es" ? primary : "en";
}

/** Formats de dates et nombres de l'interface, sans changer les données Jira. */
export function languageLocale(language: Language = getLanguage()): string {
  return { fr: "fr-FR", en: "en-GB", es: "es-ES" }[language];
}

let current: Language = "en";
const listeners = new Set<(language: Language) => void>();

export function getLanguage(): Language {
  return current;
}

export function setLanguage(language: Language): void {
  if (current === language) return;
  current = language;
  for (const listener of listeners) listener(language);
}

export function subscribeLanguage(listener: (language: Language) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
