import { useState } from "preact/hooks";
import { type ProbeResult, writeConclusion } from "../../jira/diagnostics";
import { SPRINT_PROPERTY_KEYS } from "../../jira/writes";
import type { DiagnosticModel } from "../model/DiagnosticModel";
import { ErrorMessage } from "./Message";

const MARK = { ok: "✓", failed: "✗", skipped: "–" } as const;
const STATUS_LABEL = { ok: "réussi", failed: "échec", skipped: "non lancé" } as const;

function ProbeList({ probes }: { probes: readonly ProbeResult[] }) {
  return (
    <ul class="probes">
      {probes.map((probe) => (
        <li key={probe.id} class={`probe probe-${probe.status}`}>
          <span class="probe-mark" role="img" aria-label={STATUS_LABEL[probe.status]}>
            {MARK[probe.status]}
          </span>
          <span class="probe-label">{probe.label}</span>
          {probe.httpStatus !== null && <span class="probe-code">{probe.httpStatus}</span>}
          <span class="probe-detail">{probe.detail}</span>
        </li>
      ))}
    </ul>
  );
}

export function DiagnosticView({ diagnostic }: { diagnostic: DiagnosticModel }) {
  const site = diagnostic.site;
  const [boardUrl, setBoardUrl] = useState("");
  const read = diagnostic.read.value;
  const write = diagnostic.write.value;
  const sprint = diagnostic.sprint.value;

  return (
    <main class="page">
      <section class="panel">
        <header class="panel-header">
          <h2>1 · Lectures</h2>
          <button
            type="button"
            onClick={() => void diagnostic.runReads()}
            disabled={diagnostic.readRunning.value}
          >
            {diagnostic.readRunning.value ? "En cours…" : "Relancer"}
          </button>
        </header>
        <p class="hint">
          Requêtes en lecture seule : votre compte, l'analyse d'un JQL par POST, puis l'identifiant
          du site par la passerelle GraphQL d'Atlassian (API des Goals), essayé avec l'en-tête
          Origin de l'extension, sans lui, puis remplacé par l'adresse du site. La variante acceptée
          est retenue pour ce site. Rien n'est modifié dans Jira.
        </p>
        {read ? <ProbeList probes={read.probes} /> : <p class="hint">En cours…</p>}
        {read?.displayName && <p class="hint">Compte reconnu : {read.displayName}</p>}
        {read && !read.sessionRecognized && (
          <p class="hint">
            <a href={site.origin} target="_blank" rel="noopener noreferrer">
              Ouvrir {site.host}
            </a>{" "}
            pour vous y connecter, puis relancez.
          </p>
        )}
      </section>

      <section class="panel">
        <header class="panel-header">
          <h2>2 · Test d'écriture</h2>
        </header>
        <p class="hint">
          Seul un essai réel dit si Jira accepte une écriture venant de l'extension. Le test écrit
          la propriété technique <code>{SPRINT_PROPERTY_KEYS.diagnostic}</code> sur le sprint actif,
          la relit, puis la supprime. Cette propriété est invisible dans Jira. Aucun ticket, aucun
          champ du sprint n'est touché. Si Jira refuse le premier essai pour cause d'origine (XSRF),
          un second est fait avec l'en-tête <code>X-Atlassian-Token: no-check</code>.
        </p>

        <form
          class="row"
          onSubmit={(event) => {
            event.preventDefault();
            void diagnostic.findSprint(boardUrl);
          }}
        >
          <input
            type="text"
            inputMode="url"
            autocomplete="off"
            spellcheck={false}
            aria-label="Adresse du board Jira"
            placeholder={`${site.origin}/jira/software/c/projects/ABC/boards/123`}
            value={boardUrl}
            onInput={(event) => setBoardUrl(event.currentTarget.value)}
          />
          <button type="submit" disabled={diagnostic.sprintLoading.value || boardUrl.trim() === ""}>
            {diagnostic.sprintLoading.value ? "Recherche…" : "Trouver le sprint actif"}
          </button>
        </form>
        <ErrorMessage message={diagnostic.sprintError.value} />

        {sprint && (
          <div class="row">
            <p class="sprint">
              Sprint actif : <strong>{sprint.name}</strong>
            </p>
            <button
              type="button"
              class="primary"
              onClick={() => void diagnostic.runWriteTest()}
              disabled={diagnostic.writeRunning.value || !read?.sessionRecognized}
            >
              {diagnostic.writeRunning.value ? "Test en cours…" : "Tester l'écriture sur ce sprint"}
            </button>
          </div>
        )}
        {write && (
          <>
            <ProbeList probes={write.probes} />
            <p class={`conclusion ${write.acceptedWith ? "conclusion-ok" : "conclusion-failed"}`}>
              {writeConclusion(write)}
            </p>
          </>
        )}
      </section>

      <section class="panel">
        <header class="panel-header">
          <h2>Journal des écritures</h2>
          <button
            type="button"
            onClick={() => void diagnostic.clearJournal()}
            disabled={diagnostic.journal.value.length === 0}
          >
            Effacer le journal
          </button>
        </header>
        <p class="hint">
          Chaque écriture tentée depuis le board (transition, classement, rattachement, épinglage),
          avec la réponse de Jira. Le journal reste dans ce navigateur ; il ne contient ni secret ni
          nom de personne, et il est effacé à la déconnexion.
        </p>
        {diagnostic.journal.value.length === 0 ? (
          <p class="hint">Aucune écriture pour l'instant.</p>
        ) : (
          <table class="journal">
            <thead>
              <tr>
                <th>Date</th>
                <th>Action</th>
                <th>Cible</th>
                <th>Vers</th>
                <th>Résultat</th>
                <th>Détail</th>
              </tr>
            </thead>
            <tbody>
              {diagnostic.journal.value.map((entry) => (
                <tr
                  key={`${entry.at}-${entry.issueKey}-${entry.action}`}
                  class={`journal-${entry.outcome === "réussi" ? "ok" : "ko"}`}
                >
                  <td>{new Date(entry.at).toLocaleString("fr-FR")}</td>
                  <td>{entry.action}</td>
                  <td>{entry.issueKey ?? "sprint"}</td>
                  <td>{entry.to ?? ""}</td>
                  <td>{entry.outcome}</td>
                  <td>{entry.detail ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section class="panel">
        <header class="panel-header">
          <h2>3 · Rapport</h2>
          <button type="button" onClick={() => void diagnostic.copyReport()} disabled={!read}>
            {diagnostic.reportCopied.value ? "Copié" : "Copier le rapport"}
          </button>
        </header>
        <p class="hint">
          Le rapport ne contient ni l'adresse du site, ni votre nom, ni le nom du sprint : seulement
          les sondes, les codes HTTP et les messages renvoyés par Jira. Relisez-le avant de le
          transmettre.
        </p>
        {read && <pre class="report">{diagnostic.report()}</pre>}
      </section>
    </main>
  );
}
