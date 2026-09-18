import { useState } from "preact/hooks";
import type { BoardModel } from "../model/BoardModel";
import { ErrorMessage } from "./Message";

export function BoardSetupView({ board }: { board: BoardModel }) {
  const [url, setUrl] = useState("");
  const canCancel = board.configuration.value !== null;
  const busy = board.setupBusy.value;

  return (
    <main class="centered">
      <form
        class="panel connection"
        onSubmit={(event) => {
          event.preventDefault();
          void board.detect(url);
        }}
      >
        <h2>Quel board afficher ?</h2>
        <label for="board-url">Adresse de votre board Jira</label>
        <input
          id="board-url"
          type="text"
          inputMode="url"
          autocomplete="off"
          spellcheck={false}
          placeholder={`${board.site.origin}/jira/software/c/projects/ABC/boards/123`}
          value={url}
          onInput={(event) => setUrl(event.currentTarget.value)}
        />
        <ErrorMessage message={board.setupError.value} />
        <div class="row">
          <button type="submit" class="primary grow" disabled={busy || url.trim() === ""}>
            {busy ? "Lecture du board…" : "Afficher le board"}
          </button>
          {canCancel && (
            <button type="button" onClick={() => board.cancelEdit()} disabled={busy}>
              Annuler
            </button>
          )}
        </div>
        <ul class="notes">
          <li>Copiez l'adresse affichée par Chrome quand votre board Jira est ouvert.</li>
          <li>
            Colonnes, statuts, types de tickets et champ d'estimation sont lus dans Jira. Rien n'y
            est modifié.
          </li>
        </ul>
      </form>
    </main>
  );
}
