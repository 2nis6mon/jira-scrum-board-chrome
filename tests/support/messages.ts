import { toMessage, type UserMessage } from "../../src/app/model/messages";

/**
 * Message présenté pour l'échec d'une promesse : `core` lève des raisons typées, l'application en
 * produit le texte et la suggestion. Échoue si la promesse aboutit.
 */
export async function rejectionMessage(promise: Promise<unknown>): Promise<UserMessage> {
  try {
    await promise;
  } catch (error) {
    return toMessage(error);
  }
  throw new Error("Un échec était attendu.");
}

/** Texte présenté pour l'échec d'une promesse. */
export async function rejectionText(promise: Promise<unknown>): Promise<string> {
  return (await rejectionMessage(promise)).text;
}
