import {
  english,
  getLanguage,
  type Language,
  localize,
  type MessageKey,
  translate,
} from "../../i18n";

/**
 * Message de l'application, sous une forme qui se garde (journal `audit.v1`) et se présente dans
 * la langue courante :
 * - `key` : clé du catalogue (le texte source français) et ses paramètres ;
 * - `text` : texte déjà composé par la couche Jira (message d'erreur), présenté par `localize` ;
 * - `list` : messages joints par `separator`.
 *
 * Un paramètre chaîne est un contenu Jira (titre, nom de statut, clé de ticket…) : il n'est
 * jamais traduit.
 */
export type AppMessage =
  | { readonly key: string; readonly params?: Readonly<Record<string, AppMessageParam>> }
  | { readonly text: string }
  | { readonly list: readonly AppMessage[]; readonly separator: string };

export type AppMessageParam = string | number | AppMessage;

/** Message du catalogue : la clé est vérifiée à la compilation. */
export function message(
  key: MessageKey,
  params?: Readonly<Record<string, AppMessageParam>>,
): AppMessage {
  return params ? { key, params } : { key };
}

/** Le message est-il d'une forme connue ? Lecture tolérante du journal. */
export function isAppMessage(value: unknown, depth = 0): value is AppMessage {
  if (typeof value !== "object" || value === null || depth > 8) return false;
  const candidate = value as Record<string, unknown>;
  // Même ordre que `renderMessage` : la première forme présente décide, et doit être complète.
  if ("text" in candidate) return typeof candidate.text === "string";
  if ("list" in candidate)
    return (
      Array.isArray(candidate.list) &&
      typeof candidate.separator === "string" &&
      candidate.list.every((item) => isAppMessage(item, depth + 1))
    );
  if (typeof candidate.key !== "string") return false;
  if (candidate.params === undefined) return true;
  if (typeof candidate.params !== "object" || candidate.params === null) return false;
  return Object.values(candidate.params).every(
    (param) =>
      typeof param === "string" || typeof param === "number" || isAppMessage(param, depth + 1),
  );
}

/** Texte du message dans `language` (par défaut, la langue courante). */
export function renderMessage(value: AppMessage, language: Language = getLanguage()): string {
  if ("text" in value) return localize(value.text, language);
  if ("list" in value)
    return value.list.map((item) => renderMessage(item, language)).join(value.separator);
  const params = Object.fromEntries(
    Object.entries(value.params ?? {}).map(([name, param]) => [
      name,
      typeof param === "object" ? renderMessage(param, language) : param,
    ]),
  );
  if (Object.hasOwn(english, value.key))
    return translate(value.key as MessageKey, params, language);
  // Clé inconnue de cette version : le texte source, présenté comme un message historique.
  return localize(translate(value.key as MessageKey, params, "fr"), language);
}

/**
 * Texte source (français) du message. Les avis des modèles et services sont gardés en texte
 * source et présentés par `localize` à l'affichage, qui suit ainsi un changement de langue.
 */
export function sourceText(value: AppMessage): string {
  return renderMessage(value, "fr");
}
