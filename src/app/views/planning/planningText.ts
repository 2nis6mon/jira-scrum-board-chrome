import { language } from "../../i18n";
import { type AppMessage, renderMessage } from "../../model/appMessage";

/** Texte d'un avis du modèle dans la langue affichée. */
export function text(message: AppMessage): string {
  return renderMessage(message, language.value);
}
