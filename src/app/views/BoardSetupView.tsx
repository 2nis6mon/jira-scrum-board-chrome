import { t } from "../i18n";
import type { BoardModel } from "../model/BoardModel";
import { BoardSearch } from "./BoardSearch";
import { ErrorMessage } from "./Message";

export function BoardSetupView({ board }: { board: BoardModel }) {
  const canCancel = board.configuration.value !== null;
  const busy = board.setupBusy.value;

  return (
    <main class="centered">
      <section class="panel connection" aria-labelledby="board-setup-title">
        <h2 id="board-setup-title">{t("Quel board afficher ?")}</h2>
        <BoardSearch board={board} />
        <ErrorMessage message={board.setupError.value} />
        {canCancel && (
          <button type="button" onClick={() => board.cancelEdit()} disabled={busy}>
            {t("Annuler")}
          </button>
        )}
        <ul class="notes">
          <li>
            {t(
              "Boards Scrum et Kanban : organisez vos tickets par objectif, Build et swimlanes par type, comme RUN.",
            )}
          </li>
          <li>
            {t(
              "Colonnes, statuts, types de tickets et champ d'estimation sont lus dans Jira. Rien n'y est modifié.",
            )}
          </li>
        </ul>
      </section>
    </main>
  );
}
