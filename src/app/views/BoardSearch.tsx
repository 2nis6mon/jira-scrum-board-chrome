import { useEffect, useRef, useState } from "preact/hooks";
import type { JiraBoardChoice } from "../../jira/client";
import type { BoardModel } from "../model/BoardModel";
import { toMessage, type UserMessage } from "../model/messages";
import { ErrorMessage } from "./Message";

/** Recherche différée ; une réponse ancienne ne doit jamais remplacer la nouvelle saisie. */
export function BoardSearch({ board }: { board: BoardModel }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<JiraBoardChoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState<UserMessage | null>(null);
  const generation = useRef(0);
  const busy = board.setupBusy.value;
  useEffect(() => {
    const current = ++generation.current;
    if (!query.trim()) return;
    const timer = setTimeout(() => {
      void board.searchBoards(query).then(
        (items) => {
          if (current === generation.current) {
            setResults(items);
            setComplete(true);
            setLoading(false);
          }
        },
        (reason) => {
          if (current === generation.current) {
            setError(toMessage(reason));
            setLoading(false);
          }
        },
      );
    }, 300);
    return () => {
      clearTimeout(timer);
      generation.current++;
    };
  }, [board, query]);
  return (
    <div class="board-search">
      <label for="board-name">Nom du board</label>
      <input
        id="board-name"
        type="search"
        autocomplete="off"
        placeholder="Rechercher un board…"
        value={query}
        disabled={busy}
        onInput={(event) => {
          generation.current++;
          const value = event.currentTarget.value;
          setQuery(value);
          setResults([]);
          setError(null);
          setComplete(false);
          setLoading(Boolean(value.trim()));
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.preventDefault();
        }}
      />
      <p class="hint" role="status">
        {loading
          ? "Recherche…"
          : complete && results.length === 0
            ? "Aucun board Scrum accessible ne correspond à ce nom."
            : results.length
              ? "Sélectionnez un board (5 résultats maximum)."
              : "Saisissez tout ou partie du nom du board."}
      </p>
      {results.length > 0 && (
        <>
          <label for="board-results">Boards correspondants</label>
          <select
            id="board-results"
            value=""
            disabled={busy}
            onChange={(event) => {
              const selected = results.find(
                (item) => String(item.id) === event.currentTarget.value,
              );
              if (selected)
                void board.detect(
                  `${board.site.origin}/secure/RapidBoard.jspa?rapidView=${selected.id}`,
                );
            }}
          >
            <option value="" disabled>
              Choisir un board…
            </option>
            {results.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
                {item.projectKey ? ` · ${item.projectKey}` : ""} · #{item.id}
              </option>
            ))}
          </select>
        </>
      )}
      {busy && <p role="status">Lecture du board…</p>}
      <ErrorMessage message={error} />
    </div>
  );
}
