import { localize } from "../i18n";
import type { UserMessage } from "../model/messages";

export function ErrorMessage({ message }: { message: UserMessage | null }) {
  if (!message) return null;
  return (
    <div class="message message-error" role="alert">
      <p class="message-text">{localize(message.text)}</p>
      {message.suggestion && <p class="message-suggestion">{localize(message.suggestion)}</p>}
    </div>
  );
}
