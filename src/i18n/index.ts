import { boardMessages } from "./board";
import { spanish } from "./es";
import { integrationMessages } from "./integration";
import { getLanguage, type Language } from "./language";
import { businessMessageParameters, businessMessages } from "./messages";
import { settingsMessages } from "./settings";

export type { Language, LanguagePreference } from "./language";
export {
  getLanguage,
  languageLocale,
  languagePreference,
  normalizeLocale,
  resolveLanguage,
  setLanguage,
  subscribeLanguage,
} from "./language";

/** Le français est la source du catalogue : les messages historiques restent lisibles. */
export const catalogs = [
  boardMessages,
  settingsMessages,
  businessMessages,
  integrationMessages,
] as const;
export const english = {
  ...boardMessages,
  ...settingsMessages,
  ...businessMessages,
  ...integrationMessages,
} as const;
export type MessageKey = keyof typeof english;
export { spanish } from "./es";

const translations: Readonly<
  Record<Exclude<Language, "fr">, Readonly<Record<MessageKey, string>>>
> = { en: english, es: spanish };
export type MessageParams = Readonly<Record<string, string | number>>;

function interpolate(template: string, params: MessageParams): string {
  return template.replace(/\{([a-zA-Z]\w*)\}/g, (token, key: string) =>
    Object.hasOwn(params, key) ? String(params[key]) : token,
  );
}

export function translate(
  key: MessageKey,
  params: MessageParams = {},
  language = getLanguage(),
): string {
  return interpolate(language === "fr" ? key : translations[language][key], params);
}

export const t = translate;

const escaped = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const patterns = Object.entries(english)
  .filter(([source]) => /\{[a-zA-Z]\w*\}/.test(source))
  .map(([source]) => {
    const names: string[] = [];
    let expression = "";
    let offset = 0;
    for (const match of source.matchAll(/\{([a-zA-Z]\w*)\}/g)) {
      expression += `${escaped(source.slice(offset, match.index))}([\\s\\S]*?)`;
      names.push(match[1] ?? "");
      offset = match.index + match[0].length;
    }
    expression += escaped(source.slice(offset));
    return {
      expression: new RegExp(`^${expression}$`),
      names,
      source,
      weight: source.replace(/\{[^}]+\}/g, "").length,
    };
  })
  .filter(({ weight }) => weight > 0)
  .sort((a, b) => b.weight - a.weight);

/**
 * Présente un message de l'application déjà construit ou relu dans son journal historique.
 * Les données Jira (titres, noms, JQL…) ne doivent jamais être passées à cette fonction.
 * Seuls les textes et modèles explicitement présents dans nos catalogues sont traduits.
 */
export function localize(text: string, language: Language = getLanguage()): string {
  return localizeMessage(text, language, 0);
}

function localizeMessage(text: string, language: Language, depth: number): string {
  if (language === "fr" || !text) return text;
  const dictionary = translations[language];
  const exact = Object.hasOwn(dictionary, text)
    ? (dictionary as Readonly<Record<string, string>>)[text]
    : undefined;
  if (exact !== undefined) return exact;
  for (const { expression, names, source } of patterns) {
    const match = expression.exec(text);
    if (!match) continue;
    const params = Object.fromEntries(names.map((name, index) => [name, match[index + 1] ?? ""]));
    const nested = (
      businessMessageParameters as Readonly<Record<string, readonly string[] | undefined>>
    )[source];
    if (nested && depth < 8) {
      for (const name of nested) {
        const original = params[name] ?? "";
        let translated = localizeMessage(original, language, depth + 1);
        // Certaines compositions retirent le point de la cause avant de l'insérer.
        if (translated === original && original && !/[.!?…]$/.test(original)) {
          const punctuated = localizeMessage(`${original}.`, language, depth + 1);
          if (punctuated !== `${original}.`) translated = punctuated.replace(/\.$/, "");
        }
        params[name] = translated;
      }
    }
    return interpolate(dictionary[source as MessageKey], params);
  }
  return text;
}
