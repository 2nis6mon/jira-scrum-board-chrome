import { BoardSetupError } from "../../core/boardSync";
import { CoreError } from "../../core/reasons";
import { JiraError } from "../../jira/errors";
import { BoardWriteRefused } from "../services/ports";
import { sourceText } from "./appMessage";
import { errorMessage, errorSuggestion } from "./coreText";

// Seul point d'entrée des services vers les messages du modèle (AD-1) : ils n'importent des
// modèles que des types et ce module.
export { type AppMessage, message, sourceText } from "./appMessage";
export {
  errorMessage,
  goalsIssueMessage,
  goalsWarningMessage,
  TEAM_FAMILY_LABEL,
} from "./coreText";

/** Message montré à l'utilisateur : ce qui s'est passé, et ce qu'il peut faire. */
export interface UserMessage {
  readonly text: string;
  readonly suggestion: string | null;
}

export function toMessage(error: unknown): UserMessage {
  if (error instanceof JiraError) return { text: error.message, suggestion: error.suggestion };
  if (error instanceof CoreError || error instanceof BoardSetupError) {
    const suggestion = errorSuggestion(error);
    return {
      text: sourceText(errorMessage(error)),
      suggestion: suggestion ? sourceText(suggestion) : null,
    };
  }
  if (error instanceof BoardWriteRefused)
    return { text: sourceText(errorMessage(error)), suggestion: null };
  return { text: error instanceof Error ? error.message : String(error), suggestion: null };
}
