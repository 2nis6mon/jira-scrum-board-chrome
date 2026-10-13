import { useLayoutEffect, useRef, useState } from "preact/hooks";
import { LOAD_SPAN_LABELS } from "../../core/loadTrace";
import type { LoadDiagnostics, LoadRun, LoadSpan } from "../model/LoadDiagnostics";
import "../styles/loadDiagnostics.css";

const seconds = (ms: number) =>
  `${(Math.max(0, ms) / 1_000).toLocaleString("fr-FR", { maximumFractionDigits: 1, minimumFractionDigits: 1 })} s`;
const elapsed = (run: LoadRun, activeElapsed: number) => run.durationMs ?? activeElapsed;
const runKind = (run: LoadRun) => (run.kind === "opening" ? "Ouverture" : "Actualisation");
const dateLabel = (run: LoadRun) => new Date(run.startedAt).toLocaleString("fr-FR");
const STATUS_LABEL = {
  loading: "En cours",
  ok: "Terminé",
  error: "En erreur",
  cancelled: "Interrompu",
} as const;
const SPAN_STATUS_LABEL = {
  running: "En cours",
  ok: "Terminé",
  error: "En erreur",
  cancelled: "Interrompu",
} as const;

function summary(run: LoadRun, now: number): string {
  if (run.status === "loading") return `${runKind(run)} · ${seconds(elapsed(run, now))}`;
  if (run.status === "error") return `Chargement en erreur · ${seconds(elapsed(run, now))}`;
  if (run.status === "cancelled") return `Chargement interrompu · ${seconds(elapsed(run, now))}`;
  if (run.visibleMs !== null) return `Chargé en ${seconds(run.visibleMs)}`;
  return `Lecture terminée en ${seconds(elapsed(run, now))}`;
}

