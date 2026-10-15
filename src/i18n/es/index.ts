import { boardMessagesEs } from "./board";
import { integrationMessagesEs } from "./integration";
import { businessMessagesEs } from "./messages";
import { settingsMessagesEs } from "./settings";

/** L'espagnol couvre les mêmes clés et paramètres que le catalogue anglais. */
export const spanishCatalogs = [
  boardMessagesEs,
  settingsMessagesEs,
  businessMessagesEs,
  integrationMessagesEs,
] as const;
export const spanish = {
  ...boardMessagesEs,
  ...settingsMessagesEs,
  ...businessMessagesEs,
  ...integrationMessagesEs,
} as const;
