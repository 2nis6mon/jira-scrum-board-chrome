import { signal } from "@preact/signals";
import {
  getLanguage,
  localize as localizeText,
  type MessageKey,
  type MessageParams,
  subscribeLanguage,
  translate,
} from "../i18n";

/** La présentation s'abonne à la langue, les couches métier restent indépendantes de Preact. */
export const language = signal(getLanguage());
subscribeLanguage((value) => {
  language.value = value;
});

export function t(key: MessageKey, params: MessageParams = {}): string {
  return translate(key, params, language.value);
}

export function localize(text: string): string {
  return localizeText(text, language.value);
}