/** Diagnostic local, ouvert uniquement par un geste explicite. */
export function LoadDiagnosticsView({
  diagnostics,
  hidden = false,
}: {
  diagnostics: LoadDiagnostics;
  hidden?: boolean;
}) {
  const current = diagnostics.current.value;
  const history = diagnostics.history.value;
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [, refreshClock] = useState(0);
  const now = diagnostics.elapsedMs();
  const [copyState, setCopyState] = useState<"idle" | "pending" | "ok" | "error">("idle");
  const [clearError, setClearError] = useState(false);
  const [requestsOpen, setRequestsOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const copyGeneration = useRef(0);
  const runs = current
    ? [current, ...history.filter((run) => run.id !== current.id)]
    : [...history];
  const latest = current ?? history[0] ?? null;
  const selected = runs.find((run) => run.id === selectedId) ?? latest;
  const selectedPhase = selected?.spans.findLast(
    (span) => span.kind === "phase" && span.status === "running",
  );
  const shown = open && !hidden && selected !== null;

  useLayoutEffect(() => {
    if (hidden || current?.status !== "loading") return;
    const timer = window.setInterval(() => refreshClock((value) => value + 1), 250);
    return () => window.clearInterval(timer);
  }, [current?.id, current?.status, hidden]);

  useLayoutEffect(() => {
    if (hidden) setOpen(false);
  }, [hidden]);

  useLayoutEffect(() => {
    if (!shown) return;
    const previous = document.activeElement;
    closeButton.current?.focus();
    const focusable = () =>
      [
        ...(dialog.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), select:not(:disabled), summary, textarea:not(:disabled), [tabindex="0"]',
        ) ?? []),
      ].filter(
        (element) => !element.closest("details:not([open])") || element.tagName === "SUMMARY",
      );
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        setOpen(false);
      } else if (event.key === "Tab") {
        const items = focusable();
        const first = items[0];
        const last = items.at(-1);
        if (
          event.shiftKey &&
          (document.activeElement === first || !dialog.current?.contains(document.activeElement))
        ) {
          event.preventDefault();
          last?.focus();
        } else if (
          !event.shiftKey &&
          (document.activeElement === last || !dialog.current?.contains(document.activeElement))
        ) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    const focusin = (event: FocusEvent) => {
      if (event.target instanceof Node && !dialog.current?.contains(event.target))
        closeButton.current?.focus();
    };
    document.addEventListener("keydown", keydown, true);
    document.addEventListener("focusin", focusin);
    return () => {
      document.removeEventListener("keydown", keydown, true);
      document.removeEventListener("focusin", focusin);
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, [shown]);

  useLayoutEffect(() => {
    copyGeneration.current += 1;
    setCopyState("idle");
  }, [selected?.id, open]);

  async function copy() {
    if (!selected) return;
    const generation = ++copyGeneration.current;
    setCopyState("pending");
    try {
      await diagnostics.copyReport(selected);
      if (copyGeneration.current === generation) setCopyState("ok");
    } catch {
      if (copyGeneration.current === generation) {
        setCopyState("error");
        setReportOpen(true);
      }
    }
  }

  async function clearHistory() {
    setClearError(false);
    try {
      await diagnostics.clearHistory();
      setSelectedId(null);
    } catch {
      setClearError(true);
    }
  }

  if (hidden || !latest) return null;
  const active = latest.spans.filter((span) => span.kind === "phase" && span.status === "running");

  return (
    <>
      <div class="load-diagnostics-launcher">
        <span class="load-diagnostics-summary">{summary(latest, now)}</span>
        {latest.status === "loading" && active.length > 0 && (
          <span
            class="load-diagnostics-active"
            title={active.map((span) => LOAD_SPAN_LABELS[span.label]).join(" · ")}
          >
            {LOAD_SPAN_LABELS[active.at(-1)?.label ?? "startup"]}
          </span>
        )}
        <button
          type="button"
          aria-haspopup="dialog"
          onClick={() => {
            setSelectedId(null);
            setOpen(true);
          }}
        >
          Voir les détails
        </button>
      </div>
      {shown && selected && (
        <div class="load-diagnostics-backdrop">
          <button
            class="load-diagnostics-dismiss"
            type="button"
            tabIndex={-1}
            aria-label="Fermer en dehors du diagnostic"
            onClick={() => setOpen(false)}
          />
          <div
            class="load-diagnostics-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="load-diagnostics-title"
            aria-describedby="load-diagnostics-scope"
            ref={dialog}
          >
            <header class="load-diagnostics-header">
              <div>
                <h2 id="load-diagnostics-title">Diagnostic du chargement</h2>
                <p>
                  {summary(selected, now)}
                  {selectedPhase && ` · ${LOAD_SPAN_LABELS[selectedPhase.label]}`}
                </p>
              </div>
              <button
                ref={closeButton}
                type="button"
                aria-label="Fermer le diagnostic du chargement"
                onClick={() => setOpen(false)}
              >
                ×
              </button>
            </header>
            <div class="load-diagnostics-body">
              <p id="load-diagnostics-scope" class="load-diagnostics-muted">
                Mesure depuis le démarrage de l’extension. Le chargement préalable de la page Jira
                est hors mesure.
              </p>
              <div class="load-diagnostics-history">
                <label htmlFor="load-diagnostics-run">Chargement analysé</label>
                <select
                  id="load-diagnostics-run"
                  value={selected.id}
                  onChange={(event) => {
                    setSelectedId(event.currentTarget.value);
                    setClearError(false);
                  }}
                >
                  {runs.map((run) => (
                    <option key={run.id} value={run.id}>
                      {dateLabel(run)} · {runKind(run)} · {STATUS_LABEL[run.status]}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={history.length === 0}
                  onClick={() => void clearHistory()}
                >
                  Effacer l’historique
                </button>
              </div>
              <p class="load-diagnostics-muted">
                Les cinq derniers chargements terminés restent dans ce navigateur. Le diagnostic
                courant reste consultable après effacement.
              </p>
              {clearError && (
                <p class="load-diagnostics-error" role="alert">
                  L’historique n’a pas pu être effacé. Réessayez.
                </p>
              )}
              <dl class="load-diagnostics-metrics">
                <div>
                  <dt>Données prêtes</dt>
                  <dd>
                    {selected.dataReadyMs === null ? "Non mesuré" : seconds(selected.dataReadyMs)}
                  </dd>
                </div>
                <div>
                  <dt>Board affiché</dt>
                  <dd>
                    {selected.visibleMs === null ? "Non mesuré" : seconds(selected.visibleMs)}
                  </dd>
                </div>
                <div>
                  <dt>Fin de synchronisation</dt>
                  <dd>
                    {selected.durationMs === null ? "En cours…" : seconds(selected.durationMs)}
                  </dd>
                </div>
              </dl>
              <p class="load-diagnostics-muted">
                Version {selected.version} ·{" "}
                {selected.boardType?.toUpperCase() ?? "Type de board non déterminé"}
                {selected.issues !== null && ` · ${selected.issues} tickets`}
                {selected.goals !== null && ` · ${selected.goals} objectifs`}
                {" · "}
                {STATUS_LABEL[selected.status]}
              </p>
              {selected.status === "loading" && (
                <p class="load-diagnostics-live">
                  Mesure en cours : le rapport copié sera un état provisoire.
                </p>
              )}
              {(selected.status === "error" || selected.status === "cancelled") && (
                <p class="load-diagnostics-error">
                  Mesure incomplète :{" "}
                  {selected.status === "error"
                    ? "le chargement a rencontré une erreur"
                    : "le chargement a été interrompu"}
                  .
                </p>
              )}
              <section class="load-diagnostics-section" aria-labelledby="load-diagnostics-phases">
                <h3 id="load-diagnostics-phases">Chronologie des phases</h3>
                <p class="load-diagnostics-muted">
                  Chaque ligne commence au moment indiqué depuis le démarrage. Des étapes
                  s’exécutent en parallèle : leurs durées ne s’additionnent pas.
                </p>
                <Timeline
                  spans={selected.spans.filter((span) => span.kind === "phase")}
                  total={elapsed(selected, now)}
                />
              </section>
              <details
                class="load-diagnostics-section"
                open={requestsOpen}
                onToggle={(event) => setRequestsOpen(event.currentTarget.open)}
              >
                <summary>
                  Requêtes et attentes (
                  {selected.spans.filter((span) => span.kind !== "phase").length})
                </summary>
                <p class="load-diagnostics-muted">
                  Lectures Jira, tentatives et attentes observées, sans adresse ni contenu des
                  tickets.
                </p>
                {requestsOpen && (
                  <Timeline
                    spans={selected.spans.filter((span) => span.kind !== "phase")}
                    total={elapsed(selected, now)}
                  />
                )}
              </details>
              {selected.truncated > 0 && (
                <p class="load-diagnostics-muted">
                  {selected.truncated} événements supplémentaires ne sont pas détaillés pour limiter
                  la taille du rapport.
                </p>
              )}
              <details
                class="load-diagnostics-section"
                open={reportOpen}
                onToggle={(event) => setReportOpen(event.currentTarget.open)}
              >
                <summary>Rapport à partager</summary>
                <p class="load-diagnostics-muted">
                  Copiez ce rapport et collez-le dans votre retour, en précisant ce qui vous a
                  semblé lent. Aucun envoi automatique.
                </p>
                {reportOpen && (
                  <textarea
                    class="load-diagnostics-report"
                    aria-label="Rapport du diagnostic à partager"
                    readOnly
                    value={diagnostics.report(selected)}
                  />
                )}
              </details>
            </div>
            <footer class="load-diagnostics-footer">
              <p class="load-diagnostics-muted">
                Sans contenu des tickets ni informations de connexion.
              </p>
              <span
                role="status"
                aria-live="polite"
                class={copyState === "error" ? "load-diagnostics-error" : "load-diagnostics-muted"}
              >
                {copyState === "ok" && "Rapport copié."}
                {copyState === "error" &&
                  "Copie impossible. Sélectionnez le texte dans « Rapport à partager »."}
              </span>
              <button
                class="primary"
                type="button"
                disabled={copyState === "pending"}
                onClick={() => void copy()}
              >
                {copyState === "pending" ? "Copie…" : "Copier le rapport"}
              </button>
            </footer>
          </div>
        </div>
      )}
    </>
  );
}

function Timeline({ spans, total }: { spans: readonly LoadSpan[]; total: number }) {
  if (spans.length === 0) return <p class="load-diagnostics-muted">Aucune étape enregistrée.</p>;
  const scale = Math.max(total, 1);
  return (
    <ol class="load-diagnostics-timeline">
      {spans.map((span) => {
        const duration = span.durationMs ?? Math.max(0, total - span.startMs);
        return (
          <li key={span.id} class={`load-diagnostics-span load-diagnostics-span-${span.status}`}>
            <div class="load-diagnostics-span-heading">
              <span>
                {LOAD_SPAN_LABELS[span.label]}
                {span.request !== null && ` n° ${span.request}`}
                {span.attempt !== null && ` · tentative ${span.attempt}`}
              </span>
              <strong>{seconds(duration)}</strong>
            </div>
            <div class="load-diagnostics-track" aria-hidden="true">
              <span
                style={{
                  marginLeft: `${Math.min(100, (span.startMs / scale) * 100)}%`,
                  width: `${Math.min(100, (duration / scale) * 100)}%`,
                }}
              />
            </div>
            <div class="load-diagnostics-span-meta">
              <span>
                Début + {seconds(span.startMs)} · {SPAN_STATUS_LABEL[span.status]}
              </span>
              {span.httpStatus !== null && <span>HTTP {span.httpStatus}</span>}
              {span.error !== null && <span>Erreur : {span.error}</span>}
              {span.delayMs !== null && <span>Attente prévue : {seconds(span.delayMs)}</span>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
