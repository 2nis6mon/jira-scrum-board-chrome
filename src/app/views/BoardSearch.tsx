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
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const generation = useRef(0);
  const busy = board.setupBusy.value;
  const expanded = open && results.length > 0 && !busy;
  const choose = (item: JiraBoardChoice) => {
    if (busy) return;
    setOpen(false);
    void board.detect(`${board.site.origin}/secure/RapidBoard.jspa?rapidView=${item.id}`);
  };
  useEffect(() => {
    const current = ++generation.current;
    if (!query.trim()) return;
    const timer = setTimeout(() => {
      void board.searchBoards(query).then(
        (items) => {
          if (current === generation.current) {
            setResults(items.slice(0, 5));
            setActive(-1);
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
      <div class="board-autocomplete">
        <input
          id="board-name"
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={expanded}
          aria-controls="board-results"
          aria-activedescendant={expanded && active >= 0 ? `board-result-${active}` : undefined}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          autocomplete="off"
          placeholder="Rechercher un board…"
          value={query}
          disabled={busy}
          onInput={(event) => {
            generation.current++;
            const value = event.currentTarget.value;
            setQuery(value);
            setOpen(true);
            setActive(-1);
            setResults([]);
            setError(null);
            setComplete(false);
            setLoading(Boolean(value.trim()));
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              setOpen(false);
              setActive(-1);
            } else if ((event.key === "ArrowDown" || event.key === "ArrowUp") && results.length) {
              event.preventDefault();
              setOpen(true);
              setActive((previous) =>
                event.key === "ArrowDown"
                  ? (previous + 1) % results.length
                  : previous <= 0
                    ? results.length - 1
                    : previous - 1,
              );
            } else if (event.key === "Enter") {
              event.preventDefault();
              const item = expanded ? results[active] : undefined;
              if (item) choose(item);
            }
          }}
        />
        {expanded && (
          <div
            id="board-results"
            class="board-suggestions"
            role="listbox"
            aria-label="Boards correspondants"
          >
            {results.map((item, index) => (
              <button
                key={item.id}
                id={`board-result-${index}`}
                class="board-suggestion"
                type="button"
                role="option"
                aria-selected={active === index}
                tabIndex={-1}
                onPointerDown={(event) => event.preventDefault()}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(item)}
              >
                <span class="board-suggestion-name">{item.name}</span>
                <span class="board-suggestion-meta">
                  {item.type === "kanban" ? "Kanban · " : item.type === "scrum" ? "Scrum · " : ""}
                  {item.projectKey ? `${item.projectKey} · ` : ""}#{item.id}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
      <p class="hint" role="status">
        {loading
          ? "Recherche…"
          : complete && results.length === 0
            ? "Aucun board Scrum ou Kanban accessible ne correspond à ce nom."
            : results.length
              ? "Sélectionnez un board (5 résultats maximum)."
              : "Saisissez tout ou partie du nom du board."}
      </p>
      {busy && <p role="status">Lecture du board…</p>}
      <ErrorMessage message={error} />
    </div>
  );
}
