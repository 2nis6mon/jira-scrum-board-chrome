import type { BoardModel } from "../model/BoardModel";
import { BoardSearch } from "./BoardSearch";
import { ErrorMessage } from "./Message";

export function BoardSetupView({ board }: { board: BoardModel }) {
  const canCancel = board.configuration.value !== null;
  const busy = board.setupBusy.value;

  return (
    <main class="centered">
      <section class="panel connection" aria-labelledby="board-setup-title">
        <h2 id="board-setup-title">Quel board afficher ?</h2>
        <BoardSearch board={board} />
        <ErrorMessage message={board.setupError.value} />
        {canCancel && (
          <button type="button" onClick={() => board.cancelEdit()} disabled={busy}>
            Annuler
          </button>
        )}
        <ul class="notes">
          <li>
            <strong>
              Cette extension est réservée aux boards Scrum. Les boards Kanban ne sont pas pris en
              charge.
            </strong>
          </li>
          <li>
            Recherchez un board Scrum par son nom sur le site connecté. Jusqu’à cinq résultats sont
            proposés ; précisez le nom pour affiner.
          </li>
          <li>
            Colonnes, statuts, types de tickets et champ d'estimation sont lus dans Jira. Rien n'y
            est modifié.
          </li>
        </ul>
      </section>
    </main>
  );
}
