import { BoardSetupError } from "../../core/boardSync";
import { JiraError } from "../../jira/errors";

/** Message montré à l'utilisateur : ce qui s'est passé, et ce qu'il peut faire. */
export interface UserMessage {
  readonly text: string;
  readonly suggestion: string | null;
}

export function toMessage(error: unknown): UserMessage {
  if (error instanceof JiraError || error instanceof BoardSetupError) {
    return { text: error.message, suggestion: error.suggestion };
  }
  return { text: error instanceof Error ? error.message : String(error), suggestion: null };
}
